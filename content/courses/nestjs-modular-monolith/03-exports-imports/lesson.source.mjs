// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-1-3",
    title: "Module exports & imports: what another module may use",
    slug: { _type: "slug", current: "module-exports-imports" },
    description:
        "A deploy of the CodeDev API stopped at startup with \"Nest can't resolve dependencies of the ProgressService\", and the 2 a.m. hotfix that made it start created a second UserService whose cache showed learners an old streak for days. Learn why providers are private to their module, how exports and imports decide what another module may inject, why imports are not transitive and when to re-export, why global modules hide dependencies, how to read the dependency error word by word, and what singleton and request scope cost.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "A ticket asked that completing a lesson also extends the learner's daily streak. The developer added UserService to ProgressService's constructor; the unit tests, which build ProgressService with new and fakes, all passed. Release 2026.10.23 then failed on every instance at startup with \"Nest can't resolve dependencies of the ProgressService\". The on-call engineer added UserService and UserRepository to ProgressModule's providers, the API started, and the incident was closed. Over the next four days support received 63 tickets: \"my streak is stuck\". The database had the right streak; GET /users/me returned an older one.",
    },

    content: [
        h2("1. The incident: a fix that made two of everything"),
        p("The release log, as the deploy pipeline recorded it:"),
        code("text", `
[Nest] 4128  - 10/23/2026, 1:52:07 AM     LOG [InstanceLoader] CourseModule dependencies initialized +3ms
[Nest] 4128  - 10/23/2026, 1:52:07 AM     LOG [InstanceLoader] UserModule dependencies initialized +1ms
[Nest] 4128  - 10/23/2026, 1:52:07 AM   ERROR [ExceptionHandler] UnknownDependenciesException [Error]:
Nest can't resolve dependencies of the ProgressService (ProgressRepository, CourseService, ?).
Please make sure that the argument UserService at index [2] is available in the ProgressModule context.

Potential solutions:
- Is ProgressModule a valid NestJS module?
- If UserService is a provider, is it part of the current ProgressModule?
- If UserService is exported from a separate @Module, is that module imported within ProgressModule?
  @Module({
    imports: [ /* the Module containing UserService */ ]
  })`, "deploy log"),
        p("The hotfix followed the second suggestion literally:"),
        code("typescript", `
// src/progress/progress.module.ts - hotfix, 02:10
 @Module({
     imports: [CourseModule],
     controllers: [ProgressController],
-    providers: [ProgressService, ProgressRepository],
+    providers: [ProgressService, ProgressRepository, UserService, UserRepository],
 })
 export class ProgressModule {}`, "hotfix"),
        p("The API started. What nobody noticed is that `UserService` keeps a small in-memory cache of profiles, so `GET /users/me` does not hit the database on every page load. UserModule's `UserService` serves `GET /users/me`. ProgressModule now had **its own** `UserService`, with its own cache, and that is the one that updated streaks. The database got the new streak; the cache behind `/users/me` never heard about it:"),
        code("bash", `
$ psql $DATABASE_URL -c "SELECT streak_days FROM users WHERE id = 'u_7731'"
 streak_days
-------------
           8

$ curl -s https://api.codedev.test/users/me -H "Authorization: Bearer $TOKEN" | jq .streakDays
7`, "terminal"),
        p("The startup error was a good error. It stopped a broken wiring before any request was served and told the team exactly what was missing. The hotfix turned it into a silent bug. This lesson explains the rules behind that error, so that the fix is the right one the first time."),

        h2("2. Read the evidence: the error, word by word"),
        p("Every \"can't resolve dependencies\" error has the same parts. Read them in order:"),
        bullets([
            "**`of the ProgressService`**: the class Nest was trying to create.",
            "**`(ProgressRepository, CourseService, ?)`**: its constructor parameters, in order. The ones Nest found are named; `?` marks the one it could not find.",
            "**`the argument UserService at index [2]`**: the token it looked for and its position, counting from 0. Here: the third constructor parameter, typed `UserService`.",
            "**`in the ProgressModule context`**: the module where `ProgressService` is declared. Nest looks only in that module's own providers and in what its imported modules **export**. This is the module to fix, and the fix is almost never \"declare the provider again\".",
        ]),
        p("Two variants are worth recognising. If the token reads `Object`, a parameter is typed with an interface or a type alias, which does not exist at runtime (lesson 1.2). If the name is missing or reads `dependency` or `undefined`, the import of that class itself produced `undefined` at runtime, which usually means a circular import between files or modules; lesson 4.1 is about exactly that."),
        p("The duplicate created by the hotfix is just as easy to see once you look for it. Add a log line to the constructor, or search the module files:"),
        code("bash", `
$ grep -rn "UserService" src --include=*.module.ts
src/users/user.module.ts:9:        providers: [UserService, UserRepository],
src/progress/progress.module.ts:8: providers: [ProgressService, ProgressRepository, UserService, UserRepository],

# with this.logger.log("UserService created") in the constructor:
[Nest] 4371  - 10/27/2026, 9:03:12 AM     LOG [UserService] UserService created
[Nest] 4371  - 10/27/2026, 9:03:12 AM     LOG [UserService] UserService created`, "terminal"),
        p("A class listed in `providers` of two modules is two providers: Nest creates one instance per module that declares it. Two caches, two sets of fields, and twice the work in anything the constructor starts."),

        h2("3. The core idea: providers are private, exports are the public API"),
        p("A NestJS module **encapsulates** its providers. A provider listed in `providers` can be injected into the other providers and controllers of the same module, and nowhere else. To let another module use it, two things must both be true:"),
        numbered([
            "The owning module lists it in **`exports`**. Exports are the module's public API: what the rest of the application may inject.",
            "The using module lists the owning module in **`imports`**. Importing a module gives you its exports, nothing more: never its other providers.",
        ]),
        p("And there is only one instance. Modules are singletons in Nest: UserModule is created once, its `UserService` is created once, and every module that imports UserModule gets that same instance. That is what the hotfix broke."),
        code("typescript", `
// src/users/user.module.ts
@Module({
    controllers: [UserController],
    providers: [UserService, UserRepository],
    exports: [UserService],              // the service is public, the repository stays private
})
export class UserModule {}

// src/progress/progress.module.ts
@Module({
    imports: [CourseModule, UserModule], // gives access to CourseService and UserService
    controllers: [ProgressController],
    providers: [ProgressService, ProgressRepository],
})
export class ProgressModule {}`, "the fix"),
        p("Export the service, not the repository. `UserService` is where the rules for users live (a streak can only grow by one per day, the cache is updated with the row). If ProgressModule could inject `UserRepository`, it could write the `users` table without those rules, which is the \"two writers of one table\" problem from lesson 1.1, now with the framework's blessing."),
        h3("Imports are not transitive; re-export on purpose"),
        p("If ProgressModule imports CourseModule, and CourseModule imports UserModule, ProgressModule still cannot inject `UserService`. Each module sees only the exports of the modules **it** imports. This is a feature: a module's `imports` list is a complete, honest list of what it depends on."),
        p("A module can pass another module's exports on by **re-exporting** it: list the imported module in its own `exports`. Use it for a real facade, a module whose job is to bundle a few others, for example infrastructure that every domain needs together:"),
        code("typescript", `
// src/core/core.module.ts - one import gives the database and the clock
@Module({
    imports: [DatabaseModule, ClockModule],
    exports: [DatabaseModule, ClockModule],   // re-export: importers get what these two export
})
export class CoreModule {}`, "core.module.ts"),
        p("Do not re-export a domain module just to save an import line. If CourseModule re-exported UserModule, every module importing CourseModule would silently depend on users too, and the import list would stop being honest."),
        h3("Global modules, and why to avoid them"),
        p("`@Global()` on a module makes its exports injectable everywhere, without any `imports`. It is tempting after the third \"can't resolve dependencies\" error of the week. The Nest documentation itself advises against making everything global: once `UserModule` is global, nothing in `ProgressModule` shows that progress depends on users, and the dependency graph you drew in lesson 1.1 is no longer visible in the code. Keep global modules for a few true infrastructure pieces registered once at the root, such as configuration (`ConfigModule.forRoot({ isGlobal: true })` is a common, reasonable case), and never for a domain module."),
        callout("info", "Two modules that import each other",
            "If UserModule also needed ProgressModule (say, to show progress on the profile), the two modules would import each other. Nest cannot build that graph and reports it at startup, and the error is often the confusing undefined variant from section 2. Lesson 4.1 shows how to break such a cycle; for now, notice it early: an arrow in both directions on your module diagram is a design question, not a wiring detail."),

        challenge("chal_quiz_nmm_131"),

        h2("4. Provider scope: one instance, or one per request"),
        p("Every provider has a scope that decides how many instances exist:"),
        bullets([
            "**`DEFAULT` (singleton).** One instance for the whole application (per module that declares it), created at startup and shared by every request. This is what you want for almost everything: services, repositories, clients. It costs nothing per request.",
            "**`REQUEST`.** A new instance for every incoming request, garbage-collected afterwards. Declared with `@Injectable({ scope: Scope.REQUEST })`. Inside it you can inject the request object (`@Inject(REQUEST)`).",
            "**`TRANSIENT`.** A new instance for every provider that injects it. Rarely needed; a typical use is a logger that should know which class it belongs to.",
        ]),
        p("Request scope has a cost that is easy to miss: it **bubbles up**. If `ProgressService` is request-scoped, then `ProgressController`, which injects it, becomes request-scoped too, and so does every provider that depends on either of them. Nest must build that whole chain of objects for every request. The Nest documentation warns that request-scoped providers affect performance; measure before you use them on a hot path."),
        p("The usual reason people reach for request scope is the current user. There is a cheaper and clearer way: pass it as an argument."),
        code("typescript", `
// Do not: per-request data in a field of a singleton
@Injectable()
export class ProgressService {
    private currentUserId?: string;                  // shared by every concurrent request
    setUser(userId: string) { this.currentUserId = userId; }
    async complete(lessonId: string) { /* uses this.currentUserId after an await */ }
}

// Do: the request's data travels as arguments; the service keeps no per-request state
@Injectable()
export class ProgressService {
    async complete(userId: string, lessonId: string) { /* ... */ }
}

@Controller("lessons")
export class ProgressController {
    constructor(private readonly progress: ProgressService) {}

    @Post(":id/complete")
    complete(@Param("id") lessonId: string, @Req() req: AuthenticatedRequest) {
        return this.progress.complete(req.user.id, lessonId);
    }
}`, "progress.service.ts"),
        p("A singleton is fine as long as its fields hold only things that are the same for every request: injected dependencies, configuration, a cache of shared data. Anything that belongs to one request (the user, a transaction, a correlation id) goes into arguments, or into request scope when it really must be injected and you have measured the cost."),

        h2("5. How to verify the wiring"),
        bullets([
            "**A compile test per module.** `await Test.createTestingModule({ imports: [ProgressModule] }).compile()` builds ProgressModule with only what it declares and imports, so a missing import fails in CI instead of at deploy time. Override the database provider with a fake if it connects on startup. This is the test the ticket was missing: the unit tests used `new`, which never checks the module's wiring.",
            "**One declaration per provider.** `grep -rn \"providers:\" src --include=*.module.ts` and check that every domain service appears in the `providers` of exactly one module. A second occurrence is a second instance.",
            "**One instance at runtime.** A constructor log line, or `app.get(UserService)` compared with the instance injected into another module in an integration test, proves that two modules share one object.",
            "**Exports stay small.** Read each module's `exports`: services, not repositories, and nothing that only exists to make an error go away. Review changes to `exports`, `imports` and `@Global()` like changes to a public API, because they are one.",
            "**Concurrency for per-request state.** For anything that depends on the current user, fire two requests for two users at the same time (for example two supertest calls in `Promise.all`) and check each response. A singleton with a `currentUserId` field fails this test quickly.",
        ]),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**Declaring another module's provider again.** The incident. The error goes away, a second instance appears. Spot it with the grep above or a constructor log line that prints twice.",
            "**Exporting the repository.** `exports: [UserService, UserRepository]` lets every importer bypass the service's rules. Spot it by reading `exports` lists: repositories should never be there.",
            "**Relying on transitive imports.** Expecting `UserService` in ProgressModule because CourseModule imports UserModule. Nest stops at startup with the index of the missing argument; import UserModule directly.",
            "**Mixing up the arrays.** A service in `imports` or a module in `providers`. For the first, Nest stops with an error that classes annotated with `@Injectable()` must not appear in the `imports` array; for an `exports` entry that the module does not provide or import, it reports that it cannot export a provider that is not part of the module. Read which array the error names.",
            "**`@Global()` to silence errors, and per-request data in singleton fields.** Both make code that works in a demo and fails later: the first hides the dependency graph, the second mixes up users under load. Spot `@Global()` on domain modules in review, and fields like `currentUser` or `currentTenant` on `@Injectable()` classes without a scope.",
        ]),

        h2("7. Summary"),
        numbered([
            "Providers are private to their module. Another module can inject one only when the owner exports it and the user imports the owner; imports are not transitive, and re-exporting is for deliberate facades.",
            "Read \"Nest can't resolve dependencies\" by its parts: the class, the parameter list with `?`, the token and index, and the module context. Fix it with an export and an import, never by declaring the provider in a second module, which creates a second instance.",
            "Providers are singletons by default; keep per-request data in arguments, avoid global domain modules, and use request scope only when you need it and have measured its cost.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS docs, Modules: shared modules, module re-exporting and global modules - docs.nestjs.com/modules",
            "NestJS docs, Injection scopes: DEFAULT, REQUEST, TRANSIENT and scope hierarchy - docs.nestjs.com/fundamentals/injection-scopes",
            "NestJS docs, Common errors: \"Cannot resolve dependency\" - docs.nestjs.com/faq/common-errors",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the module diagram you drew in lesson 1.1 and write next to each box its exports (services only) and its imports. Then, for an API you work on, run the grep for providers and list every class declared in two modules, every exported repository and every @Global() module. For each one, write the export and import that would replace it, and one compile test per module that would have caught the missing import."),
    ],
});
