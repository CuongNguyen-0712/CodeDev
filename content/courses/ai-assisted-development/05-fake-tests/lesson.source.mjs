// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aad-2-2",
    title: "Tests that cannot fail: spotting the AI's fake tests",
    slug: { _type: "slug", current: "tests-that-cannot-fail-fake-tests" },
    description:
        "An AI assistant wrote nine green tests and 100% line coverage for the EXP rules. A week later the streak bonus went from 10% to 100% and every test stayed green. Learn the patterns of tests that cannot fail - asserting what the mock was told to return, mocking the code under test, expect(true).toBe(true), snapshots of a bug, catch blocks that swallow the assertion, checks of types and call counts only - and the one question that exposes all of them: would this test fail if I broke the code?",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The daily EXP audit flags 412 learners whose EXP for one day is above the 99th percentile; all of them have a learning streak of 7 days or more. The leaderboard at https://app.codedev.test/ranking is topped by learners who finished three easy lessons. A refactoring pull request had moved the EXP constants around and, in the same diff, changed STREAK_BONUS_PERCENT from 10 to 100. CI was green: src/lib/exp.test.ts, written by an AI assistant the week before, has nine passing tests and 100% line coverage of exp.ts. Not one of them failed.",
    },

    content: [
        h2("1. The incident: nine green tests and a doubled bonus"),
        p("A week before the incident a developer asked an AI assistant: \"Add tests for awardLessonExp in src/lib/exp.ts. Make sure they pass.\" The assistant produced a test file, the suite went green, and the coverage report showed every line of `exp.ts` as covered. Here are six of the nine tests:"),
        code("typescript", `
// src/lib/exp.test.ts (Vitest) - written by the assistant, merged as is
import { describe, test, expect, vi } from "vitest";
import { awardLessonExp } from "./exp";
import * as repo from "./expRepository";
import { weeklyLeaderboard } from "./leaderboard";

vi.mock("./expRepository");

describe("awardLessonExp", () => {
  test("saves the EXP", async () => {
    vi.mocked(repo.saveExp).mockResolvedValue({ userId: "u_1", exp: 11 });
    const saved = await repo.saveExp("u_1", 11);
    expect(saved.exp).toBe(11);
  });

  test("applies the streak bonus", async () => {
    await awardLessonExp({ userId: "u_1", baseExp: 10, streakDays: 7 });
    expect(repo.saveExp).toHaveBeenCalled();
  });

  test("returns a number", async () => {
    const exp = await awardLessonExp({ userId: "u_1", baseExp: 10, streakDays: 0 });
    expect(typeof exp).toBe("number");
  });

  test("rejects a negative base", async () => {
    try {
      await awardLessonExp({ userId: "u_1", baseExp: -5, streakDays: 0 });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("weekly leaderboard", async () => {
    expect(await weeklyLeaderboard("2026-W42")).toMatchSnapshot();
  });

  test("module works", () => {
    expect(true).toBe(true);
  });
});`, "src/lib/exp.test.ts (excerpt)"),
        p("Every test has a name that sounds like a requirement, and every test passes. Read each one again with a single question in mind: **what change to `exp.ts` would make this test fail?** For most of them the answer is \"none\"."),

        h2("2. Reproduce it: break the code on purpose"),
        p("The fastest way to judge a test suite is to make the code wrong and watch what happens. Change the bonus to the value from the incident and run the file:"),
        code("bash", `
# exp.ts: export const STREAK_BONUS_PERCENT = 100;   (was 10)
npx vitest run src/lib/exp.test.ts

 ✓ src/lib/exp.test.ts (9 tests)
 Test Files  1 passed (1)
      Tests  9 passed (9)

# exp.ts: return 0;   as the whole body of lessonExp()
npx vitest run src/lib/exp.test.ts
      Tests  9 passed (9)`, "terminal"),
        p("Two very different bugs, the same nine green ticks. Coverage was 100% because every line *ran*; nothing checked what the lines *produced*. Line coverage measures execution, not verification: a test with no meaningful assertion covers code exactly as well as a good one."),

        h2("3. Core idea: a test is a claim that could be false"),
        p("A test is useful only if there is a version of the code that makes it fail, and that version is a bug you care about. Lesson 1.2 is about giving the assistant acceptance tests as the contract; this lesson is the other direction: checking that the tests you receive are a contract at all. A test that passes against every implementation says nothing about this one."),
        p("Why do assistants produce these tests? Because of how the request is usually phrased. \"Write tests and make sure they pass\" has a trivial solution: assert what the code already does, or what a mock was set up to return, and the tests pass by construction. Tests generated by reading the implementation also tend to copy its logic, so they repeat the bug instead of catching it. The assistant did what was asked; the request did not say \"tests that would catch a wrong bonus\"."),
        callout("info", "When a test that cannot fail is acceptable",
            "A smoke test - the module imports, the server starts, the page renders without throwing - can be worth having, and it rarely fails. Keep it, but name it for what it is and do not count it as testing the behaviour. The problem in the incident is not that weak tests existed; it is that nine of them were read as evidence that the EXP rules were verified."),

        h2("4. The patterns, and how to spot each one"),
        h3("Asserting what the mock was told to return"),
        p("\"saves the EXP\" configures `repo.saveExp` to resolve to `{ exp: 11 }`, calls `repo.saveExp` itself, and checks that it got 11. The code under test is never called. **Spot it:** the function the test asserts on is the same one it configured with `mockResolvedValue` / `mockReturnValue` a few lines earlier."),
        h3("Mocking the code under test"),
        p("A variant of the same mistake: `vi.mock(\"./exp\", ...)` in a test of `exp.ts` replaces the module you meant to test with a fake. **Spot it:** the path in `vi.mock` (or `jest.mock`) is the module named in the test file's title. Mock the collaborators - repository, clock, HTTP client - and run the real unit."),
        h3("Checking that something happened, not what"),
        p("\"applies the streak bonus\" asserts only `toHaveBeenCalled()`. It passes for a bonus of 10%, 100% or -50%. \"returns a number\" passes for `0`, `NaN` and `-Infinity` (all of type `number`). **Spot it:** assertions such as `toHaveBeenCalled()`, `toBeDefined()`, `toBeTruthy()`, `typeof x === ...` or `toHaveLength(n)` with no check of values. The fix is the value: `toHaveBeenCalledWith(\"u_1\", 11)`."),
        h3("Catching the assertion error"),
        p("In \"rejects a negative base\", if the function does **not** throw, `expect(true).toBe(false)` throws an assertion error - inside the `try`. The `catch` catches it, and `expect(error).toBeDefined()` passes. The test passes in both cases. **Spot it:** `expect` calls inside a `try` with a `catch` that does not rethrow. Use the runner's own API for expected errors: `await expect(promise).rejects.toThrow(RangeError)` or `expect(() => fn()).toThrow(...)`."),
        h3("A snapshot of the bug"),
        p("`toMatchSnapshot()` writes the current output to a file the first time it runs and compares against it afterwards. It proves the output did not change; it does not prove the output was ever right. If the code was wrong when the snapshot was written, the snapshot is a recording of the bug - and when it does fail, the update flag (`vitest -u`) makes it pass again in one keystroke, which an agent trying to get to green may well use. **Spot it:** new `.snap` files or changed snapshot lines in a diff, with nobody having read them; snapshots of large objects nobody can review."),
        h3("Asserting nothing at all"),
        p("`expect(true).toBe(true)` and its relatives (`expect(1).toBe(1)`, a test with no `expect`) only check that the file loads. **Spot it:** search for them - `git grep -nE \"expect\\((true|1)\\)\\.toBe\\((true|1)\\)\"` - and for tests without any `expect`."),
        h3("The mirror test"),
        p("A test whose expected value is computed with the same formula as the code: `expect(lessonExp(10, 7)).toBe(10 + Math.round(10 * STREAK_BONUS_PERCENT / 100))`. Change the constant and both sides move together. **Spot it:** the test imports the constants or helpers of the implementation to build its expectation. Expected values should be literals from the spec: \"10 base EXP with a 7-day streak gives 11\"."),

        challenge("chal_quiz_aad_221"),

        h2("5. Mutation thinking: rewrite the tests until a bug breaks them"),
        p("**Mutation testing** makes the question from section 1 systematic: change the code in small ways (a mutant), run the tests, and count how many mutants survive. Tools such as StrykerJS do this automatically for JavaScript and TypeScript, but you can do it by hand in two minutes for a function you are reviewing. Here is the function under test:"),
        code("typescript", `
// src/lib/exp.ts
import { saveExp } from "./expRepository";

export const STREAK_BONUS_PERCENT = 10;
export const STREAK_BONUS_MIN_DAYS = 7;

export function lessonExp(baseExp: number, streakDays: number): number {
  if (!Number.isInteger(baseExp) || baseExp < 0) {
    throw new RangeError("baseExp must be a non-negative integer");
  }
  const bonus = streakDays >= STREAK_BONUS_MIN_DAYS
    ? Math.round((baseExp * STREAK_BONUS_PERCENT) / 100)
    : 0;
  return baseExp + bonus;
}

export async function awardLessonExp(input: { userId: string; baseExp: number; streakDays: number }) {
  const exp = lessonExp(input.baseExp, input.streakDays);
  await saveExp(input.userId, exp);
  return exp;
}`, "src/lib/exp.ts"),
        p("List the mutants a reviewer would worry about, then write the smallest set of tests that kills each one. Expected values are literals worked out from the rule, not from the code:"),
        bullets([
            "`STREAK_BONUS_PERCENT = 100` (the incident) - killed by: 10 base with 7 days gives **11**.",
            "`>=` becomes `>` (bonus starts a day late) - killed by: exactly 7 days gives the bonus; 6 days does not.",
            "`Math.round` becomes `Math.floor` - killed by: 25 base with a streak gives 25 + round(2.5) = **28**, not 27.",
            "The guard is deleted - killed by: -5 is rejected with a `RangeError` and nothing is saved.",
            "`saveExp` is called with the base instead of the total - killed by: checking the arguments of `saveExp`, not just the call.",
        ]),
        code("typescript", `
// src/lib/exp.test.ts - rewritten
import { describe, test, expect, vi, beforeEach } from "vitest";
import { lessonExp, awardLessonExp } from "./exp";
import * as repo from "./expRepository";

vi.mock("./expRepository");          // a collaborator, never ./exp itself
beforeEach(() => vi.mocked(repo.saveExp).mockReset());

describe("lessonExp", () => {
  test.each([
    [10, 0, 10],    // no streak
    [10, 6, 10],    // one day short of the bonus
    [10, 7, 11],    // bonus starts at exactly 7 days
    [25, 30, 28],   // 2.5 rounds to 3
    [0, 7, 0],      // nothing to multiply
  ])("lessonExp(%i, %i) is %i", (base, days, expected) => {
    expect(lessonExp(base, days)).toBe(expected);
  });

  test("rejects a negative or fractional base", () => {
    expect(() => lessonExp(-5, 0)).toThrow(RangeError);
    expect(() => lessonExp(2.5, 0)).toThrow(RangeError);
  });
});

describe("awardLessonExp", () => {
  test("saves the total with the bonus for this learner", async () => {
    await expect(awardLessonExp({ userId: "u_1", baseExp: 10, streakDays: 7 })).resolves.toBe(11);
    expect(repo.saveExp).toHaveBeenCalledTimes(1);
    expect(repo.saveExp).toHaveBeenCalledWith("u_1", 11);
  });

  test("saves nothing when the base is invalid", async () => {
    await expect(awardLessonExp({ userId: "u_1", baseExp: -5, streakDays: 0 })).rejects.toThrow(RangeError);
    expect(repo.saveExp).not.toHaveBeenCalled();
  });
});`, "src/lib/exp.test.ts (rewritten)"),
        p("Now repeat the experiment from section 2. With `STREAK_BONUS_PERCENT = 100`, the `[10, 7, 11]` row and the `awardLessonExp` test fail. With `return 0`, most rows fail. Each test names a rule, and each one can be broken by a specific, believable bug: that is what makes it a contract."),
        callout("warning", "Interaction tests are not wrong, call-count-only tests are",
            "`toHaveBeenCalledWith(\"u_1\", 11)` is a good assertion: saving the right value for the right learner is the behaviour. `toHaveBeenCalled()` alone is the weak version. Prefer checking returned values and stored state; check calls when the call is the behaviour you care about, and then check its arguments."),

        h2("6. Asking the assistant for tests that can fail"),
        p("You can still let an assistant write tests. Change what you ask for, and verify what you get:"),
        code("text", `
Write Vitest tests for lessonExp and awardLessonExp in src/lib/exp.ts.
Rules (the spec, not the code): 10% bonus, rounded with Math.round, from a
7-day streak; a negative or non-integer base throws RangeError; awardLessonExp
saves exactly one row with the total.
- Expected values must be literals from these rules, not computed with the
  constants or helpers from exp.ts.
- Mock only ./expRepository. Do not mock ./exp.
- No snapshots, no try/catch around expect, no assertion that only checks a
  type or that a function was called.
- Under each test, write one change to exp.ts that would make it fail.`, "prompt"),
        p("The last line is the useful one: it makes the assistant state the mutant each test kills, and it gives you a list to check. Then check it - apply a few of those changes yourself and run the tests. A claim that a test catches a bug is verified only when you have watched it fail."),

        h2("7. How to verify a test suite"),
        bullets([
            "**Break the code and run the tests.** Change a constant, flip a comparison, return a fixed value. At least one test must fail for each change you care about. For bigger code, run a mutation testing tool and read the surviving mutants.",
            "**Red before green for bug fixes.** A test written for a bug must fail on the code before the fix. Check out the old commit (or revert the fix locally), run the new test, see it fail, then restore the fix.",
            "**Read test diffs like code diffs.** In a pull request, look for changed expected values, deleted assertions, new `.skip` / `.todo`, updated snapshot files and new mocks. A test changed to match the code is a test that stopped checking it.",
            "**Make empty tests fail.** `expect.hasAssertions()` (or `expect.assertions(n)` for a known number) at the start of a test fails it when no assertion ran - useful in async code with callbacks or branches.",
            "**Treat coverage as a map, not a grade.** Coverage shows which lines no test runs at all. It cannot tell you whether the tests that run a line would notice it changing.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Counting green tests instead of reading them.** Spot it: a review that mentions the number of tests or the coverage percentage, and no test by name.",
            "**Accepting \"make the tests pass\" as the goal.** Spot it: the prompt asked for passing tests, not tests that catch specific bugs, and the diff changed expected values to match the output.",
            "**Mocking too much.** Spot it: more `vi.mock` lines than assertions, or the module under test among the mocked ones.",
            "**Snapshotting what nobody can review.** Spot it: snapshot files of hundreds of lines, created or updated in the same pull request as the behaviour they \"verify\".",
            "**Trusting the test name.** \"applies the streak bonus\" does not apply anything. Spot it: read the assertion line first, the name last.",
        ]),

        h2("9. Summary"),
        numbered([
            "A test that cannot fail carries no information. Ask of every test: which believable bug in this code makes it fail?",
            "The usual fakes are asserting on a mock you configured, mocking the unit under test, call-count or type-only checks, expect inside a swallowing try/catch, unreviewed snapshots, expect(true) and mirror expectations. Each has a quick visual tell.",
            "Verify tests by breaking the code - by hand or with a mutation testing tool - and require bug-fix tests to fail before the fix. Ask assistants for tests from the spec, with literal expectations and the mutant each one kills.",
        ]),

        h2("Sources"),
        bullets([
            "Vitest documentation: expect (toThrow, rejects, toHaveBeenCalledWith, expect.assertions, expect.hasAssertions) and vi.mock - vitest.dev/api",
            "StrykerJS, mutation testing for JavaScript and TypeScript - stryker-mutator.io",
            "GitHub Copilot documentation (writing tests with an assistant) - docs.github.com/en/copilot",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick a test file in your project that an assistant wrote or helped write. For each test, write down one change to the code that should make it fail, make the change, and run the file. Delete or rewrite every test that stayed green. If your stack has a mutation testing tool, run it on the same module and compare its surviving mutants with your list."),
    ],
});
