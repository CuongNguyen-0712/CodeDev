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

function normalizeFilters(filters: Filters): NormalizedFilters {
    // keep only valid, non-default values, in alphabetical order of the property names
    return {};
}

const courseKeys = {
    all: ["courses"] as const,
    lists: (): QueryKey => [],
    list: (filters: Filters): QueryKey => [],
    details: (): QueryKey => [],
    detail: (id: string): QueryKey => [],
};

const enrollmentKeys = {
    all: ["enrollments"] as const,
    byUser: (userId: string): QueryKey => [],
};

function keysToInvalidate(cachedKeys: QueryKey[], mutation: Mutation): QueryKey[] {
    // 1. which keys does this mutation make stale? (see the table in the description)
    // 2. keep the cached keys that start with one of them, element by element
    return [];
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
