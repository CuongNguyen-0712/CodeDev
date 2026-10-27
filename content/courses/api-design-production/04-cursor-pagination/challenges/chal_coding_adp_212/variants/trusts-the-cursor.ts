import { readFileSync } from "node:fs";

// GET /courses on the CodeDev catalog, paginated with an opaque cursor (keyset pagination).
//
// Order: published_at, then id as the tie-break, both in the direction of `order`
// ("desc" = newest first, the default; "asc" = oldest first).
//
// Query (every value arrives as a string, or is missing):
//   limit   whole number of courses per page: missing -> 20; "1".."100" -> that number;
//           above 100 -> 100; anything else ("0", "-5", "2.5", "ten", "") -> 400 invalid_limit
//   order   missing -> "desc"; "asc" or "desc"; anything else -> 400 invalid_order
//   cursor  missing -> first page; otherwise it must decode (decodeCursor) to a cursor made for the
//           same order, else 400 invalid_cursor
// Checks run in that order: limit, then order, then cursor; the first failure is the result.
//
// Cursor = base64url of JSON.stringify({ v: 1, o: order, k: [published_at, id] }) of the last course
// on the page, exactly that key order (Buffer.from(json).toString("base64url")).
// decodeCursor returns null unless the text is base64url (only A-Z a-z 0-9 - _), the JSON parses,
// v is 1, o is "asc" or "desc", k has exactly 2 items, k[0] is a timestamp in the form
// "2026-10-01T08:00:00Z" and k[1] is a whole number >= 1.
//
// Page: the courses after the cursor position in that order (all courses when there is no cursor),
// at most `limit` of them; next_cursor = cursor of the last course on the page when more courses
// follow it, null when the page reaches the end of the list.

type Course = { id: number; title: string; published_at: string };
type Order = "asc" | "desc";
type CursorPayload = { v: 1; o: Order; k: [string, number] };
type Query = { limit?: string; order?: string; cursor?: string };
type Page = { status: 200; data: Course[]; next_cursor: string | null };
type ApiError = { status: 400; code: "invalid_limit" | "invalid_order" | "invalid_cursor" };

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function encodeCursor(payload: CursorPayload): string {
    return Buffer.from(JSON.stringify({ v: payload.v, o: payload.o, k: payload.k })).toString("base64url");
}

function decodeCursor(cursor: string): CursorPayload | null {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    } catch {
        return null;
    }
    if (typeof raw !== "object" || raw === null) return null;
    const { v, o, k } = raw as { v?: unknown; o?: unknown; k?: unknown };
    if (!Array.isArray(k)) return null;
    return { v: 1, o: o as Order, k: k as [string, number] };
}

// -1 when a comes first in ascending (published_at, id) order
function compareKey(a: [string, number], b: [string, number]): number {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return a[1] - b[1];
}

function listCourses(table: Course[], query: Query): Page | ApiError {
    let limit = 20;
    if (query.limit !== undefined) {
        if (!/^\d+$/.test(query.limit) || Number(query.limit) < 1) return { status: 400, code: "invalid_limit" };
        limit = Math.min(Number(query.limit), 100);
    }
    const order = query.order ?? "desc";
    if (order !== "asc" && order !== "desc") return { status: 400, code: "invalid_order" };
    let after: [string, number] | null = null;
    if (query.cursor !== undefined) {
        const decoded = decodeCursor(query.cursor);
        if (decoded === null) return { status: 400, code: "invalid_cursor" };
        after = decoded.k;
    }
    const sign = order === "asc" ? 1 : -1;
    const key = (c: Course): [string, number] => [c.published_at, c.id];
    // WHERE (published_at, id) < ($1, $2) ORDER BY published_at DESC, id DESC LIMIT limit + 1
    const rows = table
        .filter((c) => after === null || sign * compareKey(key(c), after) > 0)
        .sort((a, b) => sign * compareKey(key(a), key(b)))
        .slice(0, limit + 1);
    const data = rows.slice(0, limit);
    const last = data[data.length - 1];
    const next_cursor = rows.length > limit ? encodeCursor({ v: 1, o: order, k: key(last) }) : null;
    return { status: 200, data, next_cursor };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "rows": [courses in the table], "steps": [...] }. A step is { "insert": [courses] }
// (instructors publish courses) or { "get": { "limit"?, "order"?, "cursor"? } }; the cursor "$next"
// means the next_cursor of the previous successful page. Prints one line per step, then, when a
// page ended the list (next_cursor null), how many courses the pages returned and any duplicates.
type Step = { insert?: Course[]; get?: Query };
const input: { rows: Course[]; steps: Step[] } = JSON.parse(readFileSync(0, "utf8"));
const table = input.rows;
let next: string | null = null;
const seen = new Map<number, number>();
for (const step of input.steps) {
    if (step.insert) {
        table.push(...step.insert);
        console.log(`insert ${step.insert.map((c) => c.id).join(",")}`);
        continue;
    }
    const query: Query = { ...step.get };
    if (query.cursor === "$next") query.cursor = next ?? "";
    const res = listCourses([...table], query);
    if (res.status === 400) {
        console.log(`GET -> 400 ${res.code}`);
        continue;
    }
    next = res.next_cursor;
    for (const c of res.data) seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
    console.log(`GET -> 200 [${res.data.map((c) => c.id).join(",")}] next=${res.next_cursor}`);
    if (res.next_cursor === null) {
        const dups = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
        console.log(`end of list: ${seen.size} courses, duplicates ${dups.join(",") || "none"}`);
        seen.clear();
    }
}
