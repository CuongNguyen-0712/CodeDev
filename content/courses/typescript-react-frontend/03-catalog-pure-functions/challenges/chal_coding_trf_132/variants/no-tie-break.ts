import { readFileSync } from "node:fs";

// CodeDev course catalog: the page sorted the cached course list with .sort() during render,
// which reordered the cached array itself, so the "Newest" tab also reordered the sidebar.
// Write the catalog logic as one pure function: same input, same output, input untouched.
//
// selectCatalogPage(courses, query):
//   1. Search: query.search trimmed and compared case-insensitively; keep courses whose title
//      contains it. An empty search (after trimming) keeps every course.
//   2. Filters: keep courses whose category equals query.category and whose level equals
//      query.level; the value "all" turns that filter off.
//   3. Sort:
//        "rating"  highest rating first
//        "newest"  latest publishedAt first (ISO dates "YYYY-MM-DD": compare them as strings)
//        "title"   title A to Z, comparing title.toLowerCase() with < and >
//      Ties (same rating, same date, same lowercase title) are ordered by id A to Z (compared with < and >).
//   4. Paginate: total = number of matching courses; totalPages = Math.ceil(total / query.pageSize),
//      but at least 1. The requested page is clamped into 1..totalPages (0 or -2 -> 1, 99 -> the
//      last page); items = the courses of that page (pageSize of them, fewer on the last page).
//   Return { items, page, totalPages, total }. Never change the courses array or the courses in it:
//   the test runner calls the function several times on the same array and checks it afterwards.
//   (You may declare the parameter as readonly Course[]: then the compiler rejects courses.sort().)
//
// Do not change the types or the test runner.

type Category = "react" | "node" | "sql" | "python" | "devops";
type Level = "beginner" | "intermediate" | "advanced";

type Course = {
    id: string;
    title: string;
    category: Category;
    level: Level;
    rating: number;
    enrolled: number;
    publishedAt: string; // ISO date, "2026-05-14"
};

type CatalogQuery = {
    search: string;
    category: Category | "all";
    level: Level | "all";
    sort: "rating" | "newest" | "title";
    page: number; // 1-based, whole number
    pageSize: number; // whole number, at least 1
};

type CatalogPage = { items: Course[]; page: number; totalPages: number; total: number };

function matches(course: Course, query: CatalogQuery): boolean {
    const search = query.search.trim().toLowerCase();
    return (
        (search === "" || course.title.toLowerCase().includes(search)) &&
        (query.category === "all" || course.category === query.category) &&
        (query.level === "all" || course.level === query.level)
    );
}

function compare(a: Course, b: Course, sort: CatalogQuery["sort"]): number {
    let order = 0;
    if (sort === "rating") order = b.rating - a.rating;
    else if (sort === "newest") order = (b.publishedAt < a.publishedAt ? -1 : b.publishedAt > a.publishedAt ? 1 : 0);
    else order = (a.title.toLowerCase() < b.title.toLowerCase() ? -1 : a.title.toLowerCase() > b.title.toLowerCase() ? 1 : 0);
    return order;
}

function selectCatalogPage(courses: Course[], query: CatalogQuery): CatalogPage {
    const sorted = courses.filter((c) => matches(c, query)).sort((a, b) => compare(a, b, query.sort));
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(Math.max(query.page, 1), totalPages);
    const start = (page - 1) * query.pageSize;
    return { items: sorted.slice(start, start + query.pageSize), page, totalPages, total };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { courses, queries }. Every query runs on the same courses array, in order, like the tabs
// of the catalog page sharing one cached list. Output: one page per query (items as ids) and
// whether the courses array still has the same order and the same values at the end.
type Input = { courses: Course[]; queries: CatalogQuery[] };

const { courses, queries }: Input = JSON.parse(readFileSync(0, "utf8"));
const before = JSON.stringify(courses);
const pages = queries.map((q) => {
    const result = selectCatalogPage(courses, q);
    return { items: result.items.map((c) => c.id), page: result.page, totalPages: result.totalPages, total: result.total };
});
console.log(JSON.stringify({ pages, inputUnchanged: JSON.stringify(courses) === before }));
