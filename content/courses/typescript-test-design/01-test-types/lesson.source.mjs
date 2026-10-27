// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ttd-1-1",
    title: "Unit, integration or end-to-end: the cheapest test that catches the bug",
    slug: { _type: "slug", current: "unit-integration-e2e-cheapest-test" },
    description:
        "After a leaderboard bug, the team added a 70-second browser test that still did not catch it, while a 5-millisecond unit test would have. Learn what unit, integration and end-to-end tests are, why the test pyramid and the testing trophy are arguments about cost, how to pick the cheapest test that would have caught a given bug, and when an end-to-end test is worth what it costs.",
    estimatedTime: 20,

    scenario: {
        role: "Developer on the CodeDev learning platform team",
        problem:
            "Bug report CD-1482: on the weekly leaderboard at https://app.codedev.test/ranking, some learners have twice the points they earned. One learner passed a single 30-point challenge this week and shows 60. The team fixed it and, to make sure it never comes back, added a browser test that signs up, passes a challenge and opens the leaderboard. That test takes 70 seconds, fails about once a week for no clear reason, and - as a code review later showed - would not have caught the original bug at all.",
    },

    content: [
        h2("1. The incident: points counted twice"),
        p("Here is the bug report as it was filed, with the evidence the developer collected:"),
        code("text", `
CD-1482  Weekly leaderboard shows double points
Reporter: support    Severity: medium    Component: ranking

Learner "minh.tran" passed one challenge this week (chal_coding_sql_212, 30 points).
Leaderboard (weekly) shows: minh.tran  60 pts

API access log, same learner:
  09:41:12.004 POST /submissions 202   (attempt 1, timed out on the client)
  09:41:15.377 POST /submissions 202   (attempt 2, retried by the learner)

submissions table:
  id     user        challenge             status  points
  88121  minh.tran   chal_coding_sql_212   passed  30
  88122  minh.tran   chal_coding_sql_212   passed  30`, "CD-1482"),
        p("The learner submitted the same passing code twice, and the weekly total added both rows. The function behind the leaderboard was short:"),
        code("typescript", `
// ranking/weeklyPoints.ts - the version that shipped
type Submission = { userId: string; challengeId: string; status: "passed" | "failed"; points: number };

export function weeklyPoints(submissions: Submission[]): number {
    return submissions
        .filter((s) => s.status === "passed")
        .reduce((sum, s) => sum + s.points, 0);
}`, "weeklyPoints.ts"),
        p("The rule the product team intended is \"a challenge pays its points once\". The code says \"every passing submission pays\". The fix is to keep one passing submission per challenge. That part was easy. The interesting part of this lesson is what happened next: which test did the team write to stop the bug from coming back, and was it the right one?"),

        h2("2. Read the evidence: what the expensive test really checked"),
        p("The test the team added drives a real browser against a running app, a real API and a seeded database:"),
        code("typescript", `
// e2e/leaderboard.spec.ts - the test added after CD-1482 (Playwright)
test("a passed challenge shows up on the weekly leaderboard", async ({ page }) => {
    await signUp(page, "e2e-learner");
    await page.goto("/learning/sql-basics/lesson-3");
    await page.getByRole("button", { name: "Run" }).click();
    await expect(page.getByText("All tests passed")).toBeVisible();
    await page.goto("/ranking?board=weekly");
    await expect(page.getByRole("row", { name: /e2e-learner/ })).toContainText("30 pts");
});`, "leaderboard.spec.ts"),
        p("Read it slowly. It submits **once**. The bug only appears when the same challenge is passed **twice**. So this test was green before the fix and stays green after it: it cannot tell the broken version from the fixed one. It also costs 70 seconds on every pipeline run, needs a browser, a server and a database, and fails now and then because the leaderboard is refreshed in the background."),
        p("Now look at what a test of the function itself needs: two objects in an array."),
        code("typescript", `
// ranking/weeklyPoints.test.ts
import { describe, expect, it } from "vitest";
import { weeklyPoints } from "./weeklyPoints";

describe("weeklyPoints", () => {
    it("pays a challenge once when it was passed twice", () => {
        const twice = [
            { userId: "u1", challengeId: "sql_212", status: "passed" as const, points: 30 },
            { userId: "u1", challengeId: "sql_212", status: "passed" as const, points: 30 },
        ];
        expect(weeklyPoints(twice)).toBe(30);
    });
});`, "weeklyPoints.test.ts"),
        code("bash", `
$ npx vitest run weeklyPoints
 ✗ ranking/weeklyPoints.test.ts > weeklyPoints > pays a challenge once when it was passed twice
   AssertionError: expected 60 to be 30
 Test Files  1 failed (1)
      Tests  1 failed (1)
   Duration  412ms (transform 31ms, setup 0ms, collect 18ms, tests 4ms)`, "terminal"),
        p("Against the shipped code it fails with exactly the symptom from the bug report: 60 instead of 30. The test itself ran in 4 ms. That is the cheapest test that would have caught CD-1482, and it is the one that should have been written."),

        h2("3. Three kinds of test, sorted by what they run"),
        p("The names describe **how much of the real system** a test runs. More real parts means more kinds of bugs the test can see, and also more time, more setup and more ways to fail for reasons that have nothing to do with your change."),
        bullets([
            "**Unit test.** Calls one function or module directly, with plain values in and plain values out. No network, no database, no browser. Runs in milliseconds and, when it fails, points at a few lines of code. It can only see bugs that live inside that code.",
            "**Integration test.** Runs your code together with a real piece it depends on: the database, the file system, a framework, another module. It sees bugs in the joints: a wrong SQL query, a missing unique constraint, a column renamed in a migration. In this repository such files are called `*.integration.test.js` and run against a real PostgreSQL (`DATABASE_URL`).",
            "**End-to-end (E2E) test.** Drives the whole product the way a user does: a browser, the web app, the API, the database, often real configuration. It sees bugs that only exist when everything is wired together, such as a cookie the browser refuses or a redirect that loses the page you came from. It is the slowest, the hardest to debug and the most likely to be flaky.",
        ]),
        p("Here is what an integration test looks like on CodeDev. It cannot run without a database, so it skips itself when there is none, like the real ones in `__tests__/`:"),
        code("typescript", `
// enrollments/enroll.integration.test.ts
import { describe, expect, it } from "vitest";
import { enrollLearner } from "./enroll";
import { sql } from "../lib/db";

describe.skipIf(!process.env.DATABASE_URL)("enrollLearner (PostgreSQL)", () => {
    it("keeps one enrollment when the same learner enrolls twice", async () => {
        await enrollLearner("u_test_1", "sql-basics");
        await enrollLearner("u_test_1", "sql-basics");

        const { rows } = await sql(
            "SELECT count(*)::int AS n FROM enrollments WHERE user_id = $1 AND course_id = $2",
            ["u_test_1", "sql-basics"],
        );
        expect(rows[0].n).toBe(1);
    });
});`, "enroll.integration.test.ts"),
        callout("info", "Static checks are a test layer too",
            "Before any of these, tsc --strict catches a whole family of bugs for free: a field renamed in the API type but not in the page, a function called with a string instead of a number, a case missing from a switch. If the type checker can catch a bug, that is cheaper than any test."),

        h2("4. The pyramid and the trophy are arguments about cost"),
        p("You will meet two pictures of a healthy test suite. Both are useful once you see that they answer the same question: **where do we spend our testing time?**"),
        bullets([
            "**The test pyramid** (Mike Cohn; described in Martin Fowler's \"The Practical Test Pyramid\"): many unit tests at the bottom, fewer integration tests in the middle, a handful of end-to-end tests at the top. The reason is cost: the higher a test sits, the slower it runs, the more it breaks for unrelated reasons, and the less precisely its failure tells you what is wrong.",
            "**The testing trophy** (Kent C. Dodds): static analysis at the base, then unit tests, then the largest share of integration tests, then a few end-to-end tests. The reason is also cost, measured differently: integration tests give more confidence per test for code that is mostly wiring, such as an API handler that reads a request, calls the database and returns JSON.",
        ]),
        p("They disagree about the middle because they assume different code. Code full of rules and calculations (points, progress, prices, levels) is cheap to test at the unit level. Code that mostly moves data between a request and a database has few rules of its own, and its bugs live in the joints, so integration tests catch more of them. Neither picture is a quota. Nobody should ask \"do we have 70% unit tests?\"; ask \"for the bugs we actually have, what is the cheapest test that catches them?\""),

        h2("5. The cheapest test that would have caught it"),
        p("A practical way to choose: start at the cheapest layer and move up only when the cheaper layer **cannot see** the bug."),
        numbered([
            "Could the type checker have rejected it? Then fix the types and let `tsc` guard it.",
            "Does the wrong behaviour live inside one function, with values in and values out? Write a unit test with the inputs from the bug report.",
            "Does it depend on how your code talks to something real - SQL, a constraint, a transaction, a framework's routing? Write an integration test against the real thing.",
            "Does it only appear when the browser, the server and their configuration work together? Then, and only then, it needs an end-to-end test.",
        ]),
        p("Applied to real CodeDev bugs:"),
        bullets([
            "**Double points for a challenge passed twice (CD-1482).** The rule lives in `weeklyPoints`: unit test, two submissions in an array.",
            "**A learner reached Level 5 at 999 EXP instead of 1000.** A threshold compared with `>=` against the wrong number in `levelFromExp`: unit test at 999 and 1000.",
            "**Two enrollments for one learner after a double click.** The service checked \"already enrolled?\" and then inserted; two requests both passed the check. The protection that works is a unique constraint plus `ON CONFLICT DO NOTHING` in SQL. A unit test with an in-memory fake repository runs no SQL, so it cannot see whether the constraint exists: integration test against PostgreSQL.",
            "**Signing in from the course page dropped you on the home page instead of back on the course.** The `returnTo` parameter was lost between the sign-in page, the auth callback and a cookie: no single function is wrong. End-to-end test of that journey.",
        ]),
        challenge("chal_quiz_ttd_111"),

        h2("6. When an end-to-end test is worth it"),
        p("End-to-end tests are not bad; they are expensive, so spend them where nothing cheaper can look. They are worth it when:"),
        bullets([
            "**The journey is critical.** Sign in, enroll, open a lesson, submit code, pay for a course. If one of these breaks, learners notice within minutes. One E2E test per journey, on the happy path, is a good default.",
            "**The bug lives between layers.** Cookies, redirects, CORS, a reverse proxy, environment variables, a build step. Unit and integration tests run your code; only E2E runs your deployment.",
            "**It replaces a manual check you do before every release.** If someone clicks through the same flow by hand each time, a test that does it is cheaper after a few releases.",
        ]),
        p("They are not worth it for **variations of a rule**. \"Points are paid once\", \"optional lessons do not count\", \"0 EXP is Level 1\" are each one line of a unit test. Checking them through the browser multiplies the cost by a thousand and adds flakiness for no extra confidence. Keep the E2E test to \"the journey works\" and push the details down."),
        callout("tip", "Test the rule where the rule lives",
            "If you can say the bug in one sentence about inputs and outputs (\"two passing submissions for one challenge pay 60, not 30\"), it lives in a function and a unit test can hold it. If the sentence needs words like \"after the redirect\" or \"in Safari\", look higher up."),

        h2("7. How to verify you picked the right test"),
        bullets([
            "**Make it fail first.** Write the test against the broken code (or revert the fix locally) and watch it fail with the symptom from the bug report. A regression test that was never red has not proven anything; the E2E test in section 2 would have stayed green.",
            "**Read the failure message.** \"expected 60 to be 30\" names the bug. \"Timed out waiting for row e2e-learner\" names nothing: the cause could be the bug, the seed data, a slow refresh or the network.",
            "**Look at the duration.** `npx vitest run --reporter=verbose` prints the time of every test. A rule tested in seconds instead of milliseconds is usually tested at the wrong layer.",
            "**Ask what the test would miss.** Remove the database, the browser or the server from the test in your head. If the bug could still appear, the test is too high; if the bug could no longer appear, it is at the right layer or too low.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**An E2E test for every bug.** The suite grows to 30 minutes and goes red for timing reasons. How to spot it: E2E test names describe rules (\"optional lessons do not count\") instead of journeys (\"a learner completes a course\").",
            "**A unit test with a fake for a bug in SQL.** The fake does whatever you wrote it to do, so it passes while the real query is wrong. How to spot it: the fix changed a query, a migration or a constraint, but the new test never touches a database.",
            "**A regression test that does not reproduce the bug.** Like the leaderboard test that submitted once. How to spot it: run it against the broken version; if it is green, it is not a regression test.",
            "**Ratio targets instead of bugs.** \"We need 70% unit tests\" leads to unit tests of wiring code that mock everything. How to spot it: tests that assert a mock was called and nothing else.",
            "**No test because \"the real test would be too slow\".** The slow test is rarely the only option. How to spot it: a bug report with clear inputs and outputs and no test in the fix.",
        ]),

        h2("9. Summary"),
        bullets([
            "Unit, integration and end-to-end tests differ in how much of the real system they run: more real parts see more kinds of bugs, at a higher cost in time, setup and flakiness.",
            "The pyramid and the trophy are both cost arguments; choose by where your bugs live, starting at the cheapest layer that can see the bug (types, then unit, then integration, then E2E).",
            "Keep end-to-end tests for critical journeys and for bugs that live between layers, and prove every regression test by watching it fail on the broken code.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler / Ham Vocke, The Practical Test Pyramid - martinfowler.com/articles/practical-test-pyramid.html",
            "Vitest documentation, Getting Started and the CLI reporters - vitest.dev",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the last three bugs fixed in a project you work on. For each one, write one sentence about inputs and outputs, decide which layer could have caught it, and write that test against the version before the fix. Note how long each test runs and whether it failed for the right reason."),
    ],
});
