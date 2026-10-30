import { readFileSync } from "node:fs";

// CodeDev public API (https://api.codedev.test/v1): the services for courses and enrollments
// return a business outcome, and one function turns it into the HTTP answer. Write toHttp(outcome).
//
// Return { status, code } and, for 429 and 503 only, also retryAfter (whole seconds).
// code is null for a success, otherwise the error code of the course's error contract.
//
//   kind                     status  code
//   "ok"                     200     null
//   "created"                201     null
//   "accepted_async"         202     null     (work queued, not done yet)
//   "deleted"                204     null
//   "malformed_request"      400     "MALFORMED_REQUEST"   (body or query cannot be parsed)
//   "validation_failed"      422     "VALIDATION_FAILED"   (well-formed, but a field breaks a rule)
//   "not_authenticated"      401     "UNAUTHENTICATED"
//   "forbidden"              403     "FORBIDDEN"
//                            but when visibleToCaller is false: 404 "NOT_FOUND" (do not reveal it exists)
//   "plan_required"          403     "PLAN_REQUIRED"       (premium course, free plan)
//   "not_found"              404     "NOT_FOUND"
//   "already_enrolled"       409     "ALREADY_ENROLLED"
//   "rate_limited"           429     "RATE_LIMITED"        + retryAfter
//   "dependency_unavailable" 503     "SERVICE_UNAVAILABLE" + retryAfter
//   anything else (unknown, misspelled, other case, missing kind): 500 "INTERNAL"
//
// retryAfter = retryAfterSeconds rounded UP to a whole number, at least 1; 60 when retryAfterSeconds
// is missing. Other statuses never have retryAfter, even when the outcome carries retryAfterSeconds.
// visibleToCaller defaults to true.

type Outcome = { kind?: string; visibleToCaller?: boolean; retryAfterSeconds?: number };
type HttpAnswer = { status: number; code: string | null; retryAfter?: number };

const TABLE: Record<string, [number, string | null]> = {
    ok: [200, null],
    created: [201, null],
    accepted_async: [202, null],
    deleted: [204, null],
    malformed_request: [400, "MALFORMED_REQUEST"],
    validation_failed: [422, "VALIDATION_FAILED"],
    not_authenticated: [401, "UNAUTHENTICATED"],
    forbidden: [403, "FORBIDDEN"],
    plan_required: [403, "PLAN_REQUIRED"],
    not_found: [404, "NOT_FOUND"],
    already_enrolled: [409, "ALREADY_ENROLLED"],
    rate_limited: [429, "RATE_LIMITED"],
    dependency_unavailable: [503, "SERVICE_UNAVAILABLE"],
};

function toHttp(outcome: Outcome): HttpAnswer {
    const kind = outcome.kind;
    const entry = kind !== undefined && Object.hasOwn(TABLE, kind) ? TABLE[kind] : undefined;
    if (!entry) return { status: 500, code: "INTERNAL" };
    const [status, code] = entry;
    if (status === 429 || status === 503) {
        const seconds = outcome.retryAfterSeconds ?? 60;
        return { status, code, retryAfter: Math.max(1, Math.ceil(seconds)) };
    }
    return { status, code };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: { outcomes: Outcome[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(input.outcomes.map(toHttp)));
