// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-whf-3-3",
    title: "Debug the broken page: symptom, hypothesis, evidence, fix",
    slug: { _type: "slug", current: "debug-the-broken-page" },
    description:
        "The progress page shows Friday's numbers, the console says CORS, and the Network panel says 401. Learn a repeatable debugging method - symptom, hypotheses, evidence, fix, verification - by working through one real capture, reading the status code before the console message, and fixing a client that hides errors behind cached data.",
    estimatedTime: 20,

    scenario: {
        role: "Junior full-stack developer, CodeDev platform team",
        problem:
            "Monday morning, a support ticket: \"I finished three lessons on Sunday but my progress page still says 12 / 40.\" The page at https://app.codedev.test/progress shows numbers and no error. The console shows a CORS error for https://api.codedev.test, a teammate has already opened a pull request that sets Access-Control-Allow-Origin: * on the API, and nobody has looked at the Network panel yet.",
    },

    content: [
        h2("1. The incident: a page that looks fine and is wrong"),
        p("The learner `u_4821` completed three lessons on Sunday afternoon. On Monday at 09:12 the progress page shows **Lessons completed: 12 / 40, Streak: 6 days** - the numbers from Friday. There is no error banner, no spinner, nothing that tells the learner something failed. A page that is broken and says so is annoying. A page that is broken and **looks correct** is worse: the learner loses trust, and support has nothing to go on."),
        p("A teammate opened DevTools, saw a red CORS message in the console, and proposed a one-line fix: send `Access-Control-Allow-Origin: *` from the API. Before you review that pull request, collect the evidence. Everything you need is in one capture."),

        h2("2. The evidence pack"),
        p("This is a simplified capture of one page load, taken with the Network panel open and **Preserve log** on. Read it once from top to bottom, without drawing conclusions yet:"),
        code("text", `
Page      https://app.codedev.test/progress           Monday 2026-10-19 09:12
          "Lessons completed: 12 / 40   Streak: 6 days"    (no error shown)

Console
  Access to fetch at 'https://api.codedev.test/users/u_4821/progress' from origin
  'https://app.codedev.test' has been blocked by CORS policy: No
  'Access-Control-Allow-Origin' header is present on the requested resource.
  GET https://api.codedev.test/users/u_4821/progress net::ERR_FAILED 401 (Unauthorized)
  (the same two lines appear 3 times)

Network   filter: progress
  #  Method   Status              Type       Initiator     Time
  1  OPTIONS  204                 preflight  progress.js   38 ms
  2  GET      401 (CORS error)    fetch      progress.js   41 ms
  3  GET      401 (CORS error)    fetch      progress.js   40 ms
  4  GET      401 (CORS error)    fetch      progress.js   39 ms`, "DevTools capture (simplified)"),
        code("http", `
# Request 1 - preflight response
HTTP/2 204
access-control-allow-origin: https://app.codedev.test
access-control-allow-credentials: true
access-control-allow-methods: GET, POST, PUT, DELETE
access-control-allow-headers: authorization, content-type
access-control-max-age: 600

# Request 2 - the GET (requests 3 and 4 are identical)
GET /users/u_4821/progress HTTP/2
Host: api.codedev.test
Origin: https://app.codedev.test
Authorization: Bearer eyJhbGciOi...   (payload: { "sub": "u_4821", "exp": 1792359600 })

HTTP/2 401
content-type: application/problem+json
www-authenticate: Bearer error="invalid_token", error_description="The access token expired"

{ "type": "about:blank", "title": "Unauthorized", "status": 401 }`, "Headers tab"),
        code("text", `
Application > Local Storage > https://app.codedev.test
  progress:u_4821   {"completed":12,"total":40,"streak":6,"savedAt":"2026-10-16T18:05:11Z"}`, "Application tab"),
        p("The `exp` claim of a JWT is a Unix time in seconds: `1792359600` is Sunday 2026-10-18 21:40 UTC. You can decode it in the console with `new Date(1792359600 * 1000).toISOString()`."),

        h2("3. The method: symptom, hypotheses, evidence, fix, verify"),
        p("Debugging is not guessing faster. It is a loop with five steps, and each step produces something you can write down and show to a teammate:"),
        numbered([
            "**Symptom.** What the user sees, in their words and in exact terms: which page, which account, which numbers, since when. \"Progress is broken\" is not a symptom; \"u_4821 sees 12 / 40 on Monday after finishing 3 lessons on Sunday, no error shown\" is.",
            "**Hypotheses.** Several possible causes, not one. For each, write the evidence that would **confirm** it and the evidence that would **rule it out**.",
            "**Evidence.** Collect it in a fixed order, from the server's answer outwards: status code, response headers, response body, then the browser's reaction (console), then where the page got its data from.",
            "**Fix.** Change the cause the evidence points to. If the evidence points to three causes, there are three fixes.",
            "**Verify.** Reproduce the failing case again and show that the symptom is gone - not just that the happy path still works.",
        ]),
        image("debug-evidence-order", {
            alt: "Diagram comparing two ways to debug the same capture. On the left, in red, the console says CORS, the proposed fix adds Access-Control-Allow-Origin: *, the request is still a 401 and the page still shows Friday's numbers. On the right, in green, the evidence is read in order: status 401 with an expired token, the 401 has no Allow-Origin header, the preflight was allowed, and the data came from a cache saved on Friday. A bottom row shows the five steps: symptom, hypotheses, evidence, fix, verify.",
            caption: "Start from the server's answer. The console message is the browser's reaction to it, not the cause.",
        }),

        h2("4. Write the hypotheses before you look"),
        p("Writing hypotheses first protects you from the first plausible story. Here are five for the progress page, each with the evidence that would decide it:"),
        code("text", `
Hypothesis                                  Confirmed by                          Ruled out by
H1 CORS allow-list lost the app's origin    preflight fails or lacks the origin   preflight 204 allowing the origin
H2 API is down or overloaded                5xx, timeouts, no response            a fast, complete 4xx answer
H3 Access token expired or invalid          401 + WWW-Authenticate invalid_token  a 200 with the same token
H4 Progress is calculated wrong on server   a 200 whose body has wrong numbers    no 200 at all in the capture
H5 Page shows old data from a cache         no fresh 200, cached entry matches    a fresh 200 matching the page`),
        p("Now match the capture against the table. **H1** is ruled out: the preflight returned 204 and allowed exactly `https://app.codedev.test`, with credentials and the `authorization` header. **H2** is ruled out: the API answered in about 40 ms with a well-formed problem+json body. **H4** is ruled out: there is no 200 in the capture, so the server never sent these numbers today. **H3** and **H5** are both confirmed - the incident has more than one cause, which is common."),

        h2("5. Read the evidence in order: status code before the CORS message"),
        p("The console shows the CORS message first and in red, so it gets read first. That is the wrong order. Use this order every time:"),
        numbered([
            "**Status code** of the failing request: `401`. The server received the request and gave a definite answer about the credentials.",
            "**Response headers**: `WWW-Authenticate: Bearer error=\"invalid_token\"` says why (RFC 6750 defines this error code), and there is no `Access-Control-Allow-Origin`.",
            "**Response body**: a problem+json object that agrees with the status.",
            "**The browser's reaction**: because the 401 has no CORS headers, the browser does not hand it to the script and logs the CORS message.",
            "**Where the page's data came from**: no 200 arrived, so the numbers must come from somewhere else - the Local Storage entry saved on Friday.",
        ]),
        p("CORS is enforced by the browser **after** the response arrives. The request reached the API, the API answered, and the browser then decided the page's script may not read that answer. From the script's point of view, a response blocked by CORS looks exactly like no response at all: `fetch` rejects with a `TypeError`, and the status code is not exposed. That is why the page's code could not tell an expired token from a dead network, and why you must read the status in DevTools, where it is visible."),
        callout("info", "Why the preflight passed and the GET failed",
            "The Authorization header makes the request non-simple, so the browser sends an OPTIONS preflight first. The API's CORS middleware answers the preflight correctly. But for the GET, the auth check runs first, rejects the expired token and sends the 401 before the CORS headers are added. CORS headers must be on every response the page needs to read - including errors."),

        h3("Why the page still shows numbers"),
        p("The Initiator column points at `progress.js`. This is the code that ran:"),
        code("javascript", `
for (let attempt = 0; attempt < 3; attempt++) {
    try {
        const res = await fetch(url, { credentials: "include" });
        if (res.ok) { /* cache it and return it as fresh */ }
    } catch (err) {
        // the request failed: try again
    }
}
// still failing: show what we had last time so the page is never empty
return { status: "fresh", data: cache.get(key) ?? null };`, "progress.js (excerpt)"),
        p("Three requests with the same expired token explain the three identical 401s. The last line explains the symptom: after the failures, the cached value from Friday is returned **labelled as fresh**. The fallback was meant to be kind to the learner; instead it removed every sign that something was wrong."),

        h2("6. Three causes, three fixes"),
        bullets([
            "**The access token expired** (Sunday 21:40 UTC) and nothing renewed it. This is normal: tokens expire. The bug is how the system reacts.",
            "**The API's error responses lack CORS headers**, so the browser hides the 401 from the page and logs a misleading CORS message.",
            "**The client retries a 401 and then hides the failure** behind cached data presented as current.",
        ]),
        p("Now review the proposed one-line fix. `Access-Control-Allow-Origin: *` does not renew the token, so the request would still be a 401. And because the request is sent with `credentials: \"include\"`, the browser rejects the wildcard anyway: a credentialed response must name the exact origin and send `Access-Control-Allow-Credentials: true`. The pull request fixes the message, not the problem."),

        h3("Fix 1: CORS headers on every response, errors included"),
        p("On the API, the CORS layer must run before anything that can end the request early - authentication, rate limiting, validation. In an Express app with the `cors` package, that is a matter of order:"),
        code("javascript", `
const corsOptions = { origin: "https://app.codedev.test", credentials: true };

// before: preflights get CORS headers, but auth can end a real request first
app.use(answerPreflights);      // OPTIONS -> 204 with the CORS headers
app.use(requireAuth);           // expired token -> 401, the request ends here
app.use(cors(corsOptions));     // never reached for that 401

// after: one CORS layer first; every response, preflights and 401s included, gets the headers
app.use(cors(corsOptions));     // also answers preflights with 204
app.use(requireAuth);`, "api/app.js"),
        p("This does not make anything more permissive. The allowed origin is the same as before; the API now simply says it on its error responses too, so the page can read the 401 and react to it."),

        h3("Fix 2: a client that tells the truth"),
        p("Once the page can see status codes, `loadProgress` has to give each outcome its own label instead of collapsing everything into \"fresh\". The rule of thumb: **a definite answer from the server is reported; only a missing or failed answer may fall back to cached data, and then it is marked stale.**"),
        bullets([
            "**2xx**: fresh data. Update the cache, show the numbers.",
            "**401**: the session is over. Do not retry the same request with the same token, and do not show cached numbers that may belong to the previous session. Run the token refresh once if the app has one, then retry with the **new** token; otherwise ask the learner to sign in again.",
            "**No response (fetch rejected) or 5xx**: the server could not answer now. Show the cached numbers if there are any, with a visible \"Last updated Friday 18:05\" label and a \"Try again\" button. Without a cache, show an error state.",
            "**Any other status (403, 404, 429 ...)**: a definite answer that cached data cannot fix. Show the matching error state.",
        ]),
        p("Your task: the API team has shipped Fix 1, so the 401 now reaches the page. Fix `loadProgress` so it makes exactly one request per call and returns the right outcome for each case. The exact return shapes are in the challenge description."),
        challenge("chal_coding_whf_332"),

        h2("7. Verify: reproduce the failing case, not the happy path"),
        p("Signing in with a fresh account and seeing correct numbers proves nothing: none of the changed code runs on the happy path. Verification means forcing each failure the fix handles and checking the evidence again:"),
        code("text", `
Case                     How to reproduce                                Expected after the fix
Expired token (API)      curl -i with Origin + an expired test token     401 + access-control-allow-origin:
                                                                         https://app.codedev.test
                                                                         + access-control-allow-credentials: true
Expired token (page)     test account with an expired session, reload    Network: one GET 401, no retries
                                                                         Console: no CORS error
                                                                         Page: sign-in prompt, no numbers
No network               DevTools Network throttling: Offline, reload   cached numbers + "Last updated" label
Server error             point the page at a stub that answers 503      cached numbers marked stale, Try again
Happy path               valid session, reload                          one GET 200, cache savedAt updated
Server logs              count /progress requests per page view          1 instead of 3`),
        code("bash", `
curl -i "https://api.codedev.test/users/u_4821/progress" \\
  -H "Origin: https://app.codedev.test" \\
  -H "Authorization: Bearer <an expired test token>"`, "terminal"),
        callout("tip", "Why curl for the headers",
            "curl does not implement CORS, so it prints exactly what the server sent. It is the quickest way to check that an error response carries the CORS headers - and a reminder that CORS protects users in a browser, not the API from other clients."),
        p("Now test yourself on the evidence pack. Each statement is one step of the method:"),
        challenge("chal_quiz_whf_331"),

        h2("8. Pitfalls"),
        bullets([
            "**Debugging the console text.** A CORS message says the browser withheld a response. Open the request in the Network panel and read its status before you touch any CORS setting.",
            "**Retrying definite answers.** 401, 403, 404 and 422 do not change if you ask again with the same request. Retries belong to timeouts, missing responses, 503 and 429 (lesson 7).",
            "**Silent fallbacks.** Cached data without a \"stale\" label turns an outage into a data bug that nobody reports for days. If you show old data, say how old it is.",
            "**One cause per incident.** Here the token, the API's error path and the client each played a part. Stop when every piece of evidence is explained, not at the first plausible story.",
            "**Caches that outlive the session.** Data cached per user must be cleared on sign-out, or the next person on a shared computer sees someone else's progress.",
            "**Losing the evidence.** Without Preserve log, a redirect to the sign-in page wipes the Network panel. Turn it on before you reproduce, and save a HAR file for the ticket - after removing tokens and cookies from it.",
        ]),

        h2("9. Checklist"),
        bullets([
            "The symptom is written down exactly: page, account, values seen, values expected, since when.",
            "At least three hypotheses are listed, each with confirming and ruling-out evidence.",
            "For every failing request, the status code and response headers were read before the console message.",
            "CORS headers are sent on every response, including 4xx and 5xx, with the exact origin when credentials are used.",
            "401 triggers a token refresh or a sign-in prompt, never a retry of the same request.",
            "Cached data is shown only when the server could not answer, and always with a visible \"stale\" label.",
            "The fix is verified by reproducing each failing case again, with the evidence captured before and after.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Write a one-page root-cause report for this incident: the symptom, the hypotheses you ruled out and why, the three causes, the two fixes, and the verification table with your own before/after evidence. Then reproduce a CORS-blocked error response in a local project and compare what the console, the Network panel and curl show."),

        h2("Sources"),
        bullets([
            "RFC 9110, HTTP Semantics: section 15.5.2 (401 Unauthorized) and section 11.6.1 (WWW-Authenticate).",
            "RFC 6750, The OAuth 2.0 Authorization Framework: Bearer Token Usage, section 3 (the invalid_token error).",
            "WHATWG Fetch Standard: the CORS protocol, and why a CORS failure is reported to the script as a network error.",
        ]),
    ],
});
