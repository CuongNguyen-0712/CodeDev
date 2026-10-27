// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ttd-3-1",
    title: "Fix the flaky pipeline: tests that pass one run in five",
    slug: { _type: "slug", current: "fix-the-flaky-pipeline-tests-pass-one-run-in-five" },
    description:
        "The test workflow of the CodeDev API goes red about one run in five, a re-run of the same commit is green, and a pull request proposes to retry failed tests three times. Work through it like the developer on build duty: read the CI history and two failure logs, connect them to the code, form a hypothesis (the clock, the order of the tests, state shared between files), rule out slow machines and retries, fix the causes and prove the fix with a hundred shuffled runs.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on build duty, CodeDev learning platform",
        problem:
            "Monday 08:45. The team channel has a thread called \"CI is red again\": the test workflow of the API behind https://api.codedev.test failed 10 of its last 50 runs on main, every failed commit passed when someone pressed Re-run, and nobody can reproduce a failure locally. Developers have started to re-run red builds without reading them, and a real bug was merged last week while everyone assumed \"it is just the flaky tests\". PR #611 \"ci: retry flaky tests 3 times\" has two approvals. You are on build duty this week: find out why the pipeline is flaky before anyone merges the retry.",
    },

    content: [
        h2("1. The incident: a pipeline nobody trusts"),
        p("This is the course scenario. A flaky test is a test that can pass and fail on the same code. One flaky test is an annoyance; a pipeline that is red one run in five is worse than no pipeline, because the team learns to press **Re-run** instead of reading the failure. That is how last week's real bug reached production: its red build looked like all the others."),
        p("The proposed fix is one line in the Vitest config:"),
        code("text", `
PR #611 "ci: retry flaky tests 3 times"   (approved by 2 reviewers)

 export default defineConfig({
   test: {
     isolate: false,
+    retry: 3, // flaky tests: try again up to 3 times before failing the build
   },
 });`, "PR #611"),
        p("Before you approve or reject it, do what the earlier lessons taught for any bug: collect the evidence, explain **all** of it with one hypothesis, and only then change code. Flaky tests feel random, but each failure has a cause that you can name, reproduce on purpose and remove."),

        h2("2. The evidence pack"),
        p("Five pieces of evidence were collected in the first twenty minutes. The quiz below refers to them by letter."),
        h3("A. CI history"),
        code("text", `
Workflow "test" on main (vitest run), last 8 of 50 runs
Run    Commit   Started (UTC)        Duration  Result  Failed test
#1849  9d03b7e  2026-10-26 08:41:12  2m 38s    pass    (re-run of #1848)
#1848  9d03b7e  2026-10-26 08:37:55  2m 41s    FAIL    leaderboard.test.ts > ranks learners by points, ties by name
#1847  c51a2f0  2026-10-26 07:58:20  2m 44s    pass
#1846  4e1c9a2  2026-10-26 07:12:03  2m 40s    pass    (re-run of #1845)
#1845  4e1c9a2  2026-10-26 07:08:19  2m 39s    FAIL    enrollment.test.ts > trial ends 7 days after enrolment
#1844  b7710de  2026-10-25 16:20:47  2m 42s    pass
#1843  0aa93f1  2026-10-25 14:55:09  2m 40s    pass
#1842  0aa93f1  2026-10-25 14:31:26  2m 43s    pass
Last 50 runs: 40 pass, 10 FAIL (6 x enrollment.test.ts, 4 x leaderboard.test.ts).
Every failed commit passed on a re-run. Median duration: pass 2m 41s, FAIL 2m 40s.`, "GitHub Actions, workflow history"),
        h3("B. Failure log of run #1845"),
        code("text", `
 FAIL  src/enrollment/enrollment.test.ts > trial ends 7 days after enrolment
AssertionError: expected '2026-11-02T07:09:41.000Z' to be '2026-11-02T07:09:40.000Z' // Object.is equality
- Expected: 2026-11-02T07:09:40.000Z
+ Received: 2026-11-02T07:09:41.000Z`, "run #1845, job log"),
        h3("C. Failure log of run #1848"),
        code("text", `
 FAIL  src/leaderboard/leaderboard.test.ts > ranks learners by points, ties by name
AssertionError: expected [ 'binh 120', 'an 120', 'chi 80' ] to deeply equal [ 'an 120', 'binh 120', 'chi 80' ]`, "run #1848, job log"),
        h3("D. The code and tests involved"),
        code("typescript", `
// vitest.config.ts
export default defineConfig({ test: { isolate: false } }); // PR #577: share modules between test files, CI 40% faster

// src/enrollment/enrollment.ts
export async function enrollInTrial(db: Db, userId: string, courseId: string) {
  const startedAt = Math.floor(Date.now() / 1000) * 1000;   // stored in whole seconds
  const trialEndsAt = new Date(startedAt + 7 * DAY_MS).toISOString();
  await db.enrollments.insert({ userId, courseId, trialEndsAt });
  return { userId, courseId, trialEndsAt };
}

// src/enrollment/enrollment.test.ts
test("trial ends 7 days after enrolment", async () => {
  const expected = new Date(Math.floor(Date.now() / 1000) * 1000 + 7 * DAY_MS).toISOString();
  const course = await createCourse(db, { slug: "typescript-test-design" }); // about 150 ms on CI
  const enrollment = await enrollInTrial(db, "u_8812", course.id);
  expect(enrollment.trialEndsAt).toBe(expected);
});

// src/leaderboard/leaderboard.ts
const totals = new Map<string, number>();   // one map for the whole module
export const setPoints = (user: string, points: number) => { totals.set(user, points); };
export const addPoints = (user: string, points: number) => { totals.set(user, (totals.get(user) ?? 0) + points); };
export const pointsOf = (user: string) => totals.get(user) ?? 0;
export const ranking = () =>
  [...totals].sort((a, b) => b[1] - a[1]).map(([user, points]) => \`\${user} \${points}\`);

// src/leaderboard/leaderboard.test.ts
test("ranks learners by points, ties by name", () => {
  setPoints("an", 120);
  setPoints("binh", 120);
  setPoints("chi", 80);
  expect(ranking()).toEqual(["an 120", "binh 120", "chi 80"]);
});

// src/leaderboard/streak.test.ts
test("a 7-day streak adds 20 bonus points", () => {
  setPoints("binh", 100);
  addPoints("binh", streakBonus(7));
  expect(pointsOf("binh")).toBe(120);
});`, "the files named in the failures"),
        h3("E. The proposed fix"),
        p("PR #611, shown in section 1: `retry: 3` in the Vitest config."),

        h2("3. Reading the evidence"),
        p("Read each piece for what it **shows**. One line each:"),
        bullets([
            "**A** shows the same commit failing and then passing. Nothing in the repository changed between the two runs, so the result depends on an input that is **not** in the code: the time, the order of the tests, state left over by another test, randomness or the network. It also shows that failing runs are not slower than passing ones.",
            "**B** shows a trial end that is exactly one second later than expected. Not a day, not a time zone: one second.",
            "**C** shows the right learners with the right points in a different order: binh before an, two learners with the same 120 points.",
            "**D** shows where those inputs come in: two separate `Date.now()` calls about 150 ms apart, a `Map` at module level that every test file shares because of `isolate: false`, and a sort that only compares points.",
            "**E** changes how often the build turns red. It does not change any of the code in D.",
        ]),
        p("Notice what the history rules out on its own: two different tests fail, in two different modules, and neither failure says \"timeout\". A slow machine does not reorder a list."),

        h2("4. Hypothesis: time, order and shared state"),
        h3("The expiry test reads the clock twice"),
        p("Follow one run. The test reads the clock and rounds down to the second, then spends about 150 ms creating a course, then `enrollInTrial` reads the clock again and rounds down again. Most of the time both reads fall in the same second and the values match. When the first read happens in the last 150 ms of a second, the second read lands in the next one:"),
        code("text", `
test reads Date.now()      07:09:40.910  ->  rounds to 07:09:40  ->  expects 2026-11-02T07:09:40.000Z
createCourse()             about 150 ms
enrollInTrial Date.now()   07:09:41.062  ->  rounds to 07:09:41  ->  returns 2026-11-02T07:09:41.000Z`, "one failing run, reconstructed"),
        p("150 ms out of every 1,000 is about 15% of runs, roughly one in seven: that fits 6 enrolment failures in 50 runs. This is the clock problem from lesson 2.1 in a new place: the test and the code each asked \"what time is it?\" and got different answers."),
        h3("The leaderboard test depends on who ran before it"),
        p("Run `leaderboard.test.ts` on its own and it always passes: the map is empty, `an` is inserted before `binh`, and because `Array.prototype.sort` is stable, the tie keeps insertion order. Now add `isolate: false`. Vitest reuses one module, and so one `totals` map, for every test file that runs in the same worker. Which files share a worker, and in which order they run, depends on timing and changes from run to run. When `streak.test.ts` runs first in that worker, `binh` is already in the map; `setPoints(\"binh\", 120)` updates the value but keeps binh's earlier position, so binh comes out first. That is lesson 2.3's shared state, made visible by a tie."),
        p("There is a second finding hidden here. The test says \"ties by name\", but `ranking()` never compares names. In production the order of tied learners on the leaderboard depends on who scored first. The flaky test was right about a real bug about half the time it ran."),
        h3("Rule out the tempting wrong explanations"),
        bullets([
            "**\"The CI machines are slow.\"** Failed runs take as long as passing ones (A). A slower machine would make the 150 ms gap longer and the enrolment failure a little more frequent, a faster one a little rarer, but neither makes it zero. And speed has nothing to do with the order of two tied learners.",
            "**\"Retries fix it.\"** A retry runs the same test again until it passes. It turns a red build green; it does not turn a random result into a correct one. With three retries the leaderboard bug would almost never show again, and every new timing bug in these files would be hidden the same way.",
            "**\"Someone pushed a broken commit.\"** Every failed commit passed on a re-run with the same code (A).",
        ]),
        callout("warning", "When is a retry acceptable?",
            "Some tests cross a boundary you do not control, such as an end-to-end test that drives a real browser against a staging server, and a single retry there can be a reasonable cost. Even then, record every retry, count retried tests in a report, and open a ticket for each one. For unit and integration tests that depend on the clock, on order or on shared state, a retry only removes the signal: fix the dependency instead."),

        challenge("chal_quiz_ttd_311"),

        h2("5. Fix the causes, not the symptom"),
        p("Each source of nondeterminism gets its own fix, and each fix makes something that was implicit explicit."),
        h3("Inject the clock"),
        p("The code under test should not decide what time it is; the caller should tell it. In production the caller passes the real clock, in the test a fixed one:"),
        code("typescript", `
// src/enrollment/enrollment.ts
export type Clock = () => number;
export const systemClock: Clock = () => Date.now();

export async function enrollInTrial(db: Db, userId: string, courseId: string, now: Clock = systemClock) {
  const startedAt = Math.floor(now() / 1000) * 1000;   // stored in whole seconds
  const trialEndsAt = new Date(startedAt + 7 * DAY_MS).toISOString();
  await db.enrollments.insert({ userId, courseId, trialEndsAt });
  return { userId, courseId, trialEndsAt };
}

// src/enrollment/enrollment.test.ts
test("trial ends 7 days after enrolment, rounded down to the second", async () => {
  const now = () => Date.parse("2026-10-26T07:09:40.999Z");   // the edge of a second, on purpose
  const course = await createCourse(db, { slug: "typescript-test-design" });
  const enrollment = await enrollInTrial(db, "u_8812", course.id, now);
  expect(enrollment.trialEndsAt).toBe("2026-11-02T07:09:40.000Z");
});`, "enrollment.ts and its test"),
        p("The expected value is now a literal written by a person, not a second computation of the same formula. That matters: a test that recomputes the expected value with the code's own formula can only check that the formula agrees with itself. If you cannot change the signature yet, `vi.useFakeTimers()` with `vi.setSystemTime(...)` freezes `Date.now()` for the test, which is a good first step."),
        h3("Sort explicitly"),
        p("If the order of tied learners matters, it is a rule, and a rule belongs in the code:"),
        code("typescript", `
export const ranking = () =>
  [...totals]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))   // most points first, then by name
    .map(([user, points]) => \`\${user} \${points}\`);`, "leaderboard.ts"),
        p("Never let a test depend on the iteration order of a `Map`, a `Set` or an object's keys unless the code promises that order. Insertion order is real and well defined in JavaScript, but it is a fact about **history**: who was inserted first. Tests that share state rewrite that history."),
        h3("Reset state for every test"),
        p("The simplest fix is to stop sharing: create a leaderboard per test (a factory such as `createLeaderboard()` instead of a module-level map), so there is nothing to reset. If the module must keep a single instance, give it a reset function and call it in `beforeEach`:"),
        code("typescript", `
// src/leaderboard/leaderboard.ts
export const resetLeaderboard = () => totals.clear();

// src/leaderboard/leaderboard.test.ts and streak.test.ts
beforeEach(() => resetLeaderboard());`, "fresh state per test"),
        p("With state reset per test, `isolate: false` can stay and keep CI fast. Speed was never the problem; hidden coupling between files was."),

        h2("6. How to verify the fix"),
        p("The broken pipeline already passed 4 runs in 5, so a few green runs prove almost nothing. Verification has to **force** the conditions that caused the failures:"),
        bullets([
            "**Pin the clock to the worst moment.** The new enrolment test runs at 07:09:40.999 every time. Before the fix that test fails on every run; after the fix it passes on every run. A test that fails on purpose before the fix is the strongest evidence you have.",
            "**Shuffle the order, many times, with recorded seeds.** Run the whole suite with a different seed for the test order each time and stop at the first failure, printing the seed so you can replay that exact order.",
            "**Count.** At one failure in five, the chance that 100 runs of the broken suite all pass is 0.8 to the power 100, about 2 in 10 billion. After 100 shuffled green runs you can say the order dependency is gone, with a number behind it.",
        ]),
        code("bash", `
for seed in $(seq 1 100); do
  npx vitest run --sequence.shuffle --sequence.seed=$seed --reporter=dot > /dev/null \\
    || { echo "FAILED with seed $seed: npx vitest run --sequence.shuffle --sequence.seed=$seed"; exit 1; }
done
echo "100 shuffled runs passed"`, "terminal (Vitest 3.x; check the sequence options of your version)"),
        p("Run the loop on the old code first. It should fail within a few seeds, which proves the loop can see the problem. Then run it on the fix. Finally, close PR #611 with a link to the fix, and keep `retry` out of the unit test config."),

        h2("7. The challenge: a pipeline in one file"),
        p("The code runner has no Vitest and no CI, so the challenge brings both as a small test runner at the bottom of the file. It runs the same scenario many times, the way CI does on a busy day, and it is deterministic so that your result never depends on luck:"),
        bullets([
            "**Many runs.** Each test runs the scenario between 1 and 100 times.",
            "**An injected clock per run.** Each run gives the module a fake clock fixed at one of several start times, some of them a millisecond before a whole second.",
            "**A shuffled order with a fixed seed.** Each run receives the same awards in a different order, from a seeded random generator, like `--sequence.shuffle --sequence.seed`.",
            "**Every different answer is printed** with the number of runs that gave it. A correct module prints one ranking and one trial end per start time.",
        ]),
        p("Run the starter first and read its output. It is the CI history of section 2 in miniature: you will see which parts of the answer change from run to run. Then find the three places in the module that let them change."),
        challenge("chal_coding_ttd_312"),

        h2("8. Common mistakes with flaky tests"),
        bullets([
            "**Re-running until green.** Each re-run throws away a real failure. Spot it: the CI history shows the same commit both red and green, and nobody opened the log of the red one.",
            "**Retrying instead of fixing.** `retry` hides the failure and the bug behind it. Spot it: a test passes \"on retry 2\" in the report, or a config adds `retry` without a ticket and a date to remove it.",
            "**Computing the expected value with the code's own formula.** A second `Date.now()` in the test, or a copy of the production calculation, makes the test as flaky as the code and unable to catch a wrong formula. Spot it: the expected value is not a literal or a value you can check by hand.",
            "**Relying on insertion order.** A test expects an order that the code never sorts into. Spot it: the assertion compares a whole list, and the code that builds it has no tie-breaker.",
            "**Fixing the test and leaving the code.** The leaderboard test found a real bug; making the test sort its own copy of the result would hide it. Spot it: the diff of a \"flaky test fix\" touches only test files although the failure was about behaviour.",
        ]),

        h2("9. Summary"),
        numbered([
            "A test that passes and fails on the same commit depends on an input outside the code: the clock, the order of the tests, shared state, randomness. The failure logs tell you which one, if you read them instead of pressing Re-run.",
            "Fix the dependency, not the symptom: inject the clock, make order a rule of the code with an explicit sort, and give every test fresh state. Retries only lower the rate at which you see the bug.",
            "Prove the fix by forcing the bad conditions: a clock pinned to the edge of a second, and many runs in shuffled order with recorded seeds.",
        ]),

        h2("Sources"),
        bullets([
            "Vitest documentation: configuration options isolate, retry and sequence (shuffle, seed), and vi.useFakeTimers / vi.setSystemTime - vitest.dev/config and vitest.dev/api/vi",
            "Martin Fowler: The Practical Test Pyramid - martinfowler.com/articles/practical-test-pyramid.html",
            "MDN: Map (iteration in insertion order) and Array.prototype.sort (stable since ES2019) - developer.mozilla.org",
        ]),
        callout("tip", "Self-practice (not graded): add a CI job that runs the suite in random order",
            "In a project of your own, add a second CI job next to the normal test job that runs the whole suite with a shuffled order and a seed that changes every run (for example the CI run number), and prints that seed in the log. Run it on a schedule, such as every night, so it does not slow down pull requests. Make a failure in this job easy to replay: the log line should contain the exact command with the seed. Then break isolation on purpose - add a module-level array that one test fills and another reads - and check that the new job catches it within a few nights while the normal job stays green."),
    ],
});
