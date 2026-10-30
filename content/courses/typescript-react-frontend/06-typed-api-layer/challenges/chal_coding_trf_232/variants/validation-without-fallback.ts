// Wrong variant: reads the 422 field errors with a cast, no fallback when "errors" is missing.
import { readFileSync } from "node:fs";

// shared/api: turn whatever GET /api/courses answered into one ApiResult<CoursePage>.
// Components never see a raw Response, never call JSON.parse and never guess what a status means.
//
// toApiResult(raw), the first matching rule wins:
//   1. raw.networkError is true                         -> error { kind: "network" }
//   2. status 200-299:
//        the content type, without parameters (";charset=..."), trimmed and lowercased,
//        is "application/json" AND the body parses with JSON.parse AND the value is a CoursePage
//                                                       -> { ok: true, data }
//        content type is not JSON, or the body does not parse
//                                                       -> error { kind: "bad_response", status, reason: "not_json" }
//        it parses but is not a CoursePage              -> error { kind: "bad_response", status, reason: "invalid_shape" }
//   3. 401 -> { kind: "unauthorized" }   403 -> { kind: "forbidden" }   404 -> { kind: "not_found" }
//   4. 422 -> { kind: "validation", fieldErrors }: when the body is JSON (same content-type rule) and is an
//      object whose "errors" property is an object (not null, not an array), fieldErrors holds its entries
//      whose value is a string, in their original order; in every other case fieldErrors is {}.
//   5. 429 -> { kind: "rate_limited", retryAfter }: raw.retryAfter when it is an integer >= 0, otherwise null.
//   6. 500-599 -> { kind: "server", status }
//   7. any other status (1xx, 3xx, 400, 409, ...) -> { kind: "bad_response", status, reason: "unexpected_status" }
//
// A CoursePage is an object with:
//   items: an array in which every element is a Course
//   total: an integer >= 0
// A Course is an object with: id string, title string, level "beginner" | "intermediate" | "advanced",
//   tags an array of strings, rating a number from 0 to 5, learners an integer >= 0, updatedAt string.
//   Extra properties are allowed.
//
// describeError(error): the message the catalog shows, exactly:
//   network       "Cannot reach CodeDev. Check your connection and try again."
//   unauthorized  "Your session has expired. Please sign in again."
//   forbidden     "You do not have access to this."
//   not_found     "This item no longer exists."
//   validation    "Please fix: <field>: <message>; <field>: <message>" (fields in order),
//                 or "The request was rejected. Please check your input." when there are no field errors
//   rate_limited  "Too many requests. Try again in <retryAfter> seconds."
//                 or "Too many requests. Please wait a moment and try again." when retryAfter is null
//   server        "CodeDev is having a problem (<status>). Please try again later."
//   bad_response  "Unexpected response from CodeDev (<status>)."
// Write it as a switch on error.kind that ends in assertNever, so a new kind is a compile error.
//
// Do not change the types, assertNever or the test runner.

type Level = "beginner" | "intermediate" | "advanced";

interface Course {
    id: string;
    title: string;
    level: Level;
    tags: string[];
    rating: number;
    learners: number;
    updatedAt: string;
}

interface CoursePage {
    items: Course[];
    total: number;
}

type ApiError =
    | { kind: "network" }
    | { kind: "unauthorized" }
    | { kind: "forbidden" }
    | { kind: "not_found" }
    | { kind: "validation"; fieldErrors: Record<string, string> }
    | { kind: "rate_limited"; retryAfter: number | null }
    | { kind: "server"; status: number }
    | { kind: "bad_response"; status: number; reason: "not_json" | "invalid_shape" | "unexpected_status" };

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

// What the fetch wrapper saw. networkError: fetch itself rejected (offline, DNS, CORS).
interface RawResponse {
    networkError: boolean;
    status: number;
    contentType: string;
    body: string;
    retryAfter?: number | null;
}

function assertNever(value: never): never {
    throw new Error(`unexpected error kind: ${JSON.stringify(value)}`);
}

const LEVELS: readonly string[] = ["beginner", "intermediate", "advanced"];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCourse(value: unknown): value is Course {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.title === "string" &&
        typeof value.level === "string" &&
        LEVELS.includes(value.level) &&
        Array.isArray(value.tags) &&
        value.tags.every((tag) => typeof tag === "string") &&
        typeof value.rating === "number" &&
        value.rating >= 0 &&
        value.rating <= 5 &&
        Number.isInteger(value.learners) &&
        (value.learners as number) >= 0 &&
        typeof value.updatedAt === "string"
    );
}

function isCoursePage(value: unknown): value is CoursePage {
    return (
        isRecord(value) &&
        Array.isArray(value.items) &&
        value.items.every(isCourse) &&
        Number.isInteger(value.total) &&
        (value.total as number) >= 0
    );
}

// undefined = "not JSON": wrong content type, or the body does not parse.
function parseJsonBody(raw: RawResponse): { value: unknown } | undefined {
    const mediaType = raw.contentType.split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json") return undefined;
    try {
        return { value: JSON.parse(raw.body) };
    } catch {
        return undefined;
    }
}

function fieldErrorsOf(raw: RawResponse): Record<string, string> {
    const parsed = parseJsonBody(raw);
    const fieldErrors: Record<string, string> = {};
    if (!parsed || !isRecord(parsed.value) || !isRecord(parsed.value.errors)) return fieldErrors;
    for (const [field, message] of Object.entries(parsed.value.errors)) {
        if (typeof message === "string") fieldErrors[field] = message;
    }
    return fieldErrors;
}

function fail(error: ApiError): ApiResult<never> {
    return { ok: false, error };
}

function toApiResult(raw: RawResponse): ApiResult<CoursePage> {
    if (raw.networkError) return fail({ kind: "network" });
    const status = raw.status;
    if (status >= 200 && status <= 299) {
        const parsed = parseJsonBody(raw);
        if (!parsed) return fail({ kind: "bad_response", status, reason: "not_json" });
        if (!isCoursePage(parsed.value)) return fail({ kind: "bad_response", status, reason: "invalid_shape" });
        return { ok: true, data: parsed.value };
    }
    if (status === 401) return fail({ kind: "unauthorized" });
    if (status === 403) return fail({ kind: "forbidden" });
    if (status === 404) return fail({ kind: "not_found" });
    if (status === 422) {
        const body = JSON.parse(raw.body) as { errors: Record<string, string> };
        return fail({ kind: "validation", fieldErrors: body.errors });
    }
    if (status === 429) {
        const r = raw.retryAfter;
        return fail({ kind: "rate_limited", retryAfter: typeof r === "number" && Number.isInteger(r) && r >= 0 ? r : null });
    }
    if (status >= 500 && status <= 599) return fail({ kind: "server", status });
    return fail({ kind: "bad_response", status, reason: "unexpected_status" });
}

function describeError(error: ApiError): string {
    switch (error.kind) {
        case "network":
            return "Cannot reach CodeDev. Check your connection and try again.";
        case "unauthorized":
            return "Your session has expired. Please sign in again.";
        case "forbidden":
            return "You do not have access to this.";
        case "not_found":
            return "This item no longer exists.";
        case "validation": {
            const fields = Object.entries(error.fieldErrors);
            if (fields.length === 0) return "The request was rejected. Please check your input.";
            return "Please fix: " + fields.map(([field, message]) => `${field}: ${message}`).join("; ");
        }
        case "rate_limited":
            return error.retryAfter === null
                ? "Too many requests. Please wait a moment and try again."
                : `Too many requests. Try again in ${error.retryAfter} seconds.`;
        case "server":
            return `CodeDev is having a problem (${error.status}). Please try again later.`;
        case "bad_response":
            return `Unexpected response from CodeDev (${error.status}).`;
        default:
            return assertNever(error);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
const raw: RawResponse = JSON.parse(readFileSync(0, "utf8"));
const result = toApiResult(raw);
if (result.ok) {
    console.log(JSON.stringify({ ok: true, total: result.data.total, ids: result.data.items.map((c) => c.id) }));
} else {
    console.log(JSON.stringify({ ok: false, error: result.error, message: describeError(result.error) }));
}
