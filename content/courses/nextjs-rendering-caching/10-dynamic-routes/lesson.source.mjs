// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-4-1",
    title: "Dynamic routes, params & generateStaticParams",
    slug: { _type: "slug", current: "dynamic-routes-params-generate-static-params" },
    description:
        "A release made the production build take 40 minutes because generateStaticParams returned all 12,000 lesson pages, and every page fetched its data twice. Learn how dynamic segments and params work, why params is a Promise in recent versions, how to prerender only the popular course pages, what dynamicParams does with a slug that was not generated at build, why a missing course must call notFound() instead of rendering an empty page, and what generateMetadata costs.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "On Monday the deploy of https://app.codedev.test failed twice with \"CI job exceeded the 30 minute limit\". The third attempt, run by hand, finished after 41 minutes. The build log shows \"Generating static pages (12,214/12,214)\", against 220 pages a week earlier. A pull request merged on Friday added generateStaticParams to the lesson page app/courses/[slug]/lessons/[lessonSlug]/page.tsx and returned every published lesson, about 12,000. The API team also reports 24,400 GET /v1/lessons/:id requests from the build runner in 41 minutes, 412 of them answered with 429 Too Many Requests, and asks why each lesson was fetched twice.",
    },

    content: [
        h2("1. The incident: a build that prerendered the whole catalog"),
        p("The lesson page used to render on demand. The pull request wanted lesson pages to load faster, so it prerendered them all at build time:"),
        code("tsx", `
// app/courses/[slug]/lessons/[lessonSlug]/page.tsx - the version that shipped
import { api } from "@/lib/api";   // a small HTTP client around node:https, not fetch()

export async function generateStaticParams() {
    const lessons = await api.get("/v1/lessons?status=published&limit=all");   // ~12,000 rows
    return lessons.map((l: { courseSlug: string; slug: string }) => ({
        slug: l.courseSlug,
        lessonSlug: l.slug,
    }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; lessonSlug: string }> }) {
    const { slug, lessonSlug } = await params;
    const lesson = await api.get(\`/v1/courses/\${slug}/lessons/\${lessonSlug}\`);
    return { title: \`\${lesson.title} | CodeDev\` };
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonSlug: string }> }) {
    const { slug, lessonSlug } = await params;
    const lesson = await api.get(\`/v1/courses/\${slug}/lessons/\${lessonSlug}\`);
    return <LessonView lesson={lesson} />;
}`, "page.tsx (shipped)"),
        p("Nothing in this file is wrong in isolation. Together it asks the build to render 12,000 pages, each one making two identical API calls, before the deploy can finish. Most of those pages are opened a few times a month; some are never opened at all before the next deploy throws them away and renders them again."),

        h2("2. Reproduce it and read the evidence"),
        p("Run the production build locally against the staging API and time it. The build prints progress while it prerenders, and a route table when it ends:"),
        code("bash", `
$ time npm run build
   Creating an optimized production build ...
   Compiled successfully in 51s
   Generating static pages (1,412/12,214)
   ...
   Generating static pages (12,214/12,214)

Route (app)
...
├ ● /courses/[slug]/lessons/[lessonSlug]
│ ├ /courses/react-basics/lessons/what-is-jsx
│ ├ /courses/react-basics/lessons/props
│ └ [+11,997 more paths]
...
●  (SSG)  prerendered as static HTML (uses generateStaticParams)

real    41m12s`, "terminal"),
        p("Three numbers matter. The page count (`12,214`) tells you how many pages the build rendered. The route table marks the lesson route as prerendered with `generateStaticParams` and lists how many paths it produced. The total time is the cost you pay on **every** deploy, including the urgent one that fixes a production bug. The exact symbols and wording of the route table change between Next.js versions: read the legend the build prints under the table rather than memorising symbols."),
        p("The API side confirms the second problem. Counting requests from the build runner by path shows two calls per lesson:"),
        code("text", `
02:10-02:51  source=build-runner
GET /v1/lessons?status=published&limit=all        1
GET /v1/courses/:slug/lessons/:lessonSlug         24,422   (12,211 distinct paths)
  -> 429 Too Many Requests                          412`, "API request log, grouped"),
        p("`generateMetadata` and the page each called `api.get()` for the same lesson. Next.js memoizes `fetch` calls with the same URL and options during one render, but this client is not `fetch`, so nothing was shared. The 412 requests that hit the rate limiter failed the build of that page or, with a client that swallows errors, would have been saved as an empty static page."),

        h2("3. Dynamic segments and params"),
        p("A folder name in square brackets is a **dynamic segment**: `app/courses/[slug]/page.tsx` serves `/courses/react-basics`, `/courses/node-streams` and any other value. The value arrives in the `params` prop of the page, layout and `generateMetadata`, with one key per segment in the path:"),
        bullets([
            "`app/courses/[slug]/lessons/[lessonSlug]/page.tsx` receives `{ slug, lessonSlug }`.",
            "`app/docs/[...path]/page.tsx` is a **catch-all**: `/docs/a/b/c` gives `{ path: [\"a\", \"b\", \"c\"] }`.",
            "`app/docs/[[...path]]/page.tsx` is **optional catch-all**: it also matches `/docs` itself, with `path` undefined.",
            "Values come from the URL, so treat them as untrusted input: validate the shape before you put them in a query, and never assume the slug exists.",
        ]),
        callout("info", "params is a Promise in recent versions",
            "In Next.js 15 and later, params (and searchParams) are passed as a Promise, so you write const { slug } = await params. Earlier versions passed a plain object, and some versions allowed both during a migration period. The examples in this course use the Promise form, which is what this repository's Next.js 16 pages use. If your types or your version differ, check the Next.js docs for your version before copying code."),
        p("Reading `params` does not by itself make a route dynamic. A route with a dynamic segment can still be prerendered for the values you list in `generateStaticParams`, and rendered once and cached for the others. That choice is the subject of this lesson."),

        h2("4. The core idea: prerender what is hot, render the rest on demand"),
        p("Prerendering at build moves work from the first visitor to the build. That trade is worth it only for pages that many people open soon after the deploy. For the CodeDev catalog, traffic is very uneven:"),
        code("text", `
Last 30 days, page views by course page
top 50 courses       71% of views
next 150 courses     19% of views
remaining 410        10% of views

Lesson pages: 12,000 published, median 3 views per page per week`, "analytics"),
        p("Prerendering the top 200 course pages covers 90% of course views and takes seconds. Prerendering 12,000 lesson pages covers a long tail that a request-time render with caching handles just as well: the first visitor of a rarely read lesson waits for one render, and the next visitors get the cached result."),
        h3("generateStaticParams: a list of values, not a requirement"),
        p("`generateStaticParams` returns the param values to prerender at build. It is not a whitelist by default: it only decides **which pages are ready before the first request**. What happens to the other values is decided by `dynamicParams`:"),
        bullets([
            "**`dynamicParams = true` (the default).** A slug that was not returned is rendered on its first request. If the route is otherwise static (no per-request data such as cookies or headers), the result is cached and served like a prerendered page afterwards.",
            "**`dynamicParams = false`.** A slug that was not returned answers 404. Use it only when the list is closed and known at build, for example the 8 legal pages. For a catalog where instructors publish courses every day, it means a new course is a 404 until the next deploy.",
        ]),
        callout("warning", "Check how your version and config treat these options",
            "dynamicParams is a route segment config option (export const dynamicParams = true). Next.js 16 also offers Cache Components, an opt-in mode in which several route segment options are replaced by the \"use cache\" directive and generateStaticParams must return at least one value. Read the route segment config and generateStaticParams pages of the Next.js docs for your version before you rely on a default."),
        h3("When not to use generateStaticParams"),
        bullets([
            "**Pages that depend on the visitor.** A dashboard with personal progress is not a candidate: it renders per request, whatever params it has (lesson 9).",
            "**Huge, rarely visited sets.** Thousands of pages with a few views each cost build time on every deploy and gain almost nothing.",
            "**Data the build cannot reach.** If the build runner cannot call the production API, the build either fails or bakes in staging data.",
        ]),
        h3("notFound(): a missing course is a 404, not an empty page"),
        p("A slug that matches no course is the most common dynamic-route bug. Returning `null` or an empty layout renders a page with status `200`, which search engines index and caches store as a valid answer. Call `notFound()` from `next/navigation` instead: it stops rendering, shows the nearest `not-found.tsx` and answers `404`. It throws internally, so code after it does not run and TypeScript knows the value is not `null` afterwards."),
        h3("generateMetadata costs a render too"),
        p("`generateMetadata` runs whenever the page renders: at build for each prerendered page, and at request time for the others. If it loads the same data as the page through a client that is not memoized, every render does the work twice, which is exactly the 24,422 requests above. Wrap the loader in React's `cache()` so that both calls in the same render share one result, or use `fetch`, which Next.js memoizes per render for identical requests. Some recent versions also stream metadata after the first bytes of a dynamic page; check the docs for your version if the timing matters to you."),

        challenge("chal_quiz_nrc_411"),

        h2("5. The fix"),
        p("The course page prerenders the 200 most viewed courses and renders the others on first request. The lesson page drops `generateStaticParams` and relies on caching after the first visit. Both share one memoized loader with `generateMetadata`:"),
        code("typescript", `
// lib/courses.ts
import { cache } from "react";

export type Course = { slug: string; title: string; summary: string };

// One call per render, shared by generateMetadata and the page.
export const getCourse = cache(async (slug: string): Promise<Course | null> => {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;          // untrusted URL input
    const res = await fetch(\`https://api.codedev.test/v1/courses/\${slug}\`, {
        next: { revalidate: 3600, tags: [\`course:\${slug}\`] },   // lesson 7: revalidate by tag after an edit
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(\`course \${slug}: HTTP \${res.status}\`);   // error.tsx, not a cached empty page
    return res.json();
});

export async function getPopularCourseSlugs(limit: number): Promise<string[]> {
    const res = await fetch(\`https://api.codedev.test/v1/courses/popular?limit=\${limit}\`);
    if (!res.ok) throw new Error(\`popular courses: HTTP \${res.status}\`);
    return (await res.json()).map((c: { slug: string }) => c.slug);
}`, "lib/courses.ts"),
        code("tsx", `
// app/courses/[slug]/page.tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCourse, getPopularCourseSlugs } from "@/lib/courses";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = true;   // the default, written down so nobody flips it by accident

export async function generateStaticParams() {
    const slugs = await getPopularCourseSlugs(200);   // 90% of course views, about 20 s of build
    return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const course = await getCourse(slug);
    return course ? { title: \`\${course.title} | CodeDev\`, description: course.summary } : { title: "Course not found" };
}

export default async function CoursePage({ params }: Props) {
    const { slug } = await params;
    const course = await getCourse(slug);       // same render: served from cache(), no second request
    if (!course) notFound();                    // 404 + app/courses/[slug]/not-found.tsx
    return <CourseView course={course} />;
}`, "app/courses/[slug]/page.tsx"),
        p("For nested segments, a child's `generateStaticParams` receives the parent's params, so a lesson route could prerender only the first lesson of each popular course. The team chose not to: lesson pages are read by enrolled learners, spread across thousands of pages, and render in about 150 ms on demand."),
        p("After the change the build prerenders 214 pages and finishes in 3 minutes 40 seconds, and the build runner makes 201 API calls instead of 24,423."),

        h2("6. How to verify"),
        numbered([
            "**Build time and page count.** Run `time npm run build` before and after. The \"Generating static pages (x/y)\" line and the route table show how many paths each route prerendered. Put the build time on the CI dashboard so the next jump is visible on the pull request, not on deploy day.",
            "**API calls per page.** Log or count loader calls during the build. One call per page and loader means memoization works; two means `generateMetadata` and the page are not sharing.",
            "**A slug that was not generated.** Start the production server (`npm run start`) and request a course outside the top 200 twice with `curl -s -o /dev/null -w \"%{http_code} %{time_total}\\n\"`. Expect `200` both times, the second clearly faster. Lesson 12 shows how to read the cache headers that explain why.",
            "**A slug that does not exist.** `curl -s -o /dev/null -w \"%{http_code}\\n\" https://app.codedev.test/courses/no-such-course` must print `404`, not `200`.",
            "**A course published after the build.** Publish a course on staging and open it without redeploying. With `dynamicParams` left at `true` it renders; with `false` it is a 404, which is the behaviour to catch in review.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Prerendering everything \"because static is fast\".** Spot it: build time grows with the catalog and the route table shows thousands of paths. Prerender the pages traffic data says are hot.",
            "**`dynamicParams = false` on a catalog that grows.** Spot it: new courses or lessons answer 404 until the next deploy, while the API and the admin show them as published.",
            "**Returning `null` or an empty page for a missing slug.** Spot it: `curl -w \"%{http_code}\"` prints `200` for a slug that does not exist, and search results show empty course pages. Call `notFound()`.",
            "**`generateMetadata` and the page loading the same data separately.** Spot it: two identical API requests per render in the logs. Share one loader through `cache()` or memoized `fetch`.",
            "**Using params without awaiting it.** Spot it: TypeScript reports that `slug` does not exist on type `Promise<...>`, or the value is `undefined` at runtime on versions that pass a Promise. Await it once at the top of the function.",
        ]),

        h2("8. Summary"),
        bullets([
            "A dynamic segment gives every page one `params` value per segment; in recent versions it is a Promise to await, and its values are untrusted input.",
            "`generateStaticParams` decides what is ready at build, not what exists: prerender the hot pages and let `dynamicParams` (default `true`) render the rest on first request; `false` turns every unlisted slug into a 404.",
            "A missing record calls `notFound()`, and `generateMetadata` shares its loader with the page so that each render fetches once.",
        ]),

        h2("Sources"),
        bullets([
            "Next.js docs: generateStaticParams - nextjs.org/docs/app/api-reference/functions/generate-static-params",
            "Next.js docs: Route Segment Config (dynamicParams) - nextjs.org/docs/app/api-reference/file-conventions/route-segment-config",
            "Next.js docs: notFound and generateMetadata - nextjs.org/docs/app/api-reference/functions/not-found, nextjs.org/docs/app/api-reference/functions/generate-metadata",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one dynamic route in a project of yours and write down, from real traffic data, how many of its pages get 80% of the views. Prerender only those, time the build before and after, and request one slug that was not generated and one that does not exist with curl to confirm 200 and 404."),
    ],
});
