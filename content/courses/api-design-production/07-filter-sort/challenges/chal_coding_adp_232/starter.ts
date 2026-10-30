import { readFileSync } from "node:fs";

// GET /v1/courses?level=beginner,intermediate&sort=-publishedAt,title&q=sql&limit=20
// Write parseCourseQuery(raw): turn the raw query string into a typed CourseQuery, or collect every
// problem as { field, issue } details (the runner wraps them in the lesson 3 error contract, 400).
//
// - Parameters: level, q, sort, limit, cursor. Names are case-sensitive. Any other name ->
//   unknown_parameter. A name seen before -> duplicate_parameter (the first occurrence is used).
// - level: comma-separated list of beginner | intermediate | advanced | expert (lowercase only).
//   Per item: "" -> empty_value, not allowed -> invalid_value, repeated -> duplicate_value.
// - q: trimmed; "" -> empty_value; longer than 100 or a character other than letters, digits,
//   space . # + - -> invalid_value.
// - limit: digits only, 1..100 (default 20); "" -> empty_value, otherwise invalid_value.
// - cursor: any non-empty string (default null); "" -> empty_value.
// - sort: comma-separated fields, "-" prefix = descending. Per item: "" -> empty_value, field not
//   publishedAt | title | enrollmentCount -> unknown_sort_field, field already used ->
//   duplicate_sort_field. Then more than 2 items -> too_many_sort_fields.
//   No sort parameter -> -publishedAt. Always append { field: "id" } with the direction of the
//   last sort key.
// Details are listed in the order the parameters appear, list items in their order.
// Do not change the types, the constants or the test runner.

type Level = "beginner" | "intermediate" | "advanced" | "expert";
type SortField = "publishedAt" | "title" | "enrollmentCount";
type Direction = "asc" | "desc";

interface SortKey {
    field: SortField | "id";
    direction: Direction;
}

interface CourseQuery {
    filters: { level?: Level[] };
    q: string | null;
    sort: SortKey[];
    limit: number;
    cursor: string | null;
}

type Issue =
    | "unknown_parameter"
    | "duplicate_parameter"
    | "empty_value"
    | "invalid_value"
    | "duplicate_value"
    | "unknown_sort_field"
    | "duplicate_sort_field"
    | "too_many_sort_fields";

interface ErrorDetail {
    field: string;
    issue: Issue;
}

type ParseResult = { ok: true; query: CourseQuery } | { ok: false; details: ErrorDetail[] };

const PARAMETERS: readonly string[] = ["level", "q", "sort", "limit", "cursor"];
const LEVELS: readonly string[] = ["beginner", "intermediate", "advanced", "expert"];
const SORT_FIELDS: readonly string[] = ["publishedAt", "title", "enrollmentCount"];
const MAX_SORT_FIELDS = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_Q_LENGTH = 100;
const Q_PATTERN = /^[\p{L}\p{N} .#+-]+$/u;

function isLevel(value: string): value is Level {
    return LEVELS.includes(value);
}

function isSortField(value: string): value is SortField {
    return SORT_FIELDS.includes(value);
}

function parseCourseQuery(raw: string): ParseResult {
    // TODO: read the parameters in order (URLSearchParams), validate each against the whitelists,
    // collect the details, then build the query with the default sort and the id tiebreaker.
    return { ok: false, details: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: { traceId: string; queries: string[] } = JSON.parse(readFileSync(0, "utf8"));
const responses = input.queries.map((raw) => {
    const result = parseCourseQuery(raw);
    if (result.ok) return { status: 200, query: result.query };
    return {
        status: 400,
        body: {
            error: {
                code: "VALIDATION_FAILED",
                message: "The query string is not valid.",
                details: result.details,
                traceId: input.traceId,
            },
        },
    };
});
console.log(JSON.stringify(responses));
