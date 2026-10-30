import { readFileSync } from "node:fs";

// GET /v1/courses?level=beginner,intermediate&sort=-publishedAt,title&q=sql&limit=20
// Turn the raw query string into a typed query spec, or into the list of everything wrong with it.
// Only whitelisted parameters, filter values and sort fields get through; nothing the client sends
// is ever pasted into SQL. The full rules are in the challenge description.

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
    const details: ErrorDetail[] = [];
    const add = (field: string, issue: Issue) => details.push({ field, issue });
    const seen = new Set<string>();
    const query: CourseQuery = { filters: {}, q: null, sort: [], limit: DEFAULT_LIMIT, cursor: null };
    let sortGiven = false;

    for (const [name, value] of new URLSearchParams(raw)) {
        if (!PARAMETERS.includes(name)) {
            add(name, "unknown_parameter");
            continue;
        }
        if (seen.has(name)) {
            add(name, "duplicate_parameter");
            continue;
        }
        seen.add(name);

        switch (name) {
            case "level": {
                const levels: Level[] = [];
                for (const item of value.split(",")) {
                    if (item === "") add(name, "empty_value");
                    else if (!isLevel(item)) add(name, "invalid_value");
                    else if (levels.includes(item)) add(name, "duplicate_value");
                    else levels.push(item);
                }
                query.filters.level = levels;
                break;
            }
            case "q": {
                const text = value.trim();
                if (text === "") add(name, "empty_value");
                else if (text.length > MAX_Q_LENGTH || !Q_PATTERN.test(text)) add(name, "invalid_value");
                else query.q = text;
                break;
            }
            case "limit": {
                const n = Number(value);
                if (value === "") add(name, "empty_value");
                else if (!/^[0-9]+$/.test(value) || n < 1 || n > MAX_LIMIT) add(name, "invalid_value");
                else query.limit = n;
                break;
            }
            case "cursor": {
                if (value === "") add(name, "empty_value");
                else query.cursor = value;
                break;
            }
            case "sort": {
                sortGiven = true;
                const items = value.split(",");
                for (const item of items) {
                    if (item === "") {
                        add(name, "empty_value");
                        continue;
                    }
                    const descending = item.startsWith("-");
                    const field = descending ? item.slice(1) : item;
                    if (!isSortField(field)) add(name, "unknown_sort_field");
                    else if (query.sort.some((key) => key.field === field)) add(name, "duplicate_sort_field");
                    else query.sort.push({ field, direction: descending ? "desc" : "asc" });
                }
                if (items.length > MAX_SORT_FIELDS) add(name, "too_many_sort_fields");
                break;
            }
        }
    }

    if (details.length > 0) return { ok: false, details };
    if (!sortGiven) query.sort.push({ field: "publishedAt", direction: "desc" });
    query.sort.push({ field: "id", direction: query.sort[query.sort.length - 1].direction });
    return { ok: true, query };
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
