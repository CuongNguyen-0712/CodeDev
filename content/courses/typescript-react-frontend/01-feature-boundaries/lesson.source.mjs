// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-trf-1-1",
    title: "Split a screen into features, components and pure logic",
    slug: { _type: "slug", current: "split-a-screen-into-features-components-and-pure-logic" },
    description:
        "A sorting bug on the CodeDev course catalog takes a day to reproduce because fetching, filtering, sorting, pagination and markup all live in one 600-line CatalogPage.tsx. Learn to split a screen into feature folders, container and presentational components, and pure functions you can test in milliseconds - and when a page is too small to be worth splitting.",
    estimatedTime: 30,

    scenario: {
        role: "Frontend developer, CodeDev catalog team",
        problem:
            "A learner reports that on /courses, sorted by Most popular, two courses swap places every time the page is refreshed. The sorting code sits on line 312 of a 600-line CatalogPage.tsx, between a fetch call and a block of JSX. To reproduce the bug you need the dev server, a logged-in account, the real API and luck with the order of the rows it returns. Nobody can write a test for it, so the last two fixes broke pagination instead.",
    },

    content: [
        h2("1. The incident: one component that does everything"),
        p("Here is a shortened version of the file. Every concern of the screen is inside one function, and every concern can see and change every other one:"),
        code("tsx", `
// app/courses/CatalogPage.tsx (before, 600 lines - shortened)
export default function CatalogPage() {
    const [courses, setCourses] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [level, setLevel] = useState("all");
    const [sort, setSort] = useState("popular");
    const [page, setPage] = useState(1);

    useEffect(() => {
        fetch("/api/courses?pageSize=500").then((r) => r.json()).then((d) => setCourses(d.items));
    }, []);

    // ...120 lines of enrollment buttons, toasts and modals...

    let visible = courses.filter((c) => c.title.includes(search));     // line 298
    if (level !== "all") visible = visible.filter((c) => c.level === level);
    visible.sort((a, b) => sort === "popular" ? b.learners - a.learners : b.rating - a.rating);
    const pageItems = visible.slice((page - 1) * 12, page * 12);

    return (
        <main>
            {/* ...250 lines of filter bar, cards and pagination markup... */}
        </main>
    );
}`, "CatalogPage.tsx"),
        bullets([
            "**The reported bug**: the comparator returns 0 when two courses have the same number of learners, and the API does not promise an order for equal rows. Whatever order the rows arrive in is the order the learner sees.",
            "**Why it took a day**: the only way to run line 300 is to render the whole page, which fetches from the API. You cannot call the sorting with two hand-written courses and look at the result.",
            "**Hidden extras** a reviewer would not spot in 600 lines: `includes(search)` is case-sensitive and ignores tags, and `filter` on an empty search still runs on every render. None of these have a test either.",
        ]),

        h2("2. The core idea: three kinds of code, three homes"),
        p("A screen mixes three kinds of code that change for different reasons and are tested in different ways. Give each its own place:"),
        bullets([
            "**Pure logic** - functions whose result depends only on their arguments and that change nothing outside themselves: search, filter, sort, paginate, format a price, decide which state to show. No React, no fetch, no `Date.now()`. They live in files such as `features/catalog/catalog.logic.ts` and are tested by calling them.",
            "**Presentational components** - receive data and callbacks as props, render markup, and report user actions back through those callbacks: `CourseCard`, `FilterBar`, `Pagination`. They do not fetch and do not know where the data came from, so you can render them with a hand-written object.",
            "**Container components** - own the state and the data access for one screen and wire them to the presentational pieces: `CatalogPage` reads the query, calls the API client in `shared/api`, runs the pure logic and passes the results down. There are few of them, and they stay thin because the decisions live in the logic files.",
        ]),
        p("Group these files **by feature**, not by file type. A feature folder holds everything one part of the product needs, so a change to the catalog touches one folder:"),
        code("text", `
src/
  features/
    catalog/
      CatalogPage.tsx        container: query, data, wiring
      FilterBar.tsx          presentational
      CourseCard.tsx         presentational
      catalog.logic.ts       pure: queryCatalog, sort comparators
      catalog.logic.test.ts
      catalog.reducer.ts     pure: catalog state transitions (lesson 3)
      index.ts               what other features may import
    enrollment/
      EnrollButton.tsx
      enrollment.api.ts
      index.ts
  shared/
    api/                     typed client for /api/* (lesson 6)
    ui/                      Button, Spinner, EmptyState - no product knowledge`, "folder tree"),
        p("Two import rules keep the boundaries real: a feature may import from `shared/` and from another feature's `index.ts`, never from another feature's inner files; and `shared/` never imports from `features/`. If enrollment needs something that lives deep inside catalog, that is a sign it belongs in `shared/` or should be exported on purpose."),

        h3("When not to split"),
        p("Splitting has a cost: more files, more names, more jumps while reading. It pays off when there is logic with branches worth testing, a component that is reused, or a file that several people change for different reasons. It does not pay off for a 40-line page that fetches one thing and renders it, such as a static \"About this course\" page with one query and a list. Splitting that into a container, a card, a logic file and an index adds four files and no test you could not write before. Start inline, and extract when the first branchy logic or the second use appears."),

        callout("tip", "A quick test for \"is this pure?\"",
            "Could you call it from a plain script with literal arguments, twice, and get the same result both times without anything else changing? If the answer needs a browser, a server, a clock or a mock, it is not pure yet - move the impure part (the fetch, the time, the storage) to the caller and pass the value in."),

        p("Before you write the function, check two pieces of the split catalog: can the sorting bug be reproduced without the browser, and is the course card really presentational?"),
        challenge("chal_quiz_trf_111"),

        h2("3. Worked example: the catalog after the split"),
        image("feature-boundaries-before-after", {
            alt: "Before and after diagram. Left, in red: one CatalogPage.tsx box of 600 lines containing fetch, search, filter, sort, paginate, enrollment and markup stacked together, with a note that reproducing a sort bug needs the browser, the API and a logged-in account. Right, in green: the features/catalog folder with CatalogPage as the container, which calls shared/api for data, passes data to catalog.logic.ts (pure: queryCatalog, tested by calling it), and passes props to the presentational FilterBar and CourseCard, which send events back. A unit test box points at catalog.logic.ts with the note: milliseconds, no browser.",
            caption: "The container wires; the logic decides; the presentational components draw. Only the logic file needs to know how sorting works, and a test can call it directly.",
        }),
        p("The decisions move into one pure function. It receives the courses and the query and returns exactly what the page needs to render:"),
        code("ts", `
// features/catalog/catalog.logic.ts
export type Level = "beginner" | "intermediate" | "advanced";
export type SortKey = "popular" | "rating" | "newest" | "title";
export interface CatalogQuery { search: string; level: Level | "all"; sort: SortKey; page: number; pageSize: number }
export interface CatalogPageResult { items: Course[]; total: number; page: number; pageCount: number }

// No React, no fetch, no clock: the same arguments always give the same result,
// and the courses array that came from the API is never modified.
export function queryCatalog(courses: readonly Course[], query: CatalogQuery): CatalogPageResult {
    // 1. search  2. level  3. sort with a full tie-break  4. clamp the page and slice
}`, "catalog.logic.ts"),
        p("Two details in that signature carry the fix for the incident. `readonly Course[]` makes TypeScript reject `courses.sort(...)` on the argument, because an in-place sort would reorder the API data for every other component. And step 3 says \"full tie-break\": when two courses are equal on the sort key, the comparator must still decide (by title, then by id), otherwise the order the API happened to send leaks into the UI."),
        p("The container keeps only what is about this screen: where the data comes from and which query is active. It calls the logic during render, so there is no second copy of the results to keep in sync (lesson 3 goes further on that):"),
        code("tsx", `
// features/catalog/CatalogPage.tsx (container)
export function CatalogPage() {
    const [query, setQuery] = useState<CatalogQuery>(defaultQuery);
    const courses = useCourses();                         // shared/api client + server state (lessons 6-7)
    const result = queryCatalog(courses, query);          // pure; useMemo only if profiling says so (lesson 10)
    const { isEnrolled, enroll } = useEnrollments();      // from features/enrollment/index.ts

    return (
        <main>
            <FilterBar query={query} onChange={(patch) => setQuery({ ...query, ...patch, page: 1 })} />
            {result.items.map((course) => (
                <CourseCard key={course.id} course={course}
                    enrolled={isEnrolled(course.id)} onEnroll={() => enroll(course.id)} />
            ))}
            <Pagination page={result.page} pageCount={result.pageCount}
                onPage={(page) => setQuery({ ...query, page })} />
        </main>
    );
}

// features/catalog/CourseCard.tsx (presentational)
interface CourseCardProps { course: Course; enrolled: boolean; onEnroll: () => void }

export function CourseCard({ course, enrolled, onEnroll }: CourseCardProps) {
    return (
        <article>
            <h3>{course.title}</h3>
            <p>{course.level} - {course.learners} learners - {course.rating.toFixed(1)}</p>
            <button disabled={enrolled} onClick={onEnroll}>{enrolled ? "Enrolled" : "Enroll"}</button>
        </article>
    );
}`, "CatalogPage.tsx"),
        p("Notice what `CourseCard` does not do: it does not call the enrollment API, read the URL or decide whether the learner is enrolled. Everything it shows arrives as props, so a design preview or a test can render it with `{ course: sample, enrolled: false, onEnroll: () => {} }`."),

        p("Now write the heart of `catalog.logic.ts` yourself. The challenge spells out every rule - the search, the level filter, four sort orders with their tie-breaks, and how a page number outside the range is clamped:"),
        code("javascript", `
queryCatalog(courses, { search: " react ", level: "all", sort: "popular", page: 1, pageSize: 12 });
// -> { items: [...], total: ..., page: ..., pageCount: ... }   and courses is left exactly as it was`),
        challenge("chal_coding_trf_112"),

        h2("4. How to verify the split worked"),
        p("A split is only an improvement if you can now prove things you could not prove before. Check with evidence:"),
        numbered([
            "**The bug has a unit test.** Write the reproduction first (the test below), watch it fail, then fix the comparator. It runs without a browser or a server.",
            "**The test is fast.** Your test runner (Vitest or Jest) reports a time per test; logic tests should take milliseconds. A logic test that needs seconds is usually still waiting on something impure.",
            "**Presentational components have no data access.** Search the presentational files for `fetch(`, `useQuery`, `useEnrollment` and the API client import. Each hit is a container hiding in a presentational file.",
            "**Boundaries hold.** Configure ESLint's `no-restricted-imports` rule to forbid paths such as `features/*/*` from other features, so only `index.ts` files can be imported across features. Then the build tells you when someone crosses a boundary.",
        ]),
        code("ts", `
// features/catalog/catalog.logic.test.ts
import { queryCatalog } from "./catalog.logic";

const next = { id: "nextjs-rendering-caching", title: "Next.js Rendering & Caching", learners: 640 /* ... */ };
const react = { id: "typescript-react-frontend", title: "React + TypeScript Architecture", learners: 640 /* ... */ };
const query = { search: "", level: "all", sort: "popular", page: 1, pageSize: 12 } as const;

test("courses with equal learners keep a stable order", () => {
    const a = queryCatalog([next, react], query).items.map((c) => c.id);
    const b = queryCatalog([react, next], query).items.map((c) => c.id);
    expect(a).toEqual(b);                 // failed before the tie-break, passes after
});`, "catalog.logic.test.ts"),

        h2("5. Common mistakes"),
        bullets([
            "**Folders by file type for the whole app** (`components/`, `hooks/`, `utils/`). One change to the catalog then touches five top-level folders, and nobody knows which `utils` belong to which screen. Detect it: count the folders a typical feature pull request touches.",
            "**A presentational component that fetches.** It looks reusable until you try to render it in a test and need the API. Detect it: a component under `shared/ui` or named `*Card` that imports the API client or a data hook.",
            "**Pure logic that is not pure.** `courses.sort(...)` sorts the caller's array in place, so the cached API response changes order for every other reader; `Date.now()` inside a \"new course\" badge makes the test depend on the day it runs. Detect it: call the function twice with the same arguments and compare both results and the arguments afterwards. Copy before sorting (`[...courses].sort(...)` or `toSorted`) and pass the current time in.",
            "**Reaching into another feature.** `import { CourseCard } from \"../catalog/CourseCard\"` from the enrollment feature couples the two: a refactor inside catalog breaks enrollment. Detect it: a lint rule on cross-feature paths, or imports with two `..` segments into `features/`.",
            "**Splitting a 40-line page into six files.** Indirection without a test or a second user. Detect it: every file in the split has exactly one importer and no test.",
        ]),

        h2("6. Checklist"),
        bullets([
            "Search, filter, sort, pagination and other decisions are pure functions in a `*.logic.ts` file, with unit tests.",
            "Sort comparators break every tie (title, then id), so the input order never shows in the UI.",
            "Pure functions copy before they sort and never change their arguments.",
            "Presentational components get data and callbacks through props and import no API client or data hook.",
            "Containers are few and thin: they wire state, data and logic for one screen.",
            "Features import other features only through their `index.ts`; `shared/` never imports from `features/`.",
            "A small page stays a single file until it gets branchy logic or a second user.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Open the largest component in a project you work on. Mark each block as data access, pure logic, presentation or wiring. Extract one block of pure logic into a function, write two tests for it (one normal case and one edge case such as a tie or an empty list), and note how long the tests take to run compared with opening the page."),

        h2("Sources"),
        bullets([
            "react.dev: Thinking in React (breaking a UI into a component hierarchy), and Keeping Components Pure.",
            "MDN Web Docs: Array.prototype.sort() (sorts in place; stable since ES2019), Array.prototype.toSorted() and String.prototype.localeCompare().",
            "ESLint documentation: the no-restricted-imports rule.",
        ]),
    ],
});
