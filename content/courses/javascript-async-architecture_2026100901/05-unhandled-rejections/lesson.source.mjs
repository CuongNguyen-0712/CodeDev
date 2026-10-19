// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-2-2",
    title: "Eliminating unhandled rejections & leaks",
    slug: { _type: "slug", current: "eliminating-unhandled-rejections-and-leaks" },
    description:
        "Fire-and-forget calls, forEach(async ...), async event listeners and handlers attached too late all create promises that reject with nobody listening. Learn when the runtime reports a rejection as unhandled, how to make every background promise handled on purpose, clean up with finally, install a global safety net, and let the linter catch floating promises before production does.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, checkout team of an online shop",
        problem:
            "The error-tracking bill doubled, and the monthly event quota ran out on the 9th. 1.8 million events a day read \"Unhandled promise rejection: TypeError: Failed to fetch\", almost all from an analytics call that ad blockers block. Because of the quota, real errors are now sampled away - and nobody noticed that for a week some orders were confirmed although a stock reservation had failed, and that a failed order leaves the spinner running forever.",
    },

    content: [
        h2("1. The incident"),
        p("The checkout handler looks tidy. Every call that matters is awaited, and the ones that do not matter are simply started:"),
        code("javascript", `
submitButton.addEventListener("click", async () => {
    spinner.show();
    analytics.track("checkout_submitted");               // started, never awaited

    const order = await api.createOrder(cart);
    cart.items.forEach(async (item) => {                 // looks like a loop, is not awaited
        await api.reserveStock(order.id, item.sku);
    });

    spinner.hide();
    router.push(\`/orders/\${order.id}/thanks\`);
});`, "checkout.js"),
        p("Three different problems hide in twelve lines, and they all come from the same root: **a promise that nobody observes**. Every async call returns a promise; if no code ever attaches a handler to it, its rejection has nowhere to go."),
        bullets([
            "**Noise**: every blocked `analytics.track()` rejects with no handler. Multiply by 600,000 checkouts a day and three tracking calls per checkout.",
            "**Silent data bugs**: `forEach` does not wait for async callbacks. The thank-you page appears before any reservation finished, and a failed reservation is just another unhandled rejection in the noise.",
            "**Stuck UI**: if `createOrder` throws, `spinner.hide()` never runs - and because the listener is async, the error does not even reach a try/catch around `addEventListener`.",
        ]),
        challenge("chal_quiz_js_221"),

        h2("2. What \"unhandled\" actually means"),
        p("A promise is **handled** once a rejection handler is attached to it - with `.then(f, onRejected)`, `.catch()`, `.finally()` (which passes the rejection on to the promise it returns), `await`, or by handing it to a combinator such as `Promise.all`, which attaches its own handlers. The runtime does not decide immediately whether a rejection is unhandled. It waits until the current task and its microtasks are finished, then looks at every promise that rejected in the meantime:"),
        image("promise-rejection-lifecycle", {
            alt: "A promise rejects. If a handler is attached before the current task and its microtasks finish, the rejection is handled. If not, it is unhandled: browsers fire an unhandledrejection event on window or the worker global and log Uncaught (in promise); Node.js since version 15 terminates the process by default. If a handler is attached later, browsers fire rejectionhandled and Node emits rejectionHandled.",
            caption: "The runtime gives you until the end of the current task to attach a handler. After that, the rejection is reported - even if you handle it a second later.",
        }),
        bullets([
            "**Browsers** fire `unhandledrejection` on `window` (or the worker's global scope) and log \"Uncaught (in promise)\" to the console. Error-tracking SDKs listen to this event, which is why every floating promise ends up on your bill.",
            "**Node.js** (15 and later) treats an unhandled rejection like an uncaught exception and terminates the process. The server-side consequences are covered in the Node.js High Performance course (\"The event loop under server load\"); in this course we stay in the browser, where nothing crashes - things just silently go wrong.",
            "**Handled late** still counts: if you attach the handler after the task ended, the rejection was already reported, and you additionally get a `rejectionhandled` event.",
        ]),
        callout("info", "Rejections are values, not exceptions",
            "A synchronous throw unwinds the call stack until something catches it. A rejection is stored in the promise and travels only along handlers attached to that promise. If you drop the promise, you drop the error - there is no stack to unwind into."),

        h2("3. Four ways a promise floats"),
        h3("Fire-and-forget calls"),
        p("Telemetry, prefetching, \"mark as read\", cache warm-ups: calls whose result you genuinely do not need. Not awaiting them is fine. Not **handling** them is the bug. Attach the handler in the same expression that creates the promise:"),
        code("javascript", `
analytics.track("checkout_submitted").catch(() => {});          // best-effort: ignore
api.markAsRead(threadId).catch((error) => reportNonFatal("mark-as-read", error));`),
        h3("forEach, map and friends"),
        p("`forEach` calls your callback and ignores its return value, so an async callback produces a floating promise per element. `map` returns the promises, but only helps if you do something with them:"),
        code("javascript", `
// Floating: nobody waits, nobody handles.
items.forEach(async (item) => { await api.reserveStock(orderId, item.sku); });

// Joined: waits for all, and the first rejection reaches the caller.
await Promise.all(items.map((item) => api.reserveStock(orderId, item.sku)));

// Sequential on purpose (order matters, or the API cannot take parallel calls):
for (const item of items) await api.reserveStock(orderId, item.sku);`),
        h3("Async callbacks passed to APIs that ignore return values"),
        p("`addEventListener`, `setTimeout`, `MutationObserver`, `emitter.on(...)` - none of them look at what your callback returns. An async listener therefore returns a promise into the void. The rule: **a callback whose return value is ignored must handle its own errors**."),
        code("javascript", `
submitButton.addEventListener("click", () => {
    submitOrder().catch(showCheckoutError);    // the listener itself stays synchronous
});`),
        h3("Handlers attached too late"),
        p("Starting a request early and awaiting it later is a good latency trick - and a classic source of unhandled rejections. If the early promise rejects while the function is still awaiting something else, it has no handler at the end of that task:"),
        code("javascript", `
// Reported as unhandled when the template request fails during createOrder.
const templatePromise = api.loadReceiptTemplate();
const order = await api.createOrder(cart);
const template = await templatePromise;

// Fixed: the handler exists from the start.
const templatePromise = api.loadReceiptTemplate().catch(() => "plain");`),
        callout("warning", "new Promise(async (resolve, reject) => ...)",
            "An async executor is a fifth way: if anything inside it throws, the error rejects the executor's own promise, which nobody observes, and the promise you constructed never settles. Keep executors synchronous and wrap only the callback API inside them."),

        h2("4. Handling on purpose: catch, finally and a helper"),
        p("Every promise in your code should be in exactly one of three states: **awaited** (its errors flow to the caller), **joined** (handed to a combinator that is awaited), or **detached on purpose** with an explicit handler. Make the third state visible with a tiny helper, so a reviewer can tell intent from accident:"),
        code("javascript", `
/** Runs a promise in the background. Failures are reported, never unhandled. */
function detach(promise, label) {
    promise.catch((error) => reportNonFatal(label, error));
}

detach(analytics.track("checkout_submitted"), "analytics");
detach(prefetch(\`/orders/\${id}/receipt\`), "receipt-prefetch");`, "detach.js"),
        h3("finally: cleanup that runs on every path"),
        p("A spinner, a disabled button, a lock, an object URL, an open IndexedDB transaction - anything you set up before an await must be undone on success **and** failure. `try/finally` (or `.finally()`) is the only construct that guarantees it:"),
        code("javascript", `
async function submitOrder() {
    submitButton.disabled = true;
    spinner.show();
    try {
        const order = await api.createOrder(cart);
        await Promise.all(cart.items.map((item) => api.reserveStock(order.id, item.sku)));
        return order;
    } finally {
        spinner.hide();                 // runs after return, after throw, after an await rejects
        submitButton.disabled = false;
    }
}`, "checkout.js"),
        p("Now fix the real checkout. The tests count every rejection the runtime reports as unhandled - including the ones you handle too late - and check when the order is confirmed and whether the spinner stops."),
        challenge("chal_fix_202", "Go through every promise placeOrder creates and decide: awaited, joined with Promise.all, or detached with a handler attached in the same expression. A fallback for the prefetched template must be attached when the request starts, not when you await it. Put the cleanup in finally."),
        h3("The other leak: promises that never settle"),
        p("The opposite of an unhandled rejection is a promise that never settles at all - for example waiting for a WebSocket reply that never comes. It produces no error, but everything its callbacks reference stays in memory, and the `finally` that would release the spinner or the lock never runs. Every wait on something external needs a way out: a timeout, an `AbortSignal`, or an explicit rejection when the source closes. Listener-based leaks are the topic of lesson 5.3."),

        h2("5. A global safety net - not a strategy"),
        p("Even with discipline, a floating promise will slip into a large codebase. Install one listener at application start that makes the failure visible and actionable:"),
        code("javascript", `
window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    errorTracker.capture(reason, { tags: { kind: "unhandled-rejection" } });
});

window.addEventListener("rejectionhandled", (event) => {
    // Handled after all: lower the severity instead of paging anyone.
    errorTracker.addBreadcrumb({ message: "late rejection handler", data: String(event.reason) });
});`, "errorReporting.js"),
        bullets([
            "**Normalize the reason.** `reject(\"timeout\")` or `throw { code: 42 }` produce reasons without a stack trace; always reject with `Error` objects so the report points to the code.",
            "**Do not recover here.** The listener has no idea which operation failed or what state it left behind; it can only report. `event.preventDefault()` merely hides the console message.",
            "**Do not filter blindly.** Dropping every \"Failed to fetch\" would have hidden the failed reservations too. Fix the source - the floating promise - instead of muting the symptom.",
            "**Use `reportError(error)`** when you catch an error you cannot handle but want reported the same way as an uncaught one.",
        ]),

        h2("6. Let the tools find floating promises"),
        p("Floating promises are easy to write and hard to spot in review, which makes them perfect for static analysis:"),
        bullets([
            "**`@typescript-eslint/no-floating-promises`** flags every promise that is neither awaited, returned, nor handled with `.catch` / two-argument `.then`. It needs type information, so it also works for JavaScript checked with `checkJs`.",
            "**`@typescript-eslint/no-misused-promises`** flags async functions passed where a void callback is expected (`addEventListener`, `forEach`) and promises used as conditions (`if (isAllowed())` without `await`).",
            "**`no-async-promise-executor`** (core ESLint) forbids `new Promise(async ...)`; `eslint-plugin-promise` adds `catch-or-return` for codebases without type information.",
            "**Test runners** report unhandled rejections that happen during a test; make them fail the run instead of printing a warning, so a floating promise breaks CI and not production (lesson 6.1 shows how to test async code deterministically).",
        ]),
        callout("tip", "void is a signal, not a handler",
            "With no-floating-promises enabled, `void promise` silences the rule for an intentional fire-and-forget. It documents intent - but it still attaches no handler. Prefer `detach(promise, label)` or `.catch(...)`, which do both."),

        h2("7. Checklist"),
        bullets([
            "Every promise is awaited, joined with a combinator that is awaited, or detached with a handler attached in the same expression.",
            "No `forEach(async ...)`: use `Promise.all(items.map(...))` or a `for...of` loop with `await`.",
            "Callbacks whose return value is ignored (event listeners, timers, observers) are synchronous wrappers that handle their own errors.",
            "Promises started early for latency get their handler or fallback when they are created, not when they are awaited.",
            "Cleanup (spinners, disabled buttons, locks, object URLs) lives in `finally`; every external wait has a timeout or abort signal.",
            "One global `unhandledrejection` listener reports normalized errors; it never recovers and never mutes whole error classes.",
            "`no-floating-promises` and `no-misused-promises` run in CI, and unhandled rejections fail the test run.",
        ]),
    ],
});
