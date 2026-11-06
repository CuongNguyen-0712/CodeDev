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
    // [ ] Keep valid, non-default filters in a fixed order
}

const courseKeys = {
    all: ["courses"] as const,
    // [ ] The course query keys
};

const enrollmentKeys = {
    all: ["enrollments"] as const,
    // [ ] The enrollments of one user
};

/** The keys (used as prefixes) that a mutation makes stale. */
function targets(mutation: Mutation): QueryKey[] {
    // [ ] Keys each mutation makes stale
}

/** True when every element of prefix equals the element at the same position of key. */
function matchesPrefix(prefix: QueryKey, key: QueryKey): boolean {
    // [ ] Does a key start with the prefix?
}

function keysToInvalidate(cachedKeys: QueryKey[], mutation: Mutation): QueryKey[] {
    // [ ] The cached keys to invalidate
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
