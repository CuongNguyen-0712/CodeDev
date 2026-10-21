// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-qaf-1-1",
    title: "What to test: the pyramid & the trophy",
    slug: { _type: "slug", current: "what-to-test-the-pyramid-and-the-trophy" },
    description:
        "180 browser tests covered the checkout, and a VAT rounding bug still reached production because every one of them bought a single item. Learn the four test levels (static, unit, integration, end-to-end) and what each can and cannot catch, the test pyramid and the testing trophy and when each shape fits, how to push every check down to the cheapest level that can catch the bug, how to map manual test cases to levels, and what not to automate at all.",
    estimatedTime: 20,

    scenario: {
        role: "QA engineer moving into test automation, online shop checkout team",
        problem:
            "The checkout was \"fully automated\": about 180 browser end-to-end tests that took 42 minutes, ran only at night and failed about 6% of runs for reasons nobody investigated anymore. Then finance found that invoices with three or more units of a product had a few cents of VAT wrong. Every one of the 180 tests bought exactly one item. Your job: reproduce the bug in milliseconds, decide which checks belong at which level, and propose a suite the team will actually read.",
    },

    content: [
        h2("1. The incident: 180 green tests and a wrong invoice"),
        p("The shop stores every price in integer cents, **net** (before VAT). The finance rule, agreed with the tax advisor, is short: VAT is 19% of each invoice line's net amount, **rounded once per line** to a whole cent. The checkout used this helper to build every order line:"),
        code("javascript", `
export const VAT_PERCENT = 19;

// One invoice line: unit price before VAT, quantity -> net, VAT and gross in cents.
export function lineTotals(unitNetCents, qty) {
    const unitVatCents = Math.round((unitNetCents * VAT_PERCENT) / 100);
    return {
        netCents: unitNetCents * qty,
        vatCents: unitVatCents * qty,
        grossCents: (unitNetCents + unitVatCents) * qty,
    };
}`, "src/vat.js"),
        p("It rounds the VAT of **one unit** and then multiplies, so the rounding error is multiplied too. Nobody wrote a unit test for it: \"the checkout is covered end-to-end\". And it was, by about 180 browser tests like this one:"),
        code("javascript", `
import { test, expect } from "@playwright/test";

test("guest buys a mug", async ({ page }) => {
    await page.goto("/products/mug-01");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.getByRole("link", { name: "Checkout" }).click();
    // ... 20 more lines: address form, shipping, test card ...
    await expect(page.getByText("Total: €23.79")).toBeVisible();
});`, "e2e/checkout.spec.js"),
        p("The suite took **42 minutes**, so it ran only at night. About **6%** of the nightly runs had at least one red test for reasons unrelated to the code: a slow test payment page, a timeout, a cookie banner. After a few weeks the team stopped reading the nightly report. And every one of the 180 tests clicked \"Add to cart\" exactly once."),
        p("Five weeks after the release, the monthly VAT report did not match the order ledger. Finance traced 3,800 order lines with a quantity of 3 or more where the VAT on the invoice was 1 to 4 cents off. Small amounts, but on an invoice they are a compliance problem, and every affected invoice had to be corrected."),
        callout("warning", "More tests at the wrong level is not more safety",
            "The bug lived in one line of arithmetic. To reach that line, each end-to-end test started a browser, a server and a database, filled in a form and waited for a payment page - and then checked one hard-coded total for quantity 1. 42 minutes of testing never once asked the question that mattered: what happens with quantity 3?"),

        h2("2. Reproduce it in milliseconds"),
        p("`lineTotals` is a **pure function**: numbers in, an object out, no database, no clock, no network. That makes it the cheapest thing in the whole shop to test. Work out the expected values by hand first. One mug: 1999 x 19% = 379.81, rounded to 380. Three mugs: the line net is 5997, and 5997 x 19% = 1139.43, rounded to **1139**. The code charges 3 x 380 = 1140."),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineTotals } from "../src/vat.js";

test("one mug at 1999 net", () => {
    assert.deepStrictEqual(lineTotals(1999, 1), { netCents: 1999, vatCents: 380, grossCents: 2379 });
});

test("three mugs: VAT is rounded once per line", () => {
    assert.deepStrictEqual(lineTotals(1999, 3), { netCents: 5997, vatCents: 1139, grossCents: 7136 });
});`, "test/vat.test.js"),
        code("bash", `
$ node --test
✔ one mug at 1999 net (5.156ms)
✖ three mugs: VAT is rounded once per line (3.4089ms)
ℹ tests 2
ℹ pass 1
ℹ fail 1

✖ three mugs: VAT is rounded once per line (3.4089ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    {
  +   grossCents: 7137,
  -   grossCents: 7136,
      netCents: 5997,
  +   vatCents: 1140
  -   vatCents: 1139
    }`),
        p("Two tests, about 9 milliseconds, and the failure message shows the exact cent that is wrong. The first test is the one the 180 browser tests were effectively running, and it passes. You met `node --test`, `deepStrictEqual` and boundary-value thinking in JS-1 lesson 8; here they pay off immediately."),
        callout("tip", "Choose inputs where the two rules disagree",
            "For a price of 1999, quantity 2 does not expose the bug either: 2 x 380 = 760 and round(3998 x 19%) = round(759.62) = 760. The two roundings only drift apart once the accumulated error passes half a cent. When you test a rounding rule, calculate a few quantities by hand and pick one where a wrong rule gives a different answer - quantity 1 never does."),

        h2("3. Four levels of tests"),
        p("Every automated check sits somewhere between \"reads the source code\" and \"drives the real product like a customer\". The further up you go, the more of the system a test exercises - and the more it costs. These are the four levels most teams use:"),
        h3("Static checks"),
        p("A linter (ESLint) or a type checker (TypeScript, or plain JavaScript with JSDoc types and `// @ts-check`) reads the code without running it. It runs on every save, in your editor, at almost no cost."),
        code("javascript", `
// @ts-check
/**
 * @param {number} unitNetCents
 * @param {number} qty
 */
export function lineTotals(unitNetCents, qty) { /* ... */ }

lineTotals("19.99", 3);
// tsc: error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.`, "src/checkout.js"),
        bullets([
            "**Catches**: typos, undefined variables, a string where a number is expected, a missing `await` (with the right lint rule), unreachable code.",
            "**Cannot catch**: any wrong business rule. `Math.round(unit) * qty` and `Math.round(unit * qty)` are both perfectly typed numbers.",
        ]),
        h3("Unit tests"),
        p("A unit test calls one function or one small module directly, with its collaborators replaced or absent. The VAT test above is a unit test. Each one runs in well under a millisecond to a few milliseconds, so a thousand of them finish in seconds."),
        bullets([
            "**Catches**: wrong rules and calculations, boundaries (4999 / 5000 / 5001), rounding, validation, error cases - anything you can express as \"this input gives that output\".",
            "**Cannot catch**: wiring. A unit test of `lineTotals` cannot tell you whether the checkout actually calls it, stores its result in the right column, or sends it to the payment provider.",
        ]),
        h3("Integration tests"),
        p("An integration test runs several real pieces together: the checkout service with its order repository, an HTTP handler with its validation and serialisation, a query with a database. Slow or external parts are replaced by a fast stand-in (an in-memory store, a fake mailer) or by a local test instance. Lesson 2-3, \"Integration tests against an in-memory store\", builds one of these step by step."),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCheckout } from "../src/checkout.js";
import { createInMemoryOrders } from "../src/orders.memory.js";

test("a placed order stores the totals the invoice will print", async () => {
    const orders = createInMemoryOrders();
    const checkout = createCheckout({ orders, prices: { "MUG-01": 1999 } });

    const orderId = await checkout.placeOrder({ items: [{ sku: "MUG-01", qty: 3 }] });

    const saved = await orders.findById(orderId);
    assert.strictEqual(saved.lines[0].vatCents, 1139);
    assert.strictEqual(saved.totalCents, 7136);
});`, "test/checkout.int.test.js"),
        bullets([
            "**Catches**: pieces that do not fit - a field renamed on one side only, a total computed but never saved, a query that filters or sorts wrongly, an API that returns 500 instead of 400 for an empty cart.",
            "**Cannot catch**: problems in parts it replaces (the real payment page, the browser, the network between services), and it pinpoints a broken rule less precisely than a unit test.",
            "**Cost**: tens of milliseconds to about a second each, more if a real database starts.",
        ]),
        h3("End-to-end tests"),
        p("An end-to-end (e2e) test drives the deployed product from the outside, usually through a real browser, as in the Playwright example in section 1. It is the only level that proves a customer can really get from the product page to the confirmation email."),
        bullets([
            "**Catches**: broken journeys - a button that never becomes clickable, a misconfigured environment, a page that does not load, two services that each pass their own tests but disagree.",
            "**Cannot catch cheaply**: the many combinations of inputs. Each extra quantity, coupon or country costs another multi-second browser run.",
            "**Cost**: seconds to minutes per test, a full environment to keep alive, and the most flakiness: every network hop, animation and third-party page is a new reason to fail for reasons unrelated to your change. When it fails, the message is \"Total: €71.36 not found\", not \"VAT rounded per unit\".",
        ]),
        callout("info", "Confidence versus cost",
            "Higher levels give more confidence per test, because they run more of the real system. Lower levels give more confidence per minute and per euro, because you can afford hundreds of precise checks. A healthy suite uses both: many cheap checks for the rules, a few expensive ones for the journeys."),

        h2("4. The pyramid and the trophy"),
        p("Two well-known pictures describe how many tests to put at each level. Read the width of each layer as \"how many tests live here\"."),
        bullets([
            "The **test pyramid** (Mike Cohn, in his 2009 book \"Succeeding with Agile\"): a wide base of unit tests, fewer service-level (integration) tests, and a small tip of UI (end-to-end) tests. The logic: the cheaper the test, the more of them you can afford.",
            "The **testing trophy** (Kent C. Dodds, 2018): static checks as the base, a modest layer of unit tests, the **largest** layer of integration tests and a small cap of end-to-end tests. The logic: tests that use the code the way it is really used give more confidence, and modern tools make many integration tests almost as fast as unit tests.",
        ]),
        image("pyramid-vs-trophy", {
            alt: "Two diagrams side by side. Left, the test pyramid by Mike Cohn: a wide green Unit layer at the bottom labelled business rules and pure functions, a narrower blue Integration layer labelled service plus database or API, and a small red End-to-end tip labelled a few journeys. Right, the testing trophy by Kent C. Dodds: a wide grey Static base labelled linter and type checker, a narrow green Unit stem labelled complex pure logic, a large blue Integration cup labelled several modules together with an in-memory store or test database, and a small red End-to-end cap. Between them an arrow points upwards: higher up means slower, costlier, flakier and more confidence per test; lower down means milliseconds, cheap, stable, and the failure names the bug. A note at the bottom says the incident suite was upside down: 180 end-to-end tests and 0 unit tests for a rounding rule.",
            caption: "Both shapes keep end-to-end tests few. They differ on where the bulk lives: unit tests (pyramid) or integration tests (trophy).",
        }),
        h3("Which shape fits your code?"),
        bullets([
            "**Pyramid-shaped code**: lots of business rules - prices, taxes, discounts, shipping tables, eligibility. Each rule has many input combinations, and unit tests can enumerate them cheaply. The shop's pricing and invoicing code is like this.",
            "**Trophy-shaped code**: mostly wiring with little logic of its own - a UI that renders data from an API, an endpoint that validates, saves and returns. The bugs live in how pieces fit together, so tests of a single function would mostly test mocks.",
            "Most real products are both: a pyramid for the pricing module, a trophy for the order-history page. Pick the shape per area, not per company.",
        ]),
        p("What both shapes reject is the opposite picture, often called the **ice-cream cone**: a big scoop of manual and end-to-end tests on top, almost nothing underneath. That is exactly the suite from the incident - slow, flaky, ignored, and blind to quantity 3."),

        h2("5. Push each check down to the lowest level that can catch it"),
        p("The single most useful rule in this lesson: **for every behaviour you want to protect, find the lowest - cheapest, fastest, most precise - level that can reliably catch a bug in it, and test it there.** Go higher only for what the lower levels cannot see."),
        p("As a QA engineer you already have the raw material: the manual test cases in your test plan. Each one can be mapped to a level by asking \"what is the smallest part of the system that decides this outcome?\""),
        bullets([
            "**TC-101** \"VAT for 3 units at 19.99 net is 11.39\" - one function decides it: **unit**.",
            "**TC-114** \"Coupon WELCOME10 is rejected one second after it expires\" - a rule plus a clock: **unit**, with a fake clock (lesson 2-2).",
            "**TC-120** \"Free shipping from exactly 100.00\" - a boundary in one function: **unit**, as a small table of cases.",
            "**TC-131** \"Placing an order saves it and reduces the stock\" - the checkout service and the store must agree: **integration**.",
            "**TC-140** \"POST /api/orders with an empty cart returns 400 with code CART_EMPTY\" - routing, validation and serialisation together: **integration**, calling the handler in-process.",
            "**TC-152** \"The confirmation email contains the order number\" - checkout plus mailer: **integration** with a fake mailer (lesson 2-1).",
            "**TC-160** \"A guest can search, add to cart, pay with the test card and see the confirmation\" - the whole product: **end-to-end**, one of a handful of critical journeys.",
        ]),
        p("Notice that the e2e journey in TC-160 does not need to check the VAT for quantity 3, the coupon expiry or the shipping boundary. Those are already pinned down far below. The journey only has to prove that the pieces are connected and that a customer can finish."),
        h3("Seams make the lower levels possible"),
        p("You can only push a check down if the code lets you reach it. Compare two ways to write the same checkout step:"),
        code("javascript", `
// Hard to test: the rule is buried in a handler that needs a database and a request.
app.post("/api/orders", async (req, res) => {
    const product = await db.query("SELECT price FROM products WHERE sku = $1", [req.body.sku]);
    const vat = Math.round((product.price * 19) / 100) * req.body.qty;
    // ... save, respond
});

// Easy to test: the rule is a pure function; the handler only wires things together.
import { lineTotals } from "./vat.js";

app.post("/api/orders", async (req, res) => {
    const product = await db.query("SELECT price FROM products WHERE sku = $1", [req.body.sku]);
    const totals = lineTotals(product.price, req.body.qty);
    // ... save, respond
});`, "src/server.js"),
        p("In the first version the only way to test the VAT rule is to start a server and a database - or a browser. In the second, the rule has a **seam**: a place where a test can call it directly. Keep calculations and decisions in pure functions (inputs in, result out); pass in anything that talks to the outside world - the database, the clock, the mailer - so a test can hand over a stand-in. When code is hard to test at a low level, that is usually a design signal, not a reason to test it higher up."),
        challenge("chal_quiz_qaf_111", "For each option ask two questions: can a test at this level even see the code that is wrong, and is there a cheaper level that can? Remember what a mock does: it returns whatever you tell it to."),

        h2("6. What not to automate"),
        p("Automation is a cost you pay on every run and every refactor. Some checks are not worth it:"),
        bullets([
            "**Exploratory testing and judgement calls**: \"is this error message understandable?\", \"does the new checkout feel slower?\". A human finds these; an assertion cannot.",
            "**Visual polish** asserted through functional tests: checking pixel positions with selectors is brittle. Leave it to people, or to a dedicated visual-comparison tool used on purpose.",
            "**One-off checks**: verifying a data migration ran once, or a temporary campaign page that is deleted next week.",
            "**Features still changing every day**: automate when the behaviour settles, or the tests are rewritten more often than they catch anything.",
            "**Other people's code**: do not test that the payment provider computes its fee correctly. Test your side of the contract - what you send and how you handle each answer.",
            "**The same rule at three levels**: if the unit tests pin down every VAT case, the e2e journey does not need its own VAT matrix.",
        ]),

        h2("7. The fix"),
        p("The code fix follows the finance rule literally: compute the line net first, round the VAT once."),
        code("javascript", `
export const VAT_PERCENT = 19;

// Finance rule: VAT is calculated on the line net and rounded once per line.
export function lineTotals(unitNetCents, qty) {
    const netCents = unitNetCents * qty;
    const vatCents = Math.round((netCents * VAT_PERCENT) / 100);
    return { netCents, vatCents, grossCents: netCents + vatCents };
}`, "src/vat.js"),
        code("bash", `
$ node --test
✔ one mug at 1999 net (4.4189ms)
✔ three mugs: VAT is rounded once per line (0.5394ms)
ℹ tests 2
ℹ pass 2`),
        p("The bigger fix was to the suite. The team mapped the 180 end-to-end tests the same way as the test cases in section 5:"),
        numbered([
            "Every test that only varied prices, quantities, coupons or shipping countries became one row in a unit-test table. About 140 browser tests turned into 60 unit tests that run in under a second.",
            "Tests about saving orders, stock and emails moved to integration tests with an in-memory store and a fake mailer.",
            "**12** end-to-end journeys stayed: guest checkout, logged-in checkout, a declined card, a refund, and a few more. They run in about 4 minutes on every pull request, not at night.",
            "Each flaky e2e failure now gets an owner instead of a shrug (Module 3 covers how to find the cause).",
        ]),
        callout("success", "After the fix",
            "Two months later a developer changed the VAT rate constant into a per-country table and accidentally rounded per unit again for one country. The unit test table failed on the pull request within a second, naming the country and the quantity. No invoice was ever wrong."),

        h2("8. Pitfalls"),
        bullets([
            "**\"It is covered end-to-end\"**: a journey test proves the journey works for the one input it uses. It says nothing about quantity 3, the next coupon or the other country.",
            "**Testing a rule only through the UI** because the code gives you no seam. Extract the rule into a pure function first; the test becomes three lines.",
            "**Unit tests that only test mocks**: if a function just passes data from A to B and every collaborator is replaced, the test checks your mock setup. Test that wiring with an integration test instead.",
            "**Tolerating flaky red**: a suite that is red 6% of the time for no reason teaches everyone to ignore red. Then a real failure looks exactly like noise.",
            "**Slow feedback**: tests that run only at night find bugs a day after the change, when the author has moved on. Keep the suite fast enough to run on every pull request.",
            "**Duplicating the same check at every level**: it multiplies maintenance without catching more bugs.",
            "**Treating the pyramid or trophy as a quota**: they are rules of thumb about cost and confidence, not a ratio to hit.",
        ]),

        h2("9. Checklist"),
        bullets([
            "For each behaviour, ask: what is the smallest part of the system that decides it? Test it there.",
            "Business rules, calculations and boundaries: unit tests, with inputs chosen so a wrong rule gives a different answer.",
            "Wiring, persistence, API contracts: integration tests with in-memory or local stand-ins.",
            "End-to-end: a handful of critical journeys, fast enough to run on every pull request.",
            "Let static checks (lint, types) catch typos and wrong types for free.",
            "Keep rules in pure functions and pass in the database, clock and mailer, so lower levels can reach them.",
            "When an e2e test finds a bug, reproduce it with a lower-level test before fixing it.",
            "Do not automate judgement calls, one-off checks or other people's code.",
            "Fix or remove a flaky test; never get used to it.",
        ]),
        p("Next lesson, \"Assertions that explain failures\", is about the other half of a useful test: when it does go red, the message should tell you what broke without opening the debugger."),
    ],
});
