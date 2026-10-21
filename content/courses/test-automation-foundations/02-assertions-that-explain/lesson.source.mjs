// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-qaf-1-2",
    title: "Assertions that explain failures",
    slug: { _type: "slug", current: "assertions-that-explain-failures" },
    description:
        "A red test is only useful if its message tells you what broke. Learn what a good failure message contains (which case, where, expected, actual), why compound assert.ok checks hide the answer, how deepStrictEqual, partialDeepStrictEqual and assert.match report differences on Node 24, how custom messages and table-driven test names add the missing context, and how to write a domain assertion that explains every difference at once.",
    estimatedTime: 20,

    scenario: {
        role: "QA automation engineer, online shop orders team",
        problem:
            "At 02:00 the nightly order-export job went red in CI. The only output was \"The expression evaluated to a falsy value\" followed by a three-part assert.ok. The on-call engineer spent an hour re-running the export locally to find out which part was false - a line quantity had been exported as 2 instead of 3. In the same run, a loop over 40 shipping zones said only \"false !== true\". Your job: make every failure in the suite explain itself, so the next person on call can read the answer instead of digging for it.",
    },

    content: [
        h2("1. The incident: a red test that said nothing"),
        p("The shop exports every paid order to the warehouse system each night. Order **A-1042** has two lines: 2 mugs at 1800 cents and 3 T-shirts at 1200 cents, so the total is **7200** cents. The export test that guarded it looked like this:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportOrder } from "../src/export.js";
import { orderA1042 } from "./fixtures.js";

test("order export works", () => {
    const order = exportOrder(orderA1042);
    assert.ok(order.total === 7200 && order.status === "paid" && order.lines.length === 2);
});`, "test/export.test.js"),
        p("A refactor of the quantity parser shipped in the evening. At 02:00 CI printed this - and nothing more:"),
        code("bash", `
✖ order export works (46.1ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

    assert.ok(order.total === 7200 && order.status === "paid" && order.lines.length === 2)

  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '=='`),
        p("Three conditions went in; one bit came out. Was the status wrong? A line missing? The total off by a cent or by a whole line? The engineer on call could not tell, so they checked out the commit, rebuilt the fixture data and added `console.log` calls until, an hour later, they saw `total: 6000` and then the cause: the T-shirt line had `qty: 2`."),
        p("The same run had a second red test, from a different author:"),
        code("javascript", `
test("every shipping zone is deliverable", () => {
    for (const zone of zones) {                      // 40 zones from the fixture
        assert.equal(isDeliverable(zone), true);
    }
});`, "test/shipping.test.js"),
        code("bash", `
✖ every shipping zone is deliverable (2.4ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  false !== true`),
        p("Which of the 40 zones? The message cannot say: the assertion only ever saw a boolean. And because the first failing assertion ends the test, nobody knows whether one zone is broken or twelve."),
        callout("warning", "The bug was easy; the message was the problem",
            "Both tests did their job - they turned red on a real bug. They failed at their second job: telling a person at 02:00 what is wrong. A test suite is read far more often than it is written, and most of that reading happens when something is red."),

        h2("2. Reproduce it"),
        p("You do not need the warehouse to reproduce this. Build the broken order by hand and run the original assertion - this is the exported value the night job produced:"),
        code("javascript", `
const exported = {
    id: "A-1042",
    status: "paid",
    total: 6000,
    lines: [
        { sku: "MUG-01", qty: 2, priceCents: 1800 },
        { sku: "TEE-02", qty: 2, priceCents: 1200 },   // should be 3
    ],
};`, "test/repro.test.js"),
        p("`node --test test/repro.test.js` prints exactly the message from CI: the expression, and the fact that it was false. Running it again changes nothing - the information was thrown away the moment the three comparisons were joined with `&&`. That is the point to remember: **a failure message can only contain what the assertion was given**. `assert.ok` was given one boolean."),
        p("You already know `strictEqual` and `deepStrictEqual` from JS-1 lesson 8 (Testing with node:test & assert). This lesson is about the other half of an assertion: what it says when it fails."),

        h2("3. What a good failure message contains"),
        p("Before you change any code, decide what the message should answer. A useful failure message lets a reader who has never seen the test say what broke, without running anything. It answers four questions:"),
        numbered([
            "**Which case** - which order, user, zone or input row. Usually the test name carries it; in loops the message must.",
            "**Where** - which field, as a path into the data: `lines[1].qty`, not just `qty`.",
            "**Expected** - the value the spec demands, written as a literal in the test.",
            "**Actual** - what the code produced, shown with its type, so `2` and `\"2\"` look different.",
        ]),
        image("anatomy-of-a-failure-message", {
            alt: "Two panels compare failure messages for the same broken order export. The left, red panel titled Before: one compound assert.ok shows the CI output FAIL order export works, AssertionError, The expression evaluated to a falsy value, followed by assert.ok(order.total === 7200 && order.status === \"paid\" && order.lines.length === 2). Below it: the only fact it gives is that the whole expression was false; which case, where, expected and actual are all question marks; the answer took an hour of local re-runs. The right, green panel titled After: a domain assertion that explains shows FAIL exports order A-1042 as paid, Error: order mismatch:, total: expected 7200, got 6000, and lines[1].qty: expected 3, got 2, with the test name colored as which case, the paths as where, 7200 and 3 as expected, 6000 and 2 as actual. It notes that every difference is listed, not only the first. Four boxes along the bottom define the parts: Which case - the test name names the order and the rule; Where - a path into the data such as lines[1].qty; Expected - the value the spec demands, written as a literal; Actual - what the code produced, shown with its type, 2 is not \"2\".",
            caption: "The same failure, reported two ways. The good message answers which case, where, expected and actual - and lists every difference.",
        }),
        p("Node's assertions already give you expected and actual for free - but only if you hand them the two values. Most of the work is not writing messages; it is choosing assertions that receive enough information to write them for you."),

        h2("4. Let the assertion see the values"),
        h3("Split compound booleans"),
        p("Every `&&` inside `assert.ok` is a question whose answer gets discarded. Give each condition its own assertion with both values:"),
        code("javascript", `
assert.equal(order.status, "paid");
assert.equal(order.lines.length, 2);
assert.equal(order.total, 7200);`, "test/export.test.js"),
        p("Now the failure reads `6000 !== 7200`: actual and expected, no re-run needed. The order of the lines matters too - put the most basic facts first (status, number of lines) so that the first failure is the most informative one."),
        h3("Compare whole objects with deepStrictEqual"),
        p("When the result is a structure, compare the structure. On Node 24, `deepStrictEqual` prints a diff that shows **only the lines that differ**, marked `+` for actual and `-` for expected:"),
        code("javascript", `
assert.deepStrictEqual(order.lines[1], { sku: "TEE-02", qty: 3, priceCents: 1200 });`, "test/export.test.js"),
        code("bash", `
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+ actual - expected

  {
    priceCents: 1200,
+   qty: 2,
-   qty: 3,
    sku: 'TEE-02'
  }`),
        p("Two details of this diff are worth knowing. Keys are printed in alphabetical order, not in the order you wrote them. And for a large object, Node collapses the unchanged parts into `...` and prints `... Skipped lines` at the top - the differing lines are always shown, but their exact position (which array item?) can get lost in a long diff. That is one reason to compare a focused piece, like one line, rather than a whole 200-field document."),
        h3("Check only the fields that matter: partialDeepStrictEqual"),
        p("Sometimes the result has fields the test should not care about - a generated id, a timestamp, an internal flag. `assert.partialDeepStrictEqual(actual, expected)` checks that every key in `expected` exists in `actual` with a strictly equal value and ignores the rest. On Node 24.14 it runs without a flag and without a warning:"),
        code("javascript", `
assert.partialDeepStrictEqual(order, {
    status: "paid",
    total: 7200,
});                                // passes even though order also has id, lines, exportedAt`, "test/export.test.js"),
        callout("warning", "Partial also means partial arrays",
            "For arrays, partialDeepStrictEqual only checks that the expected items appear in actual in the same order. Verified on Node 24.14: an expected lines array with ONE line passes against an order that has two lines, and [1, 3] passes against [1, 2, 3]. If the number of items matters - and for order lines it does - assert the length separately or use deepStrictEqual for the array."),
        h3("Text: assert.match"),
        p("For messages, labels and generated text, an exact `strictEqual` breaks every time the wording changes. `assert.match(text, regex)` checks the part that matters and prints the whole input when it fails:"),
        code("javascript", `
assert.match(invoiceFooter, /total 72\\.00 USD/);`, "test/invoice.test.js"),
        code("bash", `
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /total 72\\.00 USD/. Input:

'Invoice INV-2026-0042 total 72.00 EUR'`),

        h2("5. Add the context the values cannot carry"),
        p("Expected and actual tell you **what**; they do not tell you **which case**. That part you add yourself."),
        h3("Custom messages: Node 24 keeps the comparison"),
        p("Every assertion takes an optional last argument, the message. On Node 24 a custom message does not replace the comparison - the comparison is appended after it:"),
        code("javascript", `
assert.equal(order.lines[1].qty, 3, "order A-1042, line TEE-02 qty");`, "test/export.test.js"),
        code("bash", `
AssertionError [ERR_ASSERTION]: order A-1042, line TEE-02 qty

2 !== 3`),
        p("`deepStrictEqual` does the same: your message, then the `+ actual - expected` diff. So a message should add only what the values lack - the case and the field - and never repeat the numbers by hand. The exception is `assert.ok(value, message)`: there is no comparison to append, so the message is the whole output. One more reason to avoid `assert.ok` for anything but real booleans."),
        h3("Table-driven tests: one case, one test, a name that says which"),
        p("JS-1 lesson 8 showed table-driven loops. The shipping-zone test broke two rules from that lesson: it looped **inside** one test, and the case never reached the output. Register one test per row and put the case in the name:"),
        code("javascript", `
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDeliverable } from "../src/shipping.js";
import { zones } from "./fixtures.js";

describe("isDeliverable", () => {
    for (const zone of zones) {
        it(\`delivers to \${zone.country} \${zone.postcode} (\${zone.carrier})\`, () => {
            assert.equal(isDeliverable(zone), true);
        });
    }
});`, "test/shipping.test.js"),
        code("bash", `
▶ isDeliverable
  ✔ delivers to DE 10115 (dhl) (2.8ms)
  ✖ delivers to CH 8001 (post) (0.7ms)
  ✔ delivers to FR 75008 (colissimo) (0.3ms)
  ...`),
        p("Now the report lists every failing zone by name, and the other 39 still run - one broken row no longer hides the rest. If a row must stay inside one test (a shared expensive setup, for example), pass the case as the message, for example `assert.equal(isDeliverable(zone), true, \"zone \" + zone.postcode)`; the output then starts with `zone 8001` and still ends with `false !== true`."),
        h3("Domain assertion helpers"),
        p("When the same check appears in twenty tests, wrap it in a helper that speaks the language of the domain. A helper can report what a generic assertion cannot - here, the difference in cents. Throw an `AssertionError` from `node:assert` so the runner treats it like any other failed assertion; with `operator: \"strictEqual\"` Node appends the comparison after your message:"),
        code("javascript", `
import { AssertionError } from "node:assert/strict";

export function assertCents(actual, expected, what) {
    if (actual === expected) return;
    throw new AssertionError({
        message: \`\${what}: expected \${expected} cents, got \${actual} cents (off by \${actual - expected})\`,
        actual,
        expected,
        operator: "strictEqual",
    });
}`, "test/helpers.js"),
        code("bash", `
✖ exports order A-1042 as paid (3.7ms)
  AssertionError [ERR_ASSERTION]: order A-1042 total: expected 7200 cents, got 7000 cents (off by -200)

  7000 !== 7200`),
        p("A good helper has three properties: it checks one domain idea completely, its message contains the path, expected and actual of **every** difference it found (not just the first), and it never passes silently on input it does not understand."),
        h3("Never catch and rethrow a vaguer error"),
        p("This pattern looks tidy and destroys everything above:"),
        code("javascript", `
try {
    assert.deepStrictEqual(order, expected);
} catch {
    throw new Error("export check failed");     // the diff is gone
}`, "test/export.test.js"),
        p("The runner prints `Error: export check failed`, and the stack points at the `throw`, not at the comparison. If you really need to add context on top of an assertion, keep the original as the `cause` (JS-1 lesson 7): `throw new Error(\"order A-1042 export check\", { cause: err })`. `node --test` then prints your message and, under `[cause]:`, the full original comparison. Usually, though, a custom message on the assertion itself is simpler."),

        p("Now build a domain assertion of your own. The challenge gives you the incident's compound check as a starting point; your version must name every difference with its path, the expected value and the actual value."),
        challenge("chal_coding_qaf_121", "Walk both values together and carry the path as you go: an object key adds .key (no dot at the top level), an array index adds [i]. Collect difference lines in an array instead of throwing at the first one, and throw once at the end. For objects, visit the keys of expected first, then the keys only actual has. Compare leaves with ===, never with == or String()."),

        h2("6. The fix"),
        p("The export test was rewritten around the four questions. The name carries the case, the basic facts come first, and the lines are compared as structures, so a wrong quantity shows up as a one-line diff:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportOrder } from "../src/export.js";
import { orderA1042 } from "./fixtures.js";

test("exports order A-1042 as paid with its two lines", () => {
    const order = exportOrder(orderA1042);

    assert.equal(order.status, "paid");
    assert.equal(order.lines.length, 2, "number of lines");
    assert.deepStrictEqual(order.lines, [
        { sku: "MUG-01", qty: 2, priceCents: 1800 },
        { sku: "TEE-02", qty: 3, priceCents: 1200 },
    ]);
    assert.equal(order.total, 7200, "total in cents");
});`, "test/export.test.js"),
        p("Against the broken export, this test fails at the `lines` comparison with a diff that shows `+ qty: 2` and `- qty: 3` inside the `TEE-02` line. The lines are checked **before** the total on purpose: a wrong total is a symptom, the wrong quantity is the cause, and the first failure should point at the cause."),
        callout("success", "After the fix",
            "Two weeks later the parser broke again in a different way: a quantity arrived as the string \"3\". The nightly job went red with a diff showing + qty: '3' and - qty: 3. The on-call engineer read the message, opened the parser, and had a fix in review within fifteen minutes - without running anything locally."),

        h2("7. Pitfalls"),
        bullets([
            "**Compound `assert.ok`**: `assert.ok(a === b && c === d)` reports only `false`. One assertion per fact, with both values.",
            "**Comparing booleans you computed**: `assert.equal(total === 7200, true)` prints `false !== true`. Pass the values themselves: `assert.equal(total, 7200)`.",
            "**Loops inside one test**: the first failing case ends the test and hides the others, and the case is not in the output. One test per row, with the case in its name.",
            "**Messages that repeat the values by hand**: `\"expected 7200\"` goes stale the day someone changes the literal. On Node 24 the comparison is appended anyway - write the case and the field, not the numbers.",
            "**partialDeepStrictEqual on arrays**: missing and extra items can pass. Assert the length or compare the array exactly.",
            "**A helper that stops at the first difference**: the reader fixes one field, re-runs, and finds the next. Collect every difference and report them together.",
            "**Catching and rethrowing**: `catch { throw new Error(\"check failed\") }` deletes the diff. Keep the original error as `cause`, or do not catch at all.",
            "**Loose comparison in a helper**: `==` or `String(a) === String(b)` makes `2` and `\"2\"` equal - and a type bug is exactly what an export test must catch.",
        ]),
        callout("tip", "Read your failure before you trust it",
            "When you write a new assertion, break the code once on purpose (JS-1 called this watching it fail) and read the message as if you were on call at 02:00 and had never seen the test. If you would need to open the test file or re-run anything to understand it, the message is not finished."),

        h2("8. Checklist"),
        bullets([
            "Every failure message answers: which case, where, expected, actual.",
            "No `&&` or `||` inside `assert.ok`; one assertion per fact, with the actual and expected values.",
            "Structures with `deepStrictEqual`, a subset of fields with `partialDeepStrictEqual` (plus a length check for arrays), text with `assert.match`.",
            "Custom messages add the case and the field; Node 24 appends the comparison for you.",
            "Table-driven tests register one test per row with the case in the name.",
            "Domain helpers report the path, expected and actual of every difference, compared strictly.",
            "Check causes before symptoms: lines before the total.",
            "Never replace an assertion error with a vaguer one; use `cause` if you must wrap it.",
        ]),
        p("Next, in **Arrange-act-assert & test data builders**, you will make the other half of these tests readable: the setup that builds order A-1042 in the first place."),
    ],
});
