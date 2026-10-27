import { readFileSync } from "node:fs";

// Request sent to the AI assistant:
//   "Add pagination to GET /courses. Response: { data, next_cursor }; the app sends next_cursor back
//    as ?cursor= and stops when it is null. ?size= is optional: default 20, at most 100. Answer 400
//    with { code } for a bad size or cursor. Newest courses first."
//
// Reference fix: keyset (cursor) pagination on (published_at, id). Same response shape and 400 codes.

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

// Keyset cursor: the position (published_at, id) of the last course on the page, versioned.
type Position = [string, number];

function encodeCursor(pos: Position): string {
    return Buffer.from(JSON.stringify({ v: 1, k: pos })).toString("base64url");
}

function decodeCursor(cursor: string): Position | null {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
    try {
        const { v, k } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (v !== 1 || !Array.isArray(k) || k.length !== 2) return null;
        if (typeof k[0] !== "string" || !Number.isInteger(k[1])) return null;
        return [k[0], k[1]];
    } catch {
        return null; // also a cursor issued by the old page-number version: the app restarts the list
    }
}

// Newest first: published_at DESC, then id DESC so that ties have one fixed order.
function newerFirst(a: Position, b: Position): number {
    return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0;
}

// `scan` is the table as the database reads it: rows in no particular order.
function listCourses(scan: Course[], query: ListQuery): ListResult {
    const size = parseSize(query.size);
    if (size === null) return { status: 400, body: { code: "invalid_size" } };
    let after: Position | null = null;
    if (query.cursor !== undefined) {
        after = decodeCursor(query.cursor);
        if (after === null) return { status: 400, body: { code: "invalid_cursor" } };
    }
    // SELECT id, title, published_at FROM catalog.courses
    // WHERE ($2::timestamptz IS NULL OR (published_at, id) < ($2, $3))
    // ORDER BY published_at DESC, id DESC
    // LIMIT $1 + 1
    const pos = (c: Course): Position => [c.published_at, c.id];
    const rows = scan
        .filter((c) => after === null || newerFirst(pos(c), after) > 0)
        .sort((x, y) => newerFirst(pos(x), pos(y)))
        .slice(0, size + 1);
    const data = rows.slice(0, size);
    const next_cursor = rows.length > size ? encodeCursor(pos(data[data.length - 1])) : null;
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
