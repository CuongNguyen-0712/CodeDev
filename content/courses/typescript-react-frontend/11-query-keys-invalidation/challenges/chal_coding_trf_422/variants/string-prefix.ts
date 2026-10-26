import { readFileSync } from "node:fs";

// The catalog keeps server data in a query cache (TanStack Query style): every query is stored under
// a key, an array such as ["courses", "list", { category: "react" }].
// After a learner enrolled, the "My courses" tab kept showing "Enroll" until a full reload: nothing told
// the cache that the enrollments were out of date. The first fix invalidated every query after every
// mutation and the page refetched 40 queries per click.
//
// Write the key factories and keysToInvalidate. The full rules are in the challenge description.
// Do not change the types or the test runner.

type Category = "react" | "node" | "sql" | "python" | "devops";
type Level = "beginner" | "intermediate" | "advanced";
type Sort = "popular" | "newest" | "rating";

// Filters as they come from the URL (?category=react&page=2&utm_source=newsletter): anything can be in there.
type Filters = { category?: Category; level?: Level; search?: string; sort?: Sort; page?: number; [param: string]: unknown };
type NormalizedFilters = { category?: Category; level?: Level; page?: number; search?: string; sort?: Sort };
type QueryKey = readonly unknown[];

type Mutation =
    | { type: "enroll"; userId: string; courseId: string }
    | { type: "unenroll"; userId: string; courseId: string }
    | { type: "edit"; courseId: string }
    | { type: "publish"; courseId: string };

const CATEGORIES: readonly unknown[] = ["react", "node", "sql", "python", "devops"];
const LEVELS: readonly unknown[] = ["beginner", "intermediate", "advanced"];
const SORTS: readonly unknown[] = ["popular", "newest", "rating"];

const isCategory = (v: unknown): v is Category => CATEGORIES.includes(v);
const isLevel = (v: unknown): v is Level => LEVELS.includes(v);
const isSort = (v: unknown): v is Sort => SORTS.includes(v);

function normalizeFilters(filters: Filters): NormalizedFilters {
    const out: NormalizedFilters = {};
    // Keys are added in alphabetical order, so equal filters serialise to the same JSON.
    if (isCategory(filters.category)) out.category = filters.category;
    if (isLevel(filters.level)) out.level = filters.level;
    if (typeof filters.page === "number" && Number.isInteger(filters.page) && filters.page > 1) out.page = filters.page;
    const search = typeof filters.search === "string" ? filters.search.trim().toLowerCase() : "";
    if (search !== "") out.search = search;
    if (isSort(filters.sort) && filters.sort !== "popular") out.sort = filters.sort;
    return out;
}

const courseKeys = {
    all: ["courses"] as const,
    lists: () => [...courseKeys.all, "list"] as const,
    list: (filters: Filters) => [...courseKeys.lists(), normalizeFilters(filters)] as const,
    details: () => [...courseKeys.all, "detail"] as const,
    detail: (id: string) => [...courseKeys.details(), id] as const,
};

const enrollmentKeys = {
    all: ["enrollments"] as const,
    byUser: (userId: string) => [...enrollmentKeys.all, userId] as const,
};

/** The keys (used as prefixes) that a mutation makes stale. */
function targets(mutation: Mutation): QueryKey[] {
    switch (mutation.type) {
        case "enroll":
        case "unenroll":
            return [courseKeys.detail(mutation.courseId), enrollmentKeys.byUser(mutation.userId)];
        case "edit":
            return [courseKeys.detail(mutation.courseId), courseKeys.lists(), enrollmentKeys.all];
        case "publish":
            return [courseKeys.lists()];
        default:
            return [];
    }
}

/** True when every element of prefix equals the element at the same position of key. */
function matchesPrefix(prefix: QueryKey, key: QueryKey): boolean {
    // "courses/detail/c_1" is the start of "courses/detail/c_1/reviews" and of every key below it
    return key.join("/").startsWith(prefix.join("/"));
}

function keysToInvalidate(cachedKeys: QueryKey[], mutation: Mutation): QueryKey[] {
    const prefixes = targets(mutation);
    return cachedKeys.filter((key) => prefixes.some((prefix) => matchesPrefix(prefix, key)));
}

// ---------------------------------------------------------------- test runner (do not change)
// Input, one of:
//   { "filters": [Filters, ...] }                 -> prints courseKeys.list(filters) for each
//   { "cache": [QueryKey, ...], "mutations": [...] } -> prints keysToInvalidate(cache, m) for each mutation
const input: { filters?: Filters[]; cache?: QueryKey[]; mutations?: Mutation[] } = JSON.parse(readFileSync(0, "utf8"));
if (input.filters) {
    console.log(JSON.stringify(input.filters.map((f) => courseKeys.list(f))));
} else {
    const cache = input.cache ?? [];
    console.log(JSON.stringify((input.mutations ?? []).map((m) => keysToInvalidate(cache, m))));
}
