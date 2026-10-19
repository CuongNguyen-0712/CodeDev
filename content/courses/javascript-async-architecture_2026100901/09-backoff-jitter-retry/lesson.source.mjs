// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-3-3",
    title: "Exponential backoff, jitter & a retry engine",
    slug: { _type: "slug", current: "exponential-backoff-jitter-retry-engine" },
    description:
        "A retry loop with a fixed delay turns a 40-second outage into a 14-minute one. Learn why clients that fail together retry together, how capped exponential backoff with full jitter spreads them out, which errors are worth retrying, how to honour Retry-After, and build a reusable retry(fn, options) engine that stops the moment the user cancels.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, checkout of a concert-ticketing site",
        problem:
            "Presale for a stadium tour, 10:00. At 10:02 the payment gateway restarts for 40 seconds and answers 503. About 120,000 checkout tabs are open, and each one retries \"confirm payment\" every second until it succeeds. The gateway comes back to 120,000 requests per second arriving in synchronised waves, falls over again, and only recovers after 14 minutes, when most buyers have given up. The post-mortem also finds cards declined five times in a row - the issuer flagged them as fraud - and buyers who pressed \"Cancel\" while their tab kept retrying in the background.",
    },

    content: [
        h2("1. The incident: a retry loop that kept the outage alive"),
        p("The checkout code retried the payment confirmation like this. It passed review because it is short, obvious and works perfectly against a gateway that is up:"),
        code("javascript", `
async function confirmPayment(orderId) {
    while (true) {
        try {
            return await api.post(\`/orders/\${orderId}/confirm\`);
        } catch (error) {
            await sleep(1000);                // try again in a second
        }
    }
}`, "checkout.js"),
        p("Three decisions are hidden in those lines: **when** to retry (always, every 1000 ms), **what** to retry (every error, including a declined card) and **until when** (forever, even after the user cancelled). All three were wrong. Start with the first one."),
        challenge("chal_quiz_js_331"),

        h2("2. Why fixed delays synchronise clients"),
        p("Clients that fail at the same moment - because the server they talk to failed at that moment - retry at the same moment if they all wait the same time. A fixed 1-second delay does not spread 120,000 clients out; it keeps them in formation. Each wave hits the gateway while it is warming up its connection pools and caches, and knocks it over again. This is the **thundering herd**."),
        image("retry-thundering-herd", {
            alt: "Three charts of requests per 100 ms after an outage at time zero. Fixed 1 s delay: tall identical spikes every second. Exponential backoff without jitter: fewer but equally tall spikes at 1, 3 and 7 seconds. Exponential backoff with full jitter: the same number of retries spread into a low, even band.",
            caption: "Backoff reduces how often clients retry. Only jitter stops them from retrying at the same time.",
        }),
        p("**Exponential backoff** doubles the wait after every failure: 1 s, 2 s, 4 s, 8 s. Clients that fail repeatedly back off quickly, so a struggling server gets fewer retries over time. But on its own it keeps the herd together - every client still waits exactly 1 s, then exactly 2 s. The spikes become rarer, not smaller."),

        h2("3. Capped exponential backoff with full jitter"),
        p("**Jitter** adds randomness so the herd spreads out. The variant that did the least total work in the AWS Architecture Blog's well-known comparison is **full jitter**: wait a random time between zero and the exponential delay, which is itself capped so it does not grow without limit."),
        code("javascript", `
// Delay before retry number \`attempt\` (1 = the first retry).
function backoffDelay(attempt, { baseMs = 500, maxDelayMs = 30_000, random = Math.random } = {}) {
    const exponential = Math.min(maxDelayMs, baseMs * 2 ** (attempt - 1));
    return withJitter(exponential, random);
}

// Full jitter: anywhere between 0 and the exponential delay.
function withJitter(delayMs, random = Math.random) {
    return Math.floor(random() * delayMs);
}`, "backoff.js"),
        bullets([
            "**Base**: the scale of the first wait. 200-500 ms for interactive requests, a few seconds for background sync.",
            "**Cap** (`maxDelayMs`): without it, attempt 10 at a 500 ms base waits over 4 minutes. Cap at what the user will tolerate - 10-30 s in a UI.",
            "**Max attempts**: 3-5 for a user waiting on a spinner. Background work can retry longer, but never forever without telling anyone.",
            "**Inject `random`** (and the timers): tests can then assert exact delays instead of ranges.",
        ]),
        callout("info", "Other jitter strategies",
            "Equal jitter waits half the exponential delay plus a random half, which keeps a minimum wait. Decorrelated jitter computes the next delay from the previous one (random between base and 3x the last delay). All of them beat no jitter by a wide margin; full jitter is the simplest to implement and test."),

        h2("4. Retry only what can succeed"),
        p("A declined card fails the same way on the fifth attempt as on the first - and five declines in a minute look like card testing to the issuer. Classify every error before retrying it:"),
        code("javascript", `
function isRetryable(error) {
    if (error.name === "AbortError") return false;           // the user cancelled: stop
    if (typeof error.status === "number") {
        return error.status >= 500 || error.status === 408 || error.status === 429;
    }
    return true;   // no status: network failure (TypeError) or TimeoutError - transient
}`, "isRetryable.js"),
        bullets([
            "**Retry**: network failures (`fetch` rejects with a `TypeError`), timeouts, `408`, `429` and `5xx`. They describe the state of the server or the network, not of the request.",
            "**Do not retry**: `400`, `401`, `402`, `403`, `404`, `409`, `422`. The same request will fail the same way; show the error or fix the request (refresh the token, then retry once).",
            "**Never retry a cancellation.** An `AbortError` (or any error while the user's signal is aborted) means \"stop\", not \"try again\".",
        ]),
        h3("Retry-After"),
        p("A `429 Too Many Requests` or `503 Service Unavailable` may include a `Retry-After` header - in seconds or as an HTTP date. The server is telling you when it will accept you again; your computed backoff is only a guess. Parse it at the HTTP edge and attach it to the error, so the retry engine can use it:"),
        code("javascript", `
function parseRetryAfter(header, now = Date.now()) {
    if (!header) return undefined;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);                 // "Wed, 21 Oct 2026 07:28:00 GMT"
    return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

if (!res.ok) {
    throw Object.assign(new Error(\`HTTP \${res.status}\`), {
        status: res.status,
        retryAfterMs: parseRetryAfter(res.headers.get("Retry-After")),
    });
}`, "http.js"),
        callout("warning", "Retrying a payment needs an idempotency key",
            "Retrying is only safe if doing the operation twice has the same effect as doing it once. Reads are naturally idempotent; a payment confirmation is not - unless the client sends the same Idempotency-Key header on every attempt and the server deduplicates by it. The capstone (lesson 6.3) builds on this; the Node.js High Performance course covers the server side, with retry budgets and circuit breakers."),

        h2("5. Build it: a reusable retry engine"),
        p("Put the decisions in one place instead of scattering `while` loops through the codebase. The engine takes the operation and the policy, and owns the loop:"),
        code("javascript", `
const order = await retry(
    ({ attempt, signal }) => api.post(\`/orders/\${orderId}/confirm\`, {
        headers: { "Idempotency-Key": order.idempotencyKey },
        signal,                                      // cancel the attempt itself, too
    }),
    {
        maxAttempts: 4,
        baseMs: 500,
        maxDelayMs: 8_000,
        signal: checkoutController.signal,           // "Cancel" stops everything
    },
);`, "checkout.js"),
        p("Its contract, in the order the loop applies it:"),
        numbered([
            "Before every attempt, if the signal is aborted, reject with `signal.reason` - never call the operation for a cancelled checkout.",
            "Call the operation with `{ attempt, signal }`. A result ends the loop.",
            "On failure: if the signal is aborted, reject with `signal.reason`. If the error is not retryable or this was the last attempt, reject with the **original** error - not a wrapper, so the UI can still read `status`.",
            "Otherwise wait: `error.retryAfterMs` if the server sent it, else full-jitter backoff. The wait itself is cancellable - abort clears the timer and rejects at once, like the cancellable sleep from lesson 1.3.",
        ]),
        challenge("chal_coding_303", "Write a cancellable sleep with the injected timers: resolve on the timer, or on abort clear the timer and reject with signal.reason (also when the signal is already aborted). Check signal.aborted before each attempt and again in the catch, before classifying the error."),
        p("Lesson 6.2 plugs this engine into a request state machine unchanged: the machine decides that a retry is allowed, the engine decides when it happens."),

        h2("6. Retries the user can see"),
        p("A retry engine without UI turns a failure into a spinner that spins for 30 seconds. Expose what it is doing - most engines take an `onRetry` callback for this:"),
        bullets([
            "**Say what is happening**: \"Payment service is busy - retrying in 4 s\" with a \"Try now\" button, instead of an endless spinner.",
            "**Bound the total time**, not just the attempts: combine the user's signal with a deadline using `AbortSignal.any([userSignal, AbortSignal.timeout(20_000)])`.",
            "**Retry at one layer only.** If the SDK retries 3 times, your engine 3 times and the user clicks \"Try again\" 3 times, one failure becomes 27 requests. Turn off retries in the inner layers or do not add another one.",
            "**Respect offline**: when `navigator.onLine` is false, wait for the `online` event instead of burning attempts - and treat `onLine === true` only as a hint.",
            "**Measure**: log attempts, final outcome and total wait. A rising retry rate is often the first sign of an incident.",
        ]),
        callout("success", "The next presale",
            "With full jitter (base 500 ms, cap 8 s, 4 attempts), Retry-After honoured and declines never retried, a 30-second gateway restart during the next presale produced a smooth retry load at about 15% of normal traffic. The gateway recovered in 34 seconds, and no card was declined more than once."),

        h2("7. Checklist"),
        bullets([
            "No fixed-delay retry loops: delays grow exponentially, are capped and are fully jittered.",
            "Every retry loop has a maximum number of attempts and a bound on the total time.",
            "Only transient errors are retried: network failures, timeouts, 408, 429 and 5xx; client errors and cancellations never are.",
            "`Retry-After` is parsed at the HTTP edge and overrides the computed backoff.",
            "Non-idempotent operations are retried only with an idempotency key the server deduplicates by.",
            "The user's `AbortSignal` stops the operation in flight and the wait between attempts, and leaves no timer behind.",
            "Exactly one layer retries; the UI shows retry progress and offers \"Try now\" and \"Cancel\".",
            "The engine takes `random` and timers as options so its delays are tested deterministically.",
        ]),
    ],
});
