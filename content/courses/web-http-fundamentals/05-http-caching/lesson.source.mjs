// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-whf-2-2",
    title: "HTTP caching: Cache-Control, ETag & stale pages",
    slug: { _type: "slug", current: "http-caching-cache-control-etag-stale-pages" },
    description:
        "Learners finish a lesson and the CodeDev progress page still shows yesterday's numbers. Learn how browser and CDN caches decide whether a response is fresh, what max-age, no-cache, no-store, private and public really mean, how ETag and If-None-Match turn a download into a 304, and how to prove what a cache did with DevTools and curl.",
    estimatedTime: 20,

    scenario: {
        role: "Junior full-stack developer, CodeDev learning platform",
        problem:
            "To speed up the leaderboard, a teammate put a CDN in front of https://api.codedev.test and added one middleware that sends Cache-Control: public, max-age=86400 on every GET. Since then, learners report that the progress page at https://app.codedev.test/progress still shows yesterday's percentage after they finish lessons, and one learner saw another learner's name at the top of their own progress page. The API logs show almost no requests to GET /me/progress any more.",
    },

    content: [
        h2("1. The incident: a faster leaderboard, a frozen progress page"),
        p("The leaderboard was slow, so the team put a CDN in front of the API and added one line to the server:"),
        code("javascript", `
// server.js - "cache every GET for a day, the leaderboard is too slow"
app.use((req, res, next) => {
    if (req.method === "GET") res.set("Cache-Control", "public, max-age=86400");
    next();
});`, "server.js"),
        p("The leaderboard is fast now. So is everything else - including `GET /me/progress`, the endpoint behind the learner's progress page. Three symptoms arrive the next morning:"),
        bullets([
            "Learners finish lessons, but the progress page still shows the percentage from the day before.",
            "One learner sees **another learner's** name and numbers on their own progress page.",
            "The API logs show almost no requests to `GET /me/progress`, even though the page is opened all day.",
        ]),
        p("Nothing crashed. Every cache did exactly what the header told it to do. To fix this, you need to know who those caches are and how they read `Cache-Control`."),

        h2("2. Reproduce it: who answered the request?"),
        p("Open the progress page with DevTools on the **Network** tab, finish a lesson in another tab, and come back. Look at the row for `/me/progress`:"),
        code("text", `
Name          Status   Type    Size            Time
me/progress   200      fetch   (disk cache)    2 ms`, "DevTools Network tab"),
        p("`(disk cache)` in the Size column means the request **never left the browser**: the browser reused a response it had stored earlier. The status still says 200, because that was the status of the stored response. Now ask the API directly, bypassing the browser cache:"),
        code("bash", `
curl -i https://api.codedev.test/me/progress -H 'Cookie: session=<test session>'

HTTP/2 200
content-type: application/json
cache-control: public, max-age=86400
age: 31042

{"userId":17,"name":"Mai","completedLessons":12,"percent":40}`, "terminal"),
        p("The `Age` header says this response was produced about 31,000 seconds (8.6 hours) ago - it came from the CDN's storage, not from the API. Many CDNs also add their own hit/miss header (the name depends on the vendor). Because the response said `public`, the CDN stored it under the URL `/me/progress` and served it to the next learner who asked for the same URL. That is how one learner saw another learner's name."),

        h2("3. How a cache decides: fresh or stale"),
        p("There are two kinds of HTTP cache between the page and the API:"),
        bullets([
            "A **private cache** belongs to one user: the browser's memory and disk cache.",
            "A **shared cache** serves many users: a CDN, a reverse proxy, a company proxy.",
        ]),
        p("When a cache holds a stored response, it asks one question: **is it still fresh?** A response is fresh while its **age** is less than its **freshness lifetime**."),
        bullets([
            "The freshness lifetime comes from `Cache-Control: max-age=<seconds>` (or `s-maxage`, which only shared caches use and which overrides `max-age` for them), or else from an `Expires` date.",
            "The age is the `Age` header the cache received, plus how long the response has been sitting in this cache.",
            "**Fresh**: the cache answers by itself, without contacting the server. That is the `(disk cache)` you just saw.",
            "**Stale**: the cache must check with the server first (validation, section 5) before reusing it.",
        ]),
        p("With `max-age=86400`, every learner's browser was allowed to reuse its copy of `/me/progress` for 24 hours. No request, no log line, no new numbers."),
        callout("warning", "No Cache-Control does not mean \"not cached\"",
            "When a response has no explicit freshness information, caches are allowed to guess a lifetime heuristically - RFC 9111 suggests, for example, 10% of the time since Last-Modified. If a response must not be reused, say so with a directive; silence is not a policy."),

        h2("4. The directives that matter, and the famous confusion"),
        bullets([
            "`max-age=N` - fresh for N seconds. `max-age=0` makes it stale immediately.",
            "`s-maxage=N` - like `max-age`, but only for shared caches such as a CDN.",
            "`no-cache` - the cache **may store** the response, but must **validate it with the server before every reuse**.",
            "`no-store` - the cache **must not store** the response at all.",
            "`private` - only a private cache (the browser) may store it; shared caches must not.",
            "`public` - any cache may store it, **even when it would otherwise not be allowed**, for example a response to a request with an `Authorization` header.",
            "`must-revalidate` - once stale, the response must not be used without successful validation.",
        ]),
        callout("error", "no-cache is not \"do not cache\"",
            "The most common caching mistake is reading no-cache as \"never store this\". It means \"store it, but ask before you reuse it\". With an ETag, that question costs a tiny 304 response instead of the full body. The directive that forbids storing is no-store."),
        p("Now the incident reads clearly. `public` told the CDN that a per-user response was fine to share. `max-age=86400` told every browser not to ask again for a day. Directive names are case-insensitive and separated by commas, and some take a value, sometimes in quotes - for example `private=\"Set-Cookie\"` or `no-cache=\"Set-Cookie, Authorization\"`, which apply the rule to the listed header fields only."),

        h2("5. Validation: ETag, If-None-Match and 304"),
        p("Validation lets a cache keep a stored body and still never show stale data. The server labels each version of a response with an **entity tag**; the cache sends the label back, and the server answers \"still the same\" without resending the body:"),
        code("text", `
GET /me/progress HTTP/1.1
Host: api.codedev.test

HTTP/1.1 200 OK
Cache-Control: private, no-cache
ETag: "p17-v42"
Content-Type: application/json

{"userId":17,"completedLessons":12,"percent":40}

--- later: the browser has the body stored, but no-cache says "ask first" ---

GET /me/progress HTTP/1.1
Host: api.codedev.test
If-None-Match: "p17-v42"

HTTP/1.1 304 Not Modified
Cache-Control: private, no-cache
ETag: "p17-v42"`, "first request, then a revalidation"),
        bullets([
            "`ETag` identifies one version of the representation. It changes whenever the content changes: a hash of the body, or a version number that increases with every update.",
            "The cache sends `If-None-Match` with the stored tag. If it still matches, the server answers **304 Not Modified** with no body, and the cache reuses its stored body. If not, the server sends a normal 200 with the new body and a new ETag.",
            "A tag that starts with `W/` is a **weak** ETag: \"equivalent\", not byte-for-byte identical. It is fine for this check.",
            "`Last-Modified` with `If-Modified-Since` works the same way using a date. Its resolution is one second, so two updates in the same second look identical; prefer ETag for data that changes quickly.",
        ]),
        image("cache-progress-before-after", {
            alt: "Diagram comparing two policies for GET /me/progress. On the left, Cache-Control: public, max-age=86400: the CDN stores learner 17's response and serves it to learner 23, and the browser reuses its copy for 24 hours without asking, so the page shows yesterday's numbers. On the right, Cache-Control: private, no-cache with an ETag: the CDN does not store it, and the browser sends If-None-Match on every visit, receiving a small 304 when nothing changed or a 200 with new numbers when it did. A bottom row shows how to verify: (disk cache) in DevTools, 304 status, Age header in curl.",
            caption: "private keeps per-user data out of shared caches; no-cache plus ETag keeps it correct and still cheap.",
        }),

        h2("6. Choosing a policy for each resource"),
        p("There is no single right header. Decide per resource, starting from two questions: **is it the same for every user?** and **how stale may it be?** For CodeDev:"),
        bullets([
            "`GET /me/progress`, `GET /me/submissions` - per-user, changes often: `Cache-Control: private, no-cache` plus an `ETag`.",
            "Account and payment pages, anything with personal data you never want on disk: `Cache-Control: no-store`.",
            "`GET /leaderboard` - the same for everyone, fine if it is a minute old: `Cache-Control: public, max-age=60`.",
            "`/assets/app.3f9a1c.js` - the file name changes with every build: `Cache-Control: public, max-age=31536000, immutable`.",
            "The HTML page of the app - should pick up new deploys at once: `Cache-Control: no-cache`.",
        ]),
        callout("info", "When not to add caching",
            "Do not add max-age because a page feels slow. Measure first: if the endpoint is slow because of a missing database index, a cache hides the cause and adds a new class of bugs - stale data. private, no-cache with an ETag is a safe default for API data: it is always correct, and it saves bandwidth without saving you from slow queries."),
        p("If a response depends on a request header - for example `Accept-Language`, or `Origin` as in the previous lesson - add `Vary` with that header's name, so caches store one variant per value instead of mixing them."),

        h2("7. The fix, and the part you cannot undo"),
        p("The fix replaces the global middleware with a policy per route, and answers revalidations with 304:"),
        code("javascript", `
// server.js - after the fix
app.get("/leaderboard", async (req, res) => {
    res.set("Cache-Control", "public, max-age=60");          // same for everyone
    res.json(await loadLeaderboard());
});

app.get("/me/progress", requireSession, async (req, res) => {
    const progress = await loadProgress(req.user.id);
    const etag = \`"p\${req.user.id}-v\${progress.version}"\`;  // changes on every update
    res.set("Cache-Control", "private, no-cache");           // browser may store, must ask first
    res.set("ETag", etag);
    // Simplified: a real If-None-Match may list several tags, or be *.
    if (req.get("If-None-Match") === etag) return res.status(304).end();
    res.json(progress);
});`, "server.js"),
        p("Deploying this does not clean up the past. Browsers that already stored the old response with `max-age=86400` may keep using it until it expires, and you cannot reach into their caches to delete it. Two consequences:"),
        numbered([
            "**Purge the CDN** for the affected URLs right after deploying, through the CDN's purge feature.",
            "For browsers, make the client request a URL they have never cached, for example a new versioned path, or simply wait out the 24 hours. A long `max-age` is a promise you cannot take back - start short.",
        ]),

        h2("8. How to verify what a cache did"),
        bullets([
            "**DevTools, Size column**: `(disk cache)` or `(memory cache)` means the browser answered by itself. A transferred size of a few hundred bytes with status `304` means a revalidation happened and the stored body was reused.",
            "**DevTools, Disable cache**: the checkbox in the Network tab turns the browser cache off, only while DevTools is open. Use it to compare, never as the fix.",
            "**Response headers**: read `Cache-Control`, `ETag`, `Last-Modified`, `Age` and `Vary` on the real response in the Headers panel.",
            "**curl -i**: shows what the server or CDN sends, without the browser cache. Repeat with `-H 'If-None-Match: \"p17-v42\"'` and expect `304 Not Modified`.",
            "**A test**: assert the `Cache-Control` value of every route in your API tests, so a global middleware cannot silently change it again.",
        ]),
        p("That last point is where a parser helps. Before the team trusts its new per-route policy, it wants a small audit that reads the `Cache-Control` header of every response and reports the directives that matter. Real headers are messier than the examples above - mixed case, extra spaces, empty items, quoted values and directives nobody asked about. Write the parser:"),
        challenge("chal_coding_whf_222"),
        p("Then check your understanding of the incident:"),
        challenge("chal_quiz_whf_221"),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "**One `Cache-Control` for every route.** A global middleware cannot know which responses are per-user. Set the policy where the response is built.",
            "**`public` on anything that depends on the session.** If the body changes with the cookie or the token, it is `private` (or `no-store`).",
            "**`no-cache` used to mean \"never store\".** Use `no-store` for that, and keep `no-cache` with an ETag for \"always fresh, cheap to check\".",
            "**An ETag that does not change when the data changes**, such as one computed from the user id only. Every 304 then serves stale data, now with the server's blessing.",
            "**Testing with \"Disable cache\" ticked.** The bug disappears on your machine and stays for every learner.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every API route sets its own `Cache-Control`; per-user responses are `private` or `no-store`, never `public`.",
            "Data that must always be current uses `no-cache` with an `ETag` (or `Last-Modified`), and the server answers matching `If-None-Match` with 304.",
            "Long `max-age` is used only for content that never changes under the same URL, such as hashed asset files.",
            "Responses that vary by a request header carry `Vary` with that header's name.",
            "You verified the behaviour in DevTools (`(disk cache)`, 304) and with `curl -i` (`Cache-Control`, `Age`), not by reloading and hoping.",
            "After a caching bug is fixed, the CDN is purged and the team knows that browser copies expire on their own schedule.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9111, \"HTTP Caching\" - rfc-editor.org",
            "RFC 9110, \"HTTP Semantics\", sections on conditional requests, ETag and 304 Not Modified - rfc-editor.org",
            "MDN Web Docs, \"Cache-Control\" and \"HTTP caching\" - developer.mozilla.org",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick five requests on any site you use: the HTML page, a script, an image, an API call and a logged-in page. For each, write down its Cache-Control, ETag and Age, say whether a CDN may store it, and reload twice to see which ones come back as (disk cache), 304 or a full 200. Then write the policy you would choose for each CodeDev endpoint in section 6, with one sentence of reasoning."),
    ],
});
