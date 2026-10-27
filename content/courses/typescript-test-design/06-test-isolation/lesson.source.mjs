// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ttd-2-3",
    title: "Test isolation: shared state, order & parallel runs",
    slug: { _type: "slug", current: "test-isolation-shared-state-order-parallel-runs" },
    description:
        "A leaderboard test failed in the full run and passed when run alone, and two integration test files collided on the same e-mail address one CI run in three. Learn where tests share state without saying so - module-level caches and singletons, fixtures changed in place, global fakes that are never restored, a database that is not reset, unseeded randomness - how Vitest orders and parallelises tests, and the habits that keep every test independent: fresh state in beforeEach, unique test data, and randomness with a seed you can replay.",
    estimatedTime: 18,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Two tickets landed on the same day. First: \"leaderboard.test.ts > a learner who finished today is ranked first\" fails in every full CI run of the API but passes when a developer runs that one test locally to debug it. Second: the integration job fails about one run in three with duplicate key value violates unique constraint \"users_email_key\", sometimes in users.test.ts and sometimes in enrollments.test.ts. Nobody changed either test this week; the week before, someone added a cache to the leaderboard and a second integration test file.",
    },

    content: [
        h2("1. The incident: tests that pass alone and fail together"),
        p("The first ticket reproduces in ten seconds. Run the file, then run the failing test on its own:"),
        code("bash", `
$ npx vitest run src/leaderboard/leaderboard.test.ts
 FAIL  src/leaderboard/leaderboard.test.ts > a learner who finished today is ranked first
AssertionError: expected 'anna' to be 'chi'
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)

$ npx vitest run src/leaderboard/leaderboard.test.ts -t "finished today"
 Test Files  1 passed (1)
      Tests  1 passed | 1 skipped (2)`, "terminal"),
        p("A test whose result depends on which other tests ran before it is **not isolated**. It is not broken in a random way - it fails every time the other test runs first - but it lies twice: alone it says the code works, together it blames code that may be fine. Here is the code under test and the two tests:"),
        code("typescript", `
// src/leaderboard/leaderboard.ts
const cache = new Map<string, Row[]>();                       // module-level: lives as long as the module

export async function leaderboard(courseId: string, repo: ProgressRepository): Promise<Row[]> {
    const hit = cache.get(courseId);
    if (hit) return hit;
    const rows = (await repo.topLearners(courseId)).sort((a, b) => b.points - a.points);
    cache.set(courseId, rows);
    return rows;
}

// src/leaderboard/leaderboard.test.ts
test("ranks learners by points", async () => {
    const repo = fakeProgress({ "ts-101": [{ user: "binh", points: 700 }, { user: "anna", points: 900 }] });
    expect((await leaderboard("ts-101", repo))[0].user).toBe("anna");
});

test("a learner who finished today is ranked first", async () => {
    const repo = fakeProgress({ "ts-101": [{ user: "anna", points: 900 }, { user: "chi", points: 950 }] });
    expect((await leaderboard("ts-101", repo))[0].user).toBe("chi");   // gets the cached list from the first test
});`, "leaderboard.ts"),
        p("Each test builds its own fake repository, so they look independent. They are not: both go through the same `cache`, created once when the module was imported. The second test never reaches its repository, because the first test already stored a list for `ts-101`. In production the cache works as designed; in the tests it is state that one test leaves behind for the next."),

        h2("2. Read the evidence: three questions"),
        numbered([
            "**Does it pass alone and fail together?** Then something survives between tests: module state, a global, a fixture, the database. Use `-t \"name\"` (or `test.only` locally) to run it alone, and the full file or suite to run it together.",
            "**Does it depend on the order?** Change the order and watch. Vitest can shuffle tests: `npx vitest run --sequence.shuffle` prints the seed it used, and `--sequence.seed=<that seed>` replays the same order. A failure that follows the order is shared state, not a race.",
            "**Does it depend on what runs at the same time?** Run the suite with `--no-file-parallelism` (one file at a time). If the failure disappears, two files share something outside memory: a database, a file, a port, an environment variable of a shared process.",
        ]),
        callout("info", "How Vitest runs tests (3.x defaults)",
            "Test files run in parallel in several workers. Tests inside one file run one after another, in the order they are written, unless you opt in with test.concurrent or the sequence.concurrent option. Each test file gets its own fresh module graph by default (the isolate option), so a module-level cache leaks between tests of the same file but not between files. A database, a directory or a network port is shared by all files at once. Check the configuration reference of your version: pools, isolation and their defaults have changed between releases."),
        p("The second ticket answers the third question. With `--no-file-parallelism` the integration job is green ten times in a row; with the default it fails about one run in three:"),
        code("typescript", `
// test/integration/users.test.ts
beforeAll(async () => { await db.query("DELETE FROM users WHERE email = 'learner@codedev.test'"); });
test("sign-up creates an unverified user", async () => {
    const user = await signUp(db, { email: "learner@codedev.test", password: "test-password-1" });
    expect(user.verified).toBe(false);
});

// test/integration/enrollments.test.ts - added last week, runs in another worker at the same time
test("a new learner can enroll", async () => {
    const user = await signUp(db, { email: "learner@codedev.test", password: "test-password-1" });
    expect((await enroll(db, user.id, "ts-101")).ok).toBe(true);
});`, "two integration files"),
        p("Both files insert the same e-mail address into the same database, at roughly the same time. Whichever file inserts second hits `users_email_key`. The cleanup in `beforeAll` makes it worse: it can delete the row the other file just created. Isolation between test files in memory does nothing for a database they both connect to."),

        h2("3. The core idea: every test builds the world it needs"),
        p("A test is isolated when its result depends only on its own code and on the code under test - not on other tests, their order, or what runs beside it. The test is then a reliable experiment: run it alone, first, last or in parallel, and it gives the same answer. Shared state is where isolation breaks; here are the usual places it hides:"),
        bullets([
            "**Module-level state**: caches, counters, singletons (`export const db = new Pool()`, a registry, a memoised config). Created once per import, kept across tests.",
            "**Globals changed by a test**: fake timers (`vi.useFakeTimers` without `vi.useRealTimers`, lesson 2.1), `process.env` values, `vi.spyOn` on a shared object without restoring it.",
            "**Fixtures changed in place**: a `const learners = [...]` at the top of the file that one test sorts or pushes into.",
            "**External state**: rows in a database, files in a temp directory, an open port, a Redis key. Shared by every test in every file and every worker.",
            "**Randomness without a seed**: `Math.random()` in the code or in generated test data gives a different input on every run, so a failure may never come back when you try to debug it.",
        ]),
        h3("When sharing is acceptable"),
        p("Sharing is fine for things nobody changes: a read-only fixture (freeze it with `Object.freeze` to be sure), a compiled schema, a database container started once for the whole run. Starting PostgreSQL per test would be slow for no gain; what must be fresh is the **data** each test reads and writes, not the server."),

        challenge("chal_quiz_ttd_231"),

        h2("4. The fixes"),
        h3("Fresh state in beforeEach - or no module state at all"),
        p("The cleanest fix for the leaderboard is to stop hiding the cache in the module. Create it with the object that uses it, and give each test its own:"),
        code("typescript", `
// src/leaderboard/leaderboard.ts
export function createLeaderboard(repo: ProgressRepository, cache = new Map<string, Row[]>()) {
    return async (courseId: string): Promise<Row[]> => {
        const hit = cache.get(courseId);
        if (hit) return hit;
        const rows = (await repo.topLearners(courseId)).sort((a, b) => b.points - a.points);
        cache.set(courseId, rows);
        return rows;
    };
}

// production: one instance for the process, created at startup
export const leaderboard = createLeaderboard(postgresProgress);

// leaderboard.test.ts: a new instance, and so a new cache, in every test
test("a learner who finished today is ranked first", async () => {
    const top = createLeaderboard(fakeProgress({ "ts-101": [{ user: "anna", points: 900 }, { user: "chi", points: 950 }] }));
    expect((await top("ts-101"))[0].user).toBe("chi");
});`, "leaderboard.ts"),
        p("When you cannot restructure the module yet, reset it before every test. `beforeEach` runs before each test in its scope; use it to build fresh fixtures and to undo every global change:"),
        code("typescript", `
import { afterEach, beforeEach, vi } from "vitest";

let learners: Learner[];
beforeEach(() => {
    learners = [{ user: "anna", points: 900 }, { user: "binh", points: 700 }];  // a new array per test
    clearLeaderboardCache();                // a reset exported for tests, until the cache is injected
});

afterEach(() => {
    vi.useRealTimers();                     // undo fake time
    vi.restoreAllMocks();                   // undo vi.spyOn
    vi.unstubAllEnvs();                     // undo vi.stubEnv
});`, "setup"),
        p("Reset **before** each test, not only after: a test that crashes halfway never runs its own cleanup, and the next test should not depend on that."),
        h3("Unique test data for shared resources"),
        p("For the database, give every test data that no other test can collide with, and let each test find only its own rows:"),
        code("typescript", `
import { randomUUID } from "node:crypto";

const uniqueEmail = () => \`learner-\${randomUUID()}@codedev.test\`;

test("a new learner can enroll", async () => {
    const user = await signUp(db, { email: uniqueEmail(), password: "test-password-1" });
    expect((await enroll(db, user.id, "ts-101")).ok).toBe(true);
});`, "enrollments.test.ts"),
        bullets([
            "**Unique keys per test** (above) are the cheapest fix and also work when a previous run left rows behind.",
            "**A transaction per test, rolled back in afterEach**, leaves no rows at all - when the code under test can run on the transaction's connection.",
            "**One database or schema per worker** for heavy suites: Vitest sets `process.env.VITEST_POOL_ID` in each worker (check the docs of your version), which you can use to pick `codedev_test_1`, `codedev_test_2` and so on.",
            "**Never** clean up with broad deletes such as `DELETE FROM users` in a suite that runs files in parallel: you delete the other file's data in the middle of its test.",
        ]),
        h3("Randomness with a seed"),
        p("Code that shuffles quiz questions or picks a random variant takes a random source, exactly like it takes a clock. Production passes `Math.random`; tests pass a seeded generator, so the same seed gives the same \"random\" sequence on every run:"),
        code("typescript", `
// a small, well-known seeded generator (mulberry32): same seed, same sequence
export function seededRandom(seed: number): () => number {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function shuffleQuestions<T>(items: readonly T[], random: () => number = Math.random): T[] {
    const out = [...items];                                   // never shuffle the caller's array
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

test("the shuffle keeps every question exactly once", () => {
    const seed = Number(process.env.TEST_SEED ?? Date.now() % 100000);
    const shuffled = shuffleQuestions(questions, seededRandom(seed));
    expect(shuffled.toSorted(byId), \`seed \${seed}\`).toEqual([...questions].sort(byId));
});`, "shuffle.ts"),
        p("This test uses a new seed on every run to explore more orders, and puts the seed in the failure message. When it fails in CI, `TEST_SEED=<seed> npx vitest run` replays the exact input. A test that needs one specific order uses a fixed seed instead."),

        h2("5. How to verify isolation"),
        numbered([
            "**Alone and together.** Run the failing test alone (`-t`), its file, then the whole suite. All three must agree.",
            "**Shuffled, several times.** `npx vitest run --sequence.shuffle` a few times in a row; when one fails, rerun with the printed `--sequence.seed` to reproduce the order, then fix the state, not the order.",
            "**Twice against the same database.** Run the integration job two times without resetting the database. Tests that assume an empty table or a fixed id fail on the second run.",
            "**Parallel and serial.** Compare the default run with `--no-file-parallelism`. A difference means files share something outside memory.",
            "**Repeat a suspicious test.** `test.each(Array.from({ length: 50 }, (_, i) => i))` around a test body, or a CI job that reruns the suite, shows whether a fix removed the dependency or just made it rarer.",
        ]),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**A hidden module-level cache or singleton.** Spot it: `const cache = new Map()` or `let instance` at the top level of a source file; a test that passes alone and fails after another test of the same file.",
            "**Fixing the order instead of the state.** Moving the failing test to the top of the file, or a `sequence` setting that pins the order, makes the suite green and keeps the dependency. Spot it: a commit that only reorders tests.",
            "**Cleanup only in afterEach.** A crashed test skips it, and the next test inherits the mess. Spot it: one real failure followed by a chain of unrelated failures in the same file.",
            "**Hard-coded keys in shared resources.** The same e-mail, id or file name in two tests that run in parallel. Spot it: unique-constraint errors or \"file exists\" errors that move between test files from run to run.",
            "**Unseeded randomness in tests.** A failure that nobody can reproduce. Spot it: `Math.random()` or `faker` in test data without a seed printed on failure.",
        ]),

        h2("7. Summary"),
        bullets([
            "A test is isolated when it gives the same result alone, in any order and next to any other test. Check all three: `-t`, `--sequence.shuffle` with a seed, and `--no-file-parallelism`.",
            "Shared state hides in module-level caches and singletons, globals a test changed, fixtures changed in place, the database, and unseeded randomness. Build fresh state per test (factories, `beforeEach`) and undo every global change.",
            "For shared resources, give every test its own data (unique keys, a rolled-back transaction, a database per worker), and pass a seeded random source so any failure can be replayed.",
        ]),

        h2("Sources"),
        bullets([
            "Vitest guide: Test Filtering, Improving Performance (pools, isolate, file parallelism) and the sequence configuration options - vitest.dev",
            "Vitest guide, Mocking: restoring mocks, timers and environment variables - vitest.dev/guide/mocking",
            "Martin Fowler, The Practical Test Pyramid - martinfowler.com/articles/practical-test-pyramid.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run your project's test suite with --sequence.shuffle five times and write down every test that fails in at least one run, with its seed. For each, find the shared state using the three questions from section 2 and fix the state rather than the order. Then search the source folders for top-level new Map(), let and singleton instances, and decide for each one whether tests need a way to get a fresh copy."),
    ],
});
