// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nmm-1-4",
    title: "Provider scopes & lifecycles: singleton, request and transient",
    slug: { _type: "slug", current: "provider-scopes-and-lifecycles" },
    description:
        "Lesson progress is saved for the wrong learner, but only under load, and the logs show one request reading another request's user. Learn the three NestJS provider scopes (default, request, transient), how request scope bubbles up the injection chain and what it costs, where per-request data really belongs, which lifecycle hooks run at startup and shutdown, and how to prove with logs and a test which instance served which request.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev platform team",
        problem:
            "Since the evening traffic peak last Tuesday, a handful of learners see lessons marked as done that they never opened, and others lose a completed lesson. It never happens on a developer laptop. The logs show two requests a few milliseconds apart where the second learner's id ends up in the first learner's progress row. The same week, emails for lessons completed just before a deploy go missing.",
    },

    content: [
        h2("1. The incident: a singleton that remembers the last learner"),
        p("To avoid passing the user id through every method, a teammate added a small \"context\" provider. The `AuthGuard` writes the current learner into it, and any service can read it:"),
        code("typescript", `
// common/request-context.ts (before)
@Injectable()                       // default scope: ONE instance for the whole app
export class RequestContext {
    userId?: string;
    traceId?: string;
}

// auth/auth.guard.ts
@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private readonly ctx: RequestContext, private readonly tokens: TokenService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const user = await this.tokens.verify(request.headers.authorization);
        this.ctx.userId = user.id;                       // written for "this" request...
        this.ctx.traceId = request.headers["x-trace-id"] as string;
        return true;
    }
}

// progress/progress.service.ts
@Injectable()
export class ProgressService {
    constructor(private readonly ctx: RequestContext, private readonly repo: ProgressRepository,
                private readonly lessons: LessonsService) {}

    async complete(lessonId: string) {
        await this.lessons.findById(lessonId);           // the event loop runs other requests here
        await this.repo.markDone(this.ctx.userId!, lessonId);   // ...read after another request wrote it
    }
}`, "request-context.ts"),
        p("With one learner clicking at a time, it works. Under load, the log tells a different story:"),
        code("text", `
19:41:07.312 [trace 9f1c] guard     userId=u_17
19:41:07.315 [trace 4b2e] guard     userId=u_42
19:41:07.351 [trace 4b2e] markDone  user=u_42 lesson=lsn_3   <- lsn_3 was u_17's request
19:41:07.362 [trace 4b2e] markDone  user=u_42 lesson=lsn_8`, "progress.log"),
        p("Even the trace id is wrong on the first `markDone` line: it was read from the same shared object. The learner who opened lesson 3 (`u_17`) did not get it marked; `u_42` got a lesson they never opened."),

        h2("2. Why it happens: one instance, many requests in flight"),
        p("By default, every provider in NestJS is a **singleton**: the container creates one instance when the application starts and hands that same instance to every class that injects it, for the life of the process. That is exactly what you want for stateless services, repositories and clients - and exactly wrong for a field that holds \"the current learner\"."),
        p("Node.js runs your JavaScript on one thread, but that does not mean one request at a time. Every `await` gives control back to the event loop, which continues other requests in the meantime. Between the guard and `markDone` there was an `await`, and during it the second request's guard overwrote `ctx.userId`. On a laptop with one user the window never opens; at peak traffic it opens all the time."),
        callout("warning", "Rule of thumb",
            "A singleton may hold configuration, clients, caches and other data that is the same for every request. It must never hold data that belongs to one request: the current user, the trace id, the tenant, a transaction. If you see `this.something = ...` written per request in a default-scope provider, you have found this bug."),

        h2("3. The three scopes"),
        p("NestJS lets you choose the lifetime of a provider with the `scope` option:"),
        bullets([
            "`Scope.DEFAULT` (singleton) - one instance for the whole application, created at startup. The right choice for almost everything.",
            "`Scope.REQUEST` - a new instance for each incoming request, garbage-collected after the request is handled. It can inject the request object with `@Inject(REQUEST)`.",
            "`Scope.TRANSIENT` - not shared at all: every class that injects it gets its own dedicated instance. Typical for a logger that is configured with the name of the class using it.",
        ]),
        code("typescript", `
import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import type { Request } from "express";

@Injectable({ scope: Scope.REQUEST })
export class RequestContext {
    constructor(@Inject(REQUEST) private readonly req: Request) {}

    get userId(): string { return (this.req as Request & { user: { id: string } }).user.id; }
    get traceId(): string { return String(this.req.headers["x-trace-id"] ?? ""); }
}

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {}   // each consumer gets its own instance`, "scopes.ts"),

        h3("Request scope bubbles up the injection chain"),
        p("A singleton cannot hold a request-scoped dependency: which request's instance would it keep? So Nest widens the scope upwards. Any provider that injects a request-scoped provider becomes request-scoped itself, and so does everything that injects *that* provider, up to the controller. In the incident, making `RequestContext` request-scoped also makes `ProgressService`, `AuthGuard` and `ProgressController` request-scoped - even though their `@Injectable()` still says nothing about scope. `ProgressRepository`, which does not depend on the context, stays a singleton."),
        p("Transient scope does not bubble the same way. A singleton that injects a transient logger gets its own logger instance once, at startup, and stays a singleton."),

        h3("What request scope costs"),
        bullets([
            "**Work on every request.** For each request Nest builds the request-scoped provider and every provider that bubbled up with it. The NestJS documentation warns that this affects performance and recommends the default scope unless you really need otherwise. Measure before and after on your own hot paths rather than trusting any rule of thumb.",
            "**Surprises in places that are not requests.** A cron job, a queue consumer or a WebSocket gateway has no HTTP request to inject. Code that silently became request-scoped through bubbling may not work there, or needs a context built by hand.",
            "**No lifecycle hooks.** Request-scoped instances are not tied to the application lifecycle, so `onModuleInit` and the shutdown hooks are not called on them (section 5).",
        ]),

        h3("Durable providers: per tenant instead of per request"),
        p("Multi-tenant apps sometimes need a provider per tenant (a connection to the tenant's own database, for example) but not per request. Nest supports this with `@Injectable({ scope: Scope.REQUEST, durable: true })` together with a `ContextIdStrategy` registered via `ContextIdFactory.apply(...)`, which tells Nest which requests share a sub-tree - typically all requests with the same tenant header. The instances are then created once per tenant and reused. It is an advanced tool; reach for it only after measuring that per-request instances are the bottleneck."),

        p("Before you choose a fix, check your reading of the incident: how requests interleave in a single process, how far request scope spreads, and which lifecycle hooks need extra setup."),
        challenge("chal_quiz_nmm_141"),

        h2("4. The fix: keep services stateless, carry the context explicitly"),
        image("provider-scopes-instances", {
            alt: "Left, in red: one default-scope RequestContext shared by two overlapping requests; request B's guard overwrites userId while request A is awaiting, so A saves progress for B's learner. Right, in green: each request has its own context, either through AsyncLocalStorage or a request-scoped provider, and each save uses its own learner. A bottom row compares the three scopes: default creates one instance at startup, request one per request and bubbles up, transient one per consumer.",
            caption: "A field on a singleton is shared by every request in flight. Give each request its own context - explicitly, with AsyncLocalStorage, or with request scope when its cost is acceptable.",
        }),
        p("There are three ways out, from cheapest to most expensive:"),
        numbered([
            "**Pass it as an argument.** The controller reads the learner (for example with a custom `@CurrentUser()` param decorator) and passes `userId` to `progress.complete(userId, lessonId)`. Services stay singletons and are trivial to test. This is the default choice.",
            "**AsyncLocalStorage.** For cross-cutting data you do not want in every signature - the trace id for logs, the tenant - Node's `AsyncLocalStorage` (from `node:async_hooks`) keeps a value for one asynchronous call chain. A singleton can read it safely because each request runs inside its own `run(...)`.",
            "**Request scope.** Correct, and convenient when a provider really needs the request object, but you pay the per-request cost on everything that bubbles up.",
        ]),
        code("typescript", `
// common/request-context.ts (after): a singleton that reads per-request data from AsyncLocalStorage
import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

interface Context { traceId: string }

@Injectable()
export class RequestContext {
    private readonly storage = new AsyncLocalStorage<Context>();

    run(ctx: Context, next: () => void) { this.storage.run(ctx, next); }
    get traceId(): string { return this.storage.getStore()?.traceId ?? "no-trace"; }
}

@Injectable()
export class TraceMiddleware implements NestMiddleware {
    constructor(private readonly ctx: RequestContext) {}

    use(req: Request, _res: Response, next: NextFunction) {
        const traceId = String(req.headers["x-trace-id"] ?? crypto.randomUUID());
        this.ctx.run({ traceId }, next);   // everything awaited inside this request sees this traceId
    }
}

// progress/progress.controller.ts: the learner travels as an argument
@Post("lessons/:lessonId/complete")
complete(@CurrentUser() user: User, @Param("lessonId") lessonId: string) {
    return this.progress.complete(user.id, lessonId);
}`, "request-context.ts"),
        p("The learner id is now a plain argument - visible in the signature and in every unit test - and the trace id comes from storage that each request owns. Nothing per-request is stored in a field of a shared object any more."),

        h2("5. Lifecycles: what runs at startup and at shutdown"),
        p("Singleton providers live as long as the application, and Nest calls optional hooks on them at fixed moments:"),
        bullets([
            "`onModuleInit()` - after the module's dependencies are resolved. Good for warming a cache or checking a connection.",
            "`onApplicationBootstrap()` - after all modules are initialised, before the app starts listening.",
            "`onModuleDestroy()`, `beforeApplicationShutdown(signal)`, `onApplicationShutdown(signal)` - when the app is closing: flush a batch, close a connection pool, finish in-flight work.",
        ]),
        p("Two details cause most of the surprises. First, the shutdown hooks only run on a signal such as `SIGTERM` if you call `app.enableShutdownHooks()` in `main.ts`; they are off by default. Second, none of these hooks are called on request-scoped instances, so a cleanup written in a request-scoped provider never runs at shutdown."),
        code("typescript", `
// notifications/notifications.service.ts
@Injectable()
export class NotificationsService implements OnModuleInit, OnApplicationShutdown {
    private readonly pending: LessonCompletedEmail[] = [];

    async onModuleInit() {
        await this.mailer.verify();                         // fail fast at boot, not on the first email
    }

    async onApplicationShutdown(signal?: string) {
        const sent = await this.flush();                    // do not lose emails batched before a deploy
        this.logger.log(\`flushed \${sent} pending notifications (\${signal})\`);
    }
}

// main.ts
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();                                  // without this, SIGTERM skips the hooks above
await app.listen(3000);`, "notifications.service.ts"),

        h2("6. How to verify which instance served which request"),
        p("Scope bugs hide on a laptop, so make them visible with evidence:"),
        numbered([
            "**Log instance ids.** Give suspicious providers a counter in the constructor (`static created = 0; readonly id = ++RequestContext.created;`) and put the id in a log line. A singleton logs one id for every request; a request-scoped provider logs a new id per request; a provider that bubbled up shows new ids too.",
            "**Send two requests that overlap.** In an e2e test, fire two requests for different learners at the same time and assert that each one saved its own learner. A sequential test can never catch this bug.",
            "**Check the startup log.** Request-scoped providers are not created at startup; if a constructor log appears only when traffic arrives, the provider (or something it depends on) is request-scoped.",
            "**Check shutdown in staging.** Send `SIGTERM` to a running container and look for your shutdown log line before the process exits.",
        ]),
        code("typescript", `
// test/progress.e2e-spec.ts (Jest + supertest)
it("saves progress for the learner who sent the request, even when requests overlap", async () => {
    const http = request(app.getHttpServer());
    await Promise.all([
        http.post("/progress/lessons/lsn_3/complete").set("Authorization", \`Bearer \${tokenFor("u_17")}\`).expect(201),
        http.post("/progress/lessons/lsn_8/complete").set("Authorization", \`Bearer \${tokenFor("u_42")}\`).expect(201),
    ]);
    expect(await progressRepo.doneLessons("u_17")).toEqual(["lsn_3"]);
    expect(await progressRepo.doneLessons("u_42")).toEqual(["lsn_8"]);
});`, "progress.e2e-spec.ts"),
        p("Make the overlap deterministic: let the fake `LessonsService.findById` resolve after a short, fixed delay (or resolve it from the test with a deferred promise), so that the second request's guard runs while the first is still awaiting. Against the singleton version, this test fails every time."),

        h2("7. Common mistakes"),
        bullets([
            "**Per-request data in a singleton field.** Current user, trace id, tenant or transaction stored as `this.x = ...` in a default-scope provider. Detect it by searching providers for fields assigned outside the constructor, and with the overlapping-requests test above.",
            "**Not noticing that scope bubbled up.** One `Scope.REQUEST` deep in the graph turns services and controllers above it into per-request objects. Detect it with constructor logs or instance ids that change per request, and by a latency increase after the change.",
            "**Request scope as a reflex.** Making everything request-scoped \"to be safe\" costs work on every request and breaks providers used by cron jobs and queue consumers. Detect it by grepping for `Scope.REQUEST` and asking, for each one, whether an argument or `AsyncLocalStorage` would do.",
            "**Shutdown hooks that never run.** `onApplicationShutdown` implemented but `app.enableShutdownHooks()` missing, or the hook placed on a request-scoped provider. Detect it by sending `SIGTERM` in staging and looking for the hook's log line.",
            "**Expecting a transient provider to be shared.** Two services that inject the same transient provider get two instances, so state in one is invisible to the other. Detect it with instance ids in the log.",
        ]),

        h2("8. Summary"),
        bullets([
            "The default scope is a singleton shared by every request in flight; requests interleave at every `await`, so a singleton must never store per-request data.",
            "`Scope.REQUEST` gives one instance per request and bubbles up to everything that injects it, at a cost on every request; `Scope.TRANSIENT` gives one instance per consumer. Prefer arguments or `AsyncLocalStorage` for per-request context.",
            "Lifecycle hooks run on singletons only; shutdown hooks also need `app.enableShutdownHooks()`. Prove scope and lifecycle behaviour with instance ids, an overlapping-requests test and a `SIGTERM` in staging.",
        ]),

        callout("info", "Practice on your own (not graded)",
            "Take a NestJS app you work on (or a new one with `nest new`). Add an instance counter to three providers, mark one deep in the graph `Scope.REQUEST`, and record which constructor logs appear at startup and on each request. Then write the overlapping-requests e2e test against a singleton that stores the user in a field, watch it fail, and make it pass with an argument and with `AsyncLocalStorage`. Write down in a short note (an ADR) which providers in your app hold per-request data and how each one gets it. Tested with NestJS 11 and Node.js 22 (verify before use)."),

        h2("Sources"),
        bullets([
            "NestJS documentation: Injection scopes - https://docs.nestjs.com/fundamentals/injection-scopes",
            "NestJS documentation: Lifecycle events - https://docs.nestjs.com/fundamentals/lifecycle-events",
            "Node.js documentation: Asynchronous context tracking (AsyncLocalStorage) - https://nodejs.org/api/async_context.html",
        ]),
    ],
});
