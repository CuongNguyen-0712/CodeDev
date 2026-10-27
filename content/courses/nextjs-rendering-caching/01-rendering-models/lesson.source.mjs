// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-1-1",
    title: "Static, ISR or dynamic: choosing how a page renders",
    slug: { _type: "slug", current: "static-isr-dynamic-rendering" },
    description:
        "The CodeDev course catalog was rendered on every request, and its time to first byte tripled under load, because the root layout read cookies() to pick a theme. Learn the three ways an App Router page can render (static, revalidated with ISR, dynamic), which reads make a whole route dynamic, how to choose per route from freshness, per-user data and build-time availability, and how to check the choice in the build output and the response headers.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "Release 2026.10.12 added a dark theme to https://app.codedev.test. The next Monday, during the start-of-semester rush, the catalog at /courses slowed down: the p95 time to first byte went from 140 ms to 430 ms and the database CPU doubled. The catalog page had `export const revalidate = 300` and had been served from the cache for months. Nobody touched it in that release. The only change near it was four lines in app/layout.tsx that read the theme from a cookie.",
    },

    content: [
        h2("1. The incident: a theme switch that made every page dynamic"),
        p("This is the ticket the on-call engineer opened on Monday morning:"),
        code("text", `
INC-0417  Catalog slow under load                                 Severity: high
Since:    release 2026.10.12 (dark theme)
Evidence: GET /courses   p95 TTFB  140 ms -> 430 ms at ~200 req/s
          Postgres CPU 35% -> 72%; query "published courses" now runs ~200 times/s
          (it used to run about once every 5 minutes)
Note:     app/courses/page.tsx unchanged since August (export const revalidate = 300)`, "incident ticket"),
        p("And this is the part of the release diff that touched the layout every page shares:"),
        code("tsx", `
// app/layout.tsx  (release 2026.10.12)
+import { cookies } from "next/headers";

-export default function RootLayout({ children }: { children: React.ReactNode }) {
-    return <html lang="en"><body>{children}</body></html>;
+export default async function RootLayout({ children }: { children: React.ReactNode }) {
+    const theme = (await cookies()).get("theme")?.value ?? "light";
+    return <html lang="en" data-theme={theme}><body>{children}</body></html>;
 }`, "PR #977"),
        p("The theme works. But the server can only read a cookie while it handles a request, so a layout that reads one cannot be rendered once and reused: its HTML depends on who is asking. Every page inside that layout inherits the problem, and the catalog's `revalidate = 300` stopped meaning anything. Each visit now ran the catalog query and rendered the grid from scratch."),
        p("Nobody chose to make the catalog dynamic. That is the lesson: in the App Router, how a page renders is decided by everything in its tree, and you have to check the decision, not assume it."),

        h2("2. Reproduce it and read the evidence"),
        p("Three pieces of evidence tell you how a route renders. The first is the build output. `next build` prints every route with a symbol in front of it:"),
        code("text", `
$ next build
Route (app)
┌ ƒ /
├ ƒ /about
├ ƒ /courses
├ ƒ /courses/[slug]
└ ƒ /dashboard

ƒ  (Dynamic)  server-rendered on demand`, "before the fix"),
        p("Every route is `ƒ`, even `/about`, which has no data at all. When a page you expected to be static shows up as `ƒ`, look for a request-time read in the page **or in any layout above it**. The legend can also show `○ (Static) prerendered as static content` and `● (SSG) prerendered as static HTML (uses generateStaticParams)`; the exact columns next to the routes differ between Next.js versions."),
        p("The second is the response headers. CodeDev runs `next start` behind a load balancer (`output: \"standalone\"`), and Next.js adds an `x-nextjs-cache` header to responses it serves from its own page cache:"),
        code("bash", `
# release 2026.10.05 (before the theme)
$ curl -sI https://app.codedev.test/courses | grep -i -E "x-nextjs-cache|cache-control"
x-nextjs-cache: HIT

# release 2026.10.12
$ curl -sI https://app.codedev.test/courses | grep -i -E "x-nextjs-cache|cache-control"
cache-control: private, no-cache, no-store, max-age=0, must-revalidate`, "terminal"),
        p("`HIT` means the HTML came from the cache. The `HIT` is gone after the release, and the `private, no-cache, no-store` header tells every CDN and browser on the way not to store the response, because it may be personal. The third piece is the database: the catalog query ran about 200 times per second, once per request. Three different tools, one conclusion."),

        h2("3. The core idea: three ways a page can render"),
        p("An App Router page is turned into HTML on the server in one of three ways. They differ in **when** the HTML is produced and **how many visitors share it**:"),
        bullets([
            "**Static.** The HTML is produced once, at build time (or on the first request), and every visitor gets the same copy until the next deploy. Fastest and cheapest: no rendering and no database query per visit. Right for pages that change only when you deploy: the about page, the terms, documentation.",
            "**Static with revalidation (ISR, Incremental Static Regeneration).** Static, plus a time window: `export const revalidate = 300` lets the cached HTML be at most 5 minutes old. When a request arrives after the window, Next.js still serves the cached copy and regenerates the page in the background; the following visitors get the new one. Right for public pages that change sometimes: the catalog, a course page, the weekly leaderboard.",
            "**Dynamic.** The HTML is produced for every request. Needed when the HTML depends on the request: the signed-in learner's dashboard, a search results page that reads `?q=`, anything that must be exact at the moment of the request. It costs a render (and usually a query) per visit.",
        ]),
        h3("What makes a route dynamic"),
        p("A route becomes dynamic when the page, or any layout or component rendered in it, uses a **request-time API**: `cookies()`, `headers()`, the `searchParams` prop of a page, or `connection()`. These only have a value while a request is being handled, so Next.js cannot render that tree ahead of time. One read anywhere in the tree is enough, which is why a cookie read in the root layout turned every route into `ƒ`."),
        bullets([
            "**`revalidate` does not override a dynamic read.** It describes how long a cached result may be reused; a route that reads cookies has no shared result to reuse.",
            "**Data access alone does not make a route dynamic.** A page that queries the database for published courses is rendered at build time (or at revalidation), and the query runs then, not per visit.",
            "**Whether a plain `fetch()` is cached has changed across versions.** In Next.js 13 and 14 it was cached by default; since 15 it is not. Check the docs for your version before you rely on the default, and prefer to state what you want explicitly.",
        ]),
        callout("info", "Next.js 16 and Cache Components",
            "Next.js 16 adds an opt-in model, Cache Components (`cacheComponents: true` in next.config, with the `\"use cache\"` directive, `cacheLife` and `cacheTag`). In that model a request-time read wrapped in `<Suspense>` no longer forces the whole page to render per request: the static shell is cached and the dynamic part streams in. Route segment options such as `export const revalidate` work differently there. This course uses the default model (which CodeDev runs); check the Next.js docs for your version before mixing the two."),
        h3("When not to choose each one"),
        bullets([
            "**Not static** when the content changes without a deploy (an instructor edits a course) or depends on the visitor.",
            "**Not ISR** when a stale answer is wrong rather than slightly old: the price at checkout, whether a learner is enrolled, a quiz result. Make those dynamic, or keep the page cached and revalidate it on demand right after the change (lesson 3.1).",
            "**Not dynamic** for a page that is the same for everyone. Dynamic is not wrong, it is a cost per request; pay it only for the routes whose HTML really depends on the request.",
        ]),
        challenge("chal_quiz_nrc_111"),

        h2("4. Deciding per route"),
        p("Ask the same questions for every route, in an order where the strongest constraint wins:"),
        numbered([
            "**Does the HTML show the signed-in learner's own data?** Then it is dynamic. A cache shared by all visitors must never hold one learner's progress (module 2 is about exactly that leak).",
            "**Does the route read cookies, headers or searchParams?** Then it is dynamic, whatever else it says. If the read is not really needed on the server, move it (section 5) and ask again.",
            "**How old may the HTML be?** 0 seconds means dynamic. Never older than the last deploy means static. Anything in between is ISR with that many seconds.",
            "**Can the pages be produced at build time?** Only if the data source is reachable during `next build` and the number of pages keeps the build reasonable. Otherwise the same strategy still applies, but each page is rendered on its first request and cached from then on.",
        ]),
        p("Applied to CodeDev, after the fix:"),
        code("text", `
/about              same for everyone, changes with a deploy           -> static
/courses            public, may be 5 minutes old                       -> ISR, revalidate 300
/courses/[slug]     400 public pages, may be 1 hour old                -> ISR, revalidate 3600
/courses/search     reads searchParams (?q=react)                      -> dynamic
/dashboard          the signed-in learner's progress                   -> dynamic`, "rendering plan"),
        callout("tip", "SEO is not a reason to render on every request",
            "Search engines need complete HTML in the response. Static, ISR and dynamic pages all send it; only rendering in the browser (an empty page filled by client-side fetches) hides content from crawlers. A course page that is cached for an hour is as indexable as one rendered per request, and it answers faster."),

        h2("5. Worked example: take the cookie out of the layout"),
        p("The theme is a per-visitor detail that the browser already knows. Read it there. The root layout goes back to being the same for everyone, and a tiny inline script sets the theme before the first paint so that dark-mode users do not see a white flash:"),
        code("tsx", `
// app/layout.tsx - no next/headers import, so the layout is the same for every visitor
const THEME_SCRIPT = \`try {
  var m = document.cookie.match(/(?:^|; )theme=(dark|light)/);
  document.documentElement.dataset.theme = m ? m[1] : "light";
} catch (e) {}\`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        // the script changes data-theme before React hydrates; this silences that one attribute
        <html lang="en" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
            </head>
            <body>{children}</body>
        </html>
    );
}`, "app/layout.tsx"),
        code("tsx", `
// components/ThemeToggle.tsx - the only code that writes the cookie, in the browser
"use client";

export function ThemeToggle() {
    function toggle() {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        document.cookie = \`theme=\${next}; path=/; max-age=31536000; samesite=lax\`;
    }
    return <button type="button" onClick={toggle}>Toggle theme</button>;
}`, "components/ThemeToggle.tsx"),
        p("Even simpler, if the product agrees: follow the operating system with a CSS `@media (prefers-color-scheme: dark)` rule and store nothing at all. Choose the simplest option that meets the requirement."),
        p("With the layout static again, the catalog's own settings decide. It shows public data that may be five minutes old, so it stays ISR. Course pages are the same idea with a parameter:"),
        code("tsx", `
// app/courses/page.tsx
export const revalidate = 300;        // the HTML may be at most 5 minutes old

export default async function CatalogPage() {
    const courses = await getPublishedCourses();      // runs at build and at each regeneration
    return <CourseGrid courses={courses} />;
}

// app/courses/[slug]/page.tsx
export const revalidate = 3600;

export async function generateStaticParams() {
    return (await getPublishedCourseSlugs()).map((slug) => ({ slug }));   // 400 pages at build
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const course = await getCourseBySlug(slug);
    if (!course) notFound();
    return <CourseDetails course={course} />;
}`, "app/courses"),
        p("A course published after the deploy is not in the list from `generateStaticParams`. By default it is rendered on its first request and then cached like the others (lesson 4.1 covers `dynamicParams`). That is also the answer when the data source is not reachable from the build machine, or when there are too many pages to build in a reasonable time."),
        h3("Make the expectation fail loudly"),
        p("A comment saying \"this page is ISR\" did not survive the theme release. A setting can. In the default model, `export const dynamic = \"error\"` tells Next.js that the route must be rendered statically, and the build fails if anything in the tree uses a request-time API, naming the API. Adding it to the catalog would have stopped PR #977 in CI instead of in production. (Route segment options behave differently with Cache Components; check the docs for your version.)"),
        code("tsx", `
// app/courses/page.tsx
export const revalidate = 300;
export const dynamic = "error";   // fail the build if this route ever needs a request to render`, "app/courses/page.tsx"),

        h2("6. The exercise"),
        p("Turn the questions from section 4 into a function. The CodeDev team runs it over the traits of every route before a release and compares the answer with the build output. The starter states the rules exactly, including what counts as invalid traits."),
        challenge("chal_coding_nrc_112"),

        h2("7. How to verify"),
        bullets([
            "**The build output.** After `next build`, compare each route's symbol with your plan. `ƒ` on a route you planned as static or ISR means a request-time read somewhere in its tree. Keep this list in the pull request description for releases that touch layouts.",
            "**The response headers.** `curl -sI` the route twice. A cached route answers `x-nextjs-cache: HIT` (or `STALE` right after the window, while it regenerates). A dynamic one has no such header and sends `private, no-cache, no-store`. Behind a CDN, read the CDN's own cache header as well.",
            "**A build-time guard.** `export const dynamic = \"error\"` on the routes that must stay cached turns the incident into a failing build.",
            "**Load and the database.** Under a load test (k6 reports time to first byte as `http_req_waiting`), a cached route's p95 should barely move with the number of requests, and the catalog query should run about once per revalidation window, not once per request.",
        ]),

        h2("8. Common mistakes and how to spot them"),
        bullets([
            "**A request-time read in a shared layout.** One `cookies()` or `headers()` call in `app/layout.tsx` makes every route dynamic. Spot it in the build output (everything is `ƒ`, even pages with no data) and with `grep -rn \"next/headers\" app/`.",
            "**Trusting `revalidate` alone.** It is a maximum age for a cached result, not an order to cache. Spot it by checking the build symbol and the `x-nextjs-cache` header of every route that exports it.",
            "**Silencing the read with `force-static`.** `export const dynamic = \"force-static\"` makes `cookies()` and `headers()` return empty values instead of making the route dynamic, so the theme code always sees \"no cookie\" and every visitor gets light mode. Spot it by searching for `force-static` next to request-time reads; move the read instead.",
            "**ISR for data that must be exact.** A checkout price or an enrollment button cached for an hour is wrong for an hour. Spot it by asking \"what happens if this is 5 minutes old?\" for every cached route; if the answer is a support ticket, it needs dynamic rendering or on-demand revalidation.",
            "**Making a public page dynamic \"for SEO\".** Crawlers read cached HTML just as well. Spot it in the rendering plan: a public route marked dynamic without a request-time read or per-user data.",
        ]),

        h2("9. Summary"),
        numbered([
            "Static, ISR and dynamic differ in when the HTML is produced and how many visitors share it; choose per route from per-user data, request-time reads, freshness and build-time availability, in that order.",
            "One `cookies()`, `headers()` or `searchParams` read anywhere in a route's tree, including a shared layout, makes the route dynamic, and `revalidate` cannot cache it.",
            "Verify the choice instead of assuming it: the build symbols, the `x-nextjs-cache` header, `dynamic = \"error\"` as a guard, and query counts under load.",
        ]),

        h2("Sources"),
        bullets([
            "Next.js docs, Caching and Revalidating - nextjs.org/docs/app/getting-started/caching-and-revalidating",
            "Next.js docs, Route Segment Config (revalidate, dynamic) and the cookies, headers and connection functions - nextjs.org/docs/app/api-reference",
            "Next.js docs, Incremental Static Regeneration - nextjs.org/docs/app/guides/incremental-static-regeneration",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run next build on a Next.js app you work on and write its rendering plan next to the build output: each route, the symbol you see, the strategy you want and why. For every route where the two disagree, find the read that decides it (grep for next/headers, searchParams and connection) and note whether it belongs on the server at all."),
    ],
});
