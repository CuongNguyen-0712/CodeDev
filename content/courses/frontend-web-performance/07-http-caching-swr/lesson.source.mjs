// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-fwp-3-2",
    title: "HTTP caching and stale-while-revalidate",
    slug: { _type: "slug", current: "http-caching-stale-while-revalidate" },
    description:
        "Rice Rocket revalidated its hashed bundles on every visit, waited minutes for menu edits to appear, and once let the CDN hand one customer's cart to another. Learn how browsers and CDNs decide to store, reuse and revalidate a response, what stale-while-revalidate buys, and how CDN-Cache-Control gives the CDN its own rules.",
    estimatedTime: 16,

    scenario: {
        role: "Frontend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The ordering app runs on Next.js behind a CDN. Lunch traffic sent most menu requests to the origin, returning visitors re-downloaded nothing but still waited for a round trip per bundle, and a CDN rule added for speed served cached carts across customers for 30 seconds.",
    },

    content: [
        h2("Situation"),
        code("text", `
$ curl -sI https://ricerocket.vn/_next/static/chunks/app-3f9a1c.js | grep -i cache
cache-control: public, max-age=0, must-revalidate          # 304 round trip on every visit
$ curl -sI https://ricerocket.vn/api/restaurants/42/menu | grep -i -E 'cache|age'
cache-control: public, max-age=300                          # browsers keep old prices for 5 min
x-cache: HIT
$ curl -sI -H 'Cookie: session=...' https://ricerocket.vn/api/cart | grep -i cache
cache-control: public, max-age=30                           # the CDN stores one customer's cart
x-cache: HIT`, "terminal"),

        h2("The core you need"),
        bullets([
            "**Two caches, different owners.** The browser cache belongs to one user; the CDN is shared by everyone. A shared cache keys responses by URL (plus `Vary`), so anything personal must stay out of it: `private` (browser only) or `no-store` (nowhere).",
            "**Freshness.** A stored response is fresh while its age is below `max-age` (browser) or `s-maxage` (shared caches, which prefer it over `max-age`). Fresh responses are reused without asking anyone.",
            "**`no-cache` is not \"don't cache\".** It means store, but validate before every reuse: the cache sends `If-None-Match` with the `ETag` and gets a tiny `304 Not Modified` while nothing changed. `no-store` is the one that forbids storing.",
            "**`stale-while-revalidate=N`** (RFC 5861): for N seconds after going stale, a cache may answer with the stored copy immediately and refresh it in the background, so no user waits for the origin while traffic flows.",
            "**`immutable`** tells browsers a fresh response will never change, so even a reload does not revalidate it. It is safe only for files whose URL changes with their content, like Next.js's hashed `/_next/static/` files.",
            "**`CDN-Cache-Control`** (RFC 9213, supported by Vercel, Cloudflare and Fastly) gives the CDN its own directives, so the CDN can keep a menu for 60 s while browsers still check every time.",
        ]),

        h2("Apply it in the project"),
        code("js", `
import { NextResponse } from "next/server";

export function middleware(request) {
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(cachingHeaders(request.nextUrl.pathname))) {
    response.headers.set(name, value);
  }
  return response;
}

function cachingHeaders(path) {
  if (path.startsWith("/_next/static/")) return { "Cache-Control": "public, max-age=31536000, immutable" };
  if (/^\\/api\\/restaurants\\/[^/]+\\/menu$/.test(path)) {
    return { "Cache-Control": "no-cache", "CDN-Cache-Control": "max-age=60, stale-while-revalidate=300" };
  }
  if (path === "/api/cart") return { "Cache-Control": "private, no-store" };
  if (path.startsWith("/restaurants/")) return { "Cache-Control": "no-cache" };
  return { "Cache-Control": "no-store" };
}`, "middleware.js"),
        callout("info", "Where the rule lives",
            "Next.js sets its own headers for static files and for cached routes, and a `headers()` entry in `next.config.js` is another place to set them. Keep one source of truth per route, and check the final response with `curl -I`, because a CDN rule or a framework default can override what you wrote."),

        h2("Verify"),
        code("bash", `
curl -sI https://ricerocket.vn/_next/static/chunks/app-3f9a1c.js | grep -i cache-control
# cache-control: public, max-age=31536000, immutable
curl -sI https://ricerocket.vn/api/restaurants/42/menu | grep -i -E 'cache-control|age|x-cache'
# cache-control: no-cache          (the CDN-Cache-Control header may be stripped before the browser)
# age: 74
# x-cache: STALE                   (header names differ per CDN; illustrative)
curl -sI -H 'Cookie: session=...' https://ricerocket.vn/api/cart | grep -i -E 'cache-control|x-cache'
# cache-control: private, no-store
# x-cache: MISS`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`immutable` on a file whose name does not change.** A logo at `/logo.png` with a one-year `max-age, immutable` cannot be updated for returning visitors. Only fingerprinted URLs get long lifetimes.",
            "**Personal data without `private`.** Any response decided by a cookie or an `Authorization` header can be stored by a shared cache if it is marked `public` with a lifetime. Grep the CDN logs for HITs on authenticated routes.",
            "**Expecting a purge to reach browsers.** Purging the CDN does nothing to copies already in browsers; that is why the menu is `no-cache` for browsers and only the CDN keeps it for 60 s.",
        ]),

        challenge("chal_quiz_fwp_171"),
        p("Now set the headers. The editor holds `cachingHeaders` with its rules missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the old configuration on purpose. Run plays timelines of requests from several customers through their browsers, the CDN and the origin."),
        challenge("chal_coding_fwp_172"),
    ],
});
