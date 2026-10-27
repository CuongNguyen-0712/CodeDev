// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-2-3",
    title: "Mutation testing: would the tests catch the agent's mistake?",
    slug: { _type: "slug", current: "mutation-testing-would-tests-catch-agent-mistake" },
    description:
        "During a refactor, a coding agent turned >= into > in CodeDev's pricing rule. All 214 tests passed, coverage of the pricing module was 100%, and learners at exactly level 10 paid full price for three days. Learn why coverage only says that code ran, how mutation testing checks that the tests would notice a wrong change, how to read killed, survived, timeout, no-coverage and compile-error mutants, how the mutation score is computed, and how to use it as a quality gate for agent-written tests without making every pull request slow.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer and reviewer of agent pull requests, CodeDev learning platform",
        problem:
            "Premium courses on CodeDev cost points, and learners at level 10 or above get 20% off. On Thursday a coding agent refactored src/pricing/price.ts (\"simplify priceFor, no behavior change\"). CI was green: 214 tests passed and the coverage report showed 100% statements and branches for src/pricing. On Sunday support had 37 tickets from learners at exactly level 10 who were charged 300 points for a 240-point course. The diff contained the cause in one character, among 60 changed lines of renames and early returns, and neither the tests nor the reviewer noticed it.",
    },

    content: [
        h2("1. The incident: a green suite that could not see the bug"),
        p("Hidden in the refactor, the discount condition changed. This is the relevant part of the diff:"),
        code("text", `
 export function priceFor(course: Course, learner: Learner): number {
-  const discounted = learner.level >= DISCOUNT_LEVEL;
-  if (discounted) {
-    return Math.round(course.pricePoints * (1 - DISCOUNT_RATE));
-  }
-  return course.pricePoints;
+  if (learner.level > DISCOUNT_LEVEL) return Math.round(course.pricePoints * 0.8);
+  return course.pricePoints;
 }`, "src/pricing/price.ts (diff, excerpt)"),
        p("The tests for the pricing rule were written months ago, also with an agent, and they look reasonable:"),
        code("typescript", `
// test/pricing/price.test.ts
const course300 = { id: "c_ts_adv", pricePoints: 300 };

it("gives high-level learners 20% off", () => {
  expect(priceFor(course300, { level: 15 })).toBe(240);
});

it("charges beginners the full price", () => {
  expect(priceFor(course300, { level: 5 })).toBe(300);
});`, "price.test.ts"),
        p("Both tests pass before and after the change: level 15 is above the boundary with `>=` and with `>`, and level 5 is below it with both. Both branches of the `if` run, so the coverage report is 100%. Nothing in CI could have failed, because no test asks what happens **at** level 10."),

        h2("2. Reproduce it and read the evidence"),
        p("Coverage first. It is honest about what it measures: every line and branch of `price.ts` was executed by some test."),
        code("text", `
 File                 | % Stmts | % Branch | % Funcs | % Lines
 src/pricing/price.ts |     100 |      100 |     100 |     100`, "npx vitest run --coverage (excerpt)"),
        p("Now ask a different question: if this code were wrong, would a test fail? That is what a mutation testing tool does. It makes small, deliberate changes to the code - one at a time - and runs the tests against each changed version. Running StrykerJS on the pricing module **before** the refactor gives this (the clear-text report, shortened; the exact layout depends on the version):"),
        code("text", `
[Survived] EqualityOperator
src/pricing/price.ts:8:22
-   const discounted = learner.level >= DISCOUNT_LEVEL;
+   const discounted = learner.level > DISCOUNT_LEVEL;
Tests ran:
    gives high-level learners 20% off
    charges beginners the full price

Ran 2.00 tests per mutant on average.
Mutation score: 85.71`, "npx stryker run (excerpt)"),
        p("Read the first block slowly. The tool made exactly the change the agent made later, ran both tests, and both still passed: the mutant **survived**. The hole in the tests was visible before anyone touched the code. The tool does not know whether `>=` or `>` is right - it only shows that the tests cannot tell them apart, and that any later change between the two will go through unnoticed."),

        h2("3. Core idea: coverage says the code ran, mutation says the tests checked it"),
        p("A **mutant** is a copy of your code with one small change, made by a **mutator**: `>=` becomes `>` (EqualityOperator), `+` becomes `-` (ArithmeticOperator), a condition becomes `true` (ConditionalExpression), a function body is emptied (BlockStatement), and so on. For each mutant the tool runs the tests that cover it, and records what happened:"),
        bullets([
            "**Killed** - at least one test failed. Good: the tests notice this kind of mistake.",
            "**Survived** - the tests ran and all passed. A test is missing or does not assert enough.",
            "**Timeout** - the tests did not finish, usually because the mutant created an endless loop. The change was noticed, just not by an assertion.",
            "**No coverage** - no test runs this code at all. The worst kind of undetected.",
            "**Compile error / runtime error** - the mutant is not valid code (for example a type error in TypeScript), so it says nothing about the tests.",
            "**Ignored** - excluded on purpose, by configuration or by a comment in the code.",
        ]),
        h3("The mutation score"),
        p("StrykerJS documents its score like this, and CodeDev uses the same definitions:"),
        code("text", `
detected   = killed + timeout
undetected = survived + no coverage
valid      = detected + undetected        (compile errors, runtime errors and ignored are left out)
score      = detected / valid * 100`, "mutation score"),
        p("Leaving compile errors out is fair: a mutant that never ran cannot be blamed on the tests. Counting no-coverage as undetected is also fair: code no test runs is code no test checks. StrykerJS also reports a second number, the score based on covered code only (`detected / (detected + survived)`), which is useful when you want to know how good the existing tests are, but it hides untested code, so it is not the number to gate on."),
        h3("Why this matters more with agents"),
        p("When the same agent writes the code and its tests in one session, the tests tend to describe what the code does, not what it should do. They pass by construction, they raise coverage, and they can assert very little: `toBeDefined()`, a snapshot of whatever came out, one happy-path value far from any boundary. Coverage rewards all of these. Mutation score does not: a test that asserts nothing kills nothing. That makes it a useful **independent** check on agent-written tests, and a concrete to-do list for the agent - each surviving mutant is a test to write."),
        callout("warning", "When not to use it, or not everywhere",
            "Mutation testing is expensive: every mutant means another test run. Do not run it on the whole repository on every pull request; run it on the changed files (and use the tool's incremental mode if it has one), and the full run nightly. Skip generated code, logging and thin UI glue. Do not chase 100%: some mutants are equivalent (they do not change behavior, like a mutated log message or a cache size of 100 versus 101 in a test-only path) and cannot be killed by any honest test."),
        challenge("chal_quiz_acp_231"),

        h2("4. Worked example: killing mutants and wiring the gate"),
        h3("Kill the boundary mutant"),
        p("The fix is not in `price.ts` first; it is in the tests. Add the cases the mutant says are missing - the boundary and the value just below it - and restore `>=`:"),
        code("typescript", `
it.each([
  { level: 9, price: 300 },
  { level: 10, price: 240 },   // the boundary: the discount starts here
  { level: 11, price: 240 },
])("level $level pays $price", ({ level, price }) => {
  expect(priceFor(course300, { level })).toBe(price);
});`, "price.test.ts (added)"),
        p("Rerun the mutation tool on `price.ts`: the EqualityOperator mutant is now killed, and so is the opposite one (`>` to `>=`) on the refactored code. A second example, on a different module, shows the same pattern with arithmetic. A test of `percent(1, 1)` cannot tell `completed / total` from `completed * total`, because both give 1; a test of `percent(1, 4)` can (25 versus 400). Choose test values where the wrong code gives a different answer."),
        h3("Configure the tool"),
        p("A minimal StrykerJS setup for a Vitest project. The option names below are those of recent StrykerJS versions; check the current documentation, as runners and options change:"),
        code("json", `
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "testRunner": "vitest",
  "mutate": ["src/**/*.ts", "!src/**/*.d.ts", "!src/generated/**"],
  "reporters": ["clear-text", "progress", "json"],
  "thresholds": { "high": 85, "low": 70, "break": 70 },
  "incremental": true
}`, "stryker.config.json"),
        p("In a pull request, CodeDev restricts mutation to the changed source files, so a run takes a few minutes instead of an hour:"),
        code("bash", `
changed=$(git diff --name-only origin/main...HEAD --diff-filter=d -- 'src/**/*.ts' | paste -sd, -)
[ -n "$changed" ] && npx stryker run --mutate "$changed"`, "CI step"),
        h3("The gate the agent reads"),
        p("StrykerJS can fail the run by itself when the score is below `thresholds.break`. CodeDev adds a small gate script on top of the JSON report, because the agent needs more than a red light: the score of each changed file and the exact list of mutants to kill. CI flattens the report into one list of mutants (id, file, line, mutator, status), and the gate turns it into a report and a decision. The decision compares the exact score with the threshold - a run just below the threshold fails even when its rounded score displays as the threshold - and a run with no valid mutants fails, because it measured nothing."),
        code("text", `
## Mutation gate
After the agent check passes, run \`npm run mutation:changed\`.
For every line under "undetected", add a test that fails on that mutant, or explain in the
pull request why the mutant is equivalent. Never add "Stryker disable" comments and never
change "mutate" or "thresholds"; ask a human.`, "AGENTS.md (excerpt)"),
        p("Now write the gate. The input is a recorded run; the statuses use lowercase names (`killed`, `survived`, `timeout`, `no-coverage`, `compile-error`, `ignored`)."),
        challenge("chal_coding_acp_232"),

        h2("5. How to verify"),
        bullets([
            "**Put the bug back by hand.** Change `>=` to `>` on a scratch branch and run the tests: at least one must fail now. That is the incident, replayed against the new tests.",
            "**Compare scores before and after.** The gate report of the pull request should show the pricing file's score going up and the boundary mutant gone from the undetected list.",
            "**Read the new tests, not just the number.** A killed mutant with a test that asserts an implementation detail (a private call count, a full snapshot) will break on every refactor. Prefer assertions on behavior a learner would notice: the price, the percentage, the rank.",
            "**Search the diff for exclusions.** `Stryker disable` comments and changes to `mutate` remove mutants from the score - ignored mutants count nowhere, so excluding the ones that survive raises the score without improving a single test.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Treating coverage as proof.** 100% coverage with two tests far from the boundary is how the incident shipped. Spot it: high coverage, few assertions, no tests at boundary values.",
            "**Gaming the score.** An agent asked to \"raise the mutation score\" may add disable comments, shrink `mutate`, or write tests that snapshot everything. Spot it: changes to the Stryker config or new disable comments in the diff; snapshot files that grow with every run.",
            "**Mutating everything on every pull request.** The run takes an hour, so people turn it off. Spot it: a CI job that is skipped or allowed to fail; fix it by mutating changed files only and running the full set nightly.",
            "**Counting statuses wrong.** Gating on killed / all mutants punishes the tests for compile errors and ignores timeouts; gating on the covered-code score hides untested files. Spot it: a gate script whose numbers differ from the tool's own report.",
            "**Fighting equivalent mutants.** A test that exists only to kill a mutant that cannot change behavior is noise. Spot it: tests that assert log text or internal constants; mark the mutant ignored with a reason a reviewer can check.",
        ]),

        h2("7. Summary"),
        numbered([
            "Coverage measures which code ran; mutation testing measures whether the tests would fail if that code were wrong. A surviving mutant points at a missing or weak test, often at a boundary.",
            "Score = (killed + timeout) / (killed + timeout + survived + no coverage); compile errors and ignored mutants are left out. Gate on the exact score, and fail a run that measured nothing.",
            "Use it as the agent's quality gate on changed files: the agent turns each undetected mutant into a test, and a human reviews the tests and every exclusion.",
        ]),

        h2("Sources"),
        bullets([
            "StrykerJS documentation: getting started, configuration (mutate, thresholds, incremental), Vitest runner - stryker-mutator.io/docs/",
            "Stryker documentation: mutant states and metrics (detected, undetected, valid, invalid, mutation score) - stryker-mutator.io/docs/",
            "Vitest documentation: coverage - vitest.dev",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run a mutation testing tool on one small module of your own that has high coverage. Pick three surviving mutants, write a test that kills each one, and for any you decide are equivalent, write down why. Then ask a coding agent to do the same on another module and review its tests: which ones check behavior, and which ones only make the number go up?"),
    ],
});
