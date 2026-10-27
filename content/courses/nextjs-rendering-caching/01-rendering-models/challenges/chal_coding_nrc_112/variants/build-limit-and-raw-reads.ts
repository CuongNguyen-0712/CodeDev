import { readFileSync } from "node:fs";

// CodeDev catalog incident: GET /courses was server-rendered on every request because the root
// layout read cookies() for the theme, and TTFB tripled under load. Before the next release, the
// team runs every route's traits through one function that says how the route should render.
//
// chooseRendering(page) returns { route, strategy, reason }. Apply the rules in this order:
//   1. Invalid traits -> strategy "invalid", reason "invalid traits". Traits are invalid when
//        freshnessSeconds is not null and not a whole number >= 0, or
//        pageCount is not a whole number >= 1, or
//        reads is not an array, or contains anything other than "cookies", "headers", "searchParams".
//   2. perUserData true -> "dynamic", reason "per-user data".
//   3. reads not empty  -> "dynamic", reason "reads " + the distinct names it contains, in the fixed
//        order cookies, headers, searchParams, joined with ", " (e.g. "reads cookies, searchParams").
//   4. freshnessSeconds 0 -> "dynamic", reason "must be fresh on every request".
//   5. Where the HTML comes from: "prerendered at build" when dataAtBuild is true and pageCount is
//        at most MAX_BUILD_PAGES (1000); otherwise "rendered on first request".
//   6. freshnessSeconds null (changes only with a deploy) -> "static", reason = the text from rule 5.
//   7. freshnessSeconds > 0 -> "isr:<seconds>", reason = rule 5 text + ", revalidated every <seconds> s"
//        (e.g. "isr:300", "prerendered at build, revalidated every 300 s").
// seo never changes the strategy: static, ISR and dynamic pages all send complete HTML to crawlers.
//
// Do not change the types or the test runner.

type RequestApi = "cookies" | "headers" | "searchParams";

type PageTraits = {
    route: string;
    freshnessSeconds: number | null; // how old the HTML may be; null = changes only with a deploy
    perUserData: boolean; // the HTML shows the signed-in learner's own data
    reads: RequestApi[]; // request-time APIs read by the page or by any layout above it
    pageCount: number; // how many pages this route produces (e.g. one per course)
    dataAtBuild: boolean; // the data source can be reached during `next build`
    seo: boolean; // search engines must index the page
};

type Decision = { route: string; strategy: string; reason: string };

const MAX_BUILD_PAGES = 1000;
const REQUEST_APIS: RequestApi[] = ["cookies", "headers", "searchParams"];

function isValid(page: PageTraits): boolean {
    const f: unknown = page.freshnessSeconds;
    if (f !== null && !(typeof f === "number" && Number.isInteger(f) && f >= 0)) return false;
    if (!(typeof page.pageCount === "number" && Number.isInteger(page.pageCount) && page.pageCount >= 1)) return false;
    if (!Array.isArray(page.reads)) return false;
    return page.reads.every((r) => REQUEST_APIS.includes(r));
}

function chooseRendering(page: PageTraits): Decision {
    const route = page.route;
    if (!isValid(page)) return { route, strategy: "invalid", reason: "invalid traits" };
    if (page.perUserData) return { route, strategy: "dynamic", reason: "per-user data" };
    const reads = page.reads;
    if (reads.length > 0) return { route, strategy: "dynamic", reason: `reads ${reads.join(", ")}` };
    if (page.freshnessSeconds === 0) return { route, strategy: "dynamic", reason: "must be fresh on every request" };
    const where = page.dataAtBuild && page.pageCount < MAX_BUILD_PAGES ? "prerendered at build" : "rendered on first request";
    if (page.freshnessSeconds === null) return { route, strategy: "static", reason: where };
    const s = page.freshnessSeconds;
    return { route, strategy: `isr:${s}`, reason: `${where}, revalidated every ${s} s` };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of page traits. Output: one decision per page.
const pages: PageTraits[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(pages.map((page) => chooseRendering(page))));
