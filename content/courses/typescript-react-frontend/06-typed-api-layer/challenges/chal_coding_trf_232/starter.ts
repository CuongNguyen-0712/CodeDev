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

function isCourse(value: unknown): value is Course {
    // TODO: check every property of a Course (see the rules above). Extra properties are allowed.
    return false;
}

function isCoursePage(value: unknown): value is CoursePage {
    // TODO: items is an array of Course, total is an integer >= 0.
    return false;
}

function toApiResult(raw: RawResponse): ApiResult<CoursePage> {
    // TODO: apply the rules above in order: network error, 2xx (content type, JSON.parse, isCoursePage),
    // then the status codes. Never let JSON.parse throw out of this function.
    return { ok: false, error: { kind: "bad_response", status: raw.status, reason: "unexpected_status" } };
}

function describeError(error: ApiError): string {
    // TODO: switch (error.kind) { case "network": ... default: return assertNever(error); }
    return "Something went wrong";
}

// ---------------------------------------------------------------- test runner (do not change)
const raw: RawResponse = JSON.parse(readFileSync(0, "utf8"));
const result = toApiResult(raw);
if (result.ok) {
    console.log(JSON.stringify({ ok: true, total: result.data.total, ids: result.data.items.map((c) => c.id) }));
} else {
    console.log(JSON.stringify({ ok: false, error: result.error, message: describeError(result.error) }));
}
