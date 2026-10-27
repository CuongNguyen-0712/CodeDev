// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-2-1",
    title: "Safe cache keys: public data versus per-user data",
    slug: { _type: "slug", current: "safe-cache-keys-public-vs-per-user-data" },
    description:
        "The course list was cached under \"courses:<category>\": learners who filtered for advanced courses got the beginner list, Vietnamese learners got English titles, and every newsletter link created a new cache entry. Learn to treat a cache key as the full list of inputs of the result: include everything that changes it, normalize what does not, add the user only to per-user data, refuse to cache private data, and send the Cache-Control header that matches.",
    estimatedTime: 25,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "Two support tickets in one morning. #5087: \"I chose Level: Advanced in the React catalog and got the beginner courses.\" #5091: \"Since yesterday the catalog is in English even though my account is set to Tiếng Việt, but only sometimes.\" The cache dashboard for GET /api/courses shows a hit rate of 4%, with 1,800 entries for 5 categories. In the incident channel a teammate suggests adding the user id to every cache key \"so nobody can ever see the wrong data\".",
    },

    content: [
        h2("1. The incident: one key for many answers, many keys for one answer"),
        p("Last sprint the team moved the catalog query behind a small server data cache, because the course list query joins five tables and the catalog is the busiest page of https://app.codedev.test. The data function looked like this:"),
        code("typescript", `
// lib/catalog.ts (release 2026.10.19-1)
import { cached } from "@/lib/cache";          // the team's wrapper: cached(key, ttlSeconds, load)

export async function getCourses(query: CourseQuery, locale: string) {
  return cached(\`courses:\${query.category}\`, 300, () => db.listCourses(query, locale));
}

// app/api/courses/route.ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);       // category, level, page, sort ... and utm_source
  const locale = request.headers.get("accept-language")?.slice(0, 2) ?? "en";
  const courses = await getCourses(query as CourseQuery, locale);
  return Response.json(courses, { headers: { "Cache-Control": "public, s-maxage=300" } });
}`, "before"),
        p("Both tickets and the bad hit rate come from that one string, `courses:${query.category}`. It is too small and, at the same time, the URL the CDN sees is too big."),

        h2("2. Read the evidence"),
        p("The cache wrapper logs one line per lookup. Filtered for the React category, the morning looked like this:"),
        code("text", `
09:14:02.118 cache MISS key=courses:react  inputs={category:react, level:beginner, page:1} locale=vi  load=212ms
09:14:05.340 cache HIT  key=courses:react  inputs={category:react, level:advanced, page:1} locale=vi
09:14:09.877 cache HIT  key=courses:react  inputs={category:react, level:all, page:2} locale=en`, "server log, lib/cache.ts"),
        p("Read it line by line. The second request asked for **advanced** courses and got the entry filled by a **beginner** request. The third asked for page 2 in English and got page 1 in Vietnamese. The cache did exactly what it was told: it returned the value stored under the same key. The key simply did not contain `level`, `page` or the locale, and all three change the result."),
        p("The CDN in front of the route shows the opposite problem:"),
        code("text", `
GET /api/courses?category=react                                      x-cache: MISS
GET /api/courses?page=1&category=react                               x-cache: MISS
GET /api/courses?category=react&utm_source=newsletter&utm_campaign=w43   x-cache: MISS
GET /api/courses?category=react&fbclid=IwAR0x9...                    x-cache: MISS`, "CDN log, the same answer four times"),
        p("A CDN keys its entries by URL (plus any request headers named in `Vary`). These four URLs ask the API for the same list, but as strings they differ, so each one is a miss and a new entry. That is where the 4% hit rate and the 1,800 entries come from. And because the locale is read from `Accept-Language`, which is neither in the URL nor in a `Vary` header, the CDN can also hand the Vietnamese list to an English browser: ticket #5091's \"only sometimes\"."),
        callout("info", "Two different failures",
            "A key **missing** an input that changes the result is a correctness bug: users get wrong answers. A key **containing** inputs that do not change the result is a performance bug: the cache stores the same answer many times and rarely hits. The first one is worse, and it is the one that looks fine in a quick test."),

        h2("3. The core idea: a cache key is the list of inputs"),
        p("Think of the cached thing as a function: `result = load(inputs)`. A cache is only correct if two lookups with the same key would have produced the same result. So the key must be built from **every input that changes the result**, and should contain **nothing else**. For a data request on CodeDev the possible inputs are always the same few:"),
        bullets([
            "**The resource**: course list, course detail, leaderboard, dashboard...",
            "**Route params**: the slug in `/courses/[slug]`, the course id of a progress request.",
            "**Query params the API understands**: category, level, page, sort. Not `utm_source`, not `fbclid`.",
            "**The locale**, if titles and descriptions are translated. Not for a leaderboard of names and numbers.",
            "**The user**, if and only if the data belongs to one user.",
        ]),
        h3("Classify the data before you cache it"),
        p("The last input is the dangerous one, so decide it first, per resource, and write the decision down next to the resource:"),
        code("text", `
class              example on CodeDev                          server data cache          HTTP response
public             course list, course page, leaderboard       one entry per input set    public, max-age=0, s-maxage=<ttl>
per-user           dashboard, lesson progress, my courses      one entry per input set    private, no-cache
                                                               AND per user
private-no-store   billing details, email-change tokens        never cached               private, no-store`, "three classes"),
        p("Public data is the same for everyone who sends the same inputs, so it can be shared: by the server cache, by a CDN and by the browser. Per-user data may be cached on the server only under a key that contains the user, and the response must tell every shared cache to keep out (`private`). Private data that would hurt if it were ever served twice (payment details, one-time tokens, anything you would not want in a log) is not cached at all."),
        p("Adding the user id to **every** key, as suggested in the incident channel, does not make public data safer: it is already the same for everyone. It turns one catalog entry into one entry per learner, the hit rate drops to almost nothing, and the cache becomes a slower path to the database. Keep the user out of public keys, and keep public and personal data in separate requests (lesson 3.3 shows how to split a page that needs both)."),
        h3("Normalize, so equal requests build equal keys"),
        p("Users and links send the same request in many spellings. Build the key from a normalized form:"),
        bullets([
            "**Known params only.** Drop anything the API does not read: tracking params, cache busters, typos.",
            "**Fixed order.** Sort param names, so `?page=1&category=react` and `?category=react&page=1` meet.",
            "**Defaults filled in.** A missing `page` and `page=1` are the same request; so are a missing `sort` and the default sort. Either fill in defaults or drop them, but do the same for every request.",
            "**Canonical values.** Trim spaces and lower-case values the API treats case-insensitively. Map `vi-VN` to `vi`, and an unsupported locale to the one the API actually falls back to, because the result is that fallback.",
            "**Encode values.** If a value can contain your separators, encode it (`encodeURIComponent`): otherwise `category=react&level=advanced` sent as one value builds the same key as two real params.",
        ]),
        h3("The header must match the key"),
        p("Your server cache is not the only cache. The response also passes a CDN and the browser, which build their own keys from the URL and from `Vary`. So the Cache-Control header is part of the same decision:"),
        bullets([
            "`public, s-maxage=300` lets shared caches (the CDN) keep the response for 300 s. `max-age=0` next to it keeps browsers from holding their own copy, so a revalidation on the server reaches users quickly.",
            "`private` forbids shared caches from storing the response at all. `no-cache` lets the browser store it but revalidate before each use. `no-store` forbids storing it anywhere.",
            "If a request header changes the result (`Accept-Language`, a cookie), either move that input into the URL (`/vi/courses`) or name the header in `Vary`. Moving it into the URL is usually better: CDN support for `Vary` differs, and `Vary: Cookie` turns most CDNs into a pass-through. Check what yours does.",
        ]),
        h3("Where keys come from in Next.js"),
        p("Next.js builds many keys for you, which is convenient and is also how inputs go missing without anyone noticing. The rules depend on the version, so treat this as a map and check the Next.js caching docs for yours:"),
        bullets([
            "**`\"use cache\"`** (Next.js 16 with Cache Components enabled): the key is derived from the function and its serializable arguments. Request data such as `cookies()` cannot be read inside a cached scope, so you read the session outside and pass what you need as an argument, which puts it in the key.",
            "**`unstable_cache(fn, keyParts, options)`**: the key includes the arguments of `fn`, but a value the function captures from the outer scope is not part of it unless you add it to `keyParts`. A `userId` read from the session above the call is the classic leak.",
            "**`fetch` in a server component**: when it is cached (the default changed between versions), the entry is keyed by the URL and the request options. An input you send as a header rather than in the URL needs the same care as with a CDN.",
            "**Route handlers** send exactly the Cache-Control header you set, as in the incident. For pages, Next.js sets Cache-Control itself from how the route renders.",
        ]),
        h3("When not to cache"),
        p("A cache adds a second source of truth and a class of bugs (this lesson, and the next). Do not add one because a query \"might be slow\". Measure first: if the query takes 5 ms at your traffic, the safest key is no key. Data that changes on every request (a live quiz timer) or that must never be served twice (one-time tokens) does not belong in a cache at all."),

        challenge("chal_quiz_nrc_211"),

        h2("4. Worked example: one function decides the key and the header"),
        p("The fix keeps every caching decision for the catalog in one place, so the server key, the URL the CDN sees and the header cannot drift apart:"),
        code("typescript", `
// lib/catalog-cache.ts
const COURSE_QUERY_DEFAULTS = { category: "all", level: "all", page: "1", sort: "popular" } as const;
type CourseQuery = { -readonly [K in keyof typeof COURSE_QUERY_DEFAULTS]: string };
const LOCALES = ["en", "vi"];

export function normalizeCourseQuery(params: URLSearchParams): CourseQuery {
  const query = { ...COURSE_QUERY_DEFAULTS } as CourseQuery;
  for (const name of Object.keys(COURSE_QUERY_DEFAULTS) as (keyof CourseQuery)[]) {
    const value = params.get(name)?.trim().toLowerCase();   // get() returns the first value
    if (value) query[name] = value;                          // empty or missing: keep the default
  }
  return query;                                              // unknown params never get in
}

export function normalizeLocale(locale: string | undefined): string {
  const language = (locale ?? "").trim().toLowerCase().split("-")[0];
  return LOCALES.includes(language) ? language : "en";      // the API answers in English otherwise
}

export function courseListKey(query: CourseQuery, locale: string): string {
  const pairs = (Object.keys(query) as (keyof CourseQuery)[]).sort()
    .map((name) => \`\${name}=\${encodeURIComponent(query[name])}\`);
  return \`course-list?\${pairs.join("&")}|locale=\${locale}\`;
}

// app/[locale]/api/courses/route.ts - the locale is now part of the URL the CDN sees
export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const locale = normalizeLocale((await params).locale);
  const query = normalizeCourseQuery(new URL(request.url).searchParams);
  const courses = await cached(courseListKey(query, locale), 300, () => db.listCourses(query, locale));
  return Response.json(courses, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}`, "after"),
        p("Two details are easy to miss. First, the CDN still keys by the raw URL, so `?utm_source=newsletter` is still a separate CDN entry; the server cache absorbs it now, and if the CDN miss rate matters you configure the CDN to ignore those params or redirect to the canonical URL. Second, the dashboard does not go through this function at all: it has its own key with the user in it and a `private` header, because it is a different class of data."),

        h2("5. How to verify a cache key"),
        p("A key is a function, so test it like one. Two properties catch both kinds of bug:"),
        numbered([
            "**Equal requests, equal keys.** Take spellings of the same request (param order, defaults, case, tracking params) and assert they produce one key. This catches the hit-rate bug.",
            "**Each input changes the key.** Start from one request and change one input at a time: level, page, sort, locale, the user for per-user data. Assert the key changes every time the result would. This catches the correctness bug, the one in the tickets.",
        ]),
        code("typescript", `
test("every input that changes the course list changes its key", () => {
  const base = { category: "react", level: "advanced", page: "1", sort: "popular" };
  const key = (q: typeof base, locale = "vi") => courseListKey(q, locale);
  expect(key({ ...base, level: "beginner" })).not.toBe(key(base));
  expect(key({ ...base, page: "2" })).not.toBe(key(base));
  expect(key(base, "en")).not.toBe(key(base));
  const same = normalizeCourseQuery(new URLSearchParams("page=1&category=React&level=advanced&utm_source=x"));
  expect(key(same)).toBe(key(base));
});`, "catalog-cache.test.ts"),
        p("Then check the layers you do not control from the outside. Request the same URL twice with `curl -sI` and read `Cache-Control`, `Age` and the CDN's hit header (its name depends on the vendor, for example `x-cache`). Request it once with `Accept-Language: vi` and once with `en` and compare the bodies: if they are equal but should not be, an input is missing from the key. After the deploy, the cache dashboard should show the entry count fall to roughly the number of real input combinations and the hit rate rise."),

        h2("6. Common mistakes"),
        bullets([
            "**Keying by the obvious input only.** `courses:${category}` ignores level, page and locale. Spot it: the \"each input changes the key\" test, or two requests that differ in one filter returning the same body.",
            "**Keying by the raw URL or query string.** Every tracking param and param order becomes its own entry. Spot it: many entries per resource in the cache stats, and a hit rate far below what the traffic suggests.",
            "**Adding the user to public keys \"to be safe\".** It does not prevent a leak (public data has nothing to leak) and it multiplies entries by the number of users. Spot it: a `user=` part in the key of a resource whose result never depends on who asks.",
            "**Reading an input inside the cached function instead of passing it in.** A user id or locale read from the session or a header inside the closure is invisible to the key. Spot it: grep cached functions for `cookies()`, `headers()` or session reads, and for outer variables used inside `unstable_cache`.",
            "**A correct server key behind a wrong header.** The server cache is per user, but the response says `public`, so the CDN shares it anyway. Spot it: `curl -sI` the route; personal data must come back with `private` or `no-store`.",
        ]),

        h2("7. Practice: build the cache policy"),
        p("The challenge gives you the catalog of CodeDev data resources with their classification, route params, query defaults and whether they are translated. You write the one function that every data request goes through: it returns the server cache key (or no key) and the Cache-Control header, and it refuses requests that would cache personal data without a user. The test runner prints the key and header of each request and how many cache entries a batch of requests created."),
        challenge("chal_coding_nrc_212"),

        h2("8. Summary"),
        numbered([
            "A cache key is the list of inputs of the result: include every input that changes it (resource, params, known query params, locale, the user for per-user data) and normalize everything else away.",
            "Classify each resource as public, per-user or private before caching it: the user goes only into per-user keys, private data is not cached, and the Cache-Control header (public with s-maxage, private, no-store) must say the same thing to the CDN and the browser.",
            "Verify keys with two tests, equal requests give equal keys and each input changes the key, then check the real headers with curl and the hit rate after the deploy.",
        ]),

        h2("Sources"),
        bullets([
            "Next.js documentation: Caching and Revalidating - nextjs.org/docs/app/getting-started/caching-and-revalidating (check the version selector: the caching APIs differ between versions)",
            "RFC 9111, HTTP Caching: Cache-Control directives public, private, no-cache, no-store, s-maxage, and the Vary header",
            "MDN: Cache-Control and Vary - developer.mozilla.org/docs/Web/HTTP/Headers/Cache-Control",
        ]),
        callout("tip", "Self-practice (not graded): write the cache table for your app",
            "List the data requests of one app you work on. For each one write its class (public, per-user, private-no-store), the inputs that change the result, the inputs that do not, the server cache key you would build and the Cache-Control header. Then curl two of them and check that the headers you see match the table."),
    ],
});
