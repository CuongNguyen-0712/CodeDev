import { readFileSync } from "node:fs";

// GET /v1/courses behind the mobile app's catalog infinite scroll.
//
// Last sprint this endpoint moved from ?offset=&limit= to an opaque cursor. The app now only sends
// ?limit= and the nextCursor it received, but learners still report the same two bugs:
//   - a course shows up twice while scrolling when a new course is published between two pages;
//   - a course never shows up when another course is unpublished between two pages.
//
// Fix listCourses (and the cursor functions) so that a client walking the pages sees every course
// that stayed published for the whole walk exactly once, in order, whatever is published or
// unpublished between its requests.
//
// Rules that must keep working:
//   - order: publishedAt DESC (newest first), then id DESC to break ties; compare publishedAt as
//     instants (Date.parse) and ids as plain strings;
//   - limit: undefined -> 20; only digits, 1..100 -> that number; above 100 -> 100;
//     anything else -> throw new ApiError(400, "VALIDATION_FAILED", ...);
//   - nextCursor: null when no course comes after the last one of the page;
//   - the cursor format is the one of lesson 5: base64url of the JSON
//     {"publishedAt": "...", "id": "..."} (keys in that order). The app may resume from a cursor it
//     saved earlier. Any cursor that does not decode to that shape - including one issued by the old
//     code - is rejected with new ApiError(400, "INVALID_CURSOR", ...).
// Do not change Course, Query, Page, ApiError or the test runner.

type Course = { id: string; slug: string; title: string; level: string; publishedAt: string; enrollmentCount: number };
type Query = { limit?: string; cursor?: string };
type Page = { data: Course[]; page: { nextCursor: string | null; limit: number } };

class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

type CursorPosition = { publishedAt: string; id: string };

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
    if (!/^[0-9]+$/.test(raw) || Number(raw) < 1) {
        throw new ApiError(400, "VALIDATION_FAILED", "limit must be an integer from 1 to 100");
    }
    return Math.min(Number(raw), 100);
}

// negative when a comes first (newer, or same instant and larger id)
function byNewest(a: CursorPosition, b: CursorPosition): number {
    const byTime = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    if (byTime !== 0) return byTime;
    return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
}

// keyset: the page starts strictly after the cursor's position, which stays put when rows above it
// are added or removed (unlike an offset, which counts rows).
function listCourses(courses: Course[], query: Query): Page {
    const limit = parseLimit(query.limit);
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const ordered = [...courses].sort(byNewest);
    const rest = after === null ? ordered : ordered.filter((c) => Date.parse(c.publishedAt) < Date.parse(after.publishedAt));
    const data = rest.slice(0, limit);
    const nextCursor = rest.length > limit ? encodeCursor(data[data.length - 1]) : null;
    return { data, page: { nextCursor, limit } };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { courses, limit?, cursor?, changes?: [{ afterPage, publish?: Course[], unpublish?: id[] }] }.
// The client asks for the first page (or resumes from cursor), then follows nextCursor; after page n
// it applies the changes with afterPage n to the catalog. Prints the ids the client saw, page by page.
type Change = { afterPage: number; publish?: Course[]; unpublish?: string[] };
const input: { courses: Course[]; limit?: string; cursor?: string; changes?: Change[] } = JSON.parse(readFileSync(0, "utf8"));
let catalog = [...input.courses];
let cursor = input.cursor;
const pages: string[][] = [];
let error: string | undefined;
for (let n = 1; n <= 30; n++) {
    let result: Page;
    try {
        result = listCourses(catalog, { limit: input.limit, cursor });
    } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        error = `${e.status} ${e.code}`;
        break;
    }
    pages.push(result.data.map((c) => c.id));
    for (const change of (input.changes ?? []).filter((c) => c.afterPage === n)) {
        catalog = catalog.filter((c) => !(change.unpublish ?? []).includes(c.id)).concat(change.publish ?? []);
    }
    if (result.page.nextCursor === null) break;
    cursor = result.page.nextCursor;
}
console.log(JSON.stringify(error === undefined ? { pages } : { pages, error }));
