import { readFileSync } from "node:fs";

// Safe cache keys for the CodeDev data layer. Every data request of app.codedev.test goes through
// cachePolicy(request), which returns the key of the server data cache (null = do not cache) and the
// Cache-Control header of the response. Last week the course list cached under "courses:<category>":
// learners who filtered level=advanced got the beginner list, Vietnamese learners got English titles,
// and ?utm_source=newsletter created a new cache entry per campaign link.
//
// Rules (the full text is in the challenge description):
//   1. unknown resource -> throw Error("unknown resource: <name>")
//      a route param of the resource missing or empty -> throw Error("missing param: <name>")
//      per-user or private-no-store data without a userId -> throw Error("personal data needs a signed-in user")
//   2. private-no-store -> { key: null, cacheControl: "private, no-store" }
//   3. key = resource + "/" + each route param (in RESOURCES order)
//            + "?" + every known query param, alphabetical, "name=value" joined by "&" (only if the resource has query params)
//            + "|locale=<locale>" when the resource is localized
//            + "|user=<userId>" when the data is per-user
//      query value: the first value if repeated, trimmed, lower-cased; missing or empty -> the default; unknown params dropped
//      locale: trimmed, lower-cased, the part before the first "-"; not in LOCALES (or missing) -> "en"
//      every value placed in the key (param, query value, user id) goes through encodeURIComponent
//   4. Cache-Control: public -> "public, max-age=0, s-maxage=<sMaxAge>", per-user -> "private, no-cache"
// Do not change RESOURCES, LOCALES or the test runner.

type Classification = "public" | "per-user" | "private-no-store";
type ResourceSpec = {
    classification: Classification;
    params: string[]; // route params, in path order
    query: Record<string, string>; // the query params the API understands, with their default values
    localized: boolean; // true when titles and text in the result depend on the locale
    sMaxAge: number; // seconds a shared cache may keep a public response (0 for other classes)
};

const RESOURCES: Record<string, ResourceSpec> = {
    "course-list": { classification: "public", params: [], query: { category: "all", level: "all", page: "1", sort: "popular" }, localized: true, sMaxAge: 300 },
    "course-detail": { classification: "public", params: ["slug"], query: {}, localized: true, sMaxAge: 3600 },
    leaderboard: { classification: "public", params: [], query: { period: "weekly", page: "1" }, localized: false, sMaxAge: 60 },
    dashboard: { classification: "per-user", params: [], query: { tab: "overview" }, localized: true, sMaxAge: 0 },
    "lesson-progress": { classification: "per-user", params: ["courseId"], query: {}, localized: false, sMaxAge: 0 },
    billing: { classification: "private-no-store", params: [], query: {}, localized: false, sMaxAge: 0 },
};
const LOCALES = ["en", "vi"];
const DEFAULT_LOCALE = "en";

type DataRequest = {
    resource: string;
    params?: Record<string, string>;
    query?: Record<string, string | string[]>;
    locale?: string;
    userId?: string | null;
};
type CachePolicy = { key: string | null; cacheControl: string };

function cachePolicy(req: DataRequest): CachePolicy {
    // 1. look up the resource, then check its route params and the user
    // 2. build the key from every input that changes the result, and nothing else
    // 3. choose the Cache-Control header from the classification
    return { key: req.resource, cacheControl: "public, max-age=0, s-maxage=60" };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "requests": [DataRequest, ...] }. Prints one line per request, then a summary.
const input: { requests: DataRequest[] } = JSON.parse(readFileSync(0, "utf8"));
const keys = new Set<string>();
for (const req of input.requests) {
    try {
        const policy = cachePolicy(req);
        if (policy.key !== null) keys.add(policy.key);
        console.log(`${policy.key ?? "(not cached)"} | ${policy.cacheControl}`);
    } catch (error) {
        console.log(`error: ${(error as Error).message}`);
    }
}
console.log(`${input.requests.length} requests, ${keys.size} cache entries`);
