// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-whf-1-2",
    title: "How to pick the right HTTP method and status code",
    slug: { _type: "slug", current: "pick-the-right-http-method-and-status-code" },
    description:
        "A link checker deletes real enrollments, new learners see \"Something went wrong\" on an empty dashboard, and the error-rate graph stays at zero while support tickets pile up. Learn what each HTTP method promises (safe, idempotent), what each status code family means, and how to choose between 400 and 422, 401 and 403, 404 and an empty list, 409, 429, 500 and 503.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev API team",
        problem:
            "The enrollments API was written in a hurry before launch. This week three things went wrong at once: an internal link checker crawled the admin pages and removed every enrollment it found a link for; every new learner opens a dashboard that says \"Something went wrong\" instead of \"You have not enrolled in a course yet\"; and the monitoring graph of 4xx and 5xx responses on https://api.codedev.test stayed flat at zero while support received dozens of \"I clicked Enroll and nothing happened\" tickets.",
    },

    content: [
        h2("1. The incident: an API that always says OK"),
        p("Here are the three routes behind the tickets. Each one works when you click through the happy path, which is why nobody noticed:"),
        code("javascript", `
// enrollments.routes.js (before)
app.get("/v1/enrollments/:id/delete", async (req, res) => {
    await db.enrollments.remove(req.params.id);
    res.json({ ok: true });
});

app.post("/v1/enrollments", async (req, res) => {
    if (!req.body.courseId) return res.json({ ok: false, error: "courseId is required" });
    if (await db.enrollments.exists(req.user.id, req.body.courseId)) {
        return res.json({ ok: false, error: "Already enrolled" });
    }
    const enrollment = await db.enrollments.create(req.user.id, req.body.courseId);
    res.json({ ok: true, enrollment });
});

app.get("/v1/users/me/enrollments", async (req, res) => {
    const list = await db.enrollments.forUser(req.user.id);
    if (list.length === 0) return res.status(404).json({ error: "No enrollments found" });
    res.json(list);
});`, "enrollments.routes.js"),
        bullets([
            "**The link checker** followed `<a href=\"/v1/enrollments/42/delete\">` links in the admin pages. Following links is exactly what a crawler is allowed to do, because a `GET` is promised to be harmless.",
            "**The flat error graph** counts responses by status code. Every failure above is sent as `200 OK`, so for the monitoring system - and for every proxy, cache and HTTP client between - nothing ever failed.",
            "**The empty dashboard** calls the enrollments list. A brand-new learner gets `404`, the frontend treats any 4xx as an error, and shows the error screen instead of the empty state.",
        ]),

        h2("2. Reproduce it with curl -i"),
        p("`curl -i` prints the status line and headers before the body. That is the part every tool reads first, so look at it first too:"),
        code("bash", `
$ curl -i -X POST https://api.codedev.test/v1/enrollments \\
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
    -d '{"courseId": "web-http-fundamentals"}'
HTTP/2 200
content-type: application/json

{"ok":false,"error":"Already enrolled"}

$ curl -i https://api.codedev.test/v1/users/me/enrollments -H "Authorization: Bearer $NEW_USER_TOKEN"
HTTP/2 404
content-type: application/json

{"error":"No enrollments found"}`, "terminal"),
        p("The first response says \"success\" in the status line and \"failure\" in the body. The second says \"this resource does not exist\" about a list that exists and is simply empty. HTTP gives the method and the status code precise meanings so that browsers, caches, crawlers, retry logic and dashboards can act correctly **without understanding your JSON**. When you misuse them, all of those tools make the wrong decision for you."),

        h2("3. Methods: what each one promises"),
        p("The method tells the server, and everything in between, what kind of operation the client wants. RFC 9110 defines the core methods; `PATCH` comes from RFC 5789:"),
        bullets([
            "`GET` - read a representation of the resource. `GET /v1/courses/42`, `GET /v1/users/me/enrollments`.",
            "`HEAD` - like `GET` but without the body: only the status and headers.",
            "`POST` - send data for the resource to process; most often \"create a new item in this collection\": `POST /v1/enrollments`. Also used for actions that do not fit the others, such as `POST /v1/submissions/7/rerun`.",
            "`PUT` - replace the whole resource at this URL with the body: `PUT /v1/users/me/profile`.",
            "`PATCH` - change part of the resource: `PATCH /v1/lessons/12` with `{ \"title\": \"...\" }`.",
            "`DELETE` - remove the resource: `DELETE /v1/enrollments/42`.",
            "`OPTIONS` - ask which methods and features the server supports for this URL (the browser uses it for CORS preflights, lesson 4).",
        ]),

        h3("Safe and idempotent: the two promises that matter"),
        p("Two properties decide what other software may do with a request without asking anyone:"),
        bullets([
            "**Safe** means read-only from the client's point of view: the client does not request any change on the server. `GET`, `HEAD` and `OPTIONS` are safe. Crawlers, link previews, prefetchers and browser history all rely on this and may send safe requests at any time, as often as they like.",
            "**Idempotent** means sending the same request twice has the same effect on the server as sending it once. All safe methods are idempotent, and so are `PUT` and `DELETE`: replacing a profile with the same data twice, or deleting the same enrollment twice, leaves the server in the same state. `POST` and `PATCH` are not guaranteed to be idempotent: two `POST /v1/enrollments` calls may create two enrollments.",
        ]),
        p("Idempotency is about the **effect on the server**, not about getting identical responses. The second `DELETE /v1/enrollments/42` may well answer `404` because there is nothing left to delete - the state is the same, so the method is still idempotent. Lesson 7 uses this property to decide which requests are safe to retry automatically."),
        callout("warning", "A GET that changes data is a bug, not a style choice",
            "Any URL that deletes, buys, sends or enrolls when it is fetched with GET will eventually be triggered by something that is not a human: a crawler, a link preview, a prefetch, a monitoring probe. Changes go through POST, PUT, PATCH or DELETE, which those tools do not send on their own."),

        h2("4. Status codes: five families"),
        p("The first digit of the status code is its class, and many clients only look at that digit. Pick the family first, then the exact code:"),
        bullets([
            "**1xx Informational** - an interim response, for example `100 Continue`. You rarely handle these yourself.",
            "**2xx Success** - the request was received, understood and accepted.",
            "**3xx Redirection** - the client must take another step, such as following a `Location` header (`301`, `302`, `307`, `308`), or use its cached copy (`304 Not Modified`, lesson 5).",
            "**4xx Client error** - the request is wrong, and sending it again unchanged will not help. The client (or the user) must change something.",
            "**5xx Server error** - the request may have been fine; the server failed to fulfil it. Trying again later may work.",
        ]),

        h3("Success: 200, 201 and 204"),
        bullets([
            "`200 OK` - the general success answer, with a body: a course, a list, an updated resource.",
            "`201 Created` - a new resource was created, typically by `POST`. Send a `Location` header with its URL, and usually the created resource in the body.",
            "`204 No Content` - success with no body at all. A common answer to `DELETE`. Clients must not try to parse JSON from it.",
        ]),

        h3("Client errors: pick the one that tells the client what to fix"),
        bullets([
            "`400 Bad Request` vs `422 Unprocessable Content` - use `400` when the server cannot even read the request: broken JSON, a wrong `Content-Type`, a query parameter that is not a number. Use `422` when the request is well-formed but its content breaks the rules: `courseId` is missing, an email has no `@`. Some APIs use `400` for both; what matters is that your API is consistent and documents it.",
            "`401 Unauthorized` vs `403 Forbidden` - `401` means \"I do not know who you are\": no credentials, or an expired or invalid token. Log in again and it may work. `403` means \"I know who you are, and you are not allowed\": a learner calling an admin endpoint. Logging in again will not help. Lesson 6 covers this in depth.",
            "`404 Not Found` - the target resource does not exist: `GET /v1/courses/999999`. It is about the resource in the URL, not about whether a list has items.",
            "`405 Method Not Allowed` - the URL exists but does not support this method; the response must list the supported ones in an `Allow` header.",
            "`409 Conflict` - the request conflicts with the current state of the resource: enrolling in a course you are already enrolled in, or saving a lesson that someone else changed in the meantime.",
            "`429 Too Many Requests` - the client sent too many requests in a given time. A `Retry-After` header can say how long to wait.",
        ]),

        h3("Server errors: whose fault, and is it temporary?"),
        bullets([
            "`500 Internal Server Error` - an unexpected failure in your code: an unhandled exception, a bug. Something to fix, not to wait out.",
            "`503 Service Unavailable` - the server is temporarily unable to handle the request: overloaded, or down for maintenance. It is expected to recover, and `Retry-After` can say when.",
            "`502 Bad Gateway` and `504 Gateway Timeout` - sent by a proxy or load balancer in front of your API when the server behind it gave an invalid answer or no answer in time. They tell you which hop failed.",
        ]),
        callout("info", "Never hide a failure inside a 200",
            "{ \"ok\": false } with 200 OK is invisible to monitoring, makes caches store errors as if they were content, and forces every client to parse the body to find out whether the call worked. Put the outcome in the status code, and the details in the body (lesson 10 shows a standard error body)."),

        h2("5. An empty list is not a 404"),
        p("`/v1/users/me/enrollments` is a collection. It exists for every learner, including one who has not enrolled in anything. Asking for it and getting no items is a successful answer: `200 OK` with `[]`. The frontend can then show its empty state (\"You have not enrolled in a course yet\") instead of an error screen."),
        p("`404` is for a URL that identifies nothing: an enrollment id that never existed or was deleted, a course slug with a typo. The same reasoning applies to search: `GET /v1/courses?q=cobol` with no matches is `200` with an empty list, not `404`."),

        p("Before you fix the routes, check the two distinctions people get wrong most often: what idempotent really promises, and when a request is \"bad\" rather than \"invalid\"."),
        challenge("chal_quiz_whf_121"),

        h2("6. The fix, and how to verify it"),
        image("methods-status-before-after", {
            alt: "Three requests from the incident, before and after the fix. Before, in red: GET /v1/enrollments/42/delete answers 200 and deletes data, a duplicate enrollment answers 200 with ok false, and the empty list answers 404. After, in green: DELETE /v1/enrollments/42 answers 204, the duplicate answers 409 Conflict, and the empty list answers 200 with an empty array. A bottom row shows the five status code families and who must act.",
            caption: "The method says what the client wants; the status code says what happened. Both must be true on their own, before anyone reads the body.",
        }),
        code("javascript", `
// enrollments.routes.js (after)
app.delete("/v1/enrollments/:id", async (req, res) => {
    const removed = await db.enrollments.removeOwn(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: "Enrollment not found" });
    res.status(204).end();
});

app.post("/v1/enrollments", async (req, res) => {
    if (typeof req.body.courseId !== "string") {
        return res.status(422).json({ error: "courseId is required" });
    }
    if (await db.enrollments.exists(req.user.id, req.body.courseId)) {
        return res.status(409).json({ error: "Already enrolled in this course" });
    }
    const enrollment = await db.enrollments.create(req.user.id, req.body.courseId);
    res.status(201).location(\`/v1/enrollments/\${enrollment.id}\`).json(enrollment);
});

app.get("/v1/users/me/enrollments", async (req, res) => {
    res.json(await db.enrollments.forUser(req.user.id));   // 200, [] when empty
});`, "enrollments.routes.js"),
        p("Verify each promise with evidence, not by clicking through the UI:"),
        numbered([
            "`curl -i` each case and read the status line: a duplicate enrollment now shows `HTTP/2 409`, a new learner's list shows `HTTP/2 200` and `[]`, a delete shows `HTTP/2 204` with no body.",
            "`curl -i https://api.codedev.test/v1/enrollments/42/delete` should now answer `404` (or `405` if you keep the path), and the enrollment must still be there afterwards.",
            "In the browser, the Network tab's Status column shows the same codes; the dashboard shows its empty state for a new account.",
            "Add API tests that assert the status code of every case, not only the body. Then the error graph moves the next time something fails.",
        ]),
        p("Your turn. Instead of a whole router, write the decision itself: given a description of an operation on the CodeDev API, return the method and the status code the API should use. The challenge describes the exact rules, including the order in which the checks apply."),
        code("javascript", `
chooseResponse({ action: "create", conflict: true });
// -> { method: "...", status: ... }   which method creates, and what does a duplicate get?`),
        challenge("chal_coding_whf_122"),

        h2("7. Pitfalls"),
        bullets([
            "**Status in the body.** `{ \"status\": 404 }` inside a `200` response helps nobody. Tools read the status line.",
            "**Choosing by family only.** Every 4xx looks the same to a client that only checks `>= 400`. `401` should send the user to log in, `422` should highlight a field, `409` should explain the conflict. Pick the code that tells the client what to do next.",
            "**`404` for \"no results\".** Collections and searches answer `200` with an empty list. Keep `404` for URLs that identify nothing.",
            "**`500` for bad input.** A missing field that throws inside your code becomes a `500`, which pages the on-call engineer for a client mistake. Validate input first and answer `422` (or `400`).",
            "**`503` for a bug.** `503` tells clients to wait and retry. A deterministic crash will fail again on every retry; answer `500` and fix it.",
        ]),

        h2("8. Checklist"),
        bullets([
            "No `GET` (or `HEAD`/`OPTIONS`) route changes data.",
            "`POST` creates and answers `201` with a `Location`; `DELETE` answers `204` (or `200` with a body).",
            "Broken requests get `400`, well-formed but invalid content gets `422`, and the API documents its choice.",
            "Missing credentials get `401`, missing permission gets `403`.",
            "Empty collections and searches answer `200` with `[]`; `404` is only for a resource that does not exist.",
            "Conflicts with existing state (duplicates, stale updates) get `409`; rate limits get `429`.",
            "`500` means a bug to fix; `503` means a temporary condition, ideally with `Retry-After`.",
            "API tests assert the status code of every success and failure case.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Pick five endpoints of an API you use or build, and write down for each one: the method, whether it is safe and idempotent, its success code, and the code for its most likely failure. Then check them with curl -i and compare."),

        h2("Sources"),
        bullets([
            "RFC 9110 HTTP Semantics, section 9 (methods, safe and idempotent methods) and section 15 (status codes).",
            "RFC 5789 PATCH Method for HTTP, and RFC 6585 Additional HTTP Status Codes (429 Too Many Requests).",
            "MDN Web Docs: HTTP response status codes.",
        ]),
    ],
});
