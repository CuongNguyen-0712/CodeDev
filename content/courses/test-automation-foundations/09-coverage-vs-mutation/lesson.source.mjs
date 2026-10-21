// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-qaf-3-3",
    title: "Coverage vs mutation score",
    slug: { _type: "slug", current: "coverage-vs-mutation-score" },
    description:
        "A suite at 96% coverage let a >= turn into > and nobody noticed. Learn what line, branch and function coverage in node:test really measure, how thresholds and include/exclude work, why coverage proves only that code ran - and how mutation testing (killed, survived and equivalent mutants, the mutation score) measures whether your assertions would notice a bug.",
    estimatedTime: 25,

    scenario: {
        role: "QA automation engineer, online shop checkout team",
        problem:
            "The pipeline's quality gate demands 90% line coverage, and the checkout repository proudly sits at 96%. Yet a one-character refactor - >= became > in the free-shipping rule - went through review with a green build and an unchanged coverage report, and for nine days every order of exactly $100.00 paid $4.99 shipping. Your job: show why the gate could not see it, measure the suite with mutation testing, and leave a policy the team can keep.",
    },

    content: [
        h2("1. The incident: 96% coverage, zero protection"),
        p("The marketing banner says **\"Free shipping on orders of $100 or more\"**. Prices are integer cents, so the rule is: a subtotal of 10000 cents or more ships free, anything below pays a flat 499. This is the module as it was before the incident:"),
        code("javascript", `
export const FREE_SHIPPING_CENTS = 10_000;   // $100.00
export const FLAT_FEE_CENTS = 499;

export function shippingFee(subtotalCents) {
    if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
        throw new RangeError(\`subtotalCents must be a whole number >= 0, got \${subtotalCents}\`);
    }
    if (subtotalCents >= FREE_SHIPPING_CENTS) {
        return 0;
    }
    return FLAT_FEE_CENTS;
}`, "src/shipping.js"),
        p("A year earlier, the team had added a CI step that fails the build below 90% line coverage. Coverage went up fast - mostly through tests like this one, written to \"cover\" modules nobody had tested before:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { shippingFee } from "../src/shipping.js";

test("shippingFee returns a number for small and large carts", () => {
    assert.equal(typeof shippingFee(3000), "number");
    assert.equal(typeof shippingFee(25000), "number");
});

test("shippingFee rejects a negative subtotal", () => {
    assert.throws(() => shippingFee(-1));
});`, "test/shipping.test.js"),
        p("Then a refactor \"aligned the wording with the spec\" - which someone had paraphrased as \"free shipping over $100\" - and changed one character: `subtotalCents >= FREE_SHIPPING_CENTS` became `subtotalCents > FREE_SHIPPING_CENTS`. The build was green. The coverage report did not move. A bundle priced at exactly $100.00 was the shop's best seller that month, and support found the problem only after customers complained."),
        callout("warning", "The gate measured the wrong thing",
            "Every line of shipping.js ran during the tests, so coverage was honest: 100% of the lines executed. But no assertion ever compared a fee with an expected number. Coverage counts what ran, not what was checked - and the team had optimised for the number the gate could see."),

        h2("2. Reproduce it: same coverage, broken code"),
        p("First the suite as it was, with coverage (you met the flag in JS-1 lesson 8):"),
        code("bash", `
$ node --test --experimental-test-coverage
✔ shippingFee returns a number for small and large carts (2.4976ms)
✔ shippingFee rejects a negative subtotal (1.8559ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0
...
ℹ file         | line % | branch % | funcs % | uncovered lines
ℹ -------------------------------------------------------------
ℹ src          |        |          |         |
ℹ  shipping.js | 100.00 |   100.00 |  100.00 |
ℹ -------------------------------------------------------------
ℹ all files    | 100.00 |   100.00 |  100.00 |`),
        p("Now play the refactor by hand: change `>=` to `>` on the free-shipping line and run exactly the same command again."),
        code("bash", `
$ node --test --experimental-test-coverage
✔ shippingFee returns a number for small and large carts (2.1636ms)
✔ shippingFee rejects a negative subtotal (1.5061ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0
...
ℹ  shipping.js | 100.00 |   100.00 |  100.00 |
ℹ -------------------------------------------------------------
ℹ all files    | 100.00 |   100.00 |  100.00 |
$ echo $?
0`),
        p("Same tests, same 100% on every column, exit code 0 - and a different price for real customers. Even **branch** coverage is 100%: `shippingFee(25000)` takes the free branch and `shippingFee(3000)` takes the paid one, under both versions. What you just did by hand - change the code on purpose and check whether any test notices - is the whole idea of mutation testing. Before we automate it, let's be precise about what coverage does measure."),

        h2("3. What node:test coverage measures"),
        p("`--experimental-test-coverage` uses V8's built-in coverage and prints three numbers per file:"),
        bullets([
            "**line %** - lines that executed at least once. A line counts as covered if **any** part of it ran.",
            "**branch %** - outcomes of decisions that were taken: both sides of an `if`, of `||`/`&&`, of `?:`. A branch that never ran lowers this number even when its line is \"covered\".",
            "**funcs %** - functions that were called at least once.",
        ]),
        h3("100% lines, untested branches"),
        p("Because line coverage is per line, code style changes the number. Here the guard clauses sit on one line each:"),
        code("javascript", `
export function couponDiscount(subtotalCents, coupon) {
    if (coupon.expired) throw new Error(\`coupon \${coupon.code} has expired\`);
    if (subtotalCents < coupon.minCents) return 0;
    return Math.min(coupon.amountCents, subtotalCents);
}

export function describeCoupon(coupon) {
    return \`\${coupon.code}: \${coupon.amountCents} cents off\`;
}`, "src/coupon.js"),
        p("With one test per function, and neither an expired coupon nor a too-small cart in the tests, the throw and the `return 0` never ran. Yet:"),
        code("bash", `
ℹ file       | line % | branch % | funcs % | uncovered lines
ℹ  coupon.js | 100.00 |    60.00 |  100.00 |`),
        p("Put the throw and the `return 0` on their own lines (`couponDiscount` alone, in its own file) and the same `couponDiscount` test reports `55.56 | 50.00 | 100.00 | 3-4 6-7`. Nothing about the tests changed - only the formatting. That is why a gate on line % alone is easy to satisfy by accident, and why **branch %** and the **uncovered lines** column are the useful parts of the table."),
        h3("Thresholds: make CI fail"),
        p("Each number has a threshold flag. Below it, the runner prints an error and exits with code 1 - even though every test passed. Here the coupon suite has only the `couponDiscount` test, so `describeCoupon` is never called:"),
        code("bash", `
$ node --test --experimental-test-coverage --test-coverage-lines=90 --test-coverage-branches=80 --test-coverage-functions=80
✔ a 1500-cent coupon on a 8000-cent cart (3.9021ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
...
ℹ Error: 77.78% line coverage does not meet threshold of 90%.
ℹ Error: 50.00% branch coverage does not meet threshold of 80%.
ℹ Error: 50.00% function coverage does not meet threshold of 80%.
...
$ echo $?
1`),
        p("The thresholds apply to the **all files** row, so one well-tested file can hide a poorly tested one. Read the per-file rows too."),
        h3("Which files are counted"),
        bullets([
            "By default, test files are left out of the report - `test/shipping.test.js` did not appear in the tables above.",
            "`--test-coverage-include=\"src/**\"` keeps only matching files; `--test-coverage-exclude=\"src/legacy/**\"` drops matching files. Both accept globs and can be repeated.",
            "Careful: as soon as you pass your own `--test-coverage-exclude`, it **replaces** the default, and test files show up in the table at 100% - pulling the total up. Add `--test-coverage-exclude=\"test/**\"` as well, or use `--test-coverage-include=\"src/**\"`, which leaves them out.",
            "Only files that were **loaded** during the run appear. A module that no test imports is not reported as 0% - it is not in the table at all, even with `--test-coverage-include`.",
        ]),
        callout("info", "What coverage proves",
            "Coverage proves one thing: this code ran while the tests were running. It does not prove that any assertion looked at the result, that the expected values are right, or that the boundaries were tested. Use it to find code no test reaches - the uncovered lines are a to-do list - not as a measure of how good the tests are."),

        h2("4. Mutation testing: would a test notice a bug?"),
        p("Mutation testing turns the manual experiment from section 2 into a measurement. A tool makes many small, deliberate changes to your code - each one is a **mutant** - and runs your suite once per mutant:"),
        bullets([
            "If at least one test fails, the mutant is **killed**: the suite noticed the change. Good.",
            "If every test still passes, the mutant **survived**: you could ship that bug and the suite would stay green.",
            "If the change cannot alter behaviour for any input, the mutant is **equivalent**. Example: in `for (let i = 0; i < items.length; i++)`, the mutant `i !== items.length` behaves exactly the same, because `i` starts at 0 and goes up by 1. No test can kill it.",
        ]),
        p("The changes come from a fixed set of **mutation operators** - the same mistakes developers really make:"),
        bullets([
            "**Relational**: `<` to `<=`, `>=` to `>`, `===` to `!==` - the boundary bugs from the incident.",
            "**Arithmetic**: `+` to `-`, `*` to `/`.",
            "**Logical**: `&&` to `||` and back.",
            "**Negated condition**: `if (x)` to `if (!(x))`, or the whole condition replaced by `true` / `false`.",
            "**Return value**: `return fee` to `return 0`, `return true` to `return false`, an object to `null`.",
            "**Statement removal**: a call such as `cart.recalculate()` or a `throw` deleted, a block emptied.",
        ]),
        h3("The mutation score"),
        p("The result is summarised as one number:"),
        code("text", `
mutation score = killed / (total mutants - equivalent mutants)`),
        p("Equivalent mutants are removed from the total because no test could ever kill them; counting them as failures would punish the team, counting them as kills would inflate the score. Tools cannot reliably detect equivalent mutants on their own, so a person decides, mutant by mutant."),
        h3("A mutation run by hand"),
        p("You do not need a tool to see the idea work. This script applies five mutants to `src/shipping.js` one at a time, runs `node --test` for each, and restores the file:"),
        code("javascript", `
// A tiny mutation runner: apply one mutant at a time, run the suite, restore the file.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const file = "src/shipping.js";
const original = readFileSync(file, "utf8");
const mutants = [
    ["subtotalCents >= FREE_SHIPPING_CENTS", "subtotalCents > FREE_SHIPPING_CENTS"],
    ["subtotalCents < 0", "subtotalCents <= 0"],
    ["|| subtotalCents", "&& subtotalCents"],
    ["if (subtotalCents >= FREE_SHIPPING_CENTS)", "if (!(subtotalCents >= FREE_SHIPPING_CENTS))"],
    ["return FLAT_FEE_CENTS;", "return 0;"],
];

let killed = 0;
try {
    for (const [from, to] of mutants) {
        writeFileSync(file, original.replace(from, to));
        const { status } = spawnSync(process.execPath, ["--test"], { stdio: "ignore" });
        if (status !== 0) killed++;
        console.log(\`\${status === 0 ? "survived" : "killed  "}  \${from}  ->  \${to}\`);
    }
} finally {
    writeFileSync(file, original);   // never leave a mutant behind
}
console.log(\`mutation score: \${killed}/\${mutants.length}\`);`, "scripts/mutate.mjs"),
        code("bash", `
$ node scripts/mutate.mjs
survived  subtotalCents >= FREE_SHIPPING_CENTS  ->  subtotalCents > FREE_SHIPPING_CENTS
survived  subtotalCents < 0  ->  subtotalCents <= 0
killed    || subtotalCents  ->  && subtotalCents
survived  if (subtotalCents >= FREE_SHIPPING_CENTS)  ->  if (!(subtotalCents >= FREE_SHIPPING_CENTS))
survived  return FLAT_FEE_CENTS;  ->  return 0;
mutation score: 1/5`),
        p("The suite with 100% line, branch and function coverage scores **1 out of 5**. The only kill comes from `assert.throws(() => shippingFee(-1))`: with `&&`, -1 is a whole number, so the guard no longer throws. Even the incident's exact mutant - the first line - survives. The diagram puts both measurements side by side:"),
        image("coverage-vs-mutation", {
            alt: "Two panels for the same shippingFee function and the same green suite (typeof shippingFee(3000), typeof shippingFee(25000), throws for -1). Left panel, Coverage: did each line run? All seven lines of the function are marked ran, and the result is line 100%, branch 100%, funcs 100%. Right panel, Mutation: did a test notice the change? Five mutants: relational line 4 (cents > FREE_SHIPPING_CENTS) survived, relational line 2 (cents <= 0) survived, logical line 2 (&& instead of ||) killed, negated condition line 4 survived, return value line 6 (return 0) survived. The formula mutation score = killed / (total - equivalent) gives 1 / (5 - 0) = 20%. Footer: coverage finds code that never ran; mutation score finds code that ran but that no assertion really checked.",
            caption: "Coverage says every line ran. Mutation testing says four of five bugs would ship. The function is shortened here; the line numbers refer to this listing.",
        }),
        challenge("chal_quiz_qaf_331"),

        h2("5. Reading a surviving mutant as a missing test case"),
        p("A surviving mutant is a bug report written by a machine: \"if someone made this change, nothing would tell you\". Treat each one like a ticket and ask three questions:"),
        numbered([
            "**Which input makes the mutant behave differently?** For `>=` to `>` it is the boundary itself: 10000 cents. For `return FLAT_FEE_CENTS` to `return 0` it is any paid order. For `<` to `<=` on the validation, it is 0.",
            "**What is the right answer for that input?** Work it out from the spec, not from the code - a test that copies the code's logic copies its bugs too.",
            "**Is there an exact assertion for it?** A test may already call the function with that input but only check `typeof` or `assert.ok(fee >= 0)`. Then the input is there and the check is missing - change it to `assert.strictEqual` with a literal.",
        ]),
        p("If no input can make the mutant behave differently, it is equivalent: write down why, and let the tool ignore it (tools let you mark a line or a mutant as ignored, with a reason). If you cannot decide, that is a sign the code is more complicated than it needs to be."),
        callout("tip", "Survivors cluster at boundaries",
            "Most real survivors are relational mutants on a threshold and return-value mutants behind weak assertions. The test design you already know as a manual tester - boundary values, both sides of every limit, one exact expected result per case - kills almost all of them."),
        p("Now you read a report. The shipping fee has grown weight tiers and a member discount; the suite has 100% line coverage and seven surviving mutants, plus one equivalent one. Turn each survivor into a test case:"),
        challenge("chal_coding_qaf_332", "Take one mutant at a time: find an input where the mutant's fee differs from the original, work out the correct fee by hand from the spec, and assert it with strictEqual. Then walk the spec once more for edges the report does not list - the grader runs one mutant that is not in it."),

        h2("6. Mutation testing in practice"),
        h3("Tools"),
        p("For JavaScript and TypeScript the common tool is **StrykerJS**. It generates mutants from operator lists like the one above (plus more, such as emptying string literals or flipping `true` to `false`), runs your existing tests against each one, and writes a report - including an HTML page that shows every mutant inline in your source, coloured by status. Besides killed and survived, it reports mutants with **no coverage** (no test even reached the line, so they survive for free) and **timeouts** (the mutant made the code loop; counted as detected). Stryker has plugins for popular runners such as Jest, Mocha and Vitest, and a generic command runner that runs any test command and reads its exit code. Check the current StrykerJS documentation for setup - this lesson does not depend on a particular version."),
        h3("Cost"),
        p("Every mutant is a test run. Five mutants meant five full `node --test` runs in the script above; a real pricing module easily produces a few hundred mutants. Tools reduce the cost by running only the tests that reach the mutated line and by reusing results for code that has not changed (Stryker calls this incremental mode), but mutation testing stays far slower than a normal test run. Common ways to keep it affordable:"),
        bullets([
            "Run it on the files changed in a pull request, not on the whole repository.",
            "Run the full set nightly or weekly, and look at the trend.",
            "Limit it to modules where a silent bug costs money or trust: pricing, discounts, payments, permissions, invoice totals.",
        ]),
        h3("A policy that holds up"),
        bullets([
            "**Coverage on every build**: a moderate threshold on lines **and branches** (for example 80%), and someone reads the uncovered lines in the pull request. Its job is to find code nobody tested.",
            "**Mutation score on critical modules**: on changed files in pull requests or nightly, with a target the team agrees on. Its job is to find code that runs but is not really checked.",
            "**Survivors are triaged like bugs**: add a test, mark the mutant equivalent with a reason, or delete the dead code it revealed.",
            "**No 100% targets for either number.** Above a point, people write tests for the metric instead of for the behaviour - which is exactly how the incident's suite was born.",
        ]),

        h2("7. The fix"),
        p("The code fix is one character: back to `>=`. The useful part is the suite that would have stopped it - one exact expected value per rule, at the boundaries, plus invalid input:"),
        code("javascript", `
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shippingFee } from "../src/shipping.js";

describe("shippingFee", () => {
    const cases = [
        { subtotal: 0,     expected: 499, why: "an empty cart pays the flat fee" },
        { subtotal: 9999,  expected: 499, why: "one cent below the free-shipping line" },
        { subtotal: 10000, expected: 0,   why: "exactly at the line ships free" },
        { subtotal: 25000, expected: 0,   why: "well above the line" },
    ];
    for (const { subtotal, expected, why } of cases) {
        it(\`charges \${expected} for \${subtotal} (\${why})\`, () => {
            assert.equal(shippingFee(subtotal), expected);
        });
    }

    it("rejects a negative or fractional subtotal", () => {
        assert.throws(() => shippingFee(-1), RangeError);
        assert.throws(() => shippingFee(99.5), RangeError);
    });
});`, "test/shipping.test.js"),
        code("bash", `
$ node scripts/mutate.mjs
killed    subtotalCents >= FREE_SHIPPING_CENTS  ->  subtotalCents > FREE_SHIPPING_CENTS
killed    subtotalCents < 0  ->  subtotalCents <= 0
killed    || subtotalCents  ->  && subtotalCents
killed    if (subtotalCents >= FREE_SHIPPING_CENTS)  ->  if (!(subtotalCents >= FREE_SHIPPING_CENTS))
killed    return FLAT_FEE_CENTS;  ->  return 0;
mutation score: 5/5`),
        p("Look at what changed and what did not. The coverage table for the new suite is identical to the old one - 100, 100, 100 - so the gate could never have told them apart. The mutation score went from 1/5 to 5/5. The 10000-cent case is the incident's regression test: if anyone \"aligns the wording\" again, it fails in CI."),
        callout("success", "After the fix",
            "The team kept the coverage gate but added a branch threshold and switched to --test-coverage-include=\"src/**\". They added a nightly mutation run on the pricing, discount and shipping modules, and a rule: a surviving mutant in those modules is a ticket, not a number. In the first month the nightly run found eleven survivors; nine became new boundary tests, one was an equivalent mutant marked with a reason, and one revealed dead code that was deleted."),

        h2("8. Pitfalls"),
        bullets([
            "**Gating on line % alone.** One-line `if (...) return` statements count as covered when only the condition ran. Gate on branches too.",
            "**Passing your own `--test-coverage-exclude` and forgetting `test/**`.** It replaces the default, and test files at 100% lift the total.",
            "**Trusting the total when files are missing.** A module that no test imports is not in the report at all. Compare the table with your `src/` folder now and then.",
            "**Writing tests for the number.** `typeof` checks and `assert.ok(result)` raise coverage and kill almost no mutants. Every assertion should compare with an exact expected value.",
            "**Killing mutants with assertions that mirror the code.** Computing the expected fee with the same formula as the implementation kills arithmetic mutants only by accident. Write literal values worked out from the spec.",
            "**Marking real survivors as equivalent** to raise the score. An equivalent mutant needs a written reason that holds for every input.",
            "**Running mutation testing on everything, on every push.** It becomes slow, people stop reading the results, and it gets switched off. Start with the modules that handle money.",
            "**Hand-rolled runners that leave a mutant behind.** Restore the file in a `finally` block, and check `git status` before committing.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Read **branch %** and the **uncovered lines** column, not just line %.",
            "Set `--test-coverage-lines` and `--test-coverage-branches` in CI; know that below a threshold the run exits with code 1.",
            "Use `--test-coverage-include=\"src/**\"`, or add `test/**` to every custom exclude list.",
            "Remember that unloaded files are missing from the report, not shown at 0%.",
            "Treat coverage as \"this code ran\", never as \"this code is tested\".",
            "Run mutation testing on critical modules - on changed files or nightly.",
            "Compute the score as killed / (total - equivalent), and justify every equivalent mutant in writing.",
            "Turn each surviving mutant into a test: the input where it differs, the right answer from the spec, an exact assertion.",
            "Never set 100% targets; triage survivors like bugs.",
        ]),

        h2("Course wrap-up"),
        p("You started this course deciding what deserves a test at all, and you finish it measuring whether your tests would notice a bug. Along the way you balanced the pyramid and the trophy, wrote assertions whose failure messages explain themselves, built test data with arrange-act-assert and builders, picked the right test double, tested async code with fake timers, ran integration tests against an in-memory store, hunted flaky tests caused by order, time and shared state, kept snapshots honest - and now you can tell a suite that runs code from a suite that checks it. The habit that connects every lesson: reproduce the bug with a failing test, understand the rule behind it, and leave a check that would catch it next time."),
        p("You can now:"),
        bullets([
            "Design a suite from a spec with boundary values, equivalence classes and exact expected results.",
            "Isolate code with stubs, mocks, fakes and fake timers, and test it against an in-memory store.",
            "Diagnose and fix flaky tests instead of retrying them.",
            "Read coverage reports critically and use mutation testing to find the assertions that are missing.",
        ]),
        p("Where to go next:"),
        bullets([
            "**JavaScript: Asynchronous Architecture & Production Patterns** - the event loop, cancellation, retries and deterministic tests for code that waits on the network and the clock.",
            "**API & Contract Testing in Python: From Requests to Pipelines** - the same habits applied to HTTP APIs: test cases from the contract, schema validation, consumer-driven contracts, test data and suites that stay reliable in CI.",
            "**DevOps Foundations: Linux, Containers, CI/CD & Observability** - see where your suites, coverage thresholds and nightly mutation runs live: CI pipelines with stages and caches, containers, deploys and rollbacks.",
        ]),
    ],
});
