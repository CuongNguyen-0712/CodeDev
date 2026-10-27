import { readFileSync } from "node:fs";

// Domain errors -> HTTP problem responses. The enrollment service throws the domain errors below and knows
// nothing about HTTP; one function at the edge decides what the client sees.

// ---------------------------------------------------------------- domain errors (do not change)
class DomainError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}
class CourseNotFound extends DomainError {
    constructor(readonly courseId: string) { super(`course ${courseId} not found`); }
}
class AlreadyEnrolled extends DomainError {
    constructor(readonly userId: string, readonly courseId: string) { super(`user ${userId} already enrolled in ${courseId}`); }
}
class PrerequisitesMissing extends DomainError {
    constructor(readonly courseId: string, readonly missing: string[]) { super(`prerequisites missing for ${courseId}`); }
}
class ValidationFailed extends DomainError {
    constructor(readonly errors: { field: string; message: string; value?: unknown }[]) { super(`${errors.length} invalid field(s)`); }
}
class NotAllowed extends DomainError {
    constructor(readonly action: string) { super(`not allowed to ${action}`); }
}
class PaymentRequired extends DomainError {
    constructor(readonly courseId: string, readonly priceVnd: number) { super(`payment required for ${courseId}`); }
}
class EnrollmentClosed extends DomainError {
    constructor(readonly courseId: string) { super(`enrollment closed for ${courseId}`); }
}

type ProblemRequest = { method: string; path: string; headers: Record<string, string | undefined> };
type HttpResponse = { status: number; headers: Record<string, string>; body: Record<string, unknown> };

// ---------------------------------------------------------------- your mapping
// toProblemResponse(error, req, newId) turns anything a handler threw into one HTTP response with an
// application/problem+json body (RFC 9457). In the NestJS app this runs inside a global exception filter.
//
// Correlation id: use req.headers["x-correlation-id"] when it is a string of 8 to 64 characters,
// each A-Z, a-z, 0-9 or "-" (/^[A-Za-z0-9-]{8,64}$/); otherwise call newId() exactly once and use its value.
// Do not call newId() when the header is usable.
//
// Response: headers { "Content-Type": "application/problem+json", "X-Correlation-Id": <id> }
//           body    { type, title, status, detail, instance: req.path, correlationId: <id>, ...extensions }
// type is "https://api.codedev.test/problems/" + slug. Match the classes with instanceof:
//
//   error class            status  slug                   title                    detail                                              extensions
//   CourseNotFound          404    course-not-found       "Course not found"       "Course <courseId> does not exist."
//   AlreadyEnrolled         409    already-enrolled       "Already enrolled"       "You are already enrolled in <courseId>."
//   PrerequisitesMissing    422    prerequisites-missing  "Prerequisites missing"  "Finish <missing joined by ", "> before enrolling in <courseId>."   missing: [...]
//   ValidationFailed        400    validation-failed      "Invalid request"        "<number of errors> field(s) failed validation."      errors: [{ field, message }]
//   NotAllowed              403    not-allowed            "Not allowed"            "You are not allowed to <action>."
//   PaymentRequired         402    payment-required       "Payment required"       "<courseId> requires a premium plan."                 priceVnd
//   anything else           500    internal-error         "Internal server error"  "An unexpected error occurred. Quote the correlation id when you contact support."
//
// "Anything else" includes a plain Error, a thrown string or null, an object that only looks like a domain
// error, and a DomainError subclass that is not in the table. A 500 body never contains the error's message.
// ValidationFailed errors may carry the rejected value: copy only field and message.
// Do not change the domain errors, the types or the test runner.
function toProblemResponse(error: unknown, req: ProblemRequest, newId: () => string): HttpResponse {
    return { status: 500, headers: {}, body: {} };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "cases": [{ "error": ErrorSpec, "method"?, "path"?, "correlationId"? }] } or { "generate": { "count", "seed" } }.
// correlationId, when present, is sent as the x-correlation-id request header. newId() returns
// gen-0001, gen-0002, ... (one counter per test). Each case prints the response with JSON keys sorted;
// "generate" prints only a summary: responses per status, newId() calls and bodies that leaked internal text.
type ErrorSpec = { kind: string; [key: string]: unknown };
type Case = { error: ErrorSpec; method?: string; path?: string; correlationId?: string };
type Test = { cases?: Case[]; generate?: { count: number; seed: number } };

function build(spec: ErrorSpec): unknown {
    const s = (k: string) => String(spec[k]);
    switch (spec.kind) {
        case "CourseNotFound": return new CourseNotFound(s("courseId"));
        case "AlreadyEnrolled": return new AlreadyEnrolled(s("userId"), s("courseId"));
        case "PrerequisitesMissing": return new PrerequisitesMissing(s("courseId"), spec.missing as string[]);
        case "ValidationFailed": return new ValidationFailed(spec.errors as { field: string; message: string; value?: unknown }[]);
        case "NotAllowed": return new NotAllowed(s("action"));
        case "PaymentRequired": return new PaymentRequired(s("courseId"), Number(spec.priceVnd));
        case "EnrollmentClosed": return new EnrollmentClosed(s("courseId"));
        case "Error": return new Error(s("message"));
        case "TypeError": return new TypeError(s("message"));
        case "string": return s("value");
        case "null": return null;
        case "object": return spec.value;
        default: return new Error(`unknown spec ${spec.kind}`);
    }
}

function canon(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const o = value as Record<string, unknown>;
        return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
    }
    return value === undefined ? "undefined" : JSON.stringify(value);
}

function generate(count: number, seed: number): Case[] {
    let x = seed >>> 0;
    const pick = <T>(list: T[]): T => {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        return list[(x >>> 16) % list.length];
    };
    const cases: Case[] = [];
    for (let i = 0; i < count; i++) {
        const c = `c_${100 + (i % 37)}`;
        const error = pick<ErrorSpec>([
            { kind: "CourseNotFound", courseId: c },
            { kind: "AlreadyEnrolled", userId: `u_${i}`, courseId: c },
            { kind: "PrerequisitesMissing", courseId: c, missing: ["c_88", "c_95"].slice(0, 1 + (i % 2)) },
            { kind: "ValidationFailed", errors: [{ field: "email", message: "email must be a valid email address", value: `SECRET-${i}@x` }] },
            { kind: "NotAllowed", action: "enroll in this course" },
            { kind: "PaymentRequired", courseId: c, priceVnd: 149000 },
            { kind: "EnrollmentClosed", courseId: c },
            { kind: "Error", message: `duplicate key value violates unique constraint "enrollments_user_id_course_id_key" SECRET-${i}` },
            { kind: "TypeError", message: `Cannot read properties of undefined (reading 'plan') SECRET-${i}` },
            { kind: "object", value: { name: "CourseNotFound", courseId: c, message: `SECRET-${i}` } },
        ]);
        const correlationId = pick([undefined, undefined, `req-${String(i).padStart(6, "0")}`, "short", `bad id SECRET-${i}`]);
        cases.push({ error, path: `/enrollments`, method: "POST", correlationId });
    }
    return cases;
}

const test: Test = JSON.parse(readFileSync(0, "utf8"));
let generated = 0;
const newId = () => `gen-${String(++generated).padStart(4, "0")}`;
const run = (c: Case): HttpResponse => {
    const headers: Record<string, string | undefined> = {};
    if (c.correlationId !== undefined) headers["x-correlation-id"] = c.correlationId;
    return toProblemResponse(build(c.error), { method: c.method ?? "POST", path: c.path ?? "/enrollments", headers }, newId);
};
if (test.generate) {
    const statuses = new Map<number, number>();
    let leaks = 0;
    for (const c of generate(test.generate.count, test.generate.seed)) {
        const res = run(c);
        statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
        if (canon(res).includes("SECRET")) leaks++;
    }
    const list = [...statuses.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}:${n}`).join(" ");
    console.log(`statuses ${list}; newId calls ${generated}; responses with internal text ${leaks}`);
} else {
    (test.cases ?? []).forEach((c, i) => {
        let out: string;
        try {
            const res = run(c);
            out = `${res.status} headers=${canon(res.headers)} body=${canon(res.body)}`;
        } catch (error) {
            out = `threw ${error instanceof Error ? error.message : String(error)}`;
        }
        console.log(`#${i + 1} ${c.method ?? "POST"} ${c.path ?? "/enrollments"} ${c.error.kind} -> ${out}`);
    });
}
