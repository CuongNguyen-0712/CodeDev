// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-1-2",
    title: "Server or client component? Deciding per component",
    slug: { _type: "slug", current: "server-or-client-component" },
    description:
        "One \"use client\" line at the top of the CodeDev course page turned the syllabus, the reviews and a chart library into browser code, and the JavaScript on the page tripled. Learn what runs where in the App Router, why \"use client\" is a boundary that pulls in everything it imports, how to push it down to the smallest leaf that needs state or events, how to keep server components inside client ones with children, which props can cross the boundary, and how to check the result in the bundle.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "A product ticket asked for a \"Show all lessons\" toggle on the course page. The pull request added useState to CourseView, the component that renders the whole page body, and put \"use client\" at the top of its file to make the build pass. Two weeks later the mobile performance report for https://app.codedev.test/courses/react-basics shows the JavaScript for the page grew from 96 kB to 312 kB (gzipped) and Largest Contentful Paint on a mid-range Android phone went from 1.9 s to 3.8 s. The toggle is 20 lines.",
    },

    content: [
        h2("1. The incident: one directive, the whole page"),
        p("This is the change that shipped:"),
        code("tsx", `
// app/courses/[slug]/CourseView.tsx  (PR #1012 "Show all lessons toggle")
+"use client";
+import { useState } from "react";
 import { CourseHeader } from "./CourseHeader";
 import { Syllabus } from "./Syllabus";
 import { EnrollButton } from "@/components/EnrollButton";
 import { ProgressChart } from "@/components/ProgressChart";   // imports a chart library
 import { Reviews } from "./Reviews";

 export function CourseView({ course, stats, reviews }: CourseViewProps) {
+    const [showAll, setShowAll] = useState(false);
     return (
         <main>
             <CourseHeader course={course} />
-            <Syllabus modules={course.modules} />
+            <Syllabus modules={course.modules} showAll={showAll} />
+            <button onClick={() => setShowAll(!showAll)}>Show all lessons</button>
             ...`, "PR #1012"),
        p("Without the directive, the build failed with an error saying `useState` only works in a client component. Adding `\"use client\"` fixed the error, and it also moved CourseHeader, Syllabus, ProgressChart with its chart library and Reviews into the browser bundle, because every module a client component imports becomes client code. None of them needed it. The page looked identical; it just shipped three times more JavaScript, and the phone had to download, parse and run it before the page reacted to taps."),

        h2("2. Reproduce it and read the evidence"),
        p("Open the course page in Chrome with DevTools, select the **Network** tab, filter by **JS** and reload with cache disabled. The status bar at the bottom shows the total transferred. Compare the release before PR #1012 with the one after:"),
        code("text", `
                                  before #1012     after #1012
JS transferred (gzipped)              96 kB          312 kB
largest chunk                         41 kB          131 kB   <- contains the chart library
LCP, Moto G class phone, 4G           1.9 s          3.8 s`, "Network tab and Lighthouse"),
        p("Then ask the code which files are client entry points. Every file with the directive is the start of a client subtree, and everything it imports comes with it:"),
        code("bash", `
$ grep -rln '"use client"' app/courses components
app/courses/[slug]/CourseView.tsx
components/EnrollButton.tsx
components/ThemeToggle.tsx

$ grep -n "^import" app/courses/[slug]/CourseView.tsx
2:import { useState } from "react";
3:import { CourseHeader } from "./CourseHeader";
4:import { Syllabus } from "./Syllabus";
5:import { EnrollButton } from "@/components/EnrollButton";
6:import { ProgressChart } from "@/components/ProgressChart";
7:import { Reviews } from "./Reviews";`, "terminal"),
        p("The directive sits on the component that renders the whole page, so the client subtree is the whole page. Only two things in it need the browser: the toggle and the chart's hover tooltips."),

        h2("3. The core idea: what runs where"),
        p("In the App Router every component is a **server component** unless something makes it a client component. The two kinds do different jobs:"),
        bullets([
            "**Server components** run only on the server. They can be `async`, read the database and secrets directly, and their code is never sent to the browser: only their rendered result is. They cannot use state, effects, event handlers or browser APIs, because none of those exist on the server.",
            "**Client components** are rendered on the server for the first HTML **and** run again in the browser, where React attaches event handlers and state to that HTML (hydration, next lesson). Their code is downloaded, parsed and executed by every visitor. They are needed for `useState`, `useEffect`, `onClick` and friends, and APIs like `window`, `localStorage` or `IntersectionObserver`.",
        ]),
        h3("\"use client\" is a boundary, not a label"),
        p("`\"use client\"` at the top of a file says: this module and **everything it imports** belong to the client bundle. A file without the directive becomes client code too if it is imported from a client file. That is how Reviews ended up in the browser without anyone touching Reviews.tsx. So the question is never \"is this component interactive?\" but \"where is the smallest place I can start the client subtree?\""),
        p("Two rules follow:"),
        numbered([
            "**Push the directive down to the leaf that needs it.** A toggle needs state; the syllabus it shows does not. Make the toggle the client component and keep the list on the server.",
            "**Pass server components in as `children` (or any JSX prop), not as imports.** A client component can render JSX it receives. The server renders that JSX, and the client component only decides where to place it, so `<SyllabusToggle><Syllabus /></SyllabusToggle>` keeps Syllabus a server component.",
        ]),
        h3("What can cross the boundary"),
        p("Props from a server component to a client component travel over the network with the page: React serializes them on the server and rebuilds them in the browser. Data crosses; behaviour does not:"),
        bullets([
            "**Can cross:** strings, numbers, booleans, `null`, arrays and plain objects of those, `Date` (React 19 serializes it), `Map` and `Set`, promises, JSX elements (including `children`), and Server Functions marked `\"use server\"`, which cross as a reference the browser can call.",
            "**Cannot cross:** ordinary functions (`onEnrolled={() => ...}`), instances of your own classes (a `Course` class with methods, a decimal type from a database driver), symbols. Convert to plain data on the server, or move the function into the client component.",
            "**Between two client components** there is no boundary: functions and class instances are passed in memory as in any React app.",
        ]),
        callout("info", "When not to bother",
            "A page that is mostly interactive (a code editor, a drag-and-drop board) will be mostly client components, and that is fine: the boundary then sits near the top for a good reason. The rule is not \"avoid client components\" but \"do not make static parts client code by accident\". Also, a few kilobytes on an internal admin page may not be worth a refactor; measure before you split."),
        challenge("chal_quiz_nrc_121"),

        h2("4. Worked example: the course page, split per component"),
        p("The page stays a server component: it loads the data and decides the layout. Each client component is a leaf with one job:"),
        code("tsx", `
// app/courses/[slug]/page.tsx  - server component (no directive)
import { notFound } from "next/navigation";
import { getCourseBySlug, getCourseStats, getReviews } from "@/lib/courses";   // Postgres

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const course = await getCourseBySlug(slug);
    if (!course) notFound();
    const [stats, reviews] = await Promise.all([getCourseStats(course.id), getReviews(course.id)]);

    return (
        <main>
            <CourseHeader title={course.title} level={course.level} rating={course.rating} />
            <SyllabusToggle lessonCount={course.lessonCount}>
                <Syllabus modules={course.modules} />          {/* still rendered on the server */}
            </SyllabusToggle>
            <EnrollButton courseId={course.id} />
            <ProgressChart points={stats.weekly} updatedAt={stats.updatedAt} />   {/* Date: allowed */}
            <Reviews reviews={reviews} />
        </main>
    );
}`, "app/courses/[slug]/page.tsx"),
        code("tsx", `
// app/courses/[slug]/SyllabusToggle.tsx - the only state on the page
"use client";
import { useState, type ReactNode } from "react";

export function SyllabusToggle({ lessonCount, children }: { lessonCount: number; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <section>
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
                {open ? "Hide lessons" : \`Show all \${lessonCount} lessons\`}
            </button>
            {/* hidden, not removed: the syllabus stays in the HTML for crawlers and screen readers */}
            <div hidden={!open}>{children}</div>
        </section>
    );
}`, "SyllabusToggle.tsx"),
        code("tsx", `
// components/EnrollButton.tsx - the click handler lives here, so no function crosses the boundary
"use client";
import { useTransition } from "react";
import { enroll } from "@/app/courses/actions";      // a Server Function ("use server")

export function EnrollButton({ courseId }: { courseId: string }) {
    const [pending, startTransition] = useTransition();
    return (
        <button type="button" disabled={pending} onClick={() => startTransition(() => enroll(courseId))}>
            {pending ? "Enrolling..." : "Enroll"}
        </button>
    );
}`, "EnrollButton.tsx"),
        p("ProgressChart keeps its own `\"use client\"` because the chart library needs the DOM for its tooltips. It is now the only file that brings the library in, and it receives plain data (an array of points and a `Date`). If the chart is below the fold, you can also load it lazily with `next/dynamic` from a client component, so its code is fetched only when it is about to be needed."),
        h3("Keep server code out of the client by construction"),
        p("Mark modules that must never reach the browser with the `server-only` package. If any client file imports them, directly or through another module, the build fails instead of shipping database code or trying to:"),
        code("typescript", `
// lib/courses.ts
import "server-only";
import { sql } from "./db";

export async function getCourseBySlug(slug: string) {
    const rows = await sql\`select id, slug, title, level, rating from courses where slug = \${slug} and published\`;
    return rows[0] ?? null;
}`, "lib/courses.ts"),
        p("Environment variables have a similar guard: only variables prefixed `NEXT_PUBLIC_` are inlined into client code. A private variable such as `DATABASE_URL` read in a client component is replaced with an empty string, which usually shows up as a confusing \"undefined\" bug rather than a leak. Either way, it is a sign the code is on the wrong side of the boundary."),

        h2("5. The exercise"),
        p("Plan the boundaries for a component tree. For each component, decide where it runs, which files get the directive, which props cannot cross, which server-only code ended up on the client, and how many kilobytes the browser downloads. The tests include the incident tree with the toggle in the page component."),
        challenge("chal_coding_nrc_122"),

        h2("6. How to verify"),
        bullets([
            "**The Network tab.** Filter by JS, disable the cache and reload: the transferred total for the course page went from 312 kB back to 104 kB after the split. Search the chunks (Sources panel, Ctrl+Shift+F) for a string from the chart library to see which pages load it.",
            "**A bundle analyzer.** It shows which modules are in which client chunk. The tools differ between webpack and Turbopack builds; check the Next.js docs for your version.",
            "**The directive list.** `grep -rln '\"use client\"' app components` should list small leaf files. A page-level or layout-level component in that list needs a reason in its pull request.",
            "**`server-only` imports.** Add one to every module that touches the database or secrets; a wrong import then fails `next build` in CI.",
            "**Lighthouse on a throttled phone profile.** Total Blocking Time and LCP are where shipped JavaScript shows up for users.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**`\"use client\"` on a page or layout component to make one hook compile.** Everything it imports follows. Spot it by grepping for the directive and reading the import list of each file it finds.",
            "**Passing an event handler from a server component.** The render fails with \"Functions cannot be passed directly to Client Components\". Spot it by the error, and fix it by moving the handler into the client component or by using a Server Function.",
            "**Importing a server component into a client component.** It silently becomes client code (and fails if it is async or reads the database). Spot it in the client file's imports; pass it as `children` instead.",
            "**Wrapping the app in a client provider and assuming everything below is client.** A provider that renders `{children}` does not turn those children into client components: they are rendered by the server and passed in. Spot the confusion when someone adds `\"use client\"` to pages \"because they are inside the provider\".",
            "**Assuming a client component runs only in the browser.** It is also rendered on the server for the first HTML, so `window` is undefined there. Spot it as `ReferenceError: window is not defined` during the build or a hydration error (next lesson).",
        ]),

        h2("8. Summary"),
        numbered([
            "Components are server components by default; make a component a client component only for state, effects, event handlers or browser APIs.",
            "`\"use client\"` is a boundary that pulls in every module the file imports: put it on the smallest leaf, and pass server components into client ones as `children`.",
            "Props crossing from server to client must be serializable data (strings, numbers, plain objects, arrays, Dates, JSX, Server Functions); check the result in the bundle, not by reading the page.",
        ]),

        h2("Sources"),
        bullets([
            "Next.js docs, Server and Client Components - nextjs.org/docs/app/getting-started/server-and-client-components",
            "React docs, 'use client' (serializable types) and 'use server' - react.dev/reference/rsc/use-client",
            "Next.js docs, Environment Variables (NEXT_PUBLIC_ prefix) - nextjs.org/docs/app/guides/environment-variables",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List every file with \"use client\" in a Next.js app you know. For each one, write the reason (state, effect, handler, browser API) and the list of modules it imports. Pick the file with the longest import list and sketch how you would split it: which part keeps the directive, and which parts become children rendered by the server. Measure the JS transferred before and after."),
    ],
});
