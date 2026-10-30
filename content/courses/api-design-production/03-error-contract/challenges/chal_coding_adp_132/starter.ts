import { readFileSync } from "node:fs";

// CodeDev public API: every endpoint answers errors with ONE contract.
//
//   { "error": { "code": "VALIDATION_FAILED", "message": "...",
//                "details": [ { "field": "level", "issue": "..." } ], "traceId": "..." } }
//
// Write formatError(err, ctx): it turns an internal error into { status, body } of that contract.
// traceId is always ctx.traceId (the id of the current request, also written to the logs).
//
// validation -> 422, code "VALIDATION_FAILED", message "The request has invalid fields."
//               details: one { field, issue } per issue
//                 field = the issue's path joined with "." (["lessons", 2, "title"] -> "lessons.2.title")
//                 issue = the issue's message
//               sort details by field (plain string comparison, a < b); issues with the same field
//               keep the order they had in err.issues.
// domain     -> the error's own status, code and message, details []
//               ONLY when status is an integer from 400 to 499 and code is UPPER_SNAKE_CASE
//               (/^[A-Z][A-Z0-9_]*$/). Otherwise treat it as unknown.
// unknown    -> 500, code "INTERNAL", message "An unexpected error occurred.", details []
//               (anything else too). Never copy the internal message or stack into the response.

type ValidationIssue = { path: (string | number)[]; message: string };
type InternalError =
    | { type: "validation"; issues: ValidationIssue[] }
    | { type: "domain"; status: number; code: string; message: string }
    | { type: "unknown"; message: string; stack?: string };

type ErrorDetail = { field: string; issue: string };
type ErrorResponse = {
    status: number;
    body: { error: { code: string; message: string; details: ErrorDetail[]; traceId: string } };
};

function formatError(err: InternalError, ctx: { traceId: string }): ErrorResponse {
    // TODO: build the contract for each kind of internal error
    return { status: 500, body: { error: { code: "INTERNAL", message: "", details: [], traceId: "" } } };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: { cases: { traceId: string; error: InternalError }[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(input.cases.map((c) => formatError(c.error, { traceId: c.traceId }))));
