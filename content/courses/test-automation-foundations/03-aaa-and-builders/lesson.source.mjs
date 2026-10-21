// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-qaf-1-3",
    title: "Arrange-act-assert & test data builders",
    slug: { _type: "slug", current: "arrange-act-assert-and-test-data-builders" },
    description:
        "Sixty-three order tests broke when one required field was added, and the shared fixture that replaced them made a test pass alone and fail with its neighbours. Learn the arrange-act-assert shape in depth, why irrelevant detail hides the detail that matters, Object Mother versus Test Data Builder, and how to write a builder that returns a fresh, valid object on every call: deep copies, merged nested overrides, replaced arrays and resettable ids.",
    estimatedTime: 20,

    scenario: {
        role: "QA automation engineer, online shop order team",
        problem:
            "Every order test builds its own 35-line order literal, copied from the test above it. When the backend made `currency` a required field, 63 tests broke at once and were patched with a mass find/replace. A colleague then replaced the literals with one shared `baseOrder` constant and object spread - and now the total test passes when run alone but fails when the whole file runs. Your job: understand why, and give the suite a test data builder that makes this class of bug impossible.",
    },

    content: [
        h2("1. The incident: 63 red tests, then one that lies"),
        p("The order module has around 70 unit tests. Each one starts the same way: an order literal, copied from the test above and edited. A typical arrange section looked like this - 35 lines, of which the test needed exactly one:"),
        code("javascript", `
test("orders outside the US pay the international flat rate", () => {
    const order = {
        id: "ORD-1042",
        status: "pending",
        createdAt: "2026-10-01T09:00:00Z",
        customer: {
            id: "CUS-7",
            name: "Lan Tran",
            email: "lan@example.com",
            phone: "+1 512 555 0100",
            address: {
                line1: "12 Elm St",
                line2: "",
                city: "Austin",
                postalCode: "73301",
                country: "VN",            // <- the only line this test is about
            },
        },
        lines: [
            { sku: "MUG-01", name: "Mug", qty: 2, priceCents: 1250 },
            { sku: "TEE-02", name: "T-shirt", qty: 1, priceCents: 1999 },
        ],
        coupon: null,
        giftMessage: "",
        // ... 12 more lines: payment, notes, flags
    };
    assert.equal(shippingCentsFor(order), 1599);
});`, "test/shipping.test.js (before)"),
        p("Then the backend made `currency` a required field, and the order validator started rejecting every order without it. 63 tests went red in one pull request. Nobody wanted to edit 63 literals by hand, so the fix was a find/replace of `status: \"pending\",` with `status: \"pending\", currency: \"USD\",` across the folder. It turned the suite green - and silently skipped the 9 tests whose orders were `\"paid\"`, which kept failing until someone fixed them one by one the next morning."),
        p("The team agreed the duplication had to go. The next pull request introduced one shared constant and object spread:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { orderTotalCents, addLine } from "../src/orders.js";

const baseOrder = {
    id: "ORD-1",
    currency: "USD",
    customer: { name: "Lan Tran", email: "lan@example.com", country: "VN" },
    lines: [{ sku: "MUG-01", qty: 2, priceCents: 1250 }],
    shippingCents: 499,
};

test("gift wrap adds a 300-cent line", () => {
    const order = { ...baseOrder, id: "ORD-2" };
    addLine(order, { sku: "GIFT-WRAP", qty: 1, priceCents: 300 });
    assert.equal(orderTotalCents(order), 3299);
});

test("total is lines plus shipping", () => {
    const order = { ...baseOrder };
    assert.equal(orderTotalCents(order), 2999);
});`, "test/orders.test.js"),
        p("`addLine` pushes into `order.lines` (the cart service works on its own copy, so mutating is fine in production). Both tests look independent. They are not."),

        h2("2. Reproduce it"),
        p("Run the whole file, then only the second test with `--test-name-pattern`:"),
        code("bash", `
$ node --test test/orders.test.js
✔ gift wrap adds a 300-cent line (2.5007ms)
✖ total is lines plus shipping (2.519ms)
ℹ tests 2
ℹ pass 1
ℹ fail 1

✖ total is lines plus shipping (2.519ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  3299 !== 2999

$ node --test --test-name-pattern="lines plus shipping" test/orders.test.js
✔ total is lines plus shipping (2.4118ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0`),
        p("A test that passes alone and fails in company is reading state that another test left behind. 3299 is 2999 plus the gift wrap: the second test saw the first test's line. Object spread copies only the **top level** of an object. The new object gets its own `id`, but its `lines` property points at the very same array as `baseOrder.lines`:"),
        code("javascript", `
const copy = { ...baseOrder, id: "ORD-2" };
copy === baseOrder;              // false - a new outer object
copy.lines === baseOrder.lines;  // true  - the same array, shared by every test in the file`),
        p("So the first test's `push` went into `baseOrder.lines` itself. Every test that runs after it in this file sees two lines. Reorder the tests, or run one with a name pattern, and the failure disappears - which is exactly what makes this kind of bug expensive to find. The lesson \"Flaky tests: order, time & shared state\" in module 3 hunts this family systematically; here we remove its most common cause in test data."),

        h2("3. Arrange-act-assert, properly"),
        p("You met the three-part shape in JS-1 lesson 8: arrange the inputs, act once, assert on the result. It sounds trivial; the incident above broke two of its three rules. Each part has a job:"),
        bullets([
            "**Arrange** shows the reader the facts this test depends on - and nothing else. Every value written in the arrange section is a claim: \"this matters\". A 35-line literal claims that 35 things matter when one does.",
            "**Act** is one call to the behaviour under test. One act per test means one reason to fail; when a test acts three times (add a coupon, remove it, add another) and goes red, you do not know which step broke.",
            "**Assert** checks the outcome a user or caller can observe: the returned value, the saved record, the message sent. Not which private helper ran, and not 15 unrelated fields of the result.",
        ]),
        p("Separate the three parts with a blank line. It costs nothing and makes a test readable at a glance:"),
        code("javascript", `
it("charges the 1599 international flat rate outside the US", () => {
    const order = anOrder({ customer: { country: "VN" } });     // arrange: the one fact that matters

    const shipping = shippingCentsFor(order);                    // act: one call

    assert.equal(shipping, 1599);                                // assert: the outcome
});`, "test/shipping.test.js (after)"),
        h3("Irrelevant detail hides the relevant detail"),
        p("Compare the two versions of the shipping test. In the first, the reason the expected value is 1599 is on line 17 of the arrange, between a phone number and a postal code. A reviewer cannot tell which of the 35 values the test depends on, and the next person who copies it will change the wrong one. In the second, the arrange **is** the test case: an order whose customer is in Vietnam. Everything else - a valid id, a currency, a line, an email - is still there, because the code under test may need a complete order; it is just not written in the test."),
        p("This is the same skill you use in manual test design. An equivalence class is defined by the one attribute that puts a case in it; a boundary value test names the boundary. Write those attributes in the arrange, and let something else supply a valid default for the rest."),
        callout("tip", "One test, one reason to fail",
            "If a test name contains \"and\" (\"applies the coupon and recalculates shipping and sends the email\"), it probably has several acts or several unrelated asserts. Split it. Several asserts about the same outcome (the status and the total of the one order you just paid) are fine."),

        h2("4. Object Mother vs Test Data Builder"),
        p("\"Something else supplies the defaults\" has two classic shapes."),
        h3("Object Mother: a function per named case"),
        code("javascript", `
export const pendingOrder = () => ({ /* 35 lines */ });
export const paidOrder = () => ({ ...pendingOrder(), status: "paid" });
export const internationalOrder = () => ({ /* 35 lines, country "VN" */ });
// next month: paidInternationalOrder, paidInternationalOrderWithCoupon, ...`, "test/mothers/orders.js"),
        p("Named cases read well in a test (`const order = paidOrder()`), and a new required field is added in one place instead of 63. The weakness is combinations: every new variation is a new function, the names grow longer, and a test that needs \"paid, international, with a coupon\" either adds a fourth function or edits the result after the fact. The file turns into a second copy of the domain model."),
        h3("Test Data Builder: defaults plus overrides"),
        p("A builder is one function that returns a **complete, valid** object with sensible defaults, and takes an `overrides` argument for the fields this test cares about. Here is one for the customers used in the signup tests:"),
        code("javascript", `
let nextCustomerId = 1;

export function resetCustomerIds() {
    nextCustomerId = 1;
}

export function aCustomer(overrides = {}) {
    const defaults = {                                    // a new literal on every call
        name: "Lan Tran",
        email: "lan@example.com",
        address: { line1: "12 Elm St", city: "Austin", country: "US" },
        marketingOptIn: false,
    };
    return {
        ...defaults,
        ...overrides,
        id: overrides.id ?? \`CUS-\${nextCustomerId++}\`,         // an explicit id does not use a number
        address: { ...defaults.address, ...overrides.address },   // nested: merge, not replace
    };
}`, "test/builders/customer.js"),
        p("Three properties make it safe to use from every test in the suite:"),
        numbered([
            "**A fresh object every call.** The defaults are a new literal each time, so no two builds share an array or nested object. If you prefer one `DEFAULTS` constant at the top of the file, copy it with `structuredClone(DEFAULTS)` (JS-1 showed that it deep-copies plain objects and arrays) - never spread it. Copy the caller's overrides too: if the builder keeps a reference to the array a test passed in, a later push in the test changes the test's own input.",
            "**Nested objects merge, arrays replace.** `aCustomer({ address: { country: \"VN\" } })` should mean \"the default customer, but in Vietnam\" - not a customer whose address has no street and no city. For arrays the useful rule is the opposite: `lines: [oneLine]` means exactly one line. Merging arrays by index produces orders nobody asked for. Decide the rule once, write it in the builder's doc comment, and test it.",
            "**Ids that are unique and predictable.** A counter gives every build a distinct id (two orders with the same id can hide a lookup bug), and a reset function makes them deterministic again. Each test file runs in its own process by default, so the counter starts at 1 per file - but not per test. Call the reset in `beforeEach`, and a failure message saying `ORD-3` means the same order on every run.",
        ]),
        p("The builder also keeps derived fields consistent: if an order stores `totalCents`, compute it from the final lines and shipping, so a test that overrides `lines` still gets a valid order. A test that needs an **invalid** order - a total that does not match, a missing email - builds a valid one and then breaks exactly one field, in plain sight in its arrange section."),
        p("Builders and mothers combine well: keep the builder as the single source of defaults, and write the few named cases the team uses every day on top of it, as one-liners that still accept overrides:"),
        code("javascript", `
export const aPaidOrder = (overrides = {}) => anOrder({ status: "paid", ...overrides });

// in a test
const order = aPaidOrder({ customer: { country: "VN" } });`, "test/builders/order.js"),
        callout("info", "Fluent builders",
            "Some teams write builders as classes with chained methods: anOrder().withLine(lamp).paid().build(). They read nicely and can hide complex setup (adding a line also updates the total). The override-object style used here does the same job with one function and no class; pick one style per suite and stay with it."),
        image("shared-fixture-vs-builder", {
            alt: "Two panels. Left, labelled shared fixture: one baseOrder object whose lines array holds MUG-01. Test A and test B both point at it through object spread. Test A pushes GIFT-WRAP into the shared lines array, shown with a red arrow, so test B reads a total of 3299 instead of 2999 and fails only when the whole file runs. Right, labelled test data builder: anOrder() produces a separate fresh copy for each test. Test A gets copy ORD-1 and adds GIFT-WRAP to its own lines only. Test B gets copy ORD-2 built with the override customer country VN highlighted, merged into the default customer so the name and email are kept, and its total is 2999. Both tests pass in any order.",
            caption: "Spread shares the nested lines array between tests. A builder hands each test its own deep copy and merges only the fields the test names.",
        }),
        p("The order suite's builder was written in a hurry by the same colleague who introduced `baseOrder`, and it inherited the same bug plus a few new ones. Fix it."),
        challenge("chal_fix_qaf_131", "Run through the doc comment rule by rule. Ask of every object and array in the result: could another build, DEFAULTS or the caller's overrides hold a reference to it? structuredClone answers that for whole objects. Then check the one nested object that must merge instead of replace, and look closely at the variable resetIds assigns to."),

        h2("5. The fix"),
        p("With the builder fixed, the order tests write only what they are about. Here is the incident file again. The arrange of each test now names the lines and shipping its expected total depends on, instead of inheriting them from a constant three screens up, and `beforeEach` restarts the ids:"),
        code("javascript", `
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { orderTotalCents, addLine } from "../src/orders.js";
import { anOrder, resetIds } from "./builders/order.js";

describe("orderTotalCents", () => {
    beforeEach(() => resetIds());

    it("adds a 300-cent gift wrap line to the total", () => {
        const order = anOrder({ lines: [{ sku: "MUG-01", qty: 2, priceCents: 1250 }], shippingCents: 499 });

        addLine(order, { sku: "GIFT-WRAP", qty: 1, priceCents: 300 });

        assert.equal(orderTotalCents(order), 3299);
    });

    it("is the lines plus shipping", () => {
        const order = anOrder({ lines: [{ sku: "MUG-01", qty: 2, priceCents: 1250 }], shippingCents: 499 });

        assert.equal(orderTotalCents(order), 2999);
    });
});`, "test/orders.test.js"),
        code("bash", `
$ node --test test/orders.test.js
▶ orderTotalCents
  ✔ adds a 300-cent gift wrap line to the total (5.1797ms)
  ✔ is the lines plus shipping (0.7144ms)
✔ orderTotalCents (9.1692ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0`),
        p("The expected values 3299 and 2999 are still literals worked out by hand, and the facts they follow from are visible in the same test. The builder supplies only what the test does not care about."),
        callout("success", "After the fix",
            "The 70 order tests were moved to anOrder() over two days; the average arrange section went from 35 lines to 1. Three weeks later the backend added a required channel field. The change to the test suite was one line in the builder's defaults, and no test went red."),

        h2("6. Pitfalls"),
        bullets([
            "**A module-level built object is the same bug again.** `const order = anOrder();` at the top of a file, shared by every test, is `baseOrder` with extra steps. Call the builder inside each test or in `beforeEach`.",
            "**Mystery guests.** A test that asserts `totalCents === 2999` without writing any lines in its arrange depends on the builder's defaults. When someone changes a default, unrelated tests fail. Any value your assertion depends on belongs in the test's overrides.",
            "**Asserting on the whole built object.** `deepStrictEqual(result, { ...35 fields })` couples the test to every default. Assert on the fields the behaviour changes, or use `assert.partialDeepStrictEqual` for a subset.",
            "**Builders that produce invalid objects.** If `anOrder()` fails validation, every test that uses it is testing the validator's error path by accident. Keep one test that checks `validateOrder(anOrder())` passes.",
            "**Builders full of logic.** Deriving a total is fine; re-implementing the discount engine in the builder means the test repeats the production code's assumptions. Keep builders boring: defaults, copies, merges, ids.",
            "**Random data without a seed.** Generated names and emails are useful for catching hard-coded assumptions, but a value that changes every run makes a failure impossible to reproduce. Use a fixed seed or a counter.",
        ]),

        h2("7. Checklist"),
        bullets([
            "Arrange, act, assert, separated by blank lines; one act per test.",
            "The arrange section names only the facts this test depends on; everything else comes from a builder.",
            "Assert on the observable outcome, with expected values written as literals.",
            "Builders return a complete, valid object and a fresh deep copy on every call - `structuredClone` or a new literal, never a spread of a shared constant.",
            "Nested objects in overrides merge with the defaults; arrays replace them; the overrides argument is never modified or kept.",
            "Ids come from a counter that `beforeEach` resets, so they are unique within a test and identical between runs.",
            "Invalid objects are built valid and then broken in one visible field.",
            "A test that fails only when the whole file runs is reading shared state: check every object that two tests can reach.",
        ]),
    ],
});
