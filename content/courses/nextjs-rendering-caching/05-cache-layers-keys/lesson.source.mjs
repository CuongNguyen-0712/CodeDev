// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nrc-2-1",
    title: "Map the cache layers and build a safe cache key",
    slug: { _type: "slug", current: "map-the-cache-layers-and-build-a-safe-cache-key" },
    description:
        "The CodeDev catalog cache holds 40,000 entries for a page with a few hundred real variants, and a teammate wants to cache learner progress under the course slug only. Learn the cache layers a request passes in a Next.js app - browser, CDN, Full Route Cache, Data Cache, request memoization and React cache() - what each one keys on and how long it lives, and the rule for a safe key: every input that changes the response, and nothing else.",
    estimatedTime: 30,

    scenario: {
        role: "Full-stack developer, CodeDev web team",
        problem:
            "Two cache problems arrived in the same week. The catalog cache behind /courses has grown to about 40,000 entries and almost never hits, although the catalog only has a few hundred real combinations of search, level, sort and page. In the same sprint, a teammate opened a pull request that caches getProgress(userId, slug) under the key progress:<slug> to make /courses/[slug] faster. You have to explain both problems with the same rule, and write the key function the team will use from now on.",
    },

    content: [
        h2("1. The incident: too many keys, and too few"),
        p("CodeDev wraps its server-side caching in a small helper that logs one `[cache]` line per lookup. These lines are the app's own log, not Next.js output. Here is the catalog helper and a few lines from Monday morning, right after the marketing newsletter went out:"),
        code("typescript", `
// lib/catalog.ts (before)
export async function getCatalogPage(searchParams: Record<string, string>) {
    const key = "catalog:" + new URLSearchParams(searchParams).toString();
    return cached(key, { revalidateSeconds: 300 }, () => queryCatalog(searchParams));
}`, "lib/catalog.ts"),
        code("text", `
[cache] MISS catalog:search=react&utm_source=newsletter&utm_campaign=oct
[cache] MISS catalog:utm_source=newsletter&search=react&utm_campaign=oct
[cache] MISS catalog:search=react&fbclid=IwAR2x9
[cache] MISS catalog:search=react&level=beginner&gclid=Cj0KCQ
[cache] MISS catalog:level=beginner&search=react
[cache] stats entries=40214 hitRate=0.03`, "app log"),
        p("Every line is the same catalog page, yet every line is a new key. The key is the raw query string, so tracking parameters (`utm_*`, `fbclid`, `gclid`) and the order in which the link happened to write the parameters both create new entries. The cache stores the same page thousands of times, hits 3% of the time, and still sends almost every request to the database."),
        p("The pull request has the opposite problem:"),
        code("typescript", `
// lib/progress.ts (proposed)
export async function getCourseProgress(slug: string) {
    const session = await getSession();
    return cached(\`progress:\${slug}\`, { revalidateSeconds: 60 }, () =>
        getProgress(session.userId, slug),
    );
}`, "lib/progress.ts"),
        p("The response depends on two inputs, the learner and the course, but the key only names one. The first learner who opens `/courses/react-basics` fills `progress:react-basics`, and for the next minute every other learner sees that learner's progress. The catalog key has inputs that do not change the response; the progress key misses an input that does. Both are the same mistake seen from two sides."),

        h2("2. The layers a request passes"),
        p("Before you can choose a key, you need to know which cache you are talking about. A request for a CodeDev page can be answered by any of these, in this order:"),
        numbered([
            "**Browser HTTP cache** - on the learner's device, for that browser only. Keyed on the method and the full URL (plus any request headers named in `Vary`). Lives as long as `Cache-Control: max-age` allows. Next.js also keeps a client-side Router Cache of visited pages in memory; it is per tab, so it cannot leak data between users.",
            "**CDN** - in front of the app, shared by every visitor. Most CDNs key on the URL including the query string unless you configure otherwise. Lives for `s-maxage` or until you purge it. A personal page stored here is served to strangers.",
            "**Full Route Cache** - on the Next.js server: the rendered HTML and RSC payload of a static route, keyed on the route path. Filled at build time or on revalidation, and dropped on the next deploy. Dynamic routes (those that read cookies, headers or search params) skip it.",
            "**Data Cache** - on the Next.js server, shared across requests and users. A `fetch` with `next: { revalidate }` or `cache: \"force-cache\"` is keyed on the URL and the request options; `unstable_cache(fn, keyParts, options)` is keyed on the key parts and the arguments you pass to the cached function. Lives until its revalidate time or an on-demand revalidation (lessons 6 and 7).",
            "**Request memoization** - within one server request only. Identical `fetch` GET calls during one render are made once, and a function wrapped in React `cache()` runs once per distinct argument list. When the request ends, the memo is gone.",
        ]),
        image("cache-layers-map", {
            alt: "Five boxes from left to right, the order a request passes them. 1 Browser cache: on the learner's device, keyed on method and full URL plus Vary headers, lives for Cache-Control max-age. 2 CDN: shared by every visitor, keyed on the URL with the query string by default, lives for s-maxage or until purged. 3 Full Route Cache: Next.js server, shared, static routes, keyed on the route path, lives until revalidation or the next deploy. 4 Data Cache: Next.js server, shared across requests, keyed on fetch URL and options or on key parts and arguments, lives until a revalidate time or a tag. 5 Request memo: fetch dedupe and React cache(), one request only, keyed on function and arguments. Below, a red box shows three catalog URLs that differ only in tracking parameters and order producing three entries for one page; a green box shows keys built from allowed inputs, public keys without a user id, personal keys with one, and no cache when the user is unknown.",
            caption: "The layers differ in who shares them and how long they live. The shared ones (CDN, Full Route Cache, Data Cache) are where a wrong key turns into a data leak.",
        }),
        callout("info", "Tested with Next.js 15.x (needs verification on your version)",
            "The layer names and defaults above follow the Next.js 15 App Router: fetch is not cached unless you opt in, and cookies() or headers() make a route dynamic. Next.js 16 adds Cache Components (\"use cache\", cacheLife, cacheTag), which build the key for you from the function and its inputs. The rule in the next section is the same in every version; only the API that applies it changes."),

        h2("3. The rule for a safe key"),
        p("A cache key answers one question: **is this request asking for exactly the same response as one I already stored?** So the key must contain every input that changes the response, and nothing else."),
        bullets([
            "**Too little in the key** - two different responses share one entry. For public data that shows the wrong page (English to a Vietnamese visitor). For personal data it is a data leak: learner B sees learner A's progress.",
            "**Too much in the key** - one response is stored under many keys. The hit rate collapses, memory fills up, and the origin gets nearly every request anyway. This is the 40,000-entry catalog.",
        ]),
        h3("Normalize the inputs"),
        bullets([
            "**Allow-list per resource.** The catalog depends on `search`, `level`, `sort` and `page`. Everything else - `utm_source`, `fbclid`, a `ref` someone added to a footer link - is left out. An allow-list beats a deny-list of known tracking names, because new tracking parameters appear all the time.",
            "**One spelling per value.** Sort parameter names, sort and de-duplicate multi-value parameters (`?level=intermediate&level=beginner`), and treat an empty value like a missing one, so equivalent URLs build equal keys.",
            "**Encode values.** If a key is built by joining `name=value` pairs with `&`, a search for `beginner&search=react` must not produce the same text as two separate parameters. Encoding each name and value (`encodeURIComponent`) makes the separators unambiguous.",
            "**Do not forget invisible inputs.** The locale from a cookie or `Accept-Language`, a feature flag, an A/B bucket: if it changes the HTML, it belongs in the key (for HTTP caches, in `Vary`).",
        ]),
        h3("Public or personal: decide by the kind of data"),
        bullets([
            "**Public data** (the catalog, a course syllabus, the leaderboard) is the same for every visitor. Its key never contains a user id - not even when the visitor is signed in. Otherwise each signed-in learner gets a private copy of a public page, and the cache shares nothing.",
            "**Personal data** (progress, the dashboard, enrollment state) differs per learner. If it is cached at all, the user id is part of the key, every time.",
            "**Personal data for an unknown user is not cached.** When the session is missing or failed to load, do not fall back to a key like `user=null` or `user=anonymous`: every visitor in that state would share one entry. Skip the cache and render without it.",
        ]),
        p("And sometimes the right key is no key. A personal value that is cheap to compute, read once per page, or must always be current (a points balance right after a purchase) gains little from a shared cache and carries all of its risk. Lesson 8 goes further into keeping personal data out of the shared layers."),
        p("Check the two ideas that trip people up most: what actually ends up in a key, and how long each layer remembers."),
        challenge("chal_quiz_nrc_211"),

        h2("4. Worked example: the catalog and the progress card"),
        p("For the catalog, keep only the inputs that change the page, in a fixed order, and pass them to the cached function as arguments so they become part of the key. This example uses the Next.js 15 `unstable_cache` API:"),
        code("typescript", `
// lib/catalog.ts (after) - Next.js 15
import { unstable_cache } from "next/cache";

const CATALOG_PARAMS = ["level", "page", "search", "sort"] as const;

export function catalogInputs(searchParams: Record<string, string | string[] | undefined>) {
    const inputs: Record<string, string> = {};
    for (const name of CATALOG_PARAMS) {           // fixed order, allowed names only
        const value = searchParams[name];
        if (typeof value === "string" && value !== "") inputs[name] = value;
    }
    return inputs;                                  // utm_*, fbclid, gclid never get here
}

export const getCatalogPage = unstable_cache(
    async (locale: string, inputs: Record<string, string>) => queryCatalog(locale, inputs),
    ["catalog"],                                    // the arguments are added to the key
    { revalidate: 300, tags: ["courses"] },
);

// app/courses/page.tsx
const locale = await getLocale();                   // CodeDev helper: the locale cookie
const page = await getCatalogPage(locale, catalogInputs(await searchParams));`, "lib/catalog.ts"),
        p("For progress, the safest fix is not a better shared key but no shared cache: read it per request, after the session is known, and let React `cache()` remove duplicate calls within that one request:"),
        code("typescript", `
// lib/progress.ts (after)
import { cache } from "react";

export const getCourseProgress = cache(async (slug: string) => {
    const session = await getSession();
    if (!session) return null;                      // unknown user: nothing personal to show
    return getProgress(session.userId, slug);       // per request, never shared
});`, "lib/progress.ts"),
        p("The CDN needs the same rule. Configure its cache key to ignore tracking parameters (most CDNs can include or exclude query parameters by name), and never let it store a response that contains personal data."),
        p("Now write the key function CodeDev's cache helper will use for every resource. The resource table says which route params and query parameters each resource depends on and whether it is public or per user; your function turns a request into a key, decides when not to cache, and rejects requests it cannot key safely. The challenge gives the exact format."),
        code("typescript", `
cacheKey({ resource: "courses:list", params: {}, query: { search: "react", utm_source: "mail" },
           userId: "u_1042", locale: "en" });
// -> "courses:list|en|public|..."   which parts survive, and in what order?`),
        challenge("chal_coding_nrc_212"),

        h2("5. How to verify a key"),
        numbered([
            "**Count distinct keys, not requests.** Group the `[cache]` lines by key for an hour of traffic. For the catalog, the number of distinct keys should be close to the number of real combinations of search, level, sort and page that people used, and the hit rate should rise once the fix is live.",
            "**Grep the keys.** No key of a public resource may contain `user=` or a tracking parameter; every key of a personal resource must contain `user=`. A key that contains `user=null` or `user=undefined` is a bug.",
            "**Test the key function directly.** Two URLs that differ only in `utm_source` or parameter order must produce equal keys; two learners must produce different progress keys; a missing session must produce no key.",
            "**Two-account test.** Sign in as learner A in one browser and learner B in a private window, open the same course, and compare the progress card. Do it after A has loaded the page, so a shared entry would already exist.",
            "**Read the CDN's cache status header** (its name depends on the CDN vendor) for two URLs that differ only in a tracking parameter: the second one should be a hit.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**The raw URL as the key.** Detect it: the number of entries grows with traffic, not with content, and keys contain `utm_` or `fbclid`.",
            "**A value used inside the cached function but missing from the key** - a user id or locale captured from the surrounding scope. Detect it: look for cached callbacks that read `session`, `cookies()` or `headers()` from outside their arguments, and run the two-account test.",
            "**A user id in the key of public data.** It is safe but useless: every signed-in learner gets a private copy. Detect it: the hit rate for signed-in visitors is near zero, and public keys contain `user=`.",
            "**A placeholder user for personal data** (`user=null`, `user=anonymous`, `user=0`). Every visitor without a session shares one entry. Detect it: such keys in the log, or one entry with a very high hit count on a personal resource.",
            "**Deny-listing tracking parameters instead of allow-listing inputs.** The next campaign uses `mc_cid` or `ref` and the cache fragments again. Detect it: new parameter names showing up in keys after a marketing send.",
        ]),

        h2("7. Checklist"),
        bullets([
            "You know which layer you are configuring: browser, CDN, Full Route Cache, Data Cache or request memoization, and who shares it.",
            "Each cached resource has an allow-list of the inputs that change its response; everything else is left out of the key.",
            "Names and multi-values are sorted, empty values ignored, and values encoded, so equivalent requests build equal keys and different ones cannot collide.",
            "Public keys never contain a user id; personal keys always do; personal data for an unknown user is not cached.",
            "Every value the cached function depends on reaches it as an argument (or key part), not through a closure.",
            "The `[cache]` log shows keys, so you can count them and grep them.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Take three cached functions or CDN rules in a project you work on. For each one, list every input that can change the response (path, query, cookies, headers, locale, user) and compare the list with what the key actually contains. Mark each difference as \"fragments the cache\" or \"can serve the wrong response\"."),

        h2("Sources"),
        bullets([
            "Next.js documentation: Caching in Next.js (App Router guide: Request Memoization, Data Cache, Full Route Cache, Router Cache) and the unstable_cache API reference.",
            "React documentation: cache (React Server Components API reference).",
            "RFC 9111 HTTP Caching, section 2 (Overview of Cache Operation, the primary cache key) and section 4.1 (Calculating Cache Keys with the Vary Header Field).",
        ]),
    ],
});
