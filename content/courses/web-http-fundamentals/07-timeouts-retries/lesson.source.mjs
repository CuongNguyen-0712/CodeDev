// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-whf-3-1",
    title: "Timeouts & retries: which failures are safe to retry",
    slug: { _type: "slug", current: "timeouts-retries-safe-to-retry" },
    description:
        "The submissions client retried a 401 and a 400 five times each and turned one bad request into a traffic spike. Learn which failures can go away on their own (network errors, timeouts, 429, 502, 503, 504) and which never will, how to put a timeout on fetch with AbortSignal.timeout, why a retried POST can submit twice, and how to retry with a limit, exponential backoff and Retry-After.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "On Tuesday morning the API dashboard for https://api.codedev.test shows POST /submissions traffic at six times its normal level, while successful submissions drop to zero. Two things happened at once: a release renamed the request field \"lang\" to \"language\" on the server but not in the web client, so every submission got 400 Bad Request, and learners whose access token had expired got 401 Unauthorized. The shared helper requestWithRetry() retries any response that is not 2xx five times, with no delay, so every click on Run sent six identical requests that could never succeed. Learners saw a spinner for a while and then a generic \"Something went wrong\", and many clicked Run again.",
    },

    content: [
        h2("1. The incident: a retry loop that never asks why"),
        p("This helper was added months ago after a flaky network day. It made the platform feel more reliable, so every API call started to use it, including `POST /submissions`:"),
        code("javascript", `
// api/requestWithRetry.js - the version that shipped
async function requestWithRetry(url, init) {
    let response;
    for (let i = 0; i < 6; i++) {         // "try up to 6 times"
        try {
            response = await fetch(url, init);
            if (response.ok) return response;
        } catch (error) {
            // network error: try again
        }
    }
    return response;
}`, "requestWithRetry.js"),
        p("Read it as the server sees it. A `400` means \"your request is malformed\" and a `401` means \"your credentials are not valid\". Neither answer depends on when you ask. Sending the same bytes again gets the same answer, so this loop multiplied every failing click by six and added nothing but load and waiting time."),
        p("Retries are a good tool. They are the right tool only when two things are true: **the failure can go away on its own**, and **repeating the request cannot do harm**. This lesson teaches you to check both before you write a single retry."),

        h2("2. Reproduce it and read the evidence"),
        p("Open https://app.codedev.test in Chrome, open DevTools, select the **Network** tab, type `submissions` in the filter box and click Run on any challenge. With the shipped helper you see six `POST` rows for one click, all with the same status. Click one row: the **Headers** tab shows the status, and **Response** shows the body the API sent back."),
        p("You can confirm the server's answer without the browser. `curl -i` prints the status line and the headers before the body:"),
        code("bash", `
curl -i -X POST https://api.codedev.test/submissions \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"challengeId":"c_17","lang":"javascript","code":"..."}'

HTTP/1.1 400 Bad Request
Content-Type: application/json

{"error":"validation_failed","field":"language","message":"language is required"}`, "terminal"),
        p("Run the same command again, and again: the answer is identical every time. That is the quickest test of whether a retry can help. If you can repeat the request by hand and the answer does not change, an automatic retry will not change it either."),

        h2("3. Two questions before any retry"),
        p("Every failed request lands in one of three groups. Sort it before you decide what the client does:"),
        bullets([
            "**The request is wrong: do not retry.** `400 Bad Request` and `422 Unprocessable Content` (invalid input), `401 Unauthorized` (missing or expired credentials: refresh the token or sign in again, lesson 6), `403 Forbidden`, `404 Not Found`, `409 Conflict`. The same request gets the same answer. Show the error, or fix the request first.",
            "**The server or the path is temporarily unable: retry, with care.** A network error (fetch rejects with a `TypeError`), a client timeout, `429 Too Many Requests`, `502 Bad Gateway`, `503 Service Unavailable` and `504 Gateway Timeout`. A deploy, a restart, an overloaded instance or a dropped connection can all clear up in a moment.",
            "**The server failed while handling it: do not retry automatically.** `500 Internal Server Error` usually means the handler hit a bug for this input, so the same input tends to hit it again. Worse, the handler may have done part of the work before it failed. Show an error with a Retry button and let the user decide (lesson 8).",
        ]),
        callout("info", "This is a policy, not a law",
            "HTTP does not list \"retryable status codes\". The groups above are a common, defensible client policy, and it is the one this course uses. Some teams also retry 500 for GET requests; others never retry 502 or 504 for writes. Whatever you choose, write it down once, in one helper, and test it."),
        p("The second question is about the method. RFC 9110 calls a method **idempotent** when sending the same request several times has the same intended effect on the server as sending it once. `GET`, `HEAD`, `OPTIONS`, `PUT` and `DELETE` are idempotent; `POST` and `PATCH` are not. The RFC is explicit: a client should not automatically retry a request with a non-idempotent method unless it knows the request is actually idempotent or that the original was never applied."),

        h2("4. Timeouts: a request you cannot wait for forever"),
        p("`fetch()` has no timeout option. If the server accepts the connection and then stops answering, the promise can stay pending for a long time, and your Run button spins with it. The standard way to put a limit on it is `AbortSignal.timeout(ms)`, which returns a signal that aborts by itself after `ms` milliseconds:"),
        code("javascript", `
try {
    const response = await fetch("https://api.codedev.test/courses/42/progress", {
        signal: AbortSignal.timeout(5000),     // give up after 5 s
    });
    // ...
} catch (error) {
    if (error.name === "TimeoutError") {
        // our own limit: the server may be slow or unreachable - retryable
    } else if (error.name === "AbortError") {
        // someone called controller.abort(): the user left or cancelled - do not retry
    } else {
        // TypeError: network error, DNS failure, connection refused, CORS - see lesson 4
    }
}`, "timeout.js"),
        bullets([
            "A timeout from `AbortSignal.timeout()` rejects with a `DOMException` named **`TimeoutError`**. A manual `controller.abort()` rejects with one named **`AbortError`**. Checking `error.name` tells you which one happened.",
            "To support both a timeout and a Cancel button, combine signals with `AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])`.",
            "The signal also covers reading the body: if it fires while `response.json()` is still reading, that call rejects too.",
            "Create the timeout signal **per attempt**. One signal shared by every retry would make the timeout cover all attempts together.",
        ]),
        h3("A timeout means \"I do not know\", not \"it failed\""),
        p("The most important fact about timeouts: **aborting stops the client from waiting; it does not stop the server.** If the server already received the request, it may finish the work and answer to nobody. For a `GET` that costs a little server time. For `POST /submissions` it means a submission may exist even though the learner saw an error."),
        p("How long should the timeout be? Long enough that a healthy request almost never hits it. Do not guess: look at real durations in the DevTools **Timing** tab of a request, or better in the API's own latency metrics, and set the limit well above what normal requests take. A timeout shorter than a normal slow request turns healthy requests into retries and adds load exactly when the server is busiest."),

        h2("5. Why a retried POST can submit twice"),
        image("retry-decision-timeline", {
            alt: "Diagram in two halves. On the left, in red, the shipped client: one click on Run sends POST /submissions six times in a row with no delay, and every attempt returns 400 or 401, ending in a generic error. On the right, in green, the fixed client: a 400 or 401 is returned after one attempt and shown to the user, while a 503 is retried after 100 ms, 200 ms and 400 ms, or after the time in Retry-After, until a 201 arrives or the limit is reached. A bottom strip lists the decision: retry network errors, timeouts, 429, 502, 503 and 504; return everything else at once; retry POST only with an Idempotency-Key.",
            caption: "Retry only failures that can go away on their own, a limited number of times, with growing delays.",
        }),
        p("Picture the sequence. The learner clicks Run. The request reaches the API, which saves the submission and starts grading, but the response is slow. The client's 3-second timeout fires, the client sees `TimeoutError` and, being \"reliable\", sends the same `POST` again. The API saves a second submission. Depending on how grading and rewards are written, the learner might now have two attempts counted, or a pass recorded twice."),
        p("There are two honest options for a non-idempotent request:"),
        numbered([
            "**Do not retry it automatically.** Show the error and let the user retry. Before that, check whether the first request succeeded, for example by loading the learner's latest submissions.",
            "**Make the retry recognisable.** The client generates a unique key once per user action, sends it in a header on every attempt, and the server stores the first result for that key. A repeat with the same key gets the stored result instead of creating a new resource.",
        ]),
        code("javascript", `
// one key per click on Run, reused for every retry of that click
const idempotencyKey = crypto.randomUUID();
const body = JSON.stringify({ challengeId: "c_17", language: "javascript", code });

const sendSubmission = () => fetch("https://api.codedev.test/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body,
    signal: AbortSignal.timeout(10000),       // a fresh timeout for every attempt
});`, "submitWithKey.js"),
        callout("warning", "The key only works if the server supports it",
            "The Idempotency-Key header is described in an IETF draft and is used by several payment and platform APIs, but it is not a finished standard and a server that does not implement it simply ignores it. Check the API's documentation before you rely on it. On CodeDev, the submissions API stores each key with the response it produced."),

        challenge("chal_quiz_whf_311"),

        h2("6. Retry storms, backoff and jitter"),
        p("Retries are extra traffic sent at the moment the server is weakest. Imagine the API restarts and answers `503` for a few seconds. Every open browser tab that retries immediately sends its next request into the same few seconds, and the server comes back to a queue several times larger than normal. That is a **retry storm**, and it can keep a recovering service down."),
        p("Retries also multiply across layers. If the browser makes up to 4 attempts, the API gateway makes up to 4 attempts to the service, and the service makes up to 4 attempts to the database, one click can become 4 x 4 x 4 = 64 database queries. Retry in one layer, usually the one closest to the user, and let the other layers fail fast."),
        p("Three habits keep retries cheap:"),
        bullets([
            "**A hard limit.** A small number of retries (often 2 or 3 for a user-facing request), after which you return the failure and let the UI show it.",
            "**Exponential backoff.** Wait longer before each retry: `baseDelayMs * 2 ** (n - 1)` gives 100, 200, 400 ms for retries 1, 2, 3 with a 100 ms base. The longer an outage lasts, the less often each client knocks.",
            "**Jitter.** Add randomness to the delay (for example, wait a random time between 0 and the backoff value) so that thousands of clients that failed at the same instant do not retry at the same instant. The exercise below leaves jitter out so its delays are predictable to test; production code should add it.",
        ]),
        h3("Retry-After: when the server tells you how long to wait"),
        p("A `429` or `503` response may carry a `Retry-After` header. RFC 9110 allows two forms: a number of seconds (`Retry-After: 120`) or an HTTP-date (`Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`). The server knows its own state better than your backoff formula does, so when it gives you a delay, use it. If the value is very large, it is usually better to stop retrying and tell the user than to keep a spinner running."),
        code("bash", `
curl -i https://api.codedev.test/leaderboard

HTTP/1.1 429 Too Many Requests
Retry-After: 30
Content-Type: application/json

{"error":"rate_limited"}`, "terminal"),

        h2("7. The fix: retry with a limit"),
        p("The new helper keeps everything the old one had right - one place, used by every call - and adds the questions it never asked. It takes `fetch` and `sleep` as parameters, which makes it easy to test with fakes and lets each caller decide what one attempt is:"),
        code("javascript", `
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET: idempotent, safe to retry; a fresh 5 s timeout per attempt
const progress = await fetchWithRetry("https://api.codedev.test/courses/42/progress", {
    fetch: (url) => fetch(url, { signal: AbortSignal.timeout(5000) }),
    sleep,
});

// POST: retried only because every attempt carries the same Idempotency-Key
const submission = await fetchWithRetry("submit", { fetch: sendSubmission, sleep, retries: 2 });`, "usage.js"),
        p("Write `fetchWithRetry`. It retries a rejected fetch (except a user abort) and the statuses 429, 502, 503 and 504, returns every other response at once, stops after `retries` retries, doubles the delay each time and honours a `Retry-After` given in seconds. The tests replay scripted server answers and record every delay you sleep:"),
        code("javascript", `
async function fetchWithRetry(request, { fetch, sleep, retries = 3, baseDelayMs = 100 }) {
    // for each attempt:
    //   1. call fetch(request); a rejection is retryable unless its name is "AbortError"
    //   2. a response is retryable only for 429, 502, 503, 504 - return anything else
    //   3. no retry left? return the last response or rethrow the last error
    //   4. await sleep(...) - Retry-After seconds when present, else the backoff
}`),
        challenge("chal_coding_whf_312"),
        p("Then wire the UI to the result: a `400` from `POST /submissions` shows the validation message next to the code editor, and a `401` sends the learner to sign in and back to the challenge. Neither is retried. That alone removed the spike in the incident; the release bug (`lang` instead of `language`) was then fixed in the client, verified with the `curl` command from section 2 returning `201 Created`."),

        h2("8. How to verify a retry policy"),
        bullets([
            "**Unit test with fakes, as in the exercise.** A fake fetch that answers `503, 503, 200` and a fake sleep that records delays prove the limit, the delays and the classification in milliseconds, with no network.",
            "**DevTools, Network tab.** Filter by the endpoint and trigger a failure: a `400` must appear once per click; a `503` must appear at most `retries + 1` times. The **Waterfall** column shows the gaps between attempts growing.",
            "**DevTools, request blocking.** Right-click a request and choose **Block request URL** to make fetch fail like a network error and watch the client retry and then give up. Use the **Offline** throttling option for the same effect on every request.",
            "**The server's logs.** For writes, count rows per `Idempotency-Key` after a forced timeout: one key, one submission.",
        ]),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "**`if (!response.ok) retry`.** The incident in one line. `ok` is false for every 4xx and 5xx, most of which a retry cannot fix.",
            "**Retrying a 401 instead of refreshing.** The token will not become valid by waiting. Refresh it once, or send the user to sign in.",
            "**Retrying a POST without an idempotency key.** A timeout or a 502/504 can arrive after the server already did the work. Retry only with a key the server understands, or let the user decide.",
            "**No limit, or a limit per layer.** An endless loop, or retries in the browser, the gateway and the service at once, multiplies traffic during an outage.",
            "**Retrying an `AbortError`.** The user navigated away or pressed Cancel. Retrying ignores their decision and wastes a request.",
            "**One timeout signal for all attempts.** `AbortSignal.timeout()` created once outside the loop limits all attempts together: once it fires, every remaining retry fails instantly with `TimeoutError`.",
            "**Forgetting `await` on the sleep.** The delay is computed, logged and then ignored: every retry goes out at once.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every request has a timeout (`AbortSignal.timeout`), set from measured durations, created per attempt.",
            "The client retries only network errors, timeouts, 429, 502, 503 and 504; 4xx and 500 are shown to the user, not retried.",
            "An `AbortError` is never retried and never shown as an error.",
            "Retries have a small limit, exponential backoff and jitter, and honour `Retry-After`.",
            "Non-idempotent requests (`POST`, `PATCH`) are retried only with an idempotency key the server supports.",
            "Retries happen in one layer, in one shared helper with tests.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9110, HTTP Semantics: section 9.2.2 (Idempotent Methods), section 10.2.3 (Retry-After), section 15.6 (Server Error 5xx) - rfc-editor.org/rfc/rfc9110",
            "RFC 6585, Additional HTTP Status Codes: section 4 (429 Too Many Requests)",
            "MDN Web Docs: AbortSignal.timeout() and AbortSignal.any()",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add full jitter to your fetchWithRetry (wait a random time between 0 and the backoff value) with an injected random() so it stays testable. Then write a one-paragraph retry policy for the CodeDev API - which endpoints are retried, how many times, with which timeout - and check it against the Network tab while blocking the request URL."),
    ],
});
