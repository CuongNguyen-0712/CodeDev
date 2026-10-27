import { readFileSync } from "node:fs";

// Request sent to the AI assistant:
//   "Add pagination to GET /courses. Response: { data, next_cursor }; the app sends next_cursor back
//    as ?cursor= and stops when it is null. ?size= is optional: default 20, at most 100. Answer 400
//    with { code } for a bad size or cursor. Newest courses first."
//
// The code below is what it produced (CoursesRepository.list, with the SQL it runs shown as a
// comment). It was merged after the endpoint tests passed. The response shape and the 400 errors
// are the contract with the mobile app: keep them.

type Course = { id: number; title: string; published_at: string };
type ListQuery = { size?: string; cursor?: string };
type ListResult =
    | { status: 200; body: { data: Course[]; next_cursor: string | null } }
    | { status: 400; body: { code: "invalid_size" | "invalid_cursor" } };

function parseSize(raw: string | undefined): number | null {
    if (raw === undefined) return 20;
    if (!/^\d+$/.test(raw) || Number(raw) < 1) return null;
    return Math.min(Number(raw), 100);
}

// Opaque cursor, so clients cannot depend on page numbers.
function encodeCursor(page: number): string {
    return Buffer.from(JSON.stringify({ page })).toString("base64url");
}

function decodeCursor(cursor: string): number | null {
    try {
        const { page } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        return Number.isInteger(page) && page >= 2 ? page : null;
    } catch {
        return null;
    }
}

// `scan` is the table as the database reads it: rows in no particular order.
function listCourses(scan: Course[], query: ListQuery): ListResult {
    const size = parseSize(query.size);
    if (size === null) return { status: 400, body: { code: "invalid_size" } };
    let page = 1;
    if (query.cursor !== undefined) {
        const decoded = decodeCursor(query.cursor);
        if (decoded === null) return { status: 400, body: { code: "invalid_cursor" } };
        page = decoded;
    }
    // SELECT id, title, published_at FROM catalog.courses
    // ORDER BY published_at DESC
    // LIMIT $1 OFFSET ($2 - 1) * $1
    const sorted = [...scan].sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : b.id - a.id));
    const offset = (page - 1) * size;
    const data = sorted.slice(offset, offset + size);
    const next_cursor = offset + size < sorted.length ? encodeCursor(page + 1) : null;
    return { status: 200, body: { data, next_cursor } };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "rows": [courses], "steps": [...] }. A step is { "insert": [courses] } (instructors publish
// while the learner scrolls) or { "get": { "size"?, "cursor"? } }; the cursor "$next" means the
// next_cursor of the previous successful page. Like PostgreSQL without a unique ORDER BY, the fake
// table promises no physical row order: every second request scans it backwards.
// Prints one line per step; when a page ends the list, it also prints the courses returned twice and
// the courses that existed before the first page and were never returned.
type Step = { insert?: Course[]; get?: ListQuery };
const input: { rows: Course[]; steps: Step[] } = JSON.parse(readFileSync(0, "utf8"));
const table = input.rows;
let next: string | null = null;
let requests = 0;
let before: number[] | null = null;
const seen = new Map<number, number>();
for (const step of input.steps) {
    if (step.insert) {
        table.push(...step.insert);
        console.log(`insert ${step.insert.map((c) => c.id).join(",")}`);
        continue;
    }
    const query: ListQuery = { ...step.get };
    if (query.cursor === "$next") query.cursor = next ?? "";
    const scan = requests++ % 2 === 0 ? [...table] : [...table].reverse();
    if (before === null) before = table.map((c) => c.id);
    const res = listCourses(scan, query);
    if (res.status === 400) {
        console.log(`GET -> 400 ${res.body.code}`);
        continue;
    }
    next = res.body.next_cursor;
    for (const c of res.body.data) seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
    console.log(`GET -> 200 [${res.body.data.map((c) => c.id).join(",")}] next=${next === null ? "null" : "yes"}`);
    if (next === null) {
        const dups = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
        const missing = before.filter((id) => !seen.has(id));
        console.log(`end of list: duplicates ${dups.join(",") || "none"}; never returned ${missing.join(",") || "none"}`);
        seen.clear();
        before = null;
    }
}
