// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-1-1",
    title: "How to split a React app by feature: components, hooks & an API layer",
    slug: { _type: "slug", current: "split-react-app-by-feature" },
    description:
        "A one-line change to the Premium badge on the CodeDev catalog broke search, because both lived in a 900-line CatalogPage.tsx and shared a helper nobody knew had two callers. Learn to split a React app by feature into components, hooks and an API module, to keep presentational components on typed props, to make the API module the only place that knows URLs, to point every dependency one way, and to recognise when a screen is too small to be worth splitting.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "On Monday a ticket asked for the Premium badge on course cards to be uppercase. The pull request changed four characters in src/pages/CatalogPage.tsx, a 900-line file that fetches courses, filters and sorts them, formats prices and dates, and renders the whole page. It passed review. By Tuesday morning support had 31 reports: typing anything into the catalog search box at https://app.codedev.test/courses shows \"No courses found\". Nothing in the diff mentions search.",
    },

    content: [
        h2("1. The incident: a badge change that broke search"),
        p("Here is the bug report, as it reached the frontend team:"),
        code("text", `
BUG-2291  Catalog search returns nothing                         Severity: high
Steps:    open https://app.codedev.test/courses, type "react" in Search
Expected: React Basics, Hooks in Depth, Testing React Apps, ...
Actual:   "No courses found" for every query except an empty one
Since:    release 2026.10.19 (only change touching the catalog: PR #812
          "Uppercase the Premium badge")`, "bug report"),
        p("And here is the whole diff of PR #812:"),
        code("tsx", `
// src/pages/CatalogPage.tsx  (line 214 of 903)
 function normalize(value: string): string {
-    return value.trim().toLowerCase();
+    return value.trim().toUpperCase();
 }`, "PR #812"),
        p("The author needed `normalize(course.access)` to return `PREMIUM` for the badge. What the author could not see, 500 lines further down, was the search filter:"),
        code("tsx", `
// src/pages/CatalogPage.tsx  (line 731 of 903)
const visible = courses.filter((c) =>
    normalize(c.title).includes(search.toLowerCase())   // "REACT BASICS".includes("react") -> false
);`, "CatalogPage.tsx"),
        p("Nobody made a careless mistake. The file made the mistake easy: one helper served two features with different needs (display text and search matching), and the only thing connecting them was that they happened to live in the same 900 lines. This lesson is about drawing boundaries so that a change to the badge cannot reach search, and so that when two pieces do share something, the sharing is visible."),

        h2("2. Read the evidence: what the file actually contains"),
        p("Before you split anything, measure what is there. Two commands tell you most of the story. First, how many places use the helper that broke:"),
        code("bash", `
$ grep -n "normalize(" src/pages/CatalogPage.tsx
214:function normalize(value: string): string {
388:      <Badge>{normalize(course.access)}</Badge>
402:      <span className="level">{normalize(course.level)}</span>
731:      normalize(c.title).includes(search.toLowerCase())
744:      normalize(c.category) === normalize(categoryFilter)`, "terminal"),
        p("Four callers with two different jobs: lines 388 and 402 format text for display, lines 731 and 744 compare values for filtering. Line 744 still worked after the change only because both sides were uppercased. Second, how many places know where the API lives:"),
        code("bash", `
$ grep -rn "api.codedev.test" src/
src/pages/CatalogPage.tsx:97:    const res = await fetch(\`https://api.codedev.test/courses?category=\${category}\`);
src/pages/CatalogPage.tsx:512:   await fetch(\`https://api.codedev.test/enrollments\`, { method: "POST", ... });
src/pages/CourseDetailPage.tsx:41: const res = await fetch(\`https://api.codedev.test/courses/\${id}\`);
src/components/Sidebar.tsx:23:     fetch("https://api.codedev.test/courses?sort=popular")`, "terminal"),
        p("Then skim the file and write down what each region does. For `CatalogPage.tsx` it looked like this:"),
        code("text", `
lines   1-90    imports, 14 useState calls
lines  91-180   fetching: useEffect + fetch + JSON parsing + error flags
lines 181-330   helpers: normalize, formatPrice, formatDate, formatEnrolled
lines 331-520   JSX for a course card, inlined in a .map()
lines 521-700   enroll button: POST, optimistic update, toast
lines 701-800   search, category filter, sort, pagination
lines 801-903   page layout JSX`, "CatalogPage.tsx outline"),
        p("Seven regions, at least four reasons to change (API format, display rules, catalog logic, layout), one file. Every change to any of them is reviewed as \"a change to CatalogPage\", and no test can check the search logic without rendering the whole page."),

        h2("3. The core idea: split by feature, then by role"),
        p("Most React codebases start with folders by **file type**: `components/`, `hooks/`, `utils/`, `services/`. That works for a few screens. As the app grows, one feature ends up spread across five folders, and `utils.ts` becomes a drawer of helpers with unknown callers, which is exactly how `normalize` ended up shared. Splitting **by feature first** keeps everything one feature needs in one place, and makes anything shared between features a deliberate decision:"),
        code("text", `
src/
  features/
    catalog/
      api/catalogApi.ts          the only file that knows URLs and response shapes
      hooks/useCatalog.ts        server state and UI state for the catalog page
      components/
        CatalogPage.tsx          container: calls hooks, decides what to render
        CourseCard.tsx           presentational: typed props in, JSX out
        AccessBadge.tsx          presentational
      catalog.ts                 pure logic: search, filter, sort, paginate (lesson 1.3)
      format.ts                  pure display helpers: price, date, badge text
      index.ts                   what other features may import
    enrollment/
      api/enrollmentApi.ts
      hooks/useEnroll.ts
      components/EnrollButton.tsx
      index.ts
  shared/
    ui/Button.tsx, ui/Badge.tsx  generic UI with no catalog knowledge
    http/request.ts              fetch wrapper: base URL, auth header, errors`, "folder layout"),
        p("Inside a feature, each file has one role:"),
        bullets([
            "**API module** (`api/catalogApi.ts`): builds URLs, sends requests, checks responses and returns typed data. It is the only code that knows `https://api.codedev.test` and the shape of the JSON. When the API renames a parameter, this is the one file that changes.",
            "**Hooks** (`hooks/useCatalog.ts`): connect React to the API: server state (with TanStack Query), local UI state, and the derived values the screen needs. A hook returns data and functions, never JSX.",
            "**Presentational components** (`CourseCard`, `AccessBadge`): receive everything through typed props and render it. They do not fetch, do not read the URL and do not know where data comes from. You can render one with a hand-written object.",
            "**Container components** (`CatalogPage`): call the hooks and choose which presentational components to render for the current state. Containers are thin: if one grows past a screen of code, some logic belongs in a hook or a pure function.",
            "**Pure modules** (`catalog.ts`, `format.ts`): plain functions over plain data, with no React import. The search filter and the badge text live in different functions here, so changing one cannot change the other.",
        ]),
        h3("Dependency direction: one way only"),
        p("The roles form layers, and imports point in one direction: **components -> hooks -> api**, with pure modules usable from any layer and importing nothing above them. The API module never imports a component or a hook; a hook never imports a component. Other features import only what `index.ts` exports, never `features/catalog/components/CourseCard` directly."),
        p("Why this matters in practice: a change ripples only toward the files that import the changed one. If the API module imported a component's prop type, a cosmetic rename in `CourseCard` would force an edit in the API module, and a reviewer of the API diff would have to understand UI code. Keep the arrows one way and every change has a short, predictable blast radius."),
        callout("info", "When not to split",
            "A feature folder with five subfolders for a 60-line settings page is ceremony, not architecture. Keep a small screen in one file until it has two reasons to change, a second caller for some piece, or logic you want to test without rendering. Split when you can name the boundary (\"this is display formatting, that is search\"); do not split by line count alone, and do not create a folder for one file. The goal is that a change touches as few files as possible and that every shared piece is shared on purpose."),

        challenge("chal_quiz_trf_111"),

        h2("4. Worked example: the catalog, split"),
        p("Start with the domain type. It belongs to the feature (or to the API module, which defines what the server returns), never to a component:"),
        code("typescript", `
// features/catalog/api/catalogApi.ts
import { request } from "../../../shared/http/request";

export type Category = "react" | "node" | "sql" | "python" | "devops";
export type Level = "beginner" | "intermediate" | "advanced";

export type Course = {
    id: string;
    title: string;
    category: Category;
    level: Level;
    access: "free" | "premium";
    rating: number;
    enrolled: number;
    publishedAt: string;          // ISO date
};

export type CourseListParams = { category?: Category; signal?: AbortSignal };

// The only place that knows this URL and its query parameters.
export function fetchCourses({ category, signal }: CourseListParams = {}): Promise<Course[]> {
    const query = category ? \`?category=\${encodeURIComponent(category)}\` : "";
    return request<Course[]>(\`/courses\${query}\`, { signal });
}`, "catalogApi.ts"),
        p("The hook connects that function to React. With TanStack Query v5, server state is one `useQuery` call; the hook passes the abort signal so a request for an old category is cancelled:"),
        code("typescript", `
// features/catalog/hooks/useCatalog.ts
import { useQuery } from "@tanstack/react-query";
import { fetchCourses, type Category } from "../api/catalogApi";

export function useCatalog(category: Category | undefined) {
    return useQuery({
        queryKey: ["courses", { category }],
        queryFn: ({ signal }) => fetchCourses({ category, signal }),
    });
}`, "useCatalog.ts"),
        p("Display text lives in its own pure module. The badge gets its own function, so uppercasing it touches nothing else:"),
        code("typescript", `
// features/catalog/format.ts
import type { Course } from "./api/catalogApi";

export function accessLabel(access: Course["access"]): string {
    return access === "premium" ? "PREMIUM" : "FREE";
}

export function formatEnrolled(count: number): string {
    return new Intl.NumberFormat("en", { notation: "compact" }).format(count);   // 5400 -> "5.4K"
}`, "format.ts"),
        p("Presentational components take typed props. `CourseCard` does not know about fetch, the URL or the query cache; it gets a `Course` and a callback:"),
        code("tsx", `
// features/catalog/components/CourseCard.tsx
import type { Course } from "../api/catalogApi";
import { accessLabel, formatEnrolled } from "../format";
import { Badge } from "../../../shared/ui/Badge";

type CourseCardProps = {
    course: Course;
    onOpen: (courseId: string) => void;
};

export function CourseCard({ course, onOpen }: CourseCardProps) {
    return (
        <article className="course-card">
            <h3>{course.title}</h3>
            <Badge tone={course.access === "premium" ? "gold" : "neutral"}>{accessLabel(course.access)}</Badge>
            <p>{course.rating.toFixed(1)} stars, {formatEnrolled(course.enrolled)} learners</p>
            <button type="button" onClick={() => onOpen(course.id)}>View course</button>
        </article>
    );
}`, "CourseCard.tsx"),
        p("The container is thin: it calls the hook, handles the states, and maps data to cards. (Lesson 1.2 replaces the `if` chain with a typed UI state; lesson 1.3 moves search and sorting into `catalog.ts`.)"),
        code("tsx", `
// features/catalog/components/CatalogPage.tsx
import { useNavigate } from "react-router";
import { useCatalog } from "../hooks/useCatalog";
import { CourseCard } from "./CourseCard";

export function CatalogPage() {
    const navigate = useNavigate();
    const { data, isPending, isError } = useCatalog(undefined);

    if (isPending) return <p>Loading courses...</p>;
    if (isError) return <p>Could not load courses.</p>;
    return (
        <section className="catalog-grid">
            {data.map((course) => (
                <CourseCard key={course.id} course={course} onOpen={(id) => navigate(\`/courses/\${id}\`)} />
            ))}
        </section>
    );
}`, "CatalogPage.tsx"),
        p("Finally, `index.ts` is the feature's public surface. The router imports the page from here; nothing outside the feature reaches into its folders:"),
        code("typescript", `
// features/catalog/index.ts
export { CatalogPage } from "./components/CatalogPage";
export type { Course, Category, Level } from "./api/catalogApi";`, "index.ts"),
        p("Replay PR #812 on this structure. The ticket \"uppercase the Premium badge\" changes `accessLabel` in `format.ts`. Search lives in `catalog.ts` and does not import `format.ts`, so it cannot be affected, and the diff shows that at a glance."),

        h2("5. How to verify the boundaries"),
        p("Boundaries that are not checked erode within a few months. Each of these checks runs in seconds:"),
        bullets([
            "**One place knows the API.** `grep -rn \"api.codedev.test\" src/` (or your base URL constant) must return only `shared/http/request.ts`, and `grep -rn \"fetch(\" src/features` only files under `api/`. Run it in CI as a script that fails on extra matches.",
            "**Imports point one way.** ESLint's `no-restricted-imports` rule can forbid `**/components/**` imports inside `api/` and `hooks/`, and deep imports into another feature. The `import/no-cycle` rule of eslint-plugin-import reports cycles such as api -> component -> hook -> api.",
            "**Props are typed and complete.** `npx tsc --noEmit` fails when a container forgets a required prop or passes the wrong shape. A `CourseCard` that needs `course.access` cannot be given an object without it.",
            "**Logic is testable without a browser.** A Vitest test can call `accessLabel(\"premium\")` or the search function from `catalog.ts` with plain data. If a test needs to render the page to check a filter, the filter is still in the wrong place.",
            "**React DevTools.** The Components panel should show `CatalogPage > CourseCard` with readable props. A component that has 14 hooks listed under it is a container doing a hook's job.",
        ]),
        code("json", `
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [
        { "group": ["**/components/**"], "message": "api/ and hooks/ must not import components" },
        { "group": ["**/features/*/*/**"], "message": "import another feature through its index.ts" }
      ]
    }]
  }
}`, ".eslintrc.json (applied to src/features/*/api and src/features/*/hooks)"),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**A `utils.ts` that every feature imports.** It recreates the shared `normalize`: one helper, many unrelated callers. Spot it with `grep -rn \"from .*utils\" src | wc -l`; a helper with callers in three features is either truly generic (move it to `shared/` with tests) or should be split per use.",
            "**A presentational component that fetches.** `CourseCard` with a `useEffect` that loads the instructor's name sends one request per card (20 cards, 20 requests in the Network tab) and cannot be rendered in a test or a story without mocking fetch. Pass the data down, or fetch it once in the container.",
            "**The API response used as props everywhere.** If `CourseCard` reads `course.meta.stats.avg_rating` straight from the server JSON, renaming a server field breaks UI files all over the app. Map the response to your `Course` type once, in the API module; a TypeScript error then shows the one place to fix.",
            "**Imports pointing back up.** An API module that imports a component's prop type, or a hook that imports a component to read a constant. Spot it with the ESLint rules above or by reading the import lines at the top of each `api/` file: they should mention only shared code.",
            "**Splitting too early.** Twelve folders and an `index.ts` for a page with one form and one request. If every change still touches the same three files together, they are one unit; merge them back.",
        ]),

        h2("7. Summary"),
        numbered([
            "Split by feature first (`features/catalog`), then by role inside it: an API module that alone knows URLs and response shapes, hooks that connect React to it, thin containers, and presentational components on typed props.",
            "Point dependencies one way (components -> hooks -> api, pure modules usable everywhere) and expose each feature through `index.ts`, so a change only reaches the files that import it.",
            "Check the boundaries with grep, ESLint import rules and `tsc --noEmit`, and do not split a screen until you can name the boundary.",
        ]),

        h2("Sources"),
        bullets([
            "React docs, Thinking in React: breaking a UI into a component hierarchy - react.dev/learn/thinking-in-react",
            "React docs, Reusing Logic with Custom Hooks - react.dev/learn/reusing-logic-with-custom-hooks",
            "ESLint docs, no-restricted-imports - eslint.org/docs/latest/rules/no-restricted-imports",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one page of a React app you work on (or the CatalogPage outline from section 2) and draw its boundary diagram on paper: one box per file in the target layout, one arrow per import. Mark every arrow that points the wrong way (api -> component, hook -> component, feature -> another feature's internals) and every helper with callers in two features. Then write the three grep or ESLint checks that would have caught them."),
    ],
});
