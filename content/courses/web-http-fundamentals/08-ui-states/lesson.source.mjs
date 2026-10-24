// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-whf-3-2",
    title: "Loading, error & empty states for every response",
    slug: { _type: "slug", current: "loading-error-empty-states" },
    description:
        "During a short API outage the \"My courses\" page told enrolled learners \"You have no courses yet\". Learn the four outcomes of every request in UI terms - loading, data, empty and error - how to tell errors apart by kind, why a failed refresh should keep stale data with a notice instead of a blank screen, how to stop an old response from overwriting a newer one, and how to announce state changes to screen readers.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "At 08:05 on a Monday, the enrollments service behind https://api.codedev.test restarted and answered 503 for about four minutes. During those minutes the \"My courses\" page at https://app.codedev.test/my-courses showed \"You have no courses yet\" and a \"Browse courses\" button to learners who had been enrolled for months. Support received tickets saying \"my progress was deleted\", and some learners enrolled again in courses they were already taking. The data was never lost: the page could not tell \"you have no courses\" from \"we could not load your courses\".",
    },

    content: [
        h2("1. The incident: an outage that looked like an empty account"),
        p("This is the loader behind \"My courses\". It was written on a good day, when the API always answered `200`:"),
        code("javascript", `
// pages/my-courses.js - the version that shipped
async function loadMyCourses() {
    let courses;
    try {
        const res = await fetch("https://api.codedev.test/me/enrollments", { credentials: "include" });
        courses = await res.json();
    } catch {
        courses = [];                        // "if anything goes wrong, show nothing"
    }
    if (courses.length) {
        renderCourseList(courses);
    } else {
        renderMessage("You have no courses yet", { action: "Browse courses" });
    }
}`, "my-courses.js"),
        p("Two separate paths lead to the same wrong sentence. When the request fails completely, `catch` replaces the error with an empty array. When the API answers `503` with a JSON body, nothing throws at all: `res.json()` returns an error object, its `length` is `undefined`, and the page takes the \"no courses\" branch. In both cases the code turned **\"I do not know\"** into **\"there is nothing\"**, and learners believed it."),
        challenge("chal_quiz_whf_321"),

        h2("2. Reproduce both paths"),
        p("You do not need an outage to see this. Open https://app.codedev.test/my-courses with DevTools on the **Network** tab:"),
        numbered([
            "**A failed request.** Right-click the `enrollments` row and choose **Block request URL**, then reload. The row now shows the request as blocked, `fetch` rejects with a `TypeError`, and the page shows the empty message.",
            "**An error response.** Ask the API directly. `curl -i` shows the status line, which the page never looked at:",
        ]),
        code("bash", `
curl -i https://api.codedev.test/me/enrollments -H "Authorization: Bearer $TOKEN"

HTTP/1.1 503 Service Unavailable
Content-Type: application/json
Retry-After: 30

{"error":"service_unavailable"}`, "terminal"),
        p("This is the rule to remember: `fetch()` resolves for **every** HTTP response, `404` and `503` included. It rejects only when no usable response arrives - a network failure, a CORS block or an abort. Checking `res.ok` (true for 200-299) or `res.status` is your job."),
        callout("tip", "Make the loading state visible too",
            "Use a throttling preset in the Network tab, or the Offline option, to slow requests down or stop them. A state you only see for 50 ms on your fast connection is the one a learner on a train stares at for ten seconds."),

        h2("3. Four outcomes, four different screens"),
        p("Every request a page makes ends in one of four outcomes, and each needs its own screen. Mixing any two of them is how the incident happened:"),
        image("ui-states-four-outcomes", {
            alt: "Diagram in two halves. On the left, in red, the shipped page: a request to GET /me/enrollments that succeeds with an empty list, fails with 503, fails with a network error or fails with 401 all lead to the same box, \"You have no courses yet\". On the right, in green, the fixed page: the same request first shows Loading, then branches into four boxes - Data (the course list), Empty (a 200 with an empty list: \"You have no courses yet\"), Error by kind (network or 5xx with a Retry button, 401 with Sign in again, 404 with a not-found message) and Stale (old data with a \"could not refresh\" notice).",
            caption: "\"Empty\" is a successful answer. Only a 2xx response with an empty list may say \"You have no courses yet\".",
        }),
        bullets([
            "**Loading.** The request is in flight. Show a skeleton or a spinner with text, and keep the layout stable so content does not jump when it arrives.",
            "**Success with data.** A 2xx response whose body has the shape you expect. Render it.",
            "**Success but empty.** A 2xx response with an empty list. This is the only state allowed to say \"You have no courses yet\", and it is a good place for a helpful next step such as \"Browse courses\".",
            "**Error.** No response, or a response that is not 2xx, or a body you cannot use. What the user can do depends on the kind of error - next section.",
        ]),
        p("Write the state down as data, so the outcomes cannot blur into each other. One variable with a `status` field is enough:"),
        code("javascript", `
// one of:
// { status: "loading" }
// { status: "success", courses: [...] }     courses.length may be 0: that is the empty state
// { status: "error", kind: "network" | "server" | "auth" | "forbidden" | "not_found" | "validation",
//   message: "...", courses?: [...] }       courses = the last good data, if we have any`, "state.js"),

        h2("4. Errors by kind: what can the user actually do?"),
        p("\"Something went wrong\" for every failure is the error-state version of the incident. The response tells you which action can help, so map each kind to the screen that offers that action:"),
        bullets([
            "**Network error or timeout** (`fetch` rejects with `TypeError`, or `TimeoutError` from `AbortSignal.timeout`): \"We could not reach CodeDev. Check your connection.\" with a **Retry** button.",
            "**Server error** (`500`, `502`, `503`, `504`, `429`): \"Something went wrong on our side.\" with a **Retry** button. Automatic retries from lesson 7 have already happened by the time this shows; the button lets the user decide when to try again.",
            "**Not signed in** (`401`): Retry would send the same expired credentials and fail again. Show \"Your session has expired\" and a **Sign in** link that brings the learner back to this page afterwards.",
            "**Forbidden** (`403`): the learner is signed in but may not see this, for example a premium course they have not unlocked. Say so, and offer the way to get access if there is one.",
            "**Not found** (`404`): the course or lesson does not exist (any more). Show a not-found message with a link to the catalog, not a Retry button.",
            "**Validation** (`400`, `422` on a form submit): show the message **next to the field** it is about, keep everything the user typed, and move focus to the first invalid field. Never clear a form because the server rejected it.",
        ]),
        code("javascript", `
function errorKind(error, res) {
    if (!res) return "network";                    // fetch rejected: TypeError or TimeoutError
    if (res.status === 401) return "auth";
    if (res.status === 403) return "forbidden";
    if (res.status === 404) return "not_found";
    if (res.status === 400 || res.status === 422) return "validation";
    return "server";                               // 5xx, 429 and anything unexpected
}`, "errorKind.js"),
        callout("info", "Read the error body, but do not trust it blindly",
            "A good API sends a JSON error body such as {\"error\":\"validation_failed\",\"field\":\"language\",\"message\":\"language is required\"}. Use the field and the message to place validation errors. For server errors, show your own sentence: raw server messages can be technical, untranslated or leak internal details."),

        h2("5. The fixed loader"),
        p("The new loader checks the status before it treats the body as data, checks the body's shape, and never invents an empty list:"),
        code("javascript", `
async function loadMyCourses(previous) {
    setState({ status: "loading", courses: previous?.courses });
    let res;
    try {
        res = await fetch("https://api.codedev.test/me/enrollments", {
            credentials: "include",
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
        const body = await res.json();
        if (!Array.isArray(body.courses)) throw new Error("Unexpected response shape");
        setState({ status: "success", courses: body.courses });
    } catch (error) {
        console.error("GET /me/enrollments failed", { status: res?.status, error });
        setState({
            status: "error",
            kind: errorKind(error, res),           // a 200 with a bad body counts as "server"
            courses: previous?.courses,            // keep what we already had
        });
    }
}

function render(state) {
    if (state.status === "loading" && !state.courses) return showSkeleton("Loading your courses");
    if (state.status === "error" && !state.courses) return showError(state.kind);
    if (state.status === "error") showNotice("We could not refresh your courses.", { action: "Retry" });
    if (state.courses.length === 0) return showEmpty("You have no courses yet", { action: "Browse courses" });
    return showCourseList(state.courses);
}`, "my-courses.js"),
        p("Notice what decides the empty state now: only `state.courses` from a successful response can be an empty array. A failure without previous data shows an error; a failure with previous data shows that data and a notice."),
        h3("Do not swallow errors"),
        bullets([
            "An empty `catch {}`, or a `catch` that returns a default value, hides the failure from the user **and** from you. If the fallback is the right UX, still record that it happened.",
            "Log with context: the URL, the status, and the request id if your API sends one in a response header. That turns \"it was empty this morning\" into a log line you can find.",
            "Report unexpected errors to your error tracking tool, but do not report `AbortError` (next section): cancelling is normal, not a failure.",
        ]),

        h2("6. Stale data with a notice beats a blank screen"),
        p("A learner who opened \"My courses\" five minutes ago already has a correct list on screen. If a background refresh fails, wiping that list to show an error throws away good information. Keep it, and say clearly that it may be out of date:"),
        code("text", `
+------------------------------------------------------------------+
| We could not refresh your courses. Showing the list from 08:01.  |
|                                                         [Retry]  |
+------------------------------------------------------------------+
  JavaScript Modern Foundations         62% complete
  Web Application Fundamentals          10% complete`),
        bullets([
            "**Stale with a notice** is honest: the user sees the data and knows it might be old. Show when it was last loaded.",
            "**Stale without a notice** is a different bug: the page claims numbers are current when they are not. Never hide that a refresh failed.",
            "**Blank on every failure** is the least useful: the user loses information they already had, and often reloads the page, adding load to a struggling server.",
            "Data that must be current to be safe - a balance, a final grade, a submit button for an exam - should not be shown stale. Show the error instead.",
        ]),

        h2("7. Race conditions: the newest request must win"),
        p("The course search sends one request per keystroke. Responses do not come back in the order the requests were sent: a short query such as `p` matches many courses and can be slower than `py`. If every response renders when it arrives, the oldest answer can land last and overwrite the newest. The list then shows results for \"p\" while the box says \"py\"."),
        p("Cancel the request you no longer need. An `AbortController` per search does it, and the aborted request rejects with an `AbortError`, which you ignore rather than show:"),
        code("javascript", `
let current = null;

async function search(query) {
    current?.abort();                              // the previous query is now irrelevant
    const controller = new AbortController();
    current = controller;
    setState({ status: "loading" });
    try {
        const res = await fetch(\`https://api.codedev.test/courses?q=\${encodeURIComponent(query)}\`, {
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
        const body = await res.json();
        if (controller !== current) return;        // a newer search started meanwhile
        setState({ status: "success", courses: body.courses });
    } catch (error) {
        if (error.name === "AbortError") return;   // cancelled on purpose: not an error state
        setState({ status: "error", kind: "server" });
    }
}`, "search.js"),
        bullets([
            "Aborting also saves bandwidth, and it stops the browser from parsing a response nobody will see.",
            "The `controller !== current` check covers the moment between the response arriving and the code reaching `setState`. Without abort support, that check alone is the classic \"ignore stale responses\" fix.",
            "Abort pending requests when the user leaves the page too, so a late response does not update a screen that is gone.",
            "Verify it: in the Network tab, type quickly in the search box; replaced requests appear as **(canceled)**, and only the last query's response reaches the list.",
        ]),

        h2("8. Announce state changes, at a glance"),
        p("A spinner that appears and a list that changes are visible, but a screen reader user hears nothing unless the page tells them. A few attributes cover most cases:"),
        code("html", `
<!-- polite: read after the user's current task, e.g. "Loading your courses", "12 courses loaded" -->
<p role="status" aria-live="polite" id="courses-status"></p>

<!-- role="alert" is assertive: read immediately; use it for errors only -->
<div role="alert" id="courses-error" hidden></div>

<!-- the list itself while it is being replaced -->
<ul id="course-list" aria-busy="true">...</ul>`, "my-courses.html"),
        bullets([
            "Put the live region in the page from the start and change its text; regions added at the same moment as their text are often not announced.",
            "A spinner needs a text alternative, such as visible or visually hidden \"Loading your courses\".",
            "Do not use color alone for an error. Say what happened and what to do, in words.",
            "After an error, keep keyboard focus somewhere useful, for example on the Retry button or the first invalid field.",
        ]),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "**`catch { return []; }`.** Turns every failure into the empty state. Search the codebase for catch blocks that return empty arrays, `null` or `0`.",
            "**No `res.ok` check.** An error body is parsed as data. Look for `await res.json()` with no status check before it.",
            "**`data.length ? list : empty`** where `data` might be an error object. Check the shape with `Array.isArray` before you count.",
            "**One generic error for everything.** A Retry button on a `401` or `404` cannot help. Branch on the kind.",
            "**Clearing good data on a failed refresh**, or worse, keeping it without saying the refresh failed.",
            "**Rendering every response as it arrives** in search, filters and tabs. The newest request must win.",
            "**Showing `AbortError` as a failure.** It means your own code cancelled the request.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every request-driven view has four states: loading, data, empty, error - and empty is shown only after a 2xx with an empty list.",
            "`res.ok` is checked before the body is used, and the body's shape is validated.",
            "Errors are classified: network/timeout and 5xx get Retry, 401 gets Sign in, 403 explains access, 404 explains not found, validation errors sit next to their fields.",
            "Failures are logged with URL, status and request id; nothing is swallowed silently.",
            "A failed refresh keeps the previous data and shows a visible \"could not refresh\" notice.",
            "Superseded requests are aborted or ignored; `AbortError` is not shown as an error.",
            "Status changes are announced with `role=\"status\"` / `aria-live`, errors with `role=\"alert\"`.",
        ]),

        h2("Sources"),
        bullets([
            "MDN Web Docs: Using the Fetch API - \"Checking response status\" (fetch does not reject on HTTP error statuses)",
            "MDN Web Docs: AbortController and AbortSignal",
            "MDN Web Docs: ARIA live regions (aria-live, role=\"status\", role=\"alert\")",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write loadMyCourses as a pure function that takes a fake fetch and returns the next state, then test it with a 200 and a list, a 200 and an empty list, a 503, a 401 and a rejected fetch. In the browser, use Block request URL and a throttling preset to look at each state on https://app.codedev.test/my-courses, and turn on a screen reader to hear what is announced."),
    ],
});
