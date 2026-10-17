// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-2-2",
    title: "Timeouts, retry budgets & circuit breakers",
    slug: { _type: "slug", current: "timeouts-retry-budgets-circuit-breakers" },
    description:
        "One slow dependency takes down the whole checkout. Put a deadline on every outbound call and propagate it down the call chain, keep retries inside a budget so they cannot become a storm, and build a circuit breaker that fails fast while the dependency recovers.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, payments platform of an e-wallet",
        problem:
            "Tuesday, 11:40. The third-party fraud-scoring API starts answering in 30 seconds instead of 80 ms. The wallet API calls it with a plain fetch() and no timeout, so every top-up and checkout hangs. The connection pool fills up, the event loop is idle but nothing completes, and the gateway and the mobile app both retry. Within four minutes every wallet endpoint is down - including balance checks that never touch fraud scoring.",
    },

    content: [
        h2("1. The incident"),
        p("The fraud API did not go down. It became slow, which is worse: a dead dependency fails fast, a slow one holds on to everything you give it. Here is the call at the centre of the outage:"),
        code("javascript", `
async function scoreTransaction(tx) {
    const res = await fetch(\`\${FRAUD_URL}/score\`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tx),
    });
    if (!res.ok) throw Object.assign(new Error(\`fraud API \${res.status}\`), { status: res.status });
    return res.json();
}`, "src/clients/fraud.js"),
        p("Each waiting request keeps a socket, a slot in the HTTP agent pool, memory for its request context and - most importantly - a user waiting at the checkout. At 400 checkouts per second and 30 seconds per call, the service holds 12,000 requests in flight. Then the retries arrive."),
        callout("warning", "Slow is the new down",
            "Most cascading failures start with latency, not errors. A dependency that answers in 30 seconds turns your service into a queue. Timeouts, retry limits and circuit breakers exist to turn 'slow' back into a fast, explicit failure that you can handle."),

        h2("2. Every network call needs a timeout"),
        p("Node's built-in `fetch` (undici) waits up to **5 minutes** for response headers by default, and most database and HTTP clients are similar. Never rely on defaults: give every outbound call an explicit deadline that fits the user-facing budget."),
        p("The modern way is an `AbortSignal`. Aborting does not just stop you from waiting - it closes the socket and releases the pool slot:"),
        code("javascript", `
const res = await fetch(\`\${FRAUD_URL}/score\`, {
    method: "POST",
    body: JSON.stringify(tx),
    signal: AbortSignal.timeout(800), // rejects with a TimeoutError after 800 ms
});`),
        p("Not every API accepts a signal, so you will also meet hand-written wrappers built on `Promise.race`. They are easy to get subtly wrong: a race decides which promise you **listen to**, it does not stop the loser."),
        code("javascript", `
// Looks fine, leaks under load:
const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("ETIMEDOUT")), 800));
const result = await Promise.race([callDependency(), timeout]);
// 1. after a fast response, the 800 ms timer is still scheduled
// 2. after a timeout, callDependency() is still running and holding its socket`),
        callout("info", "Pick timeouts from data",
            "Set the timeout from the dependency's observed latency (a little above its p99 under normal load) and from what the caller can afford. A timeout longer than the caller's own deadline is useless: nobody is waiting for the answer any more."),
        challenge("chal_fix_nhp_212", "Keep a handle on the timer so it can be cleared whichever side wins the race, and make the deadline cancel the request through the AbortController."),

        h2("3. Deadlines, not just timeouts"),
        p("A checkout request passes through several hops: gateway, wallet API, fraud client, maybe a ledger service. If each hop has its own fixed 5-second timeout, a request that already spent 4.5 seconds upstream can still start a fresh 5-second call downstream - work that will finish long after the user gave up."),
        p("Instead, set **one deadline at the edge** and pass the remaining budget down. Each hop spends part of it and gives the rest to the next call:"),
        code("javascript", `
const DEADLINE_HEADER = "x-request-deadline"; // absolute epoch ms

app.use((req, res, next) => {
    const upstream = Number(req.get(DEADLINE_HEADER));
    req.deadline = Number.isFinite(upstream) ? upstream : Date.now() + 3000; // edge budget: 3 s

    // Abort downstream work when the client goes away before we answered.
    const disconnect = new AbortController();
    res.on("close", () => { if (!res.writableEnded) disconnect.abort(); });
    req.signal = disconnect.signal;
    next();
});

async function callWithDeadline(req, url, init = {}) {
    const remaining = req.deadline - Date.now();
    if (remaining < 50) {
        // Not enough time left to do anything useful: fail now instead of queueing work.
        throw Object.assign(new Error("DEADLINE_EXCEEDED"), { code: "DEADLINE_EXCEEDED" });
    }
    return fetch(url, {
        ...init,
        headers: { ...init.headers, [DEADLINE_HEADER]: String(req.deadline) },
        // Stop when the budget runs out OR when the client disconnects.
        signal: AbortSignal.any([AbortSignal.timeout(remaining), req.signal]),
    });
}`, "src/http/deadline.js"),
        bullets([
            "Pass an **absolute** deadline (or a remaining duration, as gRPC's `grpc-timeout` does) - never a fresh fixed timeout per hop.",
            "Check the remaining budget **before** starting expensive work, and skip retries that cannot finish in time.",
            "Absolute deadlines assume roughly synchronized clocks between services; when in doubt, send the remaining milliseconds and subtract a safety margin.",
        ]),

        h2("4. Retries: only what is safe, only what you can afford"),
        p("A retry is worth it only when the failure is **transient** (a `503`, a timeout, a reset connection, a `429` once `Retry-After` has passed) and the operation is **idempotent** - a read, or a write protected by an idempotency key. A `400` or `422` will fail the same way every time."),
        p("Space retries out with capped exponential backoff and full jitter, so thousands of clients that failed together do not retry together: wait a random time between 0 and `min(cap, base * 2^attempt)`."),
        code("javascript", `
const backoff = (attempt, baseMs = 100, capMs = 2000) =>
    Math.random() * Math.min(capMs, baseMs * 2 ** attempt);`),
        h3("Retry storms and retry budgets"),
        p("Backoff spaces retries out; it does not limit how many there are. During an outage, every failed call becomes 3 or 4 calls, and when several layers retry, the attempts multiply. The struggling dependency receives the most traffic exactly when it can handle the least."),
        p("A **retry budget** caps retries as a fraction of normal traffic, so they can never more than slightly increase load:"),
        code("javascript", `
// Allow retries only while they stay under 10% of recent requests.
function createRetryBudget({ ratio = 0.1, minPerSecond = 10 } = {}) {
    let requests = 0;
    let retries = 0;
    setInterval(() => { requests = 0; retries = 0; }, 1000).unref();

    return {
        onRequest() { requests++; },
        canRetry() {
            if (retries >= Math.max(minPerSecond, requests * ratio)) return false;
            retries++;
            return true;
        },
    };
}`, "src/http/retryBudget.js"),
        bullets([
            "Retry at **one** layer - usually the client closest to the failing dependency - and make the outer layers fail fast.",
            "When the budget is spent, return the error immediately; a fast failure is better than a slow one.",
            "Never retry past the request deadline from section 3.",
        ]),
        challenge("chal_quiz_nhp_211"),

        h2("5. Circuit breakers: stop knocking on a closed door"),
        p("Timeouts make each call fail in 800 ms instead of 30 s. But if the fraud API is down for ten minutes, every checkout still waits 800 ms, holds a socket for it, and adds load to a service that is trying to recover. A **circuit breaker** notices that the dependency is failing and stops calling it for a while."),
        image("circuit-breaker-states", {
            alt: "State machine with CLOSED, OPEN and HALF-OPEN. Consecutive failures open the circuit; after the reset timeout it becomes half-open; a successful trial closes it, a failed trial opens it again.",
            caption: "Closed counts failures, open fails fast, half-open lets a few trial calls decide.",
        }),
        numbered([
            "**Closed** - calls go through. The breaker counts consecutive failures; a success resets the count.",
            "**Open** - after `failureThreshold` failures in a row, calls are rejected immediately with an error such as `CIRCUIT_OPEN`, without touching the network.",
            "**Half-open** - after `resetTimeoutMs`, a limited number of trial calls go through. If a trial succeeds the circuit closes; if it fails it opens again for another full `resetTimeoutMs`.",
        ]),
        p("What happens on `CIRCUIT_OPEN` is a product decision. For fraud scoring, the wallet might approve small top-ups with a rules-only check, queue larger ones for manual review and reject the rest with a clear message - all in a few milliseconds."),
        callout("tip", "Decide what counts as a failure",
            "Timeouts, connection errors and 5xx responses should trip the breaker. A 400 or 404 is the caller's problem, not a sign that the dependency is unhealthy - count those as successes for the breaker. Use one breaker per dependency (and per endpoint if they fail independently), and export its state as a metric."),
        challenge("chal_coding_nhp_213", "Derive half-open from the clock: the circuit is half-open when it is open and resetTimeoutMs has elapsed since it opened. Count trial calls in flight and decrement in a finally block."),
        p("In production you would usually reach for a library such as `opossum`, which adds rolling error-rate windows, events and fallbacks - but its states and transitions are exactly the ones you just implemented."),

        h2("6. Checklist"),
        bullets([
            "Every outbound call has an explicit timeout via `AbortSignal`; a `Promise.race` wrapper must clear its timer and abort the loser.",
            "Set one deadline at the edge and propagate the remaining budget; refuse to start work that cannot finish in time.",
            "Retry only transient failures of idempotent operations, with capped exponential backoff and full jitter.",
            "Retry at a single layer and cap retries with a retry budget so an outage cannot multiply traffic.",
            "Wrap each dependency in a circuit breaker; count timeouts and 5xx as failures, not 4xx.",
            "Have a fast fallback for `CIRCUIT_OPEN`, and alert on breaker state changes and budget exhaustion.",
        ]),
    ],
});
