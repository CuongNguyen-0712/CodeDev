// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-1-3",
    title: "Filter, sort & paginate the catalog with pure functions",
    slug: { _type: "slug", current: "catalog-filter-sort-paginate-pure-functions" },
    description:
        "Clicking the \"Newest\" tab on the CodeDev catalog reordered the \"Top rated\" sidebar too, because the page called .sort() during render on the array held by the query cache. Learn to write search, filters, sorting and pagination as pure functions over Course[]: never mutate the input, give every sort a stable tie-break so pages do not shift, clamp out-of-range pages, and test all of it with plain data, without a browser.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "QA filed a bug against the catalog at https://app.codedev.test/courses: after clicking the \"Newest\" tab, the \"Top rated this month\" sidebar shows the newest courses at the top instead of the best-rated ones, and it stays wrong until the page is reloaded. A second report says page 2 of \"Top rated\" sometimes repeats a course from page 1 and skips another. Neither the sidebar nor the pagination code changed in the last release; the release added the \"Newest\" tab.",
    },

    content: [
        h2("1. The incident: a sort that reached another component"),
        p("The \"Newest\" tab was added with three lines inside the catalog page's render:"),
        code("tsx", `
// CatalogPage.tsx - the version that shipped
const { data: courses = [] } = useQuery({ queryKey: ["courses"], queryFn: fetchCourses });

const visible =
    tab === "newest"
        ? courses.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        : courses.sort((a, b) => b.rating - a.rating);`, "CatalogPage.tsx"),
        p("And the sidebar, written months earlier by another developer, reads the same query:"),
        code("tsx", `
// TopRatedSidebar.tsx
const { data: courses = [] } = useQuery({ queryKey: ["courses"], queryFn: fetchCourses });
const top = courses.slice(0, 5);    // "the API returns courses by rating"`, "TopRatedSidebar.tsx"),
        p("`Array.prototype.sort` sorts **in place** and returns the same array. Both components get the same array object from the TanStack Query cache, because they use the same query key. Sorting it for the tab rewrote the cache entry for every reader. React does not know an array was changed behind its back, so the sidebar shows the new order only the next time it happens to re-render, which made the bug look random."),
        p("The second report has a related cause. When two courses have the same rating, their relative order depends on the order the API happened to return them in. A cache refresh between loading page 1 and page 2 can swap two equally rated courses, so one appears on both pages and the other on neither."),

        h2("2. Reproduce it and read the evidence"),
        p("You can prove the mutation in the browser console, without any React tooling. TanStack Query's `QueryClient` exposes the cached value; in development many apps put it on `window` for this purpose:"),
        code("text", `
> const cached = queryClient.getQueryData(["courses"]);
> cached.slice(0, 3).map((c) => c.id)
[ "c03", "c07", "c11" ]          // by rating, as the API sent it

// click the "Newest" tab, then:
> cached.slice(0, 3).map((c) => c.id)
[ "c01", "c08", "c04" ]          // same array object, new order
> cached === queryClient.getQueryData(["courses"])
true`, "DevTools console"),
        p("A unit test makes the same point permanently. Freeze the input in the test, and an in-place sort throws instead of quietly corrupting data:"),
        code("typescript", `
import { test, expect } from "vitest";

test("sorting for the Newest tab does not change the cached list", () => {
    const courses = Object.freeze([...fixtureCourses]);   // a frozen array cannot be sorted in place
    sortForTab(courses, "newest");                          // TypeError: Cannot assign to read only property '0'
    expect(courses.map((c) => c.id)).toEqual(fixtureCourses.map((c) => c.id));
});`, "catalog.test.ts"),

        h2("3. The core idea: catalog logic is a pure function"),
        p("A **pure function** returns a value that depends only on its arguments and changes nothing outside itself: no mutation of its inputs, no requests, no reading the clock or the URL. React already asks this of components and hooks during render (react.dev, Keeping Components Pure); the catalog's search, filter, sort and pagination are the easiest place to honour it, because they are data in, data out:"),
        code("typescript", `
type CatalogQuery = {
    search: string;
    category: Category | "all";
    level: Level | "all";
    sort: "rating" | "newest" | "title";
    page: number;
    pageSize: number;
};

type CatalogPage = { items: Course[]; page: number; totalPages: number; total: number };

function selectCatalogPage(courses: readonly Course[], query: CatalogQuery): CatalogPage;`, "catalog.ts"),
        p("This signature buys three things the inline version could not give:"),
        bullets([
            "**Tests without a browser.** A Vitest test passes ten hand-written courses and a query and checks the ids that come back. No rendering, no mocked fetch, no waiting; hundreds of cases run in well under a second.",
            "**One owner for the rules.** The tab, the sidebar and a future \"Export to CSV\" can all call the same function with different queries, and get consistent answers.",
            "**Safe sharing.** The input is never changed, so it does not matter how many components read the same cached array.",
        ]),
        h3("Three rules that make it correct"),
        numbered([
            "**Copy before you sort.** `filter`, `map` and `slice` return new arrays; `sort`, `reverse` and `splice` change the array you call them on. Sort a copy: `[...courses].sort(compare)`, or `courses.toSorted(compare)` (ES2023: check that your `tsconfig` `lib` includes `ES2023` and that your browser targets support it). Typing the parameter as `readonly Course[]` makes TypeScript reject `courses.sort(...)` at compile time.",
            "**Give every sort a total order.** Since ES2019 `sort` is stable, which means ties keep their input order, and the input order is whatever the API sent. Add a final tie-break on a unique key, usually the id, so the same set of courses always comes out in the same order, whatever order it came in. Then page boundaries do not move.",
            "**Clamp the page.** Filters change the number of results. A learner on page 5 who narrows the search to 12 results (2 pages of 10) should land on page 2, not on an empty page 5. Compute `totalPages` first (at least 1, so an empty result is \"page 1 of 1\"), then clamp the requested page into `1..totalPages`.",
        ]),
        callout("info", "When not to do this in the browser",
            "Client-side filtering only works when the client has the whole list. CodeDev's catalog has about 200 published courses, which is fine to load once and filter in memory. For thousands of rows, or data the user may not see in full, send the search, filters, sort and page to the API and let the database do it (with a stable ORDER BY, for the same tie-break reason). Also, do not reach for useMemo by default: filtering 200 objects takes well under a millisecond. Measure with the React Profiler first, and memoize only if the function shows up."),

        challenge("chal_quiz_trf_131"),

        h2("4. Worked example: a comparator with a tie-break"),
        p("Here is the technique on a different list, the weekly leaderboard: highest score first, then the earliest to reach that score, then the user id. It returns a new array and leaves `entries` alone:"),
        code("typescript", `
type Entry = { userId: string; score: number; reachedAt: string };   // ISO timestamp

function compareEntries(a: Entry, b: Entry): number {
    if (a.score !== b.score) return b.score - a.score;                     // primary: score, high to low
    if (a.reachedAt !== b.reachedAt) return a.reachedAt < b.reachedAt ? -1 : 1;  // then: earliest first
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;          // last: a unique key
}

export function rankLeaderboard(entries: readonly Entry[]): Entry[] {
    return [...entries].sort(compareEntries);
}`, "leaderboard.ts"),
        p("Two details are worth copying. ISO 8601 dates and timestamps in the same format and time zone sort correctly as strings, so no `Date` parsing is needed. And the comparator compares with `<` and `>` instead of `localeCompare`: `localeCompare` depends on the runtime's locale data, which is right for showing names to humans but can differ between Node and browsers, while a tie-break must give the same order everywhere."),
        p("In the catalog page, the component then becomes a thin caller. The query state (search, filters, page) is lesson 2.1; for now it is plain props:"),
        code("tsx", `
export function CatalogResults({ query }: { query: CatalogQuery }) {
    const { data: courses = [] } = useCatalog();
    const page = selectCatalogPage(courses, query);   // pure: safe to call on every render

    return (
        <>
            <CourseGrid courses={page.items} />
            <Pagination page={page.page} totalPages={page.totalPages} total={page.total} />
        </>
    );
}`, "CatalogResults.tsx"),
        p("Now write `selectCatalogPage` itself. The starter states the exact search, filter, sort, tie-break and paging rules; the test runner calls your function several times on the same array, like the tabs sharing one cache entry, and checks the array afterwards."),
        challenge("chal_coding_trf_132"),

        h2("5. How to verify"),
        bullets([
            "**Table tests on plain data.** Ten courses chosen to have ties (same rating, same date, same title in another case), and one test per rule: search trimmed and case-insensitive, each filter, each sort, page 0 and page 99. No DOM, no network.",
            "**A frozen input.** Pass `Object.freeze([...courses])` in tests: any in-place `sort`, `reverse` or `splice` throws `TypeError` instead of passing silently.",
            "**Shuffled input, same output.** Call the function on the same courses in two different orders and expect the same pages. This is the test that catches a missing tie-break.",
            "**The compiler.** With `courses: readonly Course[]`, `courses.sort(...)` fails with `Property 'sort' does not exist on type 'readonly Course[]'`.",
            "**In the app.** Switch between tabs and check that the sidebar stays in rating order; in the console, `queryClient.getQueryData([\"courses\"])` must keep the API's order.",
        ]),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**Sorting the cached array.** `data.sort(...)` in render, or in TanStack Query's `select` option. Spot it with a frozen input in a test, or by comparing the cached array before and after switching tabs.",
            "**Copying only sometimes.** `const list = filtered ? courses.filter(match) : courses; list.sort(...)` mutates the cache exactly when no filter is active, which is the default view. Spot it with a test that uses no filters at all.",
            "**No tie-break.** `sort((a, b) => b.rating - a.rating)` looks complete until two courses have 4.8. Spot it with the shuffled-input test, or by two courses swapping places after a refetch.",
            "**Not clamping the page.** Narrowing the search on page 5 shows an empty page with \"Page 5 of 2\". Spot it with a test that asks for page 99, and one with no results at all (page 1 of 1, not page 1 of 0).",
            "**Searching raw input.** `title.includes(search)` fails on \"React\" vs \"react\" and on the trailing space a phone keyboard adds. Spot it with a test for `\"  REACT \"`.",
        ]),

        h2("7. Summary"),
        numbered([
            "Catalog logic is data in, data out: write search, filters, sort and pagination as a pure function of `(courses, query)` and call it during render.",
            "Never mutate the input (copy before `sort`, type it `readonly`), and end every comparator with a unique tie-break so equal items always come out in the same order and pages do not shift.",
            "Clamp the page into `1..totalPages` with `totalPages` at least 1, and prove each rule with plain-data tests: frozen input, shuffled input, out-of-range pages.",
        ]),

        h2("Sources"),
        bullets([
            "React docs, Keeping Components Pure - react.dev/learn/keeping-components-pure",
            "MDN Web Docs, Array.prototype.sort() (in-place, stable since ES2019) and Array.prototype.toSorted()",
            "TanStack Query v5 docs, Render Optimizations: structural sharing and the select option",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Find one place in a React codebase you know where an array is sorted, reversed or spliced. Check whether that array can be shared (props, context, a query cache, a module-level constant). Write the frozen-input test and the shuffled-input test for it, run them, and fix what fails."),
    ],
});
