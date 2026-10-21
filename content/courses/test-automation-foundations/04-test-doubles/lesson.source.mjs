// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-qaf-2-1",
    title: "Stubs, mocks & fakes: picking the right double",
    slug: { _type: "slug", current: "stubs-mocks-and-fakes-picking-the-right-double" },
    description:
        "One suite, two failures: 30 tests broke on a refactor that changed no behaviour, and the one stub that always succeeded hid a service that swallowed mailer errors. Learn the five test doubles (dummy, stub, spy, mock, fake), state versus interaction verification, dependency injection, node:test's t.mock.fn and t.mock.method in depth, why you should not mock what you do not own, and how to pick the right double for each job.",
    estimatedTime: 25,

    scenario: {
        role: "QA automation engineer, online shop accounts team",
        problem:
            "The password-reset service had 34 unit tests, all green. In March a developer tidied two internal calls without changing what customers see, and 30 of those tests went red; the fix-up took a day. In April the email provider had a three-hour outage: the service kept answering \"email sent\", about 1,200 customers never got their reset link, and support learned about it from the tickets. Not one test had ever made the mailer fail. Your job: understand why the suite was both too fragile and too trusting, and rebuild it with the right doubles.",
    },

    content: [
        h2("1. The incident: a suite that was fragile and blind at once"),
        p("A **test double** is anything that stands in for a real collaborator during a test: a fake database, a mailer that sends nothing, a payment client that always says yes. You met the simplest one, `t.mock.fn`, in JS-1 lesson 8. This lesson is about choosing the right kind - because the password-reset suite chose badly in two opposite directions."),
        p("This is the service that shipped. Its collaborators (the user store, the token store and the mailer) are passed in, which is good; what it does with a mailer failure is not:"),
        code("javascript", `
export function createPasswordReset({ users, tokens, mailer, log = console }) {
    return {
        async requestReset(email) {
            const user = await users.findByEmail(email);
            if (!user) return { status: "email sent" };      // never reveal whether an account exists

            const token = await tokens.create(user.id);
            try {
                await mailer.send(user.email, "password-reset", { token });
            } catch (error) {
                log.error("reset mail failed", error);          // logged... and forgotten
            }
            return { status: "email sent" };
        },
    };
}`, "src/password-reset.js"),
        p("And this is the shape of the tests - 30 of the 34 copied the same block of call assertions:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPasswordReset } from "../src/password-reset.js";

test("requestReset sends the reset email", async (t) => {
    const order = [];
    const users = { findByEmail: t.mock.fn(async (email) => { order.push("findByEmail"); return { id: 7, email }; }) };
    const tokens = { create: t.mock.fn(async () => { order.push("tokens.create"); return "tok-123"; }) };
    const mailer = { send: t.mock.fn(async () => { order.push("mailer.send"); }) };   // always succeeds
    const reset = createPasswordReset({ users, tokens, mailer });

    const result = await reset.requestReset("ana@shop.test");

    assert.deepStrictEqual(result, { status: "email sent" });
    assert.deepStrictEqual(order, ["findByEmail", "tokens.create", "mailer.send"]);
    assert.deepStrictEqual(tokens.create.mock.calls[0].arguments, [7]);
    assert.deepStrictEqual(mailer.send.mock.calls[0].arguments,
        ["ana@shop.test", "password-reset", { token: "tok-123" }]);
});`, "test/password-reset.test.js"),
        p("Two things are wrong with this test, and they pull in opposite directions:"),
        bullets([
            "**It checks how, not what.** The call order and the exact argument lists are internal decisions of the service. When the team passed the token lifetime explicitly (`tokens.create(user.id, { ttlMinutes: 30 })`, the same 30 minutes as the old default) and moved the mail adapter to a single options object, every customer got the same email as before - and 30 tests failed.",
            "**It never lets the mailer fail.** The mailer double resolves on every call, so the `catch` block that swallows the error never ran in any test. During the outage the service did exactly what that block says: log, forget, answer \"email sent\".",
        ]),
        callout("warning", "Fragile and blind are the same mistake",
            "Both failures come from treating doubles as a way to make the code run, instead of as a way to describe the behaviour you care about. Tests that pin down internals break when nothing is wrong; doubles that only ever succeed stay green when something is."),

        h2("2. Reproduce both failures"),
        p("First the fragility. Apply the harmless refactor - two changed lines, same email in the inbox - and run the old test:"),
        code("bash", `
$ node --test test/password-reset.test.js
✖ requestReset sends the reset email (8.3ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    [
      7,
  +   {
  +     ttlMinutes: 30
  +   }
    ]
ℹ tests 1
ℹ pass 0
ℹ fail 1`),
        p("The failure points at an argument list, not at anything a customer would notice. Multiply by 30 tests and you have a day of \"fixing\" tests that were not detecting a bug."),
        p("Now the blindness. Write the test nobody wrote: a mailer double that **fails**, and the expectation the business actually has - an outage must surface as an error, so the API can answer \"try again later\" instead of lying:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPasswordReset } from "../src/password-reset.js";

test("a mailer outage is reported, not hidden", async (t) => {
    const users = { findByEmail: async (email) => ({ id: 7, email }) };
    const tokens = { create: async () => "tok-123" };
    const mailer = { send: t.mock.fn(async () => { throw new Error("SMTP 421: service not available"); }) };
    const log = { error: t.mock.fn() };                    // keep the test output quiet
    const reset = createPasswordReset({ users, tokens, mailer, log });

    await assert.rejects(reset.requestReset("ana@shop.test"), /password-reset email/);
    assert.strictEqual(mailer.send.mock.callCount(), 1);
});`, "test/mailer-down.test.js"),
        code("bash", `
$ node --test test/mailer-down.test.js
✖ a mailer outage is reported, not hidden (4.3ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection.
ℹ tests 1
ℹ pass 0
ℹ fail 1`),
        p("\"Missing expected rejection\" is the April outage in one line: the mailer threw, and `requestReset` resolved anyway. One double that can fail found what 34 doubles that always succeed could not."),

        h2("3. Five kinds of test double"),
        p("Gerard Meszaros named the kinds of double in his book xUnit Test Patterns (2007), and the names are worth learning because they describe **what the double is for**. Libraries blur them (a `t.mock.fn` can act as a stub, a spy or a mock), but the job stays distinct:"),
        bullets([
            "**Dummy** - fills a parameter that the code path never uses. `createCart({ logger: {} })` in a coupon test that never logs. If the code does touch it, the test crashes, which tells you your assumption was wrong.",
            "**Stub** - returns canned answers so the code takes the path you want: `taxRate: async () => 19` for a German customer, `findByEmail: async () => null` for an unknown address. You check the result, never the stub.",
            "**Spy** - records every call (arguments, return value, thrown error) so the test can look at them afterwards. `t.mock.fn` is a spy; with an implementation it is a stub and a spy at once.",
            "**Mock** - in the strict sense, a double that is told **in advance** which calls it must receive and fails the test when they differ. With `node:test` you get the same effect by asserting on a spy's calls after the act.",
            "**Fake** - a small, real, working implementation: an in-memory user store backed by a `Map`, a mailer that appends to an `outbox` array, a clock you advance by hand. It behaves like the real thing for the cases you need, without the network.",
        ]),
        image("five-test-doubles", {
            alt: "Five boxes on a left-to-right arrow labelled with increasing behaviour. Dummy: fills a parameter, passed because the signature needs it and never used; example logger: {} on the coupon path; check nothing. Stub: canned answers so the code takes the path under test; example taxRate returning 19 for a German customer; check the result. Spy: records arguments, result and error of every call; example send = t.mock.fn() and send.mock.calls; check the calls. Mock: told up front which calls it must receive and fails when they differ; example expect one charge of (\"A-1\", 4999); check the interaction. Fake: a small working implementation such as a Map, an array or an outbox; example createFakeMailer() and mailer.outbox; check what it holds. Below, a green box: state verification is the default - assert on the result or on what a fake holds, such as a total of 5998 cents or one reset email in the outbox; it survives refactors. An amber box: interaction verification only when the call is the outcome - the card is charged exactly once, the email is actually sent.",
            caption: "Pick the simplest double that lets the test state the behaviour. Check results and fake state by default; check calls only when the call is the outcome.",
        }),

        h2("4. State or interaction: what does the test verify?"),
        p("Every test ends by verifying something, and there are only two options:"),
        bullets([
            "**State verification** - after the act, look at a result: the return value, the order in the in-memory store, the email in the fake outbox. The test does not care how the code got there.",
            "**Interaction verification** - after the act, look at the calls a spy received: which method, how often, with which arguments, in which order.",
        ]),
        p("State verification is the default because it survives refactoring: any implementation that produces the right result passes. The over-specified test in the incident verified interactions that were **means**, not **ends**: nobody outside the service cares whether the token was created with one argument or two."),
        p("But some interactions are the outcome. When the effect of the code is a message to the outside world, the call to that boundary is the only observable result:"),
        bullets([
            "**An email must be sent** - once, to the account owner, with the reset template. There is no return value that proves it; the send is the behaviour.",
            "**A card must be charged exactly once** - a double-click on \"Pay\" that charges twice is a real bug, and only the number of calls to the payments adapter shows it.",
            "**An event must be published** - `order.paid` must reach the warehouse queue, or the parcel never ships.",
        ]),
        p("Even then, verify the interaction at the **boundary** (the mailer, the payments adapter, the queue) and only the parts that matter. \"One email to ana@shop.test with the password-reset template\" is the requirement; the order of the internal lookups that led to it is not."),
        callout("tip", "A quick test for over-specification",
            "Ask: \"Could a customer, a downstream system or the business tell the difference if this assertion changed?\" If the answer is no - a call order between your own modules, how many times an internal cache was read - the assertion is pinning an implementation detail."),

        h2("5. Dependency injection and the node:test toolkit"),
        p("Doubles only work if the test can put them in. **Dependency injection** just means passing collaborators in instead of importing or constructing them inside: `createPasswordReset({ users, tokens, mailer })` lets a test pass whatever it wants. Compare a service that does `import { sendMail } from \"./smtp.js\"` at the top: to replace that, you need module mocking - `t.mock.module` exists in Node 24, but only behind the `--experimental-test-module-mocks` flag (verified on 24.14: without it, `t.mock.module` is not a function). Injection needs no flag and no magic."),
        h3("Everything a mock.fn records"),
        p("JS-1 lesson 8 used `callCount()` and `calls[i].arguments`. Each entry of `fn.mock.calls` holds more than that: `arguments`, `result`, `error`, `this` (plus `stack` and `target`). Two details matter for async code:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";

test("what a mock.fn records", async (t) => {
    const charge = t.mock.fn(async (orderId, amountCents) => ({ id: \`ch_\${orderId}\`, amountCents }));

    // Call 0: the provider times out. Call 1 (onCall = 1): the card is declined.
    charge.mock.mockImplementationOnce(async () => { throw new Error("timeout"); });
    charge.mock.mockImplementationOnce(async () => { throw new Error("card declined"); }, 1);

    await assert.rejects(charge("A-1", 4999), /timeout/);
    await assert.rejects(charge("A-1", 4999), /card declined/);
    assert.deepStrictEqual(await charge("A-1", 4999), { id: "ch_A-1", amountCents: 4999 });

    assert.strictEqual(charge.mock.callCount(), 3);
    const first = charge.mock.calls[0];
    assert.deepStrictEqual(first.arguments, ["A-1", 4999]);
    assert.ok(first.result instanceof Promise);   // an async function returns a promise...
    assert.strictEqual(first.error, undefined);   // ...so the call itself did not throw

    charge.mock.resetCalls();
    assert.strictEqual(charge.mock.callCount(), 0);
});

test("a synchronous throw is recorded in error", (t) => {
    const parse = t.mock.fn((text) => JSON.parse(text));
    assert.throws(() => parse("{oops"), SyntaxError);
    assert.strictEqual(parse.mock.calls[0].result, undefined);
    assert.ok(parse.mock.calls[0].error instanceof SyntaxError);
});`, "test/mock-fn.test.js"),
        bullets([
            "**`error` is only set for a synchronous throw.** An async implementation that rejects still *returns* a promise, so `result` is that (rejected) promise and `error` stays `undefined`. To check an async failure, `await assert.rejects(...)` on what the code under test returned.",
            "**`mockImplementationOnce(fn, onCall)` targets one call index**, which defaults to the current call count. Calling it twice before any call makes both target call 0, so the second replaces the first (verified on Node 24.14). Pass `onCall` explicitly - as above - to script a sequence such as \"timeout, then decline, then success\".",
            "**`mockImplementation(fn)`** swaps the implementation for all later calls; **`resetCalls()`** forgets the recorded calls but keeps the implementation.",
        ]),
        h3("mock.method: spy on or replace one method of a real object"),
        p("When the collaborator is an object you already have - a fake, or a real adapter - `t.mock.method(object, \"name\", impl?)` swaps one method and returns the new mock function. Without an implementation it wraps the original, so the real code still runs and you get a spy for free:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";

test("mock.method spies on or replaces a method", async (t) => {
    const mailer = { sent: 0, async send() { this.sent += 1; } };

    const send = t.mock.method(mailer, "send");      // no implementation: the original still runs
    await mailer.send({ to: "ana@shop.test" });
    assert.strictEqual(mailer.sent, 1);
    assert.strictEqual(send.mock.calls[0].this, mailer);

    send.mock.mockImplementation(async () => { throw new Error("SMTP 421"); });
    await assert.rejects(mailer.send({ to: "ana@shop.test" }), /SMTP 421/);

    send.mock.restore();                              // the real method is back
    assert.strictEqual(mailer.send.mock, undefined);
});`, "test/mock-method.test.js"),
        p("You rarely need `restore()` by hand: everything created through the test context's `t.mock` is restored automatically when that test ends, so a method replaced in one test is the original again in the next. Call `restore()` when you need the real behaviour back in the middle of a test."),
        p("A spy is a small piece of code - a function that remembers. Building one yourself is the fastest way to understand exactly what `t.mock.fn` records and why a double must never swallow the errors it is told to throw. The grader then uses your spy as the mailer double in a password-reset suite, so you see it catch the April bug."),
        challenge("chal_coding_qaf_212", "Keep one array of calls and one queue of once-implementations. In the spy, pick the implementation (queue first), call it with apply(this, args) inside try/catch, push a record in both branches, and throw the caught error again. A rejected promise is not a throw - it is just the result."),

        h2("6. Don't mock what you don't own - and don't over-specify what you do"),
        p("The payment provider's SDK, the email provider's client, the cloud storage library: you did not write them and you cannot change them. Doubling them directly (`t.mock.method(client.charges, \"create\", ...)`) has two problems. Your double encodes **your guess** of how the SDK behaves - its error shapes, its retries, its field names - and the guess is never checked. And every test of your business code becomes coupled to the SDK's shape, so an SDK upgrade breaks tests that have nothing to do with payments."),
        p("The usual answer is a thin **adapter** you own: one small module that translates between your words and the provider's. Business code depends on the adapter; tests replace the adapter with a fake; the adapter itself gets a handful of tests against the provider's sandbox, run less often."),
        code("javascript", `
// The only file that knows the email provider's SDK (its API shape is simplified here).
const TEMPLATE_IDS = { "password-reset": "tpl_reset_v3", "order-confirmation": "tpl_order_v2" };

export function createMailer(client, { from }) {
    return {
        async send({ to, template, data }) {
            const response = await client.messages.create({
                from, to: [to], templateId: TEMPLATE_IDS[template], variables: data,
            });
            if (response.status >= 400) {
                throw new Error(\`mail provider answered \${response.status}\`);
            }
        },
    };
}`, "src/mailer.js"),
        code("javascript", `
// Small working implementations of our own interfaces. One place to update when an interface changes.
export function createFakeMailer() {
    const outbox = [];
    return {
        outbox,
        async send(message) {
            outbox.push(structuredClone(message));
        },
    };
}

export function createInMemoryUsers(list) {
    const byEmail = new Map(list.map((user) => [user.email, user]));
    return {
        async findByEmail(email) {
            return byEmail.get(email) ?? null;
        },
    };
}

export function createFakeTokens() {
    const issued = new Map();
    return {
        async create(userId, { ttlMinutes }) {
            const token = \`tok-\${issued.size + 1}\`;
            issued.set(token, { userId, ttlMinutes });
            return token;
        },
        lookup(token) {                     // test-only helper: who owns this token?
            return issued.get(token);
        },
    };
}`, "test/fakes.js"),
        p("Notice the adapter's `send({ to, template, data })` is **our** interface. When the team changed it in the March refactor, the fake changed in one place, not in 30 tests."),
        h3("Picking the double: a decision table"),
        bullets([
            "The code needs a parameter it never uses on this path: a **dummy** (`{}` or `null`).",
            "The code needs an **answer** (a rate, a user, a price) and you check the result: a **stub**.",
            "The collaborator holds **state** the code reads and writes (users, orders, tokens, an outbox): a **fake** - and assert on its contents.",
            "The **call itself is the outcome** (send this email, charge this card once, publish this event): a **spy** on the boundary, asserting count and the arguments that matter.",
            "You need the collaborator to **fail** (timeout, decline, outage): a stub or spy whose implementation throws or rejects, or `t.mock.method` on a fake - at least one test per failure the business cares about.",
            "The collaborator is a **third-party SDK**: wrap it in an adapter you own and fake the adapter; test the adapter separately against the provider's sandbox.",
            "The collaborator is **pure and fast** (a price calculator, a validator): no double at all - use the real thing.",
        ]),
        p("And the over-specification check for every assertion on a double: does it describe something observable outside the unit? Call order between your own collaborators, the exact argument list of an internal lookup and how often a cache is read almost never are."),
        challenge("chal_quiz_qaf_211", "For each scenario, ask what the test must prove - an answer, a state, or that a call happened - and whether the double could ever fail. For the placeOrder test, ask which assertion a customer could never observe."),

        h2("7. The fix"),
        p("The service fix is small: stop swallowing the mailer error. Wrap it with a `cause` (JS-1 lesson 7) so the API layer can answer 503 \"we could not send the email, please try again\" and the log keeps the provider's message:"),
        code("javascript", `
export class MailDeliveryError extends Error {
    name = "MailDeliveryError";
}

export function createPasswordReset({ users, tokens, mailer }) {
    return {
        async requestReset(email) {
            const user = await users.findByEmail(email);
            if (!user) return { status: "email sent" };      // still: never reveal whether an account exists

            const token = await tokens.create(user.id, { ttlMinutes: 30 });
            try {
                await mailer.send({ to: user.email, template: "password-reset", data: { token } });
            } catch (error) {
                throw new MailDeliveryError("could not send the password-reset email", { cause: error });
            }
            return { status: "email sent" };
        },
    };
}`, "src/password-reset.js"),
        p("The tests were rebuilt around fakes and outcomes. The 30 copies of the call-order block became three tests that each state one rule:"),
        code("javascript", `
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createPasswordReset } from "../src/password-reset.js";
import { createFakeMailer, createInMemoryUsers, createFakeTokens } from "./fakes.js";

describe("requestReset", () => {
    let mailer, tokens, reset;

    beforeEach(() => {
        mailer = createFakeMailer();
        tokens = createFakeTokens();
        const users = createInMemoryUsers([{ id: 7, email: "ana@shop.test" }]);
        reset = createPasswordReset({ users, tokens, mailer });
    });

    it("emails one working reset link to the account owner", async () => {
        const result = await reset.requestReset("ana@shop.test");

        assert.deepStrictEqual(result, { status: "email sent" });
        assert.strictEqual(mailer.outbox.length, 1);
        const [mail] = mailer.outbox;
        assert.strictEqual(mail.to, "ana@shop.test");
        assert.strictEqual(mail.template, "password-reset");
        assert.deepStrictEqual(tokens.lookup(mail.data.token), { userId: 7, ttlMinutes: 30 });
    });

    it("gives the same answer for an unknown email and sends nothing", async () => {
        const result = await reset.requestReset("nobody@shop.test");

        assert.deepStrictEqual(result, { status: "email sent" });
        assert.strictEqual(mailer.outbox.length, 0);
    });

    it("reports a mailer outage instead of claiming success", async (t) => {
        t.mock.method(mailer, "send", async () => {
            throw new Error("SMTP 421: service not available");
        });

        await assert.rejects(reset.requestReset("ana@shop.test"), (error) => {
            assert.strictEqual(error.name, "MailDeliveryError");
            assert.match(error.cause.message, /SMTP 421/);
            return true;
        });
    });
});`, "test/password-reset.test.js"),
        code("bash", `
$ node --test
✔ a mailer outage is reported, not hidden (4.7ms)
▶ requestReset
  ✔ emails one working reset link to the account owner (5.6ms)
  ✔ gives the same answer for an unknown email and sends nothing (0.7ms)
  ✔ reports a mailer outage instead of claiming success (3.2ms)
✔ requestReset (12.1ms)
ℹ tests 4
ℹ pass 4
ℹ fail 0`),
        p("Run against the March version of the service - the refactored one that still swallows the error - the first two tests pass and the outage test fails: exactly the bug, and nothing else. The first test still verifies the email (the interaction that is the outcome), but through the fake's outbox and only the fields a customer sees: who gets it, which template, and a token that really belongs to user 7."),
        callout("success", "After the fix",
            "In May the provider failed again for 40 minutes. The API answered 503 with \"please try again\", the error rate alert fired within two minutes, and the on-call engineer saw MailDeliveryError with the cause \"SMTP 421\" in the log. A week later the team renamed tokens.create to tokens.issue: one line in fakes.js changed, and no test did."),

        h2("8. Pitfalls"),
        bullets([
            "**Doubles that can only succeed.** For every collaborator that can fail in production (network, provider, database), write at least one test where the double throws or rejects, and assert what the user sees.",
            "**Asserting the order of internal calls.** Unless the order is a requirement (\"charge before shipping\"), it is an implementation detail; check outcomes instead.",
            "**Copy-pasted call assertions.** Thirty tests that assert the same `mock.calls[0].arguments` turn one refactor into thirty failures. Put the rule in one test; the others check their own behaviour.",
            "**Doubling a third-party SDK directly.** Wrap it in an adapter you own, fake the adapter, and test the adapter against the provider's sandbox.",
            "**Checking `calls[i].error` for an async double.** A rejecting async implementation records a promise in `result` and leaves `error` empty; assert with `await assert.rejects` on what the code under test returned.",
            "**Two `mockImplementationOnce` calls without `onCall`.** In `node:test` the second replaces the first; pass the call index to script a sequence.",
            "**A fake that is smarter than the real thing.** A fake user store that ignores letter case when the real one does not will hide bugs. Keep fakes small, and test them against the same expectations as the real implementation (the integration lesson, \"Integration tests against an in-memory store\", does exactly this).",
            "**Doubling pure code.** A price calculator or a validator is fast and deterministic: use the real one. Every double is code that can drift from what it replaces.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Pass collaborators in (dependency injection); avoid module mocking unless you have no other way in.",
            "Name the job: dummy for an unused parameter, stub for an answer, fake for state, spy for a call that is the outcome.",
            "Verify state by default; verify interactions only at a boundary and only when the call is the outcome.",
            "Assert only what is observable outside the unit: recipient and template, not the order of internal lookups.",
            "Give every collaborator that can fail at least one test where its double fails.",
            "Use `t.mock.fn` records fully: `arguments`, `result`, `error`, `this`; remember async failures live in the returned promise.",
            "Script sequences with `mockImplementationOnce(fn, onCall)`; replace methods with `t.mock.method` and rely on automatic restore at the end of the test.",
            "Wrap third-party SDKs in an adapter you own; fake the adapter in unit tests and test the adapter against the sandbox.",
            "Keep fakes small and in one shared file, so an interface change touches one place.",
        ]),
    ],
});
