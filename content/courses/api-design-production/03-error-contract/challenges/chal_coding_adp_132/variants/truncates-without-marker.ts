import { readFileSync } from "node:fs";

// CodeDev API error contract: every error, whatever threw it, leaves the API through formatError as
// one application/problem+json body (RFC 9457) with four extension members:
//   { type, title, status, code, message, details, traceId, instance }
//
// - AppError (domain errors, already mapped to a status): code, status and message as given;
//   details from its details list.
// - ValidationFailed (from the ValidationPipe): status 400, code "VALIDATION_FAILED",
//   message "request.invalid", details from its errors list.
// - HttpError (framework errors: unknown route, wrong method, guard): its status,
//   code "HTTP_<status>" (e.g. "HTTP_404"), its message; no details.
// - Anything else (Error, string, null, plain object): status 500, code "INTERNAL_ERROR".
// - An AppError or HttpError whose status is not a whole number from 400 to 599 is a bug: treat it
//   as "anything else".
// - status >= 500: message is "server.error" and details is [] - never the thrown message or stack.
//   An AppError keeps its own code (a stable machine code is safe to show).
// - message is passed through exactly as given: it is a message key ("course.not_found") that the
//   clients translate, so do not trim, change case or translate it.
// - details: keep only entries that are objects with a string "field"; output exactly
//   { field, code, message } (a code or message that is not a string becomes ""), never other
//   members such as the rejected "value". Sort by field, then code (compare with < and >). Keep
//   at most MAX_DETAILS; when more are left, keep the first MAX_DETAILS and append
//   TRUNCATION_MARKER.
// - type is PROBLEM_BASE + code in lowercase with "_" replaced by "-"
//   ("COURSE_NOT_FOUND" -> ".../problems/course-not-found").
// - title is TITLES[status], or "Error" for a status not in the table.
// - traceId is ctx.traceId when it is a non-empty string, otherwise "unknown"; instance is ctx.path.
// - headers: exactly { "Content-Type": "application/problem+json" }.

type FieldError = { field: string; code: string; message: string };

class AppError extends Error {
    constructor(readonly code: string, readonly status: number, message: string, readonly details: unknown[] = []) {
        super(message);
    }
}
class ValidationFailed extends Error {
    constructor(readonly errors: unknown[]) {
        super("validation failed");
    }
}
class HttpError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

type RequestContext = { path: string; traceId?: unknown };
type Problem = {
    type: string;
    title: string;
    status: number;
    code: string;
    message: string;
    details: FieldError[];
    traceId: string;
    instance: string;
};
type ErrorResponse = { status: number; headers: Record<string, string>; body: Problem };

const PROBLEM_BASE = "https://api.codedev.test/problems/";
const MAX_DETAILS = 10;
const TRUNCATION_MARKER: FieldError = { field: "*", code: "DETAILS_TRUNCATED", message: "details.truncated" };
const TITLES: Record<number, string> = {
    400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found",
    405: "Method Not Allowed", 409: "Conflict", 410: "Gone", 412: "Precondition Failed",
    422: "Unprocessable Content", 429: "Too Many Requests", 500: "Internal Server Error",
    502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
};

const validStatus = (s: number) => Number.isInteger(s) && s >= 400 && s <= 599;

function toDetails(list: unknown[]): FieldError[] {
    const clean: FieldError[] = [];
    for (const d of list) {
        if (typeof d !== "object" || d === null) continue;
        const { field, code, message } = d as Record<string, unknown>;
        if (typeof field !== "string") continue;
        clean.push({ field, code: typeof code === "string" ? code : "", message: typeof message === "string" ? message : "" });
    }
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    clean.sort((a, b) => cmp(a.field, b.field) || cmp(a.code, b.code));
    return clean.length > MAX_DETAILS ? clean.slice(0, MAX_DETAILS) : clean;
}

function formatError(thrown: unknown, ctx: RequestContext): ErrorResponse {
    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "server.error";
    let details: FieldError[] = [];

    if (thrown instanceof AppError && validStatus(thrown.status)) {
        ({ status, code, message } = thrown);
        details = toDetails(thrown.details);
    } else if (thrown instanceof ValidationFailed) {
        status = 400;
        code = "VALIDATION_FAILED";
        message = "request.invalid";
        details = toDetails(thrown.errors);
    } else if (thrown instanceof HttpError && validStatus(thrown.status)) {
        status = thrown.status;
        code = `HTTP_${status}`;
        message = thrown.message;
    }
    if (status >= 500) {
        message = "server.error";
        details = [];
    }

    return {
        status,
        headers: { "Content-Type": "application/problem+json" },
        body: {
            type: PROBLEM_BASE + code.toLowerCase().replace(/_/g, "-"),
            title: TITLES[status] ?? "Error",
            status,
            code,
            message,
            details,
            traceId: typeof ctx.traceId === "string" && ctx.traceId !== "" ? ctx.traceId : "unknown",
            instance: ctx.path,
        },
    };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { cases: [{ thrown, ctx }] }. thrown describes what the handler threw:
//   { kind: "app", code, status, message, details? }   -> new AppError(...)
//   { kind: "validation", errors }                     -> new ValidationFailed(errors)
//   { kind: "http", status, message }                  -> new HttpError(status, message)
//   { kind: "error", message, stack? }                 -> new Error(message) (stack kept)
//   { kind: "raw", value }                             -> value itself (a string, null, an object)
// Output: one { status, headers, body } per case, in order.
type Thrown = { kind: string; [key: string]: any };

function rebuild(t: Thrown): unknown {
    switch (t.kind) {
        case "app": return new AppError(t.code, t.status, t.message, t.details);
        case "validation": return new ValidationFailed(t.errors);
        case "http": return new HttpError(t.status, t.message);
        case "error": {
            const e = new Error(t.message);
            if (typeof t.stack === "string") e.stack = t.stack;
            return e;
        }
        default: return t.value;
    }
}

const { cases }: { cases: { thrown: Thrown; ctx: RequestContext }[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(cases.map((c) => {
    try {
        throw rebuild(c.thrown);
    } catch (error) {
        return formatError(error, c.ctx);
    }
})));
