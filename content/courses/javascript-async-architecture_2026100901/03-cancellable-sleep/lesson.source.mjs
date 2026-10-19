// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-1-3",
    title: "Cancellable sleep: timers that stop with AbortSignal",
    slug: { _type: "slug", current: "cancellable-sleep-abortsignal" },
    description:
        "Order pages keep polling long after the user has left, and \"Delivered\" toasts pop up on the wrong order. Learn how AbortController and AbortSignal model cancellation, build a sleep(ms, { signal }) that clears its timer and never leaks a listener, and combine it with fetch, AbortSignal.timeout and AbortSignal.any.",
    estimatedTime: 22,

    scenario: {
        role: "Frontend engineer, order tracking in a single-page shop",
        problem:
            "Since the \"Order history\" view shipped, traffic on GET /orders/:id/status has grown 9x. Every order page starts a polling loop, and leaving the page does not stop it: a support agent who clicks through 40 orders keeps 40 loops alive, and one agent's tab was measured at 240 requests per minute. Users see a \"Your order was delivered\" toast for order #1 while looking at order #7. The first patch added a cancelled flag - traffic dropped, but loops still finish their sleeps, and in-flight requests still land on the wrong page.",
    },

    content: [
        h2("1. The incident: loops that outlive their page"),
        p("Each order page starts a loop when it mounts. Nothing stops it when the page goes away:"),
        code("javascript", `
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollOrderStatus(orderId) {
    for (;;) {
        const res = await fetch(\`/api/orders/\${orderId}/status\`);
        const { status } = await res.json();
        renderStatus(status);                     // writes into whatever page is showing now
        if (status === "delivered") return showToast("Your order was delivered");
        await sleep(10_000);
    }
}

export function mountOrderPage(orderId) {
    pollOrderStatus(orderId);
    return function unmount() { /* nothing to stop */ };
}`, "order-page.js"),
        p("The first patch creates an `AbortController` per page, aborts it in `unmount`, and changes the loop to `while (!signal.aborted)`. It looks complete. Before reading on, predict what it really stops."),
        challenge("chal_quiz_js_131"),

        h2("2. AbortController and AbortSignal"),
        p("Cancellation on the web platform has two halves. The **controller** belongs to whoever decides to cancel (the page, the component, the user's Cancel button). The **signal** is handed to every operation that should stop when that decision is made."),
        bullets([
            "`controller.abort(reason?)` aborts the signal once. Later calls do nothing. Without an argument, the reason is a `DOMException` named `\"AbortError\"`.",
            "`signal.aborted` and `signal.reason` tell you whether and why it was aborted; `signal.throwIfAborted()` throws the reason if it was.",
            "The signal fires a single `\"abort\"` event at the moment of abort. A listener added afterwards never runs - always check `signal.aborted` first.",
            "Platform APIs already accept a signal: `fetch(url, { signal })`, `addEventListener(type, fn, { signal })`, stream pipes and many libraries. They reject with `signal.reason` when it aborts.",
        ]),
        p("A flag only works where somebody reads it. An operation stops promptly only if it **listens** for the abort - and a plain `setTimeout` inside a promise does not. That is the gap the patch left: the loop reads `signal.aborted`, but its sleep cannot hear it, so every abandoned loop sits out its timer before it notices."),
        code("javascript", `
const controller = new AbortController();

fetch("/api/orders/42/status", { signal: controller.signal })
    .then((res) => res.json())
    .catch((err) => {
        if (controller.signal.aborted) return;     // we cancelled it - not an error
        reportError(err);
    });

controller.abort();                                // the request is cancelled now
console.log(controller.signal.reason.name);        // "AbortError"`, "abort-basics.js"),
        callout("info", "Abort is a decision, not an error",
            "When code you cancelled rejects, nothing went wrong - you asked for it. Check signal.aborted (or compare the error with signal.reason) and return quietly. Showing \"Something went wrong\" every time a user navigates away trains them to ignore your error messages."),

        h2("3. Building sleep(ms, { signal })"),
        p("A sleep that takes a signal has to handle three ways out, and leave nothing behind on any of them:"),
        numbered([
            "**Already aborted.** If `signal.aborted` is true when `sleep` is called, reject at once with `signal.reason`. Do not start a timer: the abort event has already fired and will never fire again.",
            "**Aborted while sleeping.** Clear the timer and reject with `signal.reason` - the exact value, so callers can tell a user cancel from a timeout or a custom reason.",
            "**Timer fires.** Remove the abort listener, then resolve. A long-lived signal - one per page, shared by a loop that sleeps hundreds of times - must not collect one listener per iteration.",
        ]),
        image("cancellable-sleep-paths", {
            alt: "Flow of sleep(ms, { signal }): if the signal is already aborted, reject immediately; otherwise arm a timer and an abort listener. If the timer fires first, remove the listener and resolve; if the signal aborts first, clear the timer and reject with signal.reason.",
            caption: "The timer and the abort listener are armed together, and whichever fires first disarms the other.",
        }),
        p("Without a signal, it should behave like the one-liner it replaces. In the exercise the timers are injected so the tests can run a whole polling session on a fake clock and count the timers and listeners that are left at the end:"),
        code("javascript", `
function sleep(ms, { signal, timers = globalThis } = {}) {
    return new Promise((resolve, reject) => {
        // 1. already aborted?
        // 2. arm the timer and the abort listener
        // 3. whichever fires first cleans up the other
    });
}`, "sleep.js"),
        challenge("chal_coding_103", "Check signal.aborted before anything else. Keep the timer id and the abort handler in variables both callbacks can reach, so the abort handler can clear the timer and the timer callback can remove the listener. Reject with signal.reason itself, not with a new error."),

        h2("4. The polling loop, fixed"),
        p("With a cancellable sleep, one signal covers both places where the loop waits. Abort lands within milliseconds whether the loop is waiting for the network or sleeping, and the rejection unwinds the loop through its normal error path:"),
        code("javascript", `
async function pollOrderStatus(orderId, signal) {
    try {
        for (;;) {
            const res = await fetch(\`/api/orders/\${orderId}/status\`, { signal });
            const { status } = await res.json();
            renderStatus(status);
            if (status === "delivered") return showToast("Your order was delivered");
            await sleep(10_000, { signal });
        }
    } catch (err) {
        if (signal.aborted) return;               // the page went away - stop quietly
        showStatusError(err);
    }
}

export function mountOrderPage(orderId) {
    const controller = new AbortController();
    pollOrderStatus(orderId, controller.signal);
    return function unmount() {
        controller.abort(new DOMException("Order page closed", "AbortError"));
    };
}`, "order-page.js"),
        bullets([
            "**One controller per lifetime.** A signal aborts only once; when the page mounts again, create a new controller.",
            "**Abort in exactly one place.** The owner of the lifetime (`unmount`) aborts; the loop, the fetch and the sleep only listen.",
            "**Nothing renders after abort.** Because every await rejects as soon as the page is gone, no late response can write into the next page or fire the wrong toast.",
        ]),

        h2("5. Timeouts and combined signals"),
        p("Two static helpers turn the same mechanism into deadlines:"),
        bullets([
            "`AbortSignal.timeout(ms)` returns a signal that aborts by itself after `ms`, with a `DOMException` named `\"TimeoutError\"` - which is exactly why rejecting with `signal.reason` matters.",
            "`AbortSignal.any([a, b])` returns a signal that aborts when any of the inputs does, with that input's reason. Use it to combine \"the page closed\" with \"this request took too long\".",
        ]),
        code("javascript", `
async function fetchStatus(orderId, pageSignal) {
    const signal = AbortSignal.any([pageSignal, AbortSignal.timeout(8_000)]);
    try {
        const res = await fetch(\`/api/orders/\${orderId}/status\`, { signal });
        return await res.json();
    } catch (err) {
        if (signal.reason?.name === "TimeoutError") return { status: "unknown" }; // slow API: try next poll
        throw err;                                // page closed or a real network error
    }
}`, "order-status.js"),
        callout("tip", "Node.js ships this sleep",
            "In Node.js, import { setTimeout } from \"node:timers/promises\" gives await setTimeout(ms, value, { signal }), which rejects with an AbortError when the signal aborts. Writing your own still pays off in browser code and in libraries that must run in both."),
        p("This sleep is a building block for the rest of the course. Lesson 3.2 uses the same signals to make the latest search request win, and the retry engine in lesson 3.3 waits between attempts with `sleep(delay, { signal })` - so cancelling an operation also cancels its pending retries."),

        h2("6. Pitfalls"),
        bullets([
            "**Listener leaks on long-lived signals.** An app-wide or page-wide signal outlives thousands of operations. Every operation that adds an abort listener must remove it when it finishes normally - Node even prints a MaxListenersExceededWarning when they pile up.",
            "**Checking the flag only between steps.** `while (!signal.aborted)` notices the abort only after the current await finishes. Pass the signal into every await that can take long.",
            "**Treating aborts as failures.** Error toasts, retries and error tracking should skip rejections caused by your own abort.",
            "**Reusing an aborted controller.** Once aborted, every new operation given its signal rejects immediately. Create a fresh controller for each lifetime.",
            "**Unobserved rejections.** A cancellable sleep that nobody awaits (or catches) turns an abort into an unhandled rejection. Await it, or attach a catch.",
        ]),

        h2("7. Checklist"),
        bullets([
            "Every long-running async flow takes an `AbortSignal`, and its owner aborts it when the work is no longer wanted (unmount, navigation, new input).",
            "Each await that can take long - fetch, sleep, queues - receives the signal; none relies on a flag checked afterwards.",
            "`sleep(ms, { signal })` rejects at once for an already-aborted signal, clears its timer on abort and removes its listener on resolve.",
            "Rejections carry `signal.reason` unchanged, so callers can tell a cancel from a `TimeoutError` or a custom reason.",
            "Code that catches errors returns quietly when `signal.aborted` is true, and reports everything else.",
            "Deadlines use `AbortSignal.timeout`, combined with the lifetime signal through `AbortSignal.any`.",
        ]),
    ],
});
