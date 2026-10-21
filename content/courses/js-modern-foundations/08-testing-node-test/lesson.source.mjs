// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-jsf-4-2",
    title: "Testing with node:test & assert",
    slug: { _type: "slug", current: "testing-with-node-test-and-assert" },
    description:
        "A suite can be 100% green and still prove nothing. Learn Node's built-in test runner (node --test, test, describe, it), the difference between strictEqual and deepStrictEqual, assert.throws and assert.rejects, how to pick edge cases that catch real bugs, mocking functions and time with mock.fn and mock.timers, watch mode and coverage - and why a test that cannot fail is worse than no test.",
    estimatedTime: 25,

    scenario: {
        role: "Junior full-stack developer, online shop checkout team",
        problem:
            "The checkout's applyDiscount function shipped with a test suite that was \"100% passing\". In the same week two support tickets arrived: a campaign set to 0% (paused) still gave every customer 10% off, and customers whose cart was exactly $50.00 - the advertised minimum - got no discount at all. The only test for the function called it once and checked assert.ok(result). Your job: make the tests able to fail, fix the bugs, and leave a suite the next developer can trust.",
    },

    content: [
        h2("1. The incident: a green suite that proved nothing"),
        p("Prices in the shop are stored in cents (lesson 1 showed why floating-point dollars are a bad idea). The discount rule from the product spec is short:"),
        bullets([
            "Carts of **$50.00 (5000 cents) or more** get the campaign discount. Below that, the price is unchanged.",
            "The campaign percent is a whole number from 0 to 100. If no percent is given, the default is 10%.",
            "Anything else - a negative subtotal, 150%, 12.5% - is a programming error and throws a `RangeError`.",
        ]),
        p("This is the code that shipped, together with its only test:"),
        code("javascript", `
export const THRESHOLD_CENTS = 5000;

export function applyDiscount(subtotalCents, percent) {
    const pct = percent || 10;                       // "default to 10%"
    if (subtotalCents <= THRESHOLD_CENTS) return subtotalCents;
    return subtotalCents - Math.round((subtotalCents * pct) / 100);
}`, "src/discount.js"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDiscount } from "../src/discount.js";

test("applyDiscount works", () => {
    const result = applyDiscount(8000, 10);
    assert.ok(result);
});`, "test/discount.test.js"),
        p("`node --test` printed a green check mark, the pull request showed \"all tests passing\", and the reviewer approved. But look at what `assert.ok(result)` actually checks: only that `result` is **truthy**. It would pass for 7200 (correct), 8000 (no discount), 800 (the discount instead of the price) and even the string `\"oops\"`. The test can only fail if the function throws or returns 0, `NaN`, `null` or `undefined` - and ironically, a correct 100% discount returns 0, so the one input where it *would* fail is a correct one."),
        callout("warning", "Two bugs, zero red tests",
            "percent || 10 treats an explicit 0 as \"missing\" (0 is falsy), so a paused 0% campaign became 10%. And subtotalCents <= 5000 returns early for a cart of exactly 5000, so the advertised minimum did not qualify. Neither bug is exotic; the test was simply unable to see them."),

        h2("2. Reproduce it with tests that can fail"),
        p("Before touching the code, write the tests that describe each support ticket. A bug you can reproduce with a failing test is a bug you can fix with confidence - and the test stays behind to stop it from coming back."),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDiscount } from "../src/discount.js";

test("a 0% campaign keeps the full price", () => {
    assert.strictEqual(applyDiscount(8000, 0), 8000);
});

test("a cart of exactly 5000 cents gets the discount", () => {
    assert.strictEqual(applyDiscount(5000, 10), 4500);
});`, "test/discount.test.js"),
        code("bash", `
$ node --test
✖ a 0% campaign keeps the full price (1.6ms)
✖ a cart of exactly 5000 cents gets the discount (0.4ms)
ℹ tests 2
ℹ pass 0
ℹ fail 2

✖ a 0% campaign keeps the full price
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  7200 !== 8000`),
        p("Red is good news here: both tickets are now reproducible in a fraction of a second, on any machine, without clicking through a checkout. The failure message even tells you the actual value (7200) and the expected one (8000)."),

        h2("3. node:test in five minutes"),
        p("Node has shipped a built-in test runner since Node 18, and on Node 24 it is a complete, stable tool: no install, no config file. You need two imports:"),
        bullets([
            "`node:test` - the runner: `test`, `describe`, `it`, hooks such as `beforeEach`, and `mock`.",
            "`node:assert/strict` - the assertions. Always import the **strict** variant: in it, `assert.equal` behaves like `strictEqual` and `assert.deepEqual` like `deepStrictEqual`, so there is no accidental `==` comparison.",
        ]),
        h3("Running tests"),
        p("`node --test` with no arguments searches the project (skipping `node_modules`) for files whose names look like tests - for example `*.test.js`, `*-test.mjs`, `*_test.cjs`, `test-*.js`, and any file inside a `test/` folder - and runs each file in its own process. You can also pass files or glob patterns: `node --test \"src/**/*.test.js\"`. Add it to `package.json` so everyone runs it the same way:"),
        code("json", `
{
  "type": "module",
  "scripts": {
    "test": "node --test",
    "test:watch": "node --test --watch"
  }
}`, "package.json"),
        h3("test, describe and it"),
        p("`test(name, fn)` registers one test. `describe(name, fn)` groups related tests, and `it` is simply an alias of `test` that reads well inside a `describe`. A test passes if its function returns (or its returned promise resolves) without throwing; any thrown error - usually a failed assertion - makes it fail."),
        code("javascript", `
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createCart } from "../src/cart.js";

describe("cart", () => {
    let cart;

    beforeEach(() => {
        cart = createCart();             // a fresh cart for every test: no shared state
    });

    it("starts empty with a total of 0", () => {
        assert.strictEqual(cart.items.length, 0);
        assert.strictEqual(cart.totalCents(), 0);
    });

    it("adds the quantity of an item that is already in the cart", () => {
        cart.add({ sku: "MUG-01", priceCents: 1250 }, 1);   // arrange
        cart.add({ sku: "MUG-01", priceCents: 1250 }, 2);   // act
        assert.strictEqual(cart.items[0].qty, 3);           // assert
        assert.strictEqual(cart.totalCents(), 3750);
    });
});`, "test/cart.test.js"),
        p("Most good tests have the same three-part shape: **arrange** the inputs, **act** by calling the code once, **assert** on the result. When a test needs a long arrange section or acts several times, it usually tests too many things at once."),
        h3("Names are documentation"),
        p("When a test fails in CI, its name is the first - often the only - thing a teammate reads. Name the behaviour and the condition, not the function:"),
        bullets([
            "Weak: `\"applyDiscount works\"`, `\"test 3\"`, `\"edge case\"`.",
            "Strong: `\"a cart of exactly 5000 cents gets the discount\"`, `\"rejects a percent above 100 with a RangeError\"`.",
        ]),
        p("A good name also tells you whether the test or the code is wrong when they disagree: the name is the requirement."),

        h2("4. Choosing the right assertion"),
        p("Almost every assertion you write is one of these:"),
        bullets([
            "`assert.strictEqual(actual, expected)` - same value by `Object.is`: numbers, strings, booleans, `null`, `undefined`. Use it for every primitive result.",
            "`assert.deepStrictEqual(actual, expected)` - same **structure**: arrays and objects with the same own keys and values (compared strictly, so `2` and `\"2\"` differ), the same prototype; `Date`s, `Map`s and `Set`s by content.",
            "`assert.throws(fn, expected)` - `fn` must throw. `expected` can be a class (`RangeError`), a regular expression for the message, or an object such as `{ name: \"RangeError\", message: /percent/ }`.",
            "`await assert.rejects(promiseOrAsyncFn, expected)` - the async version of `throws`. It returns a promise, so you must `await` it.",
            "`assert.ok(value)` - only \"is it truthy?\". Rarely the right choice for a result; fine for a real boolean such as `assert.ok(isValid(order))`.",
        ]),
        challenge("chal_quiz_jsf_421"),
        p("A rule of thumb that covers most cases: **primitives with `strictEqual`, objects and arrays with `deepStrictEqual`, errors with `throws`/`rejects`, and every expected value written out literally in the test.** If you compute the expected value with the same formula the code uses (`expected = subtotal - subtotal * pct / 100`), the test repeats the bug instead of catching it."),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPrice } from "../src/prices.js";
import { applyDiscount } from "../src/discount.js";

test("rejects an unknown SKU with a helpful message", async () => {
    const fetchPrice = async () => null;               // the price service knows nothing
    await assert.rejects(loadPrice(fetchPrice, "A1"), /no price for A1/);
});

test("validates the percent", () => {
    assert.throws(() => applyDiscount(8000, 150), {
        name: "RangeError",
        message: /percent must be a whole number from 0 to 100/,
    });
});`, "test/errors.test.js"),

        h2("5. Edge cases: where the bugs live"),
        p("Bugs cluster at the edges of the input space, because that is where `<` and `<=`, `||` and `??`, and \"empty\" and \"zero\" behave differently. For every function, walk through this list and write down what *should* happen:"),
        bullets([
            "**Empty**: an empty array, an empty string, an empty cart, a missing optional argument.",
            "**Zero**: 0 items, 0 cents, 0% - especially wherever the code uses `||`, `if (value)` or `!value`, because 0 is falsy.",
            "**Boundaries**: the exact threshold value and the values on both sides of it (4999, 5000, 5001).",
            "**Both ends of every range**: the smallest and largest valid values (0 and 100), and the first invalid value on each side (-1 and 101).",
            "**Wrong kinds of input** the function promises to reject: a negative number, a fraction, a string.",
        ]),
        p("When several cases share the same shape, a small table keeps them readable. `node:test` has no special API for this - a plain loop is enough, as long as each case gets its own name:"),
        code("javascript", `
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shippingCents } from "../src/shipping.js";

// Free shipping from 10000 cents; otherwise a flat 499.
const cases = [
    { subtotal: 0,     expected: 499, why: "an empty cart still pays shipping" },
    { subtotal: 9999,  expected: 499, why: "one cent below the free-shipping line" },
    { subtotal: 10000, expected: 0,   why: "exactly at the free-shipping line" },
    { subtotal: 10001, expected: 0,   why: "just above the line" },
];

describe("shippingCents", () => {
    for (const { subtotal, expected, why } of cases) {
        it(\`returns \${expected} for \${subtotal} (\${why})\`, () => {
            assert.strictEqual(shippingCents(subtotal), expected);
        });
    }
});`, "test/shipping.test.js"),
        p("Now it is your turn. Instead of fixing code, you will write the tests - and a grader will check whether they are any good by running them against the correct `applyDiscount` and against several buggy versions of it. This technique is called **mutation testing**: a suite is only as good as the bugs it can catch."),
        challenge("chal_coding_jsf_422", "Start from the spec, not the code: write one exact strictEqual per rule (happy path, 4999 vs 5000, 0%, 100%, the default), then one assert.throws for the first invalid value on each side of every range. Your suite must stay green against the correct function - double-check every expected value by hand."),

        h2("6. The fix"),
        p("With failing tests in place, the code fix is small: use a default parameter (which only replaces `undefined`, never 0), compare with `<` against the threshold, and validate the inputs the spec says to reject."),
        code("javascript", `
export const THRESHOLD_CENTS = 5000;

export function applyDiscount(subtotalCents, percent = 10) {
    if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
        throw new RangeError(\`subtotalCents must be a whole number >= 0, got \${subtotalCents}\`);
    }
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
        throw new RangeError(\`percent must be a whole number from 0 to 100, got \${percent}\`);
    }
    if (subtotalCents < THRESHOLD_CENTS) return subtotalCents;   // 5000 itself qualifies
    return subtotalCents - Math.round((subtotalCents * percent) / 100);
}`, "src/discount.js"),
        p("The diagram shows why the new tests work where the old one did not. Each column is a realistic bug; each row is a test. The old `assert.ok` row catches nothing. Each new test is aimed at one edge, and together they cover every column:"),
        image("which-test-catches-which-bug", {
            alt: "A table with four bug columns - returns the discount instead of the price, threshold uses greater-than, 0% falls back to the default 10%, accepts 150% - and five test rows. The assert.ok row is marked missed in every column. The strictEqual 8000 at 10% row catches only the first bug. The exactly-5000 row catches the first and second. The 0% row catches the first and third. The assert.throws for 150% row catches the fourth.",
            caption: "No single test catches everything, and assert.ok catches nothing. Exact values at the edges, together, catch every bug.",
        }),
        callout("success", "After the fix",
            "The two reproduction tests went red, then green after the fix. The suite now has a dozen small tests that each name one rule of the spec. A month later someone \"simplified\" percent = 10 back to percent || 10 in a refactor; the 0% test failed in CI within a minute, before the change reached review."),

        h2("7. Mocking functions and time"),
        p("Some code depends on things a test should not use for real: a payment API, an email sender, the current time. `node:test` ships a `mock` helper for both. Inside a test, use the test context's `t.mock` - everything it creates is restored automatically when the test ends."),
        h3("mock.fn: a function that records its calls"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPrice } from "../src/prices.js";

test("asks the price service once per SKU", async (t) => {
    const fetchPrice = t.mock.fn(async (sku) => 1999);   // fake implementation

    assert.strictEqual(await loadPrice(fetchPrice, "B2"), 1999);
    assert.strictEqual(fetchPrice.mock.callCount(), 1);
    assert.deepStrictEqual(fetchPrice.mock.calls[0].arguments, ["B2"]);
});`, "test/prices.test.js"),
        p("Pass the dependency in as an argument (as `loadPrice(fetchPrice, sku)` does) and mocking becomes trivial: no module patching, no global state."),
        h3("mock.timers: control setTimeout and Date"),
        p("A test that waits 30 real minutes for an abandoned-cart reminder will never be written; a test that waits a \"short\" real 100 ms becomes slow and flaky. Fake timers let the test move time forward instantly and exactly:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleReminder } from "../src/reminders.js";
import { isCouponActive } from "../src/coupons.js";

test("sends the cart reminder after exactly 30 minutes", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const send = t.mock.fn();

    scheduleReminder(send, { delayMs: 30 * 60_000 });

    t.mock.timers.tick(30 * 60_000 - 1);          // one millisecond early: a boundary!
    assert.strictEqual(send.mock.callCount(), 0);

    t.mock.timers.tick(1);
    assert.strictEqual(send.mock.callCount(), 1);
});

test("a coupon is valid until its expiry instant", (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-21T09:00:00Z") });
    assert.strictEqual(isCouponActive({ expiresAt: "2026-10-21T09:00:01Z" }), true);

    t.mock.timers.tick(1000);                      // Date.now() moves too
    assert.strictEqual(isCouponActive({ expiresAt: "2026-10-21T09:00:01Z" }), false);
});`, "test/time.test.js"),
        callout("info", "Fake time and promises",
            "mock.timers fakes the timer functions and Date you list in apis; it does not touch promises. If the code awaits something before it schedules a timer, let that promise settle before you tick. The JavaScript: Asynchronous Architecture course covers this in depth."),

        h2("8. Watch mode and coverage"),
        bullets([
            "`node --test --watch` re-runs the affected test files whenever you save a file. Keep it open in a terminal while you work; the feedback loop drops to about a second.",
            "`node --test --experimental-test-coverage` prints a table of line, branch and function coverage per file, with the uncovered line numbers. The flag is still marked experimental on Node 24, but it is widely used.",
            "`--test-coverage-lines=80` (and `--test-coverage-branches`, `--test-coverage-functions`) makes the run fail when coverage drops below the threshold - useful in CI.",
        ]),
        code("bash", `
$ node --test --experimental-test-coverage
# example output: the numbers depend on your code and tests
...
ℹ file            | line % | branch % | funcs % | uncovered lines
ℹ src/discount.js |  76.92 |    66.67 |  100.00 | 5-6 9-10`),
        callout("warning", "Coverage measures what ran, not what was checked",
            "Coverage tells you which lines executed during the tests. It cannot tell whether any assertion looked at the result: a suite of assert.ok(result) calls can show high coverage and catch nothing. Use the uncovered lines column to find code no test reached at all, then write exact assertions for it."),

        h2("9. Pitfalls: tests that cannot fail"),
        p("A test that cannot fail is worse than no test: it costs time to run and maintain, and it gives everyone false confidence. Watch for these:"),
        bullets([
            "**Truthiness instead of values**: `assert.ok(result)` or `assert.ok(list.length)`. Compare with an exact expected value.",
            "**A forgotten `await`**: `assert.rejects(...)` without `await` returns a promise nobody waits for. The test is reported as passed; the runner only prints a warning that the test \"generated asynchronous activity after the test ended\".",
            "**Swallowing the failure**: wrapping the act in `try { ... } catch {}`, or asserting inside a callback that is never called. If the test should throw, use `assert.throws`; if a callback must run, check a `mock.fn`'s `callCount()`.",
            "**The expected value is computed by the same logic** as the code under test. Write literal numbers you worked out by hand.",
            "**Shared state between tests**: a module-level cart that one test fills and the next one reads. Create fresh data in each test or in `beforeEach`; tests must pass in any order and on their own.",
            "**Real time and real networks**: `await sleep(100)` and live HTTP calls make tests slow and flaky. Inject dependencies and use `mock.fn` / `mock.timers`.",
        ]),
        callout("tip", "Watch it fail once",
            "Before you trust a new test, make it fail on purpose: break the line it protects (change < to <=) and check that the test goes red with a clear message. Then undo the change. A test you have never seen fail is a test you do not know works."),

        h2("10. Checklist"),
        bullets([
            "Import `node:assert/strict`, run tests with `node --test`, and keep `node --test --watch` open while coding.",
            "Name each test after the behaviour and condition it checks.",
            "Arrange, act once, assert - one rule per test.",
            "Primitives with `strictEqual`, objects and arrays with `deepStrictEqual`, errors with `throws` and `await assert.rejects`.",
            "Write expected values as literals worked out by hand, never with the code's own formula.",
            "Cover empty, zero, the exact boundary and both sides of it, and the first invalid value on each end of every range.",
            "Reproduce every bug with a failing test before fixing it.",
            "Mock dependencies and time with `t.mock.fn` and `t.mock.timers`; no real sleeps, no real network.",
            "Use coverage to find untested code, not as proof that the code is tested well.",
            "Watch every new test fail once.",
        ]),

        h2("Course wrap-up"),
        p("You started this course with a cart total of 0.30000000000000004 and finished it with a test suite that can tell a correct discount from a broken one. Along the way you used strict equality and safe number handling, immutable updates with `structuredClone`, closures, ES modules on Node 24, iterator helpers and the new `Set` methods, `Intl` dates and time zones, errors with `cause` - and now `node:test`. Every lesson followed the same habit worth keeping: reproduce the bug, understand the rule, fix it, and leave a check behind."),
        p("Where to go next:"),
        bullets([
            "**Test Automation Foundations** - take the habits from this lesson further: the test pyramid, assertions and test doubles, async tests with fake timers, hunting flaky tests and measuring what a suite really covers.",
            "**Frontend Engineering with TypeScript & React** - add types to the JavaScript you now know and build React apps that stay fast and correct as they grow: typed state, reducers, effects without races, and testing the logic behind the UI.",
            "**JavaScript: Asynchronous Architecture & Production Patterns** - the event loop, promises, cancellation, retries and deterministic async tests, for code that waits on the network and the clock.",
        ]),
    ],
});
