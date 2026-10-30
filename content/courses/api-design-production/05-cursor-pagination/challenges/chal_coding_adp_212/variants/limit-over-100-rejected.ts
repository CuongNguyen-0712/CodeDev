import { readFileSync } from "node:fs";

// GET /v1/courses on the CodeDev public API: cursor pagination with a stable order.
//
// listCourses(courses, query) returns one page: { data, page: { nextCursor, limit } }.
//
// Order: publishedAt DESC (newest first), then id DESC to break ties. Compare publishedAt as
// instants (Date.parse) and ids as plain strings (< and >).
//
// query.limit (a string from the query string, or undefined):
//   undefined                         -> 20
//   only digits, value 1..100         -> that number
//   only digits, value above 100      -> 100 (clamped, not an error)
//   anything else ("0", "-1", "2.5", "abc", "") -> throw new ApiError(400, "VALIDATION_FAILED", ...)
//
// query.cursor (a string, or undefined):
//   undefined -> the first page.
//   otherwise it must be base64url of the JSON {"publishedAt": "...", "id": "..."}: an object whose
//   publishedAt is a string Date.parse understands and whose id is a non-empty string.
//   Anything else -> throw new ApiError(400, "INVALID_CURSOR", ...).
//   The page holds the courses that come strictly after that position in the order. The course the
//   cursor points to does not have to exist any more.
//
// Node's Buffer speaks base64url: Buffer.from(text).toString("base64url") and
// Buffer.from(cursor, "base64url").toString("utf8").
//
// nextCursor: encodeCursor(last course of the page) when at least one more course comes after it,
// otherwise null. encodeCursor writes the keys in the order publishedAt, id.
// Do not change Course, Query, Page, ApiError or the test runner.

type Course = { id: string; slug: string; title: string; level: string; publishedAt: string; enrollmentCount: number };
type Query = { limit?: string; cursor?: string };
type Page = { data: Course[]; page: { nextCursor: string | null; limit: number } };
type CursorPosition = { publishedAt: string; id: string };

class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function encodeCursor(course: Course): string {
    return Buffer.from(JSON.stringify({ publishedAt: course.publishedAt, id: course.id })).toString("base64url");
}

function decodeCursor(cursor: string): CursorPosition {
    let value: unknown;
    try {
        value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    } catch {
        throw new ApiError(400, "INVALID_CURSOR", "cursor is not valid");
    }
    if (typeof value !== "object" || value === null) throw new ApiError(400, "INVALID_CURSOR", "cursor is not valid");
    const { publishedAt, id } = value as Record<string, unknown>;
    if (typeof publishedAt !== "string" || Number.isNaN(Date.parse(publishedAt)) || typeof id !== "string" || id === "") {
        throw new ApiError(400, "INVALID_CURSOR", "cursor is not valid");
    }
    return { publishedAt, id };
}

function parseLimit(raw: string | undefined): number {
    if (raw === undefined) return 20;
    if (!/^[0-9]+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) {
        throw new ApiError(400, "VALIDATION_FAILED", "limit must be an integer from 1 to 100");
    }
    return Math.min(Number(raw), 100);
}

// negative when a comes first (newer, or same instant and larger id)
function compare(a: CursorPosition, b: CursorPosition): number {
    const byTime = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    if (byTime !== 0) return byTime;
    return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
}

function listCourses(courses: Course[], query: Query): Page {
    const limit = parseLimit(query.limit);
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const ordered = [...courses].sort(compare);
    const rest = after === null ? ordered : ordered.filter((c) => compare(c, after) > 0);
    const data = rest.slice(0, limit);
    const nextCursor = rest.length > limit ? encodeCursor(data[data.length - 1]) : null;
    return { data, page: { nextCursor, limit } };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { courses, queries: Query[] } prints one result per query;
//        { courses, walk: Query } follows nextCursor from the first page and prints the ids per page.
const input: { courses: Course[]; queries?: Query[]; walk?: Query } = JSON.parse(readFileSync(0, "utf8"));
function call(query: Query): Page | { status: number; code: string } {
    try {
        return listCourses(input.courses, query);
    } catch (e) {
        if (e instanceof ApiError) return { status: e.status, code: e.code };
        throw e;
    }
}
if (input.walk) {
    const pages: string[][] = [];
    let query: Query = input.walk;
    for (let i = 0; i < 30; i++) {
        const result = call(query);
        if (!("data" in result)) { pages.push([JSON.stringify(result)]); break; }
        pages.push(result.data.map((c) => c.id));
        if (result.page.nextCursor === null) break;
        query = { ...input.walk, cursor: result.page.nextCursor };
    }
    console.log(JSON.stringify({ pages }));
} else {
    console.log(JSON.stringify((input.queries ?? []).map((q) => {
        const r = call(q);
        return "data" in r ? { ids: r.data.map((c) => c.id), nextCursor: r.page.nextCursor, limit: r.page.limit } : r;
    })));
}
