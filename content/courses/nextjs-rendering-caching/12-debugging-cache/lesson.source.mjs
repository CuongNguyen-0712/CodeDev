// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-4-3",
    title: "Debugging the cache in production: headers & logs",
    slug: { _type: "slug", current: "debugging-cache-production-headers-logs" },
    description:
        "Two tickets arrived in one morning: a course page still showed the old price an hour after the edit, and a learner saw another learner's name on the dashboard. Learn to find which cache answered with evidence instead of guesses: read Cache-Control, Age and the CDN's cache status header with curl, read the route markers in the build output, log hits and misses in the data layer, and follow a checklist that tells a stale page from a data leak and says what to do first for each.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend developer on call, CodeDev learning platform",
        problem:
            "09:40, ticket #5301 from an instructor: \"I lowered the price of React Basics from 249,000 to 199,000 VND at 08:55. The course page still says 249,000 for me and for my students.\" 10:05, ticket #5307 from a learner, with a screenshot: \"My dashboard says Welcome back, Minh Anh. My name is Thu Trang, and the progress bars are not mine.\" Both pages are cached somewhere between the database and the browser: in the browser, at the CDN, in the Next.js server or in the data layer. The on-call developer has to decide within minutes which ticket is a stale page and which is a data leak, because the second one is a security incident.",
    },

    content: [
        h2("1. The incident: two tickets, one word"),
        p("Both tickets say \"the page is wrong\", and the first instinct for both is \"clear the cache\". That instinct is half right. A **stale page** shows data that was correct for everyone a while ago: annoying, and fixed by revalidating. A **data leak** shows data that belongs to someone else: it can expose names, progress and email addresses, and purging once does not fix it, because the next request can leak again. Before touching anything, find out which cache answered, and why."),
        p("A request to the CodeDev web app can be answered by several caches, each with its own evidence:"),
        bullets([
            "**The browser**: the HTTP cache (headers), and the Next.js client router cache, which keeps pages visited during the session in memory. Evidence: DevTools Network shows `(disk cache)` or `(memory cache)`, or no request at all for a client-side navigation.",
            "**The CDN or reverse proxy** in front of the app. Evidence: `Age` and a cache status header in the response.",
            "**The Next.js server**: a prerendered or revalidated page served from its cache. Evidence: the build output route markers and, on self-hosted servers, a cache status header.",
            "**The data layer**: `fetch` with caching options, `\"use cache\"`, `unstable_cache`, or the team's own cache in front of the API. Evidence: only your logs, because the HTTP response looks the same either way.",
        ]),

        h2("2. Reproduce it with curl"),
        p("A browser adds its own caches and cookies, so start with `curl`. `-s` hides the progress bar, `-D -` prints the response headers, and `-o /dev/null` drops the body:"),
        code("bash", `
$ curl -s -D - -o /dev/null https://app.codedev.test/courses/react-basics

HTTP/2 200
cache-control: public, max-age=0, s-maxage=3600, stale-while-revalidate=86400
age: 3420
x-vercel-cache: HIT
content-type: text/html; charset=utf-8

$ curl -s https://app.codedev.test/courses/react-basics | grep -o 'data-price="[0-9]*"'
data-price="249000"`, "ticket #5301, at 09:50"),
        p("Then reproduce what the learner saw. Request the dashboard twice with two different test accounts on staging, or with your own session and no session, and compare:"),
        code("bash", `
$ curl -s -D - -o /dev/null -b "session=$SESSION_TEST_A" https://app.codedev.test/dashboard

HTTP/2 200
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
x-vercel-cache: MISS

$ curl -s -b "session=$SESSION_TEST_A" https://app.codedev.test/dashboard | grep -o 'Welcome back, [^<]*'
Welcome back, Test Learner A
$ curl -s -b "session=$SESSION_TEST_B" https://app.codedev.test/dashboard | grep -o 'Welcome back, [^<]*'
Welcome back, Test Learner A`, "ticket #5307, reproduced on staging"),
        p("Use test accounts for this, never a real learner's session. The second command is the important one: user B received user A's name, so the leak reproduces on demand. Note also what the headers say: the response was not stored at the CDN. Section 5 shows where to look next."),
        callout("warning", "Request headers do not always bypass a cache",
            "Adding -H \"Cache-Control: no-cache\" to curl asks caches to revalidate, but many CDNs ignore it by default, and a different query string (?v=2) may or may not be part of the cache key depending on the CDN's configuration. Know your CDN's rules before you conclude \"it is not cached\" from a request that tried to bypass the cache."),

        h2("3. Reading the response headers"),
        p("Read the headers in this order: who may store the response, how old this copy is, and which cache answered."),
        bullets([
            "**`Cache-Control`** says who may store the response and for how long. `private` or `no-store` means a shared cache (CDN, proxy) must not store it. `public` with `s-maxage=3600` lets shared caches keep it for an hour; `max-age` applies to the browser; `stale-while-revalidate=86400` lets a cache serve an expired copy for up to a day while it fetches a new one in the background (lesson 6).",
            "**`Age`** is the number of seconds since the cached copy was generated or last revalidated at the origin, as reported by the shared cache. `age: 3420` at 09:50 means this copy is from about 08:53. A missing `Age` usually means the response did not come from a shared cache.",
            "**The cache status header** names the cache that answered and how. Vendors name it differently: Vercel uses `x-vercel-cache` (values such as `HIT`, `MISS`, `STALE`, `PRERENDER`, `REVALIDATED`), Cloudflare `cf-cache-status`, CloudFront and many proxies `x-cache`, and a self-hosted Next.js server sets `x-nextjs-cache` on pages it serves from its own cache. Exact names and values change between providers and versions: check your provider's documentation.",
            "**`Vary`** lists the request headers that are part of the cache key. A personal page cached by a shared cache without varying on the session would serve one user's copy to everyone, which is why personal pages must not be cacheable by shared caches at all.",
            "**`Set-Cookie` on a cacheable response** is a red flag: a CDN that stores it may hand one user's session cookie to the next visitor. Most CDNs refuse to cache such responses by default; do not rely on it.",
        ]),
        p("Back to ticket #5301: `s-maxage=3600`, `age: 3420`, `HIT`. The CDN served a copy generated at about 08:53, two minutes before the price change, and nothing told it to drop that copy. That is a stale page, and the next question is why the edit did not trigger revalidation (lessons 7 and 8)."),

        h2("4. Reading the build output"),
        p("`next build` ends with a route table and a legend. The legend is the reliable part: the symbols have changed between versions, so read it rather than memorise them. A recent version prints something like this:"),
        code("text", `
Route (app)                         Revalidate  Expire
┌ ○ /                                       1h      1y
├ ○ /about
├ ● /courses/[slug]                         1h      1y
│ ├ /courses/react-basics                   1h      1y
│ └ [+197 more paths]
├ ƒ /dashboard
└ ƒ /courses

○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses generateStaticParams)
ƒ  (Dynamic)  server-rendered on demand`, "next build output"),
        p("Two quick checks come from this table. A route you expect to be personal, such as `/dashboard`, must be marked as rendered on demand; if it shows as prerendered, every visitor gets the same HTML, generated by whoever triggered it. And a public route that suddenly changes from prerendered to on demand in a pull request means something in it started reading per-request data such as cookies or headers (lesson 1). Compare the table of the last good build with the current one before you read any code."),

        h2("5. Logging hits and misses in the data layer"),
        p("The dashboard response in section 2 was `private, no-store` and a CDN `MISS`. The HTML was rendered fresh for each request, yet it contained the wrong user. When the HTTP layer is clean, the shared data is inside the server: a cached function whose key does not include the user, or a module-level variable that outlives one request. HTTP headers cannot show that; your logs can."),
        p("The simplest reliable signal: a cached loader's body runs only on a **miss**. Log every call to the wrapper and every run of the body, with the key, and the difference is your hit count. Never log the personal data itself, and hash user ids if your log policy requires it:"),
        code("typescript", `
// lib/cacheLog.ts
type Loader<A extends unknown[], R> = (...args: A) => Promise<R>;

export function withCacheLog<A extends unknown[], R>(
    name: string,
    keyOf: (...args: A) => string,
    cached: (load: Loader<A, R>) => Loader<A, R>,     // the cache you already use
    load: Loader<A, R>,
): Loader<A, R> {
    const loadAndLog: Loader<A, R> = async (...args) => {
        console.info(JSON.stringify({ evt: "cache_miss", name, key: keyOf(...args) }));   // body runs = miss
        return load(...args);
    };
    const fromCache = cached(loadAndLog);
    return async (...args) => {
        console.info(JSON.stringify({ evt: "cache_call", name, key: keyOf(...args) }));
        return fromCache(...args);
    };
}`, "lib/cacheLog.ts"),
        code("text", `
{"evt":"cache_call","name":"dashboardSummary","key":"dashboard"}
{"evt":"cache_miss","name":"dashboardSummary","key":"dashboard"}     <- u_7 (Minh Anh) loads it
{"evt":"cache_call","name":"dashboardSummary","key":"dashboard"}     <- u_12 (Thu Trang): a hit
{"evt":"cache_call","name":"dashboardSummary","key":"dashboard"}     <- u_31: a hit`, "server log, 10:20"),
        p("The log answers ticket #5307 in three lines: one key, `\"dashboard\"`, shared by every user. The loader takes the user id as an argument, but the key does not include it, so the first learner's summary was served to everyone until the entry expired. The fix is the one from lessons 4 and 5: a key built from every input that changes the result, or better, no shared cache at all for per-user data."),
        callout("info", "Built-in logging",
            "Next.js can log fetch requests and whether they came from its cache (the logging.fetches option in next.config, mainly for development), and some versions print more detail when the NEXT_PRIVATE_DEBUG_CACHE environment variable is set on a self-hosted server. These options are version-specific: check the Next.js docs for your version. Your own log around the loader works the same in every version and in production."),

        challenge("chal_quiz_nrc_431"),

        h2("6. Checklist: stale page or data leak?"),
        h3("Stale page: old, but the same for everyone"),
        numbered([
            "Two requests without cookies, or as two different test users, return the same old content.",
            "Read `Cache-Control`, `Age` and the cache status: which cache answered, and when was the copy made? An `Age` older than the edit means the copy predates it.",
            "Check whether revalidation ran: the edit should call `revalidateTag` or `revalidatePath` (lesson 7). Log that call with the tag, and check that the page's data uses the same tag.",
            "Mitigate: revalidate the tag or purge the path at the CDN. Fix: make the edit trigger it every time, and add a test or a check to the deploy that it does.",
        ]),
        h3("Data leak: someone else's data"),
        numbered([
            "Treat it as a security incident from the first minute: tell the security owner, keep the evidence (screenshots, headers, log lines), and do not wait for the root cause before stopping the exposure.",
            "Reproduce with two test accounts. If user B sees user A's data, the leak is confirmed.",
            "Stop it first: mark the route `no-store` at the CDN or turn off the suspected cache, and purge what is stored. Then verify with the two accounts again.",
            "Find the layer: personal page with `public` or `s-maxage`, or prerendered in the build output, means an HTTP or page cache; `private, no-store` plus a fresh render means the data layer: look for cache keys without the user and module-level state.",
            "Fix: personal data out of shared caches, keys with every input (lessons 4, 5 and 9). Add a test that renders the page for two users and compares the results.",
        ]),

        h2("7. How to verify the fix"),
        bullets([
            "**Stale page:** edit the price on staging, then `curl` the page. The new price appears within the time your revalidation promises, and `Age` restarts from a small number.",
            "**Data leak:** the two-account curl comparison from section 2 shows each user their own name, on several requests in a row and from two machines.",
            "**Headers:** personal routes answer `private` or `no-store`, and their cache status is never `HIT`.",
            "**Logs:** each user's loader key appears with its own `cache_miss`, and no key is shared between users.",
            "**Build output:** personal routes stay marked as rendered on demand; keep the route table of each release so you can compare.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**\"Clear the cache\" as the whole fix.** Spot it: the ticket comes back the next day. Purging hides a stale page for one cycle and a leak for one request; find the cause.",
            "**Testing in the browser you are signed in with.** Spot it: results differ between your browser and curl. The browser adds its own caches and cookies; reproduce with curl and test accounts.",
            "**Treating `MISS` or `no-store` as \"no cache involved\".** Spot it: headers are clean, yet users see each other's data. The data layer caches behind the HTTP layer; check its keys and logs.",
            "**Logging personal data to debug a leak.** Spot it: log lines with names or emails. Log keys and hashed ids, which are enough to see a shared key.",
            "**Trusting one vendor's header names everywhere.** Spot it: the header you look for is missing after a move to another host. Learn the headers of the CDN you actually run behind.",
        ]),

        h2("9. Summary"),
        bullets([
            "Find which cache answered before you fix anything: `Cache-Control` says who may store a response, `Age` how old the copy is, and the CDN's cache status header which cache served it.",
            "The build output shows which routes are prerendered and which render on demand; clean HTTP headers do not rule out a shared cache in the data layer, so log calls and misses with their keys.",
            "A stale page is old for everyone and is fixed by revalidation; a data leak is someone else's data, is a security incident, and is stopped first and fixed by keys or by keeping personal data out of shared caches.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9111, HTTP Caching: Cache-Control directives and the Age header - rfc-editor.org/rfc/rfc9111",
            "RFC 5861, stale-while-revalidate and stale-if-error - rfc-editor.org/rfc/rfc5861",
            "Next.js docs: Caching and Revalidating - nextjs.org/docs/app/getting-started/caching-and-revalidating",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write a one-page runbook for your own app: the curl commands for one public and one personal page, the cache headers you expect for each, the name of your CDN's cache status header, and where your data-layer cache logs go. Then test it with two test accounts on staging, and time how long it takes you to tell a stale page from a leak."),
    ],
});
