// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ttd-2-2",
    title: "Fakes, stubs & mocks: where to draw the boundary",
    slug: { _type: "slug", current: "fakes-stubs-mocks-where-to-draw-the-boundary" },
    description:
        "The enrollment service tests needed a real PostgreSQL database and took nine minutes, so the team replaced the repository with vi.fn() mocks. The suite became fast and green - and a double click on Enroll started returning 500, because no mock ever threw the unique-constraint error the database throws. Learn the difference between stubs, mocks and fakes, where to put the boundary (at the slow or non-deterministic edge, not around your own logic), why over-mocking hides bugs, and how one contract test keeps an in-memory fake honest against the real repository.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Two weeks ago the EnrollmentService tests were rewritten: they used to start a PostgreSQL container and took nine minutes in CI, and now every repository method is a vi.fn() and the file runs in 40 ms. Since Monday the API at https://api.codedev.test has logged 312 responses \"500 Internal Server Error\" on POST /enrollments, all from learners who clicked Enroll twice. The service has a catch block for exactly this case, it has a test, and the test is green.",
    },

    content: [
        h2("1. The incident: green tests, red production"),
        p("The API log shows what the database said on the second click:"),
        code("text", `
2026-10-26T08:14:03.208Z POST /enrollments user=u_8812 course=ts-101 201 38ms
2026-10-26T08:14:03.391Z POST /enrollments user=u_8812 course=ts-101 500 12ms
  error: duplicate key value violates unique constraint "enrollments_user_course_key"
  code: '23505'  detail: 'Key (user_id, course_id)=(u_8812, ts-101) already exists.'
  at PostgresEnrollmentRepository.create (src/enrollments/postgresRepository.ts:41)`, "api.log"),
        p("And this is the service, together with the test that was supposed to cover the double click:"),
        code("typescript", `
// src/enrollments/service.ts
async enroll(userId: string, courseId: string): Promise<EnrollResult> {
    try {
        const enrollment = await this.repo.create({ userId, courseId, status: "active", progress: 0,
            enrolledAt: this.clock.now().toISOString() });
        return { ok: true, enrollment };
    } catch (error) {
        if (error instanceof DuplicateEnrollmentError) return { ok: false, error: "already_enrolled" };
        throw error;                                          // anything else becomes a 500
    }
}

// src/enrollments/service.test.ts
test("enrolling twice returns already_enrolled", async () => {
    const repo = {
        create: vi.fn()
            .mockResolvedValueOnce({ id: "e1", userId: "u1", courseId: "ts-101" })
            .mockRejectedValueOnce(new DuplicateEnrollmentError("u1", "ts-101")),
        findById: vi.fn(), findByUser: vi.fn(), update: vi.fn(), delete: vi.fn(),
    };
    const service = new EnrollmentService(repo, fixedClock);
    await service.enroll("u1", "ts-101");
    expect(await service.enroll("u1", "ts-101")).toEqual({ ok: false, error: "already_enrolled" });
    expect(repo.create).toHaveBeenCalledTimes(2);
});`, "service.ts"),
        p("The test passes because the **test author** decided that the repository throws `DuplicateEnrollmentError`. The real `PostgresEnrollmentRepository` never does: it lets the driver's error (code `23505`) escape. The service and its mock agree with each other perfectly, and both disagree with the database. A test made of mocks can only check that your code is consistent with your own assumptions; when the assumption is the bug, the test inherits it."),

        h2("2. Read the evidence"),
        p("Three questions settle where the bug lives:"),
        numbered([
            "**What error does the real dependency throw?** The stack trace ends in `postgresRepository.ts:41`, and the error is the driver's (`code: '23505'`), not `DuplicateEnrollmentError`. That class is only ever constructed in `service.test.ts` - `grep -rn \"new DuplicateEnrollmentError\" src/` returns nothing outside the tests.",
            "**What does the green test actually check?** Two things: that `create` was called twice, and that the service maps the error the mock throws. Nothing in it touches the code that runs in production on the second click.",
            "**Would the old, slow test have caught it?** Yes: against a real database the second `create` throws the real error, and the test would have failed with the same 500 the learners saw. The team traded the only test that knew the contract for speed.",
        ]),
        p("The fix in production is one mapping in the repository: catch the driver error with code `23505` on `enrollments_user_course_key` and throw `DuplicateEnrollmentError`. The fix in the tests is the subject of this lesson: keep them fast **and** keep the contract."),

        h2("3. Stubs, mocks and fakes"),
        p("\"Mock\" is used for any replacement, but the replacements do different jobs. The names below come from Gerard Meszaros' xUnit Test Patterns, popularised by Martin Fowler; the umbrella term is **test double**."),
        bullets([
            "**Stub**: returns canned answers so the code under test can run. It feeds values **in** and nobody asserts on it. `{ now: () => new Date(\"2026-10-31T16:59:00Z\") }` from lesson 2.1 is a stub clock.",
            "**Mock** (and its passive cousin, the **spy**): records the calls it receives so the test can assert on what went **out**: `expect(sendEmail).toHaveBeenCalledWith(...)`. In Vitest, `vi.fn()` and `vi.spyOn()` create both: they can return canned values and record calls.",
            "**Fake**: a real, working implementation with a shortcut - an in-memory repository instead of PostgreSQL, a `Map` instead of Redis, an outbox array instead of an SMTP server. It has behaviour: what you `create` you can `findById` later, and a duplicate is refused.",
        ]),
        h3("Where to draw the boundary"),
        p("Replace a dependency when using the real one would make the test slow, non-deterministic or impossible to set up: the database, the network, the clock, randomness, email and payment providers. Keep everything else real, especially your own pure logic, value objects and small helpers. A useful rule: **double what you own the interface of, at the edge of your system**, such as `EnrollmentRepository` or `Clock`, and do not mock libraries' internals or the module under test."),
        bullets([
            "**Use a fake** for a dependency with state that the code reads back (repositories, caches, queues). A stub would make you script every read in advance, in the order the code happens to make them today.",
            "**Use a mock or spy** when the call itself is the outcome: an email was sent, a payment was charged, an event was published - and nobody reads it back inside the code you test.",
            "**Use a stub** for simple inputs: the clock, a feature flag, a configuration value.",
        ]),
        h3("Why over-mocking hides bugs"),
        bullets([
            "**A mock answers whatever you script.** It never throws an error you did not think of, never returns rows in a different order, never refuses a duplicate. The bugs that live in those gaps are exactly the ones you cannot see.",
            "**Call assertions test the implementation, not the behaviour.** `toHaveBeenCalledTimes(2)` breaks when someone adds a harmless `findByUser` check, and passes when the result is wrong.",
            "**Mocked state drifts from the real thing.** A scripted `findById` returns the enrollment as it was when the test was written, not as the code just changed it.",
        ]),
        h3("When not to use a fake"),
        p("A fake reproduces the contract you wrote down, not the database. SQL syntax, migrations, transactions under concurrency, query plans and constraints you did not copy into the fake still need an **integration test against real PostgreSQL** (lesson 1.1). The usual split: many fast service tests on the fake, a few integration tests on the real repository, and one contract suite that runs against both."),

        challenge("chal_quiz_ttd_221"),

        h2("4. Worked example: one contract, two implementations"),
        p("Start from the interface the service already depends on. The contract is everything a caller may rely on, written as tests rather than comments:"),
        code("typescript", `
// src/enrollments/repository.ts
export interface EnrollmentRepository {
    create(input: NewEnrollment): Promise<Enrollment>;          // throws DuplicateEnrollmentError on (userId, courseId)
    findById(id: string): Promise<Enrollment | null>;
    findByUser(userId: string): Promise<Enrollment[]>;          // oldest enrolledAt first
    update(id: string, changes: EnrollmentChanges): Promise<Enrollment | null>;
    delete(id: string): Promise<boolean>;                       // false when nothing was deleted
}`, "repository.ts"),
        code("typescript", `
// src/enrollments/repository.contract.ts - shared by the fake and the real repository
import { beforeEach, describe, expect, test } from "vitest";

export function enrollmentRepositoryContract(name: string, makeRepo: () => Promise<EnrollmentRepository>) {
    describe(\`\${name} satisfies the EnrollmentRepository contract\`, () => {
        let repo: EnrollmentRepository;
        beforeEach(async () => { repo = await makeRepo(); });

        test("a second enrollment in the same course is refused", async () => {
            await repo.create(row("u1", "ts-101"));
            await expect(repo.create(row("u1", "ts-101"))).rejects.toBeInstanceOf(DuplicateEnrollmentError);
        });

        test("changing a returned object does not change the stored row", async () => {
            const created = await repo.create(row("u1", "ts-101"));
            created.progress = 99;
            expect((await repo.findById(created.id))?.progress).toBe(0);
        });

        test("deleting twice is not an error", async () => {
            const { id } = await repo.create(row("u1", "ts-101"));
            expect(await repo.delete(id)).toBe(true);
            expect(await repo.delete(id)).toBe(false);
        });
    });
}`, "repository.contract.ts"),
        code("typescript", `
// src/enrollments/fakeRepository.test.ts - runs everywhere, in milliseconds
enrollmentRepositoryContract("FakeEnrollmentRepository", async () => new FakeEnrollmentRepository());

// src/enrollments/postgresRepository.test.ts - runs in the integration job, which has a database
describe.skipIf(!process.env.DATABASE_URL)("PostgreSQL", () => {
    enrollmentRepositoryContract("PostgresEnrollmentRepository", async () => {
        await db.query("TRUNCATE enrollments");
        return new PostgresEnrollmentRepository(db);
    });
});`, "contract runs"),
        p("Run this before the production fix and the PostgreSQL run fails on the first contract test with the `23505` error from the incident: the contract caught the bug the mocks hid. After the mapping in the repository, both runs pass, and from then on the service tests use the fake with confidence. When someone changes the real repository, the contract tells them whether the fake must change too."),
        h3("The service test, rewritten with the fake and a stub clock"),
        code("typescript", `
test("enrolling twice returns already_enrolled and keeps one enrollment", async () => {
    const repo = new FakeEnrollmentRepository();
    const clock = { now: () => new Date("2026-10-26T08:14:03Z") };      // stub
    const service = new EnrollmentService(repo, clock);

    await service.enroll("u1", "ts-101");
    expect(await service.enroll("u1", "ts-101")).toEqual({ ok: false, error: "already_enrolled" });
    expect(await repo.findByUser("u1")).toHaveLength(1);               // the outcome, not the calls
});`, "service.test.ts"),
        p("No call counts, no scripted answers. The test describes what a learner sees and what the database ends up holding, so it survives refactoring and fails when the behaviour breaks."),
        h3("Where a mock is the right tool"),
        p("Sending the welcome email is a side effect that nothing reads back. A spy is the clearest assertion, and `vi.fn()` is enough:"),
        code("typescript", `
test("a new enrollment sends one welcome email; a duplicate sends none", async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const service = new EnrollmentService(new FakeEnrollmentRepository(), clock, { sendEmail });

    await service.enroll("u1", "ts-101");
    await service.enroll("u1", "ts-101");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith({ to: "u1", template: "welcome", courseId: "ts-101" });
});`, "service.test.ts"),
        callout("info", "Version note",
            "vi.fn(), mockResolvedValue, mockRejectedValueOnce, toHaveBeenCalledWith and describe.skipIf exist in Vitest 3.x. vi.mock(\"./module\") replaces a whole module and is hoisted to the top of the file, which surprises many people; its exact rules have changed between versions, so read the mocking guide for your version before you use it - and prefer passing the dependency in, as above, when you can."),

        h2("5. Write the fake"),
        p("In the exercise the runner gives you the interface, the error class and the unchanged `EnrollmentService`, and runs scripted enrollments - double clicks, cancellations, learners leaving a course, callers changing the objects they get back - against your in-memory repository. It is the same contract the PostgreSQL repository satisfies, so a fake that passes is one the service tests can trust:"),
        challenge("chal_coding_ttd_222"),

        h2("6. How to verify your doubles"),
        bullets([
            "**Run the contract against both implementations.** The fake in every run, PostgreSQL in the integration job. A fake without a contract test is a guess that gets older every sprint.",
            "**Break the code on purpose.** Delete the `catch` in `enroll` and run the service tests. With the mocked repository they stay green if the mock never throws; with the fake they fail. A test that cannot fail when the behaviour breaks is not testing it (lesson 3.4 makes this systematic with mutation testing).",
            "**Count your mocks.** A test with more `vi.fn()` lines than assertions about results is usually testing wiring. Ask which of them could be a fake or the real object.",
            "**Read the error path against production.** For each error a double throws, find the line in the real implementation that throws it. If there is none - as with `DuplicateEnrollmentError` in the incident - the test is checking fiction.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**Mocking the dependency into saying what the code expects.** The incident in one line. Spot it: an error class or return value that only the test file ever constructs.",
            "**A fake that returns its stored objects.** PostgreSQL returns a new object for every read; a `Map` returns the same one. A service that changes the object and forgets to call `update` passes against the fake and loses the change in production. Spot it: a contract test that changes a returned object and reads it back.",
            "**Asserting calls instead of results.** `toHaveBeenCalledTimes` on a repository method breaks on harmless refactors and stays green on wrong results. Spot it: tests that fail after a refactor that changed no behaviour.",
            "**Mocking your own logic.** Mocking `calculateProgress` inside a test of `recordProgress` tests nothing but the call. Spot it: `vi.mock` or `vi.spyOn` on a module from the same feature folder as the code under test.",
            "**Scripted reads in the order of today's code.** `mockResolvedValueOnce` chains break when the code reads in a different order, and pass when it reads stale data. Spot it: long `Once` chains; replace them with a fake that holds state.",
        ]),

        h2("8. Summary"),
        bullets([
            "Stubs feed values in, mocks and spies record what goes out, fakes are working lightweight implementations. Choose by what the code does with the dependency, not by habit.",
            "Draw the boundary at the slow or non-deterministic edge you own (repository, clock, email sender) and keep your own logic real. Over-mocking checks your assumptions, so a wrong assumption ships with green tests.",
            "Keep a fake honest with a contract test that runs against the fake and the real implementation, and keep a few integration tests for what only the database can tell you.",
        ]),

        h2("Sources"),
        bullets([
            "Vitest guide, Mocking (functions, vi.fn, vi.spyOn, modules) - vitest.dev/guide/mocking",
            "Martin Fowler, Mocks Aren't Stubs, and The Practical Test Pyramid - martinfowler.com/articles/practical-test-pyramid.html",
            "PostgreSQL documentation, Appendix A: Error Codes (23505 unique_violation)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one test file in your project with several vi.fn() repositories. Write the contract for that repository as three or four tests, make an in-memory fake pass them, and rewrite the service tests to use the fake. Then delete one error-handling branch in the service and check which version of the tests notices."),
    ],
});
