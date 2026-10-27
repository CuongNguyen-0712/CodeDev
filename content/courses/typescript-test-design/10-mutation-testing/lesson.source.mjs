// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ttd-3-4",
    title: "Mutation testing: measuring how good your tests are",
    slug: { _type: "slug", current: "mutation-testing-measuring-how-good-your-tests-are" },
    description:
        "The CodeDev checkout had a 90% coverage gate, and it let through a refactor that deleted the minimum-price rule. Learn what mutation testing measures that coverage cannot: how a tool such as StrykerJS plants small bugs (mutants), runs your tests against each one and reports which survive, how to read the mutation score next to coverage, what to do with equivalent mutants, how to keep it fast by mutating only the files a pull request changes, and how to use survivors as feedback on tests written by people or by AI.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev checkout team",
        problem:
            "The post-mortem of PR #702, the refactor that charged -1,000 VND for a 49,000 VND course, ends with one open question: the pull request passed CI, including the 90% line coverage gate on src/checkout, so which check would have failed it? One proposal is to raise the gate to 100%. Before the team agrees, the tech lead asks you to try mutation testing on coupon.ts with the test file as it was before the refactor, and to report what it shows that coverage did not.",
    },

    content: [
        h2("1. The incident: a gate that measured the wrong thing"),
        p("Lesson 3.3 ended with three green tests and 100% coverage on code that had lost a business rule. The team's coverage gate did its job exactly: it checked that the tests **ran** at least 90% of the lines. Nobody had a check for whether the tests would **notice** if a line were wrong. Raising the gate to 100% would not change that; the broken code was already at 100%."),
        p("Mutation testing is that second check, automated. You did it by hand in lesson 3.3: change one small thing, run the tests, see whether anything fails. A mutation testing tool does it for every place in the code it knows how to change, and gives you a list and a number."),

        h2("2. Core idea: mutants, killed and survived"),
        p("A mutation testing run works like this:"),
        numbered([
            "The tool runs your tests once on the real code. They must all pass; otherwise there is nothing to compare against.",
            "It creates **mutants**: copies of the code with one small change each, made by rules called **mutators** - `>` becomes `>=`, `+` becomes `-`, a condition becomes `true` or `false`, a block is emptied, a string becomes empty.",
            "For each mutant it runs the tests that cover the changed line.",
            "If at least one test fails, the mutant is **killed**: the tests noticed. If every test passes, it **survived**: you could ship that bug and stay green.",
        ]),
        p("Tools such as StrykerJS report a few more states. **No coverage** means no test even ran the mutated code. **Timeout** means the mutant made the tests hang (an endless loop), which counts as detected. **Compile error** means the change did not type-check and is left out. The **mutation score** is roughly the share of mutants detected, killed plus timed out, out of all valid mutants; survivors and mutants without coverage count against it."),
        h3("Why this measures something coverage cannot"),
        p("Coverage is a property of the **execution**: which lines ran. A mutation score is a property of the **assertions**: which changes they react to. A test that calls a function and asserts nothing has full coverage of that function and kills nothing. That is also why the two numbers can disagree wildly on the same file, and why both are worth reading."),
        callout("info", "When not to use it",
            "Mutation testing is expensive: it runs the tests once per mutant, so a project with a few thousand mutants and a slow test suite can take hours. Do not start with the whole repository. Start with code that holds business rules - prices, eligibility, permissions, scheduling - and skip glue code, generated code and logging, where a surviving mutant rarely means a missing test that matters."),

        h2("3. Worked example: StrykerJS on coupon.ts"),
        p("StrykerJS is a widely used mutation testing tool for JavaScript and TypeScript, with a runner for Vitest. The commands below follow its documentation at the time of writing; package names and options change between versions, so check stryker-mutator.io/docs for yours."),
        code("bash", `
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner
npx stryker init        # optional: asks a few questions and writes a config file`, "terminal"),
        code("json", `
{
  "testRunner": "vitest",
  "mutate": ["src/checkout/**/*.ts", "!src/**/*.test.ts"],
  "reporters": ["clear-text", "html", "progress"],
  "thresholds": { "high": 80, "low": 60, "break": 60 }
}`, "stryker.config.json"),
        p("`mutate` decides which files get mutants (here: the checkout code, not the tests). `thresholds.break` makes the run fail when the score is below 60, so it can act as a CI check. Run it with the test file from before the refactor (the three tests of lesson 3.3):"),
        code("text", `
$ npx stryker run

[Survived] EqualityOperator
src/checkout/coupon.ts:3:7
-   if (today > coupon.expiresOn) return price;
+   if (today >= coupon.expiresOn) return price;

[Survived] ConditionalExpression
src/checkout/coupon.ts:4:7
-   if (price <= MIN_PRICE) return price;
+   if (false) return price;

... 3 more survived mutants

File       | % score | # killed | # timeout | # survived | # no cov | # errors
coupon.ts  |  75.00  |    15    |     0     |     5      |    0     |    0`, "clear-text reporter (abridged; the mutants and counts depend on the Stryker version)"),
        p("Read the survivors one by one. Each is a sentence about your tests:"),
        bullets([
            "**Line 3, `>` to `>=`**: no test uses a coupon on its expiry day. Missing test: the expiry day itself.",
            "**Line 4, `if (false)`**: removing the cheap-course rule changes nothing the tests see. Missing test: a course that costs 10,000 VND or less. This is the rule PR #702 deleted; with this test in place, the refactor would have failed CI.",
            "**The other survivors**: read each one the same way, and before you write a test for a survivor, check that a test **can** kill it. Section 4 explains why that is not always the case.",
        ]),
        p("Notice also what the tool does **not** do. Its mutators are a fixed list. Whether it plants `Math.floor` to `Math.round` depends on the tool and version, and many do not, so the rounding bug of PR #702 may never appear as a mutant. The tool is a strong check on the mistakes it knows; thinking through the rules, as in lesson 3.3, still covers the rest."),

        h2("4. Equivalent mutants: why 100% is not the target"),
        p("Some mutants change the code without changing its behaviour. They are called **equivalent mutants**, and no test can kill them. Here is one from the progress bar of the course page, which must never show more than 100%:"),
        code("typescript", `
// src/progress/clampProgress.ts
export function clampProgress(percent: number): number {
  if (percent > 100) return 100;      // mutant: if (percent >= 100) return 100;
  return percent;
}

// The two versions differ only when percent is exactly 100:
//   original: skips the if and returns percent, which is 100
//   mutant:   takes the if and returns 100
// Same result for every input: no test can tell them apart.`, "an equivalent mutant"),
        p("Reason it through once, then record the decision where the next reader will see it. StrykerJS supports a comment that disables a mutator on the next line, with a reason:"),
        code("typescript", `
// Stryker disable next-line EqualityOperator: at exactly 100 both branches return 100
if (percent > 100) return 100;`, "clampProgress.ts"),
        p("Because equivalent mutants exist, a 100% mutation score is often impossible and chasing it produces strange tests. Use the score as a trend and a threshold (\"do not go below what we have\"), and use the **list of survivors** as the real output: every survivor is either a missing test, an equivalent mutant you have marked, or code you decided is not worth testing."),

        h2("5. Using it in a real workflow"),
        h3("Mutate only what a pull request changes"),
        p("A full run of a large project is too slow for every pull request. Two common ways to keep it fast:"),
        code("bash", `
# only the files this branch changed (not the tests)
npx stryker run --mutate "$(git diff --name-only origin/main -- 'src/**/*.ts' ':!src/**/*.test.ts' | paste -sd, -)"

# reuse the results of the previous run for code and tests that did not change
npx stryker run --incremental`, "terminal (check both options in the docs of your version)"),
        p("A typical setup: changed files on every pull request with a `break` threshold, and a full run on a schedule, every night or every week, whose report the team reads."),
        h3("Feedback for tests written by people or by AI"),
        p("AI assistants write tests quickly, and they tend to write the tests the code already passes: the happy middle of each rule, expected values copied from the implementation. Coverage rewards that; mutation testing does not. When a pull request comes with generated tests, run the mutation report on the changed files and paste the survivors into the review. \"5 mutants survive, including `>` to `>=` on the expiry line\" is a concrete request; \"please add more tests\" is not. The same works in the other direction: give the survivors back to the assistant as the list of cases to add, then check that the new tests kill them."),

        challenge("chal_quiz_ttd_341"),

        h2("6. How to verify your mutation testing setup"),
        bullets([
            "**Check it can fail.** Delete one important assertion in a test and run the tool: the score should drop and a new survivor should point at that behaviour. A setup that reports the same score either way is not mutating what you think.",
            "**Check the scope.** The report should list only the files in `mutate`. Mutants in test files or generated code make the score meaningless.",
            "**Check the time.** Note how long a pull request run takes. If it is much longer than the normal test job, narrow `mutate` or use incremental mode before people start to skip it.",
            "**Check one survivor by hand.** Apply the mutant's change yourself, run the tests, and confirm they stay green. It builds trust in the report and is how you spot equivalent mutants.",
        ]),

        h2("7. Common mistakes with mutation testing"),
        bullets([
            "**Treating it like coverage.** Spot it: someone sets a 100% mutation score gate. Equivalent mutants make that impossible; set a realistic threshold and read the survivors.",
            "**Killing mutants with meaningless assertions.** Spot it: new tests that assert implementation details or exact log messages just to make a survivor go away. Ask which behaviour the test protects.",
            "**Running it on everything, every time.** Spot it: a CI job that takes an hour and gets disabled. Mutate changed files on pull requests, the rest on a schedule.",
            "**Forgetting the tool's blind spots.** Spot it: \"no survivors, so the tests are complete\". The tool only plants the mutations it knows; rounding, wrong constants and missing features may never appear.",
            "**Ignoring \"no coverage\" mutants.** Spot it: a report with many no-cov mutants and a reasonable-looking score. No test runs that code at all; start there.",
        ]),

        h2("8. Summary"),
        numbered([
            "Coverage tells you which code ran; mutation testing tells you which small bugs your tests would notice. Read both, and trust the survivors list more than either number.",
            "A survivor is a missing test, an equivalent mutant to mark with a reason, or code you chose not to test. That is why 100% is not the target.",
            "Keep it fast and useful: mutate the files a pull request changes, run the full set on a schedule, and use survivors as concrete review feedback on tests written by people or by AI.",
        ]),

        h2("Sources"),
        bullets([
            "StrykerJS documentation: getting started, configuration (mutate, thresholds, incremental), mutant states and the list of mutators - stryker-mutator.io/docs",
            "Vitest documentation: coverage - vitest.dev/guide/coverage",
            "Martin Fowler: The Practical Test Pyramid - martinfowler.com/articles/practical-test-pyramid.html",
        ]),
        callout("tip", "Self-practice (not graded): one survivor at a time",
            "Install StrykerJS in a small project of your own with tests, limit `mutate` to one file that holds a business rule, and run it. For every survivor, write one line: missing test (then write it), equivalent (then add a disable comment with the reason), or not worth testing (and why). Run it again and compare the score and the list."),
    ],
});
