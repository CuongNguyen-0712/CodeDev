// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-1-2",
    title: "Providers & dependency injection: constructor injection and fakes",
    slug: { _type: "slug", current: "providers-dependency-injection-fakes" },
    description:
        "EnrollmentService created its own PgEnrollmentRepository and read the time with new Date() inside its methods, so its unit tests needed a real Postgres and one of them failed almost every night when the run crossed midnight. Learn what a NestJS provider is, how Nest injects constructor parameters by token, how to bind a token to an implementation with useClass, useValue and useFactory, why an interface cannot be a token, and how to test a service with an in-memory repository and a fixed clock. You then write such a service yourself.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The nightly CI run of the CodeDev API starts at 23:58 UTC. For three weeks it has been red on 19 of 21 nights, always on the same test, \"EnrollmentService lists today's enrollments\", while every daytime run is green. The unit-test job also needs a Postgres container, because EnrollmentService opens its own database connection, so the 214 unit tests take six minutes and fail with ECONNREFUSED whenever the container starts late. Nobody can reproduce the nightly failure on a laptop.",
    },

    content: [
        h2("1. The incident: a test that only fails at midnight"),
        p("This is the CI report the team has been ignoring for three weeks:"),
        code("text", `
CI  nightly #412   started 2026-10-25 23:58:04 UTC   FAILED (1 of 214)

  ● EnrollmentService › lists today's enrollments
    expect(received).toHaveLength(expected)
    Expected length: 1
    Received length: 0
      at src/enrollments/enrollment.service.spec.ts:58:41
    test started 23:59:59.871, finished 00:00:00.334

History:  failed on 19 of the last 21 nightly runs, passed on all 340 daytime runs
Job:      unit tests need DATABASE_URL (Postgres service container), 6 min 12 s`, "CI report"),
        p("The service under test hides two things the test cannot control:"),
        code("typescript", `
// src/enrollments/enrollment.service.ts - the version that shipped
@Injectable()
export class EnrollmentService {
    async enroll(userId: string, courseId: string): Promise<Enrollment> {
        const repo = new PgEnrollmentRepository();       // opens a pool from process.env.DATABASE_URL
        const now = new Date();                          // the machine's clock
        return repo.insert({ userId, courseId, enrolledAt: now, expiresAt: addDays(now, 30) });
    }

    async enrolledOn(day: string): Promise<Enrollment[]> {   // day = "2026-10-25"
        return new PgEnrollmentRepository().findByDay(day);
    }
}`, "enrollment.service.ts"),
        code("typescript", `
it("lists today's enrollments", async () => {
    await service.enroll("u1", "c42");
    const today = new Date().toISOString().slice(0, 10);
    expect(await service.enrolledOn(today)).toHaveLength(1);
});`, "enrollment.service.spec.ts"),
        p("Read the timestamps in the report. The enrollment was saved at about 23:59:59.9, so its day is `2026-10-25`. The test computed `today` a few hundred milliseconds later, after midnight: `2026-10-26`. Two calls to `new Date()`, one in the service and one in the test, landed on different days. The service has no bug in this case; the test is wrong. But nobody could prove that, because nobody could run the code at 23:59:59.9 on demand."),

        h2("2. Read the evidence: hidden dependencies"),
        p("A dependency is anything a class needs that it does not compute from its own arguments: a database, the current time, a random number, configuration, another service. When the class creates a dependency itself, the caller (and the test) cannot choose it. Find them with one search:"),
        code("bash", `
$ grep -rnE "new Pg[A-Za-z]+\\(|new Date\\(\\)|Date\\.now\\(\\)|process\\.env\\." src --include=*.service.ts
src/enrollments/enrollment.service.ts:9:   const repo = new PgEnrollmentRepository();
src/enrollments/enrollment.service.ts:10:  const now = new Date();
src/enrollments/enrollment.service.ts:15:  return new PgEnrollmentRepository().findByDay(day);
src/progress/progress.service.ts:41:       const completedAt = new Date();
src/users/user.service.ts:22:              if (process.env.STREAK_GRACE_HOURS) {`, "terminal"),
        p("Each match is a decision the service makes for every caller: which database to use, which time it is, which configuration applies. Three consequences follow, and the incident shows all of them:"),
        bullets([
            "**Tests need the real thing.** A unit test of `enroll` needs a running Postgres, the right schema and a clean table. That is six minutes per run and a failure whenever the container is slow to start.",
            "**Time cannot be chosen.** You cannot test \"the enrollment expires after 30 days\" or \"just before midnight\" without waiting, and you cannot reproduce the nightly failure at 10 a.m.",
            "**Every call builds a new pool.** `new PgEnrollmentRepository()` per call opens connections per request in production as well; nobody decided that, it just happened.",
        ]),

        h2("3. The core idea: ask for dependencies, do not create them"),
        p("**Dependency injection** turns the decision around. The class declares what it needs as constructor parameters, and whoever creates the class passes them in. In production that is Nest; in a unit test it is you, with fakes. The class itself no longer knows which database or which clock it gets."),
        h3("Providers and the Nest container"),
        p("In NestJS, a **provider** is anything the framework can create and inject: usually a class marked with `@Injectable()` and listed in a module's `providers`. When Nest builds a module it reads each provider's constructor parameter types, finds a provider for each one, creates it first (or reuses the existing instance) and passes it in. By default each provider is created once and shared by everything in the module that asks for it (lesson 1.3 covers scopes)."),
        p("How does Nest know the parameter types at runtime, when TypeScript types are erased? With `emitDecoratorMetadata: true` in `tsconfig.json` (set by the Nest CLI), the compiler records the constructor parameter types of every decorated class as metadata. That is why `@Injectable()` matters even on a class with no options: without a decorator, no metadata is emitted, and Nest creates the class with no arguments."),
        p("Nest matches parameters to providers by **token**. For `constructor(private readonly repo: EnrollmentRepository)` the token is the class `EnrollmentRepository` itself. A module's `providers` entry says which value to give for a token:"),
        code("typescript", `
providers: [
    EnrollmentService,                                              // short for { provide: EnrollmentService, useClass: EnrollmentService }
    { provide: EnrollmentRepository, useClass: PgEnrollmentRepository },   // token -> implementation
    { provide: Clock, useValue: { now: () => new Date() } },               // token -> a ready-made object
    {
        provide: ACCESS_DAYS,                                       // a string or symbol token, injected with @Inject(ACCESS_DAYS)
        useFactory: (config: ConfigService) => config.get<number>("ACCESS_DAYS", 30),
        inject: [ConfigService],
    },
]`, "provider forms"),
        h3("An interface is not a token"),
        p("TypeScript interfaces do not exist at runtime, so Nest cannot match on one. A constructor parameter typed with an interface is recorded as `Object`, and Nest cannot find a provider for it. Use an **abstract class** as the contract instead: it describes the methods like an interface, it exists at runtime, and it can be the token. (A string or symbol token with `@Inject(TOKEN)` also works; the abstract class keeps the type and the token in one name.)"),
        callout("info", "When not to inject",
            "Inject what has state, side effects or more than one implementation: a repository, a clock, an HTTP client, another domain's service. Do not turn everything into a provider. A pure function such as quotePrice(outline) from lesson 1.1, a value object or a DTO is simply imported and called; wrapping it in a provider adds a token and a test fake for nothing. And do not create an abstract class for every service \"in case\" there will be a second implementation: for a repository and a clock the second implementation already exists, the fake your tests need. Lesson 3.3 looks at when a repository abstraction pays for itself. Finally, a constructor with eight parameters is not a dependency injection problem: the class does too much, which is a module boundary problem (lesson 1.1)."),

        challenge("chal_quiz_nmm_121"),

        h2("4. Worked example: EnrollmentService with a repository and a clock"),
        p("Start with the two contracts. Both are abstract classes, so they can be used as tokens:"),
        code("typescript", `
// src/common/clock.ts
import { Injectable } from "@nestjs/common";

export abstract class Clock {
    abstract now(): Date;
}

@Injectable()
export class SystemClock implements Clock {
    now(): Date {
        return new Date();                 // the only new Date() in the application code
    }
}

// src/enrollments/enrollment.repository.ts
export type Enrollment = { userId: string; courseId: string; enrolledAt: Date; expiresAt: Date };

export abstract class EnrollmentRepository {
    abstract insert(enrollment: Enrollment): Promise<Enrollment>;
    abstract findByDay(day: string): Promise<Enrollment[]>;
}`, "contracts"),
        p("The Postgres implementation receives the shared database service instead of opening its own pool:"),
        code("typescript", `
// src/enrollments/pg-enrollment.repository.ts
@Injectable()
export class PgEnrollmentRepository implements EnrollmentRepository {
    constructor(private readonly db: DatabaseService) {}

    async insert(e: Enrollment): Promise<Enrollment> {
        await this.db.query(
            "INSERT INTO enrollments (user_id, course_id, enrolled_at, expires_at) VALUES ($1, $2, $3, $4)",
            [e.userId, e.courseId, e.enrolledAt, e.expiresAt],
        );
        return e;
    }

    async findByDay(day: string): Promise<Enrollment[]> {
        return this.db.query(/* ... WHERE enrolled_at::date = $1 */ "...", [day]);
    }
}`, "pg-enrollment.repository.ts"),
        p("The service now only asks. Its constructor is the complete list of what it depends on, and TypeScript parameter properties (`private readonly`) store each one as a field:"),
        code("typescript", `
// src/enrollments/enrollment.service.ts
const ACCESS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EnrollmentService {
    constructor(
        private readonly enrollments: EnrollmentRepository,
        private readonly clock: Clock,
    ) {}

    enroll(userId: string, courseId: string): Promise<Enrollment> {
        const now = this.clock.now();
        const expiresAt = new Date(now.getTime() + ACCESS_DAYS * DAY_MS);   // new Date(ms) builds a date; it does not read the clock
        return this.enrollments.insert({ userId, courseId, enrolledAt: now, expiresAt });
    }

    enrolledOn(day: string): Promise<Enrollment[]> {
        return this.enrollments.findByDay(day);
    }
}

// src/enrollments/enrollment.module.ts
@Module({
    imports: [DatabaseModule],
    providers: [
        EnrollmentService,
        { provide: EnrollmentRepository, useClass: PgEnrollmentRepository },
        { provide: Clock, useClass: SystemClock },
    ],
    exports: [EnrollmentService],
})
export class EnrollmentModule {}`, "enrollment.service.ts and enrollment.module.ts"),
        h3("The test: plain classes, no Nest, no database"),
        p("A unit test does what Nest does in production: it calls the constructor. The fakes are a few lines each and live next to the tests:"),
        code("typescript", `
class FixedClock implements Clock {
    private time: number;
    constructor(iso: string) { this.time = Date.parse(iso); }
    now(): Date { return new Date(this.time); }
    advance(ms: number): void { this.time += ms; }
}

class InMemoryEnrollmentRepository implements EnrollmentRepository {
    readonly rows: Enrollment[] = [];
    async insert(e: Enrollment) { this.rows.push(e); return e; }
    async findByDay(day: string) { return this.rows.filter((e) => e.enrolledAt.toISOString().startsWith(day)); }
}

it("keeps an enrollment made at 23:59:59.9 on that day", async () => {
    const clock = new FixedClock("2026-10-25T23:59:59.900Z");
    const service = new EnrollmentService(new InMemoryEnrollmentRepository(), clock);

    await service.enroll("u1", "c42");
    clock.advance(200);                                   // now 00:00:00.100 on the 26th

    expect(await service.enrolledOn("2026-10-25")).toHaveLength(1);
    expect(await service.enrolledOn("2026-10-26")).toHaveLength(0);
});`, "enrollment.service.spec.ts"),
        p("This test reproduces the nightly failure deliberately, at any time of day, in a few milliseconds. It also shows what the old test really meant to check, and it needs no `DATABASE_URL`. Whether `PgEnrollmentRepository` computes the day the same way is a separate question for a small integration test against a real database (lesson 4.3), not something every unit test should pay for."),
        h3("The same wiring inside Nest"),
        p("When you want to check the module's wiring as well, build it with the testing module and replace only the outside world. `Test.createTestingModule` takes the same metadata as `@Module()`; `overrideProvider` swaps one token's value:"),
        code("typescript", `
import { Test } from "@nestjs/testing";

const clock = new FixedClock("2026-10-25T23:59:59.900Z");
const moduleRef = await Test.createTestingModule({ imports: [EnrollmentModule] })
    .overrideProvider(EnrollmentRepository).useValue(new InMemoryEnrollmentRepository())
    .overrideProvider(Clock).useValue(clock)
    .compile();

const service = moduleRef.get(EnrollmentService);    // built by Nest, with the fakes injected`, "enrollment.module.spec.ts"),
        p("Note one detail: `EnrollmentModule` still imports `DatabaseModule`, so with this setup Nest still creates the database service, even though nothing uses it. If that service connects on startup, override it too. The unit test above avoids the question entirely; reach for the testing module when the wiring is what you want to test."),

        h2("5. Your turn: inject the repository and the clock"),
        p("Premium access on CodeDev lasts 30 days from the moment a learner enrolls. Write an `EnrollmentService` whose constructor receives an `EnrollmentRepository` and a `Clock`, with `enroll`, `hasAccess` and `daysLeft`. The test runner builds it with an in-memory repository (sometimes already holding enrollments, sometimes changed behind your back by an admin tool) and a fixed clock that moves only when the test says so, then runs a list of operations. The exact rules are in the challenge description and in the comments of the starter file."),
        challenge("chal_coding_nmm_122"),

        h2("6. How to verify"),
        bullets([
            "**Unit tests run without a database.** `DATABASE_URL= npx jest src/enrollments` must pass. If a unit test needs the variable, some class still creates its own connection.",
            "**The grep from section 2 finds only the edges.** `new Date()` and `Date.now()` may appear in `SystemClock` and nowhere else in services; `new Pg...` only in module wiring (better: nowhere, because Nest creates them). Run it in CI.",
            "**Time-dependent rules have tests at the edges.** A fixed clock makes \"exactly at expiry\", \"one millisecond before midnight\" and \"29 February\" ordinary test cases. If such a test is hard to write, the time is still hidden somewhere.",
            "**Wiring errors appear at startup.** A missing provider fails `npm run start:dev` (or `Test.createTestingModule(...).compile()`) immediately with \"Nest can't resolve dependencies of ...\" and names the parameter; lesson 1.3 shows how to read it. A unit test with `new` does not check the wiring, so keep one test that compiles the real module.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**Creating dependencies inside the class.** `new PgEnrollmentRepository()`, `new Date()`, `new HttpClient()` in a method. Spot it with the grep above, or when a unit test needs environment variables or a network.",
            "**An interface as the constructor type.** `constructor(private readonly clock: Clock)` with `interface Clock` compiles, but the app fails at startup and the error mentions `Object` instead of a class name. Use an abstract class, or a symbol token with `@Inject(CLOCK)`.",
            "**A provider without `@Injectable()`.** No decorator means no constructor metadata, so Nest calls the constructor with no arguments and the first method call fails with `TypeError: Cannot read properties of undefined`. Spot it when a dependency is `undefined` although the module lists every provider.",
            "**Patching globals instead of injecting.** `jest.useFakeTimers()` can freeze `Date`, and `jest.mock(\"./pg-enrollment.repository\")` can replace a module, so the old service could have been tested. But each test must remember to do it, the patch applies to everything in the process, and the code still hides its dependencies. Spot it when every test file of a service starts with the same mocks.",
            "**A fake that is easier than the real thing.** An in-memory repository that accepts duplicate enrollments while Postgres rejects them makes a broken service pass. Keep fakes small, give them the same rules as the real implementation, and check both against one shared set of tests (lesson 4.3).",
        ]),

        h2("8. Summary"),
        numbered([
            "A service should ask for its dependencies (repository, clock, other services) as constructor parameters instead of creating them; then production and tests can each pass what they need.",
            "Nest injects by token: a class, an abstract class or a string/symbol, bound with useClass, useValue or useFactory in the module's providers. Interfaces are erased at runtime and cannot be tokens.",
            "Test the rules with plain constructors, an in-memory repository and a fixed clock; keep one test that compiles the real module to check the wiring.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS docs, Providers: dependency injection and registration - docs.nestjs.com/providers",
            "NestJS docs, Custom providers: useClass, useValue, useFactory and non-class tokens - docs.nestjs.com/fundamentals/custom-providers",
            "NestJS docs, Testing: Test.createTestingModule and overrideProvider - docs.nestjs.com/fundamentals/testing",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run the grep from section 2 on an API you work on. For each match, decide whether it is a real dependency (move it to the constructor, with an abstract class token when tests need a fake) or a pure calculation (leave it as a function). Then pick one time-dependent rule, such as a streak, an expiry or a deadline, and write its test at the edge: one millisecond before and exactly at the boundary, with a fixed clock."),
    ],
});
