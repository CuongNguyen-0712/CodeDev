// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-whf-3-4",
    title: "REST API basics: resources, idempotency & error bodies",
    slug: { _type: "slug", current: "rest-api-basics-resources-idempotency-error-bodies" },
    description:
        "The new mobile app creates duplicate enrollments on slow networks, and every endpoint reports errors in a different shape. Learn the REST basics that prevent both: resource-oriented URLs, which methods are safe to retry and why, idempotency keys for POST, cursor pagination, RFC 9457 Problem Details error bodies, versioning, and when an action endpoint is the better design.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, CodeDev platform team",
        problem:
            "The mobile team is integrating with https://api.codedev.test and sends a list of questions: why is it POST /getLessons but GET /course/lessons/list, why do some errors come back as 200 with { \"success\": false } and others as an HTML page, and why do learners on trains end up enrolled twice in the same course? The database confirms duplicate enrollments created a few seconds apart, each pair from one tap on \"Enroll\".",
    },

    content: [
        h2("1. The incident: an API that grew one endpoint at a time"),
        p("The CodeDev API was built feature by feature, by different people. Each endpoint works. Together they are hard to use, and one of them is quietly wrong. This is a sample of what the mobile team found:"),
        code("text", `
POST /getLessons                  { "courseId": "web-http-fundamentals" }
GET  /course/lessons/list?id=web-http-fundamentals
POST /createEnrollment            { "userId": "u_4821", "courseId": "web-http-fundamentals" }
GET  /enrollUser?userId=u_4821&courseId=web-http-fundamentals
POST /deleteEnrollment            { "id": "enr_901" }
GET  /leaderboard?page=3`, "endpoints in use"),
        code("http", `
HTTP/2 200                                  # a "not found", reported as success
{ "success": false, "msg": "course not found" }

HTTP/2 400
{ "error": "BAD_INPUT" }

HTTP/2 500
content-type: text/html
<html><body><h1>Internal Server Error</h1>...`, "three error shapes"),
        p("And the bug: on a slow network, the app sends `POST /createEnrollment`, waits 10 seconds, gets no response and sends it again. The first request was processed; only its response was lost. The learner now has two enrollments, two progress rows and a leaderboard entry counted twice."),
        p("REST is not a standard you can validate against; it is a set of conventions built on HTTP semantics. Following them buys you three things the mobile team needs: URLs they can guess, retries they can trust, and errors they can handle with one piece of code."),

        h2("2. Resources, not actions"),
        p("A REST API exposes **resources** - the nouns of your domain - at stable URLs, and uses the **HTTP method** to say what to do with them. The verb is in the method, never in the path:"),
        code("text", `
GET    /courses                                  list courses
GET    /courses/{courseId}                       one course
GET    /courses/{courseId}/lessons               the lessons of one course
GET    /lessons/{lessonId}                       one lesson
POST   /enrollments                              enroll: create an enrollment
GET    /users/{userId}/enrollments               a learner's enrollments
DELETE /enrollments/{enrollmentId}               unenroll
PUT    /users/{userId}/progress/{lessonId}       set a learner's progress on a lesson
GET    /leaderboard?period=week&limit=20         a filtered, paged view`, "CodeDev API, resource style"),
        bullets([
            "**Plural nouns for collections** (`/courses`), an id for one item (`/courses/{courseId}`). Lowercase, hyphens between words.",
            "**Nest only to show ownership**, one level deep: `/courses/{courseId}/lessons` reads well; `/courses/{c}/lessons/{l}/challenges/{ch}/tests` does not. A lesson has its own id, so `/lessons/{lessonId}` is enough.",
            "**Filters, sorting and paging go in the query string**: `/leaderboard?period=week`. They select a view of the resource; they are not a new resource.",
            "**GET never changes anything.** `GET /enrollUser` is the dangerous line in the list above: browsers prefetch links, crawlers follow them and caches may replay them. A GET with side effects will one day be triggered by something that is not a user.",
        ]),
        callout("info", "Consistency beats purity",
            "Nobody grades your URLs. What matters is that a client who has seen two endpoints can guess the third, and that every endpoint follows the same method semantics. Pick conventions, write them down, and apply them everywhere."),

        h2("3. Safe, idempotent, and why retries depend on it"),
        p("RFC 9110 gives each method a meaning the client, the browser, proxies and caches can rely on. Two properties decide what a client may repeat:"),
        bullets([
            "**Safe** (GET, HEAD, OPTIONS, TRACE): the client asks for nothing to change. Reading progress or a lesson is safe.",
            "**Idempotent** (PUT, DELETE, and every safe method): sending the request several times has the same **intended effect on the server** as sending it once. The responses may differ - a second `DELETE` may get `404` - but the state does not.",
            "**Neither** (POST, and PATCH in general): each request that arrives may create or change something again.",
        ]),
        p("Why is PUT idempotent? Because it carries the **complete** new state: \"make progress for this lesson be `completed` at 09:40\". Doing that twice leaves the same row. POST means \"create a new one\", so two arrivals create two. PATCH depends on the patch: `{ \"status\": \"completed\" }` is harmless to repeat, `{ \"op\": \"increment\", \"path\": \"/streak\" }` is not."),
        image("idempotent-retry", {
            alt: "Diagram of a retry after a timeout. On the left, in red, POST /enrollments is sent twice: the first creates enr_901 but its response is lost, the second creates enr_902, so one tap made two enrollments. On the right, in green, both attempts carry the same Idempotency-Key, the server recognises the key on the second attempt and returns the stored result for enr_901, so there is one enrollment. A bottom row lists methods: GET and HEAD safe and idempotent, PUT and DELETE idempotent, POST not idempotent, PATCH not idempotent in general.",
            caption: "A timeout only tells you that no answer arrived, not whether the server did the work.",
        }),

        h3("Making POST safe to retry: idempotency keys"),
        p("Creating things is what POST is for, so you cannot just switch methods. Instead, the client attaches a unique key to **one user action** and reuses it for every retry of that action. The server stores the result per key and, when the same key arrives again, returns the stored result instead of doing the work twice:"),
        code("http", `
POST /enrollments HTTP/2
Host: api.codedev.test
Idempotency-Key: 5f0c8e8a-7d0e-4b8e-9a43-2a7c1f3d9e61
content-type: application/json

{ "userId": "u_4821", "courseId": "web-http-fundamentals" }`, "the client: one key per tap, same key on retry"),
        code("javascript", `
// server sketch: the store must be shared and durable in production (a table, not a Map)
async function createEnrollment(req, res) {
    const key = req.get("Idempotency-Key");
    const seen = key && await idempotency.find(req.user.id, key);
    if (seen) return res.status(seen.status).json(seen.body);       // replay, do not redo

    const enrollment = await enrollments.insert(req.user.id, req.body.courseId);
    const body = { id: enrollment.id, courseId: enrollment.courseId };
    if (key) await idempotency.save(req.user.id, key, { status: 201, body });
    return res.status(201).location(\`/enrollments/\${enrollment.id}\`).json(body);
}`, "api/enrollments.js"),
        bullets([
            "**Scope keys to the caller** and expire them after a while (hours to days), so one client cannot replay another's result.",
            "**Reject a reused key with a different body** (`422` is a common choice): it is a client bug, not a retry.",
            "**Keep a natural guard too.** A unique constraint on `(user_id, course_id)` makes a second enrollment impossible even without a key; the API then answers `409 Conflict` or returns the existing enrollment.",
            "The `Idempotency-Key` header is used by several public APIs (Stripe's is the best known) and is being standardised in the IETF HTTP APIs working group. Check the current status before you cite it as a standard.",
        ]),
        callout("warning", "Idempotent does not mean the client should retry blindly",
            "Lesson 7 still applies: retry only failures that can recover (no response, 503, 429), with backoff and a limit. Idempotency only answers the second question - if the first attempt did reach the server, is a second one harmless?"),

        h2("4. Pagination: cursors at a glance"),
        p("`GET /courses/{courseId}/lessons` is small. `GET /leaderboard` is not. Never return an unbounded list; return a page and a way to get the next one:"),
        code("http", `
GET /leaderboard?period=week&limit=20 HTTP/2

HTTP/2 200
content-type: application/json

{
  "data": [ { "userId": "u_102", "points": 940 }, ... 19 more ],
  "nextCursor": "eyJwb2ludHMiOjYxMCwiaWQiOiJ1XzQ0In0"
}

GET /leaderboard?period=week&limit=20&cursor=eyJwb2ludHMiOjYxMCwiaWQiOiJ1XzQ0In0`, "cursor pagination"),
        bullets([
            "**Offset pages** (`?page=3` or `?offset=40`) are simple, but when rows are inserted or move while the user pages, items are skipped or shown twice, and large offsets get slow because the database still walks past every skipped row.",
            "**Cursor pages** encode the position of the last item (here: its points and id). The next query continues **after** that position, so inserts do not shift the pages. The cursor is opaque: clients pass it back unchanged and never build it themselves.",
            "**Cap `limit`** on the server (for example at 100) and document the default. `nextCursor: null` means the last page.",
        ]),

        h2("5. One error shape: Problem Details (RFC 9457)"),
        p("The mobile team needs to handle every error with one piece of code. That only works if every error has the right **status code** and the **same body shape**. RFC 9457 defines that shape, with the media type `application/problem+json`:"),
        code("http", `
HTTP/2 422
content-type: application/problem+json

{
  "type": "https://api.codedev.test/problems/validation-error",
  "title": "Your request is not valid",
  "status": 422,
  "detail": "The enrollment has 1 invalid field.",
  "instance": "/enrollments",
  "errors": [
    { "pointer": "#/courseId", "detail": "no course with this id" }
  ]
}`, "a Problem Details response"),
        bullets([
            "**type**: a URI that identifies the kind of problem, ideally a page that documents it. Clients branch on it. When you have nothing more specific than the status code, use `about:blank` (the default).",
            "**title**: a short summary of the problem **type**. It stays the same for every occurrence (except translations).",
            "**status**: the HTTP status code, repeated for convenience. It must match the real status line.",
            "**detail**: a human-readable explanation of **this** occurrence. Show it to people; never parse it.",
            "**instance**: a URI for this occurrence, for example the request path or an id support can search for.",
            "**Extension members** add data for a type: `errors` with a JSON Pointer per invalid field is a common one, and it is what lets a form highlight the right input.",
        ]),
        p("Two rules make the body trustworthy. **The status code tells the truth**: never `200` with `{ \"success\": false }` - caches, retry logic, monitoring and DevTools all read the status line, not your body. And **every layer uses the same shape**, including the framework's default 404 and 500 handlers, which otherwise return HTML. Never put stack traces or SQL in `detail`; log them server-side with the `instance` id."),

        h2("6. Versioning at a glance"),
        bullets([
            "**Additive changes are not breaking**: a new optional field, a new endpoint, a new `type` of problem. Clients must ignore fields they do not know.",
            "**Breaking changes** are removing or renaming a field, changing its type or meaning, adding a required input, or changing status codes. They need a new version.",
            "**The common pattern** is a major version in the path (`/v1/courses`, then `/v2/courses`) or in a header. Run both versions during a migration window, and announce the end date of the old one, for example with the `Sunset` response header (RFC 8594).",
            "**Mobile apps make this real**: old app versions stay installed for months, so a breaking change without a version breaks users you cannot update.",
        ]),

        h2("7. When not to force REST"),
        p("Not every operation is reading or replacing a resource. Forcing an action into CRUD often produces something worse than an honest action endpoint. Starting a run of a learner's submission against the hidden tests is a good example:"),
        code("http", `
POST /submissions/sub_5512/start HTTP/2
Idempotency-Key: 0b7d...e2

HTTP/2 202 Accepted
Location: /submissions/sub_5512
content-type: application/json

{ "id": "sub_5512", "status": "queued" }`, "an action endpoint"),
        bullets([
            "`PUT /submissions/sub_5512 { \"status\": \"running\" }` would pretend the client sets the state, when really it asks the server to start a process with its own rules. An action endpoint says what it does.",
            "**Keep the HTTP semantics anyway**: it is a POST, so it is not idempotent and takes an `Idempotency-Key`; it answers `202 Accepted` because the work continues after the response; the client polls the resource in `Location`.",
            "**Other good reasons to step outside REST**: a complex search with a large body (`POST /courses/search`), live updates such as the leaderboard during a contest (Server-Sent Events or WebSocket), or an internal API where a typed RPC framework fits the team better.",
        ]),
        p("Test yourself on two retries and one error body from the CodeDev API:"),
        challenge("chal_quiz_whf_341"),

        h2("8. Pitfalls"),
        bullets([
            "**Verbs in paths and GETs that write.** `/enrollUser?...` via GET can be triggered by prefetching or a crawler. Detect it by searching the routes for GET handlers that call insert, update or delete.",
            "**Retrying POST without a key.** Detect it in the data: pairs of rows with the same owner and content created seconds apart.",
            "**Errors with status 200.** Detect it in DevTools or monitoring: a 200 whose body says the request failed. Your error rate dashboard shows zero while users fail.",
            "**Several error shapes.** Detect it by requesting an unknown route, an invalid body and an unauthenticated call: all three should return `application/problem+json`.",
            "**Unbounded lists.** Detect it by checking every collection endpoint for a `limit` cap, and by watching response size as data grows.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Paths name resources with plural nouns; the HTTP method carries the action; GET never changes state.",
            "PUT replaces the full state, DELETE removes, and both can be retried; POST and non-idempotent PATCH accept an `Idempotency-Key` and the data has a natural unique constraint where one exists.",
            "Every collection endpoint is paged with a server-side cap; large or fast-changing lists use cursors.",
            "Every error uses the correct status code and an `application/problem+json` body with stable `type` and `title`; `detail` is per occurrence; field errors use JSON Pointers.",
            "Only additive changes go into an existing version; breaking changes get a new version and a published end date for the old one.",
            "Actions that are not CRUD get an honest action endpoint with correct POST semantics.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Write the resource table for the platform's notifications (list, mark one as read, mark all as read, delete), with method, path, success status and one Problem Details example per endpoint. Decide which operations need an Idempotency-Key and why, then describe it in an OpenAPI file and ask a teammate to guess one endpoint from the others."),

        h2("Sources"),
        bullets([
            "RFC 9110, HTTP Semantics: section 9.2.1 (safe methods), section 9.2.2 (idempotent methods) and section 9.3 (method definitions).",
            "RFC 9457, Problem Details for HTTP APIs: sections 3 and 3.1 (members of a problem details object).",
            "RFC 8594, The Sunset HTTP Header Field.",
        ]),
    ],
});
