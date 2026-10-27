import { readFileSync } from "node:fs";

// CodeDev API: every handler reports a business outcome, and this one function turns it into the
// status code and the headers the client needs. One table for the whole API, so the same outcome
// gets the same answer on every endpoint.
//
// kind                 status                       headers
// ok                   204 for DELETE, 200 else     -
// created              201                          Location: <location>, only when the method is POST
// accepted             202                          Location: <location> (the status resource to poll)
// already_exists       200                          -
// validation_failed    400                          -
// rule_violated        422                          -
// unauthenticated      401                          WWW-Authenticate: Bearer realm="codedev"
// forbidden            403, or 404 when hidden      -
// not_found            404                          -
// version_conflict     409                          -
// payment_required     402                          -
// rate_limited         429                          Retry-After: <seconds>
// gone                 410                          -
// dependency_down      503                          Retry-After: <seconds>
// method_not_allowed   405                          Allow: <methods>
// anything else        500                          -
//
// - The method is compared case-insensitively ("delete" is DELETE).
// - Retry-After is retryAfterSeconds written as a string when it is a whole number >= 0,
//   otherwise "60" (the API's default).
// - Allow lists the allowed methods uppercased, without duplicates, in the order
//   GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, joined with ", "; other methods are dropped.
//   No method left (or no allowed list) gives an empty Allow header.
// - A POST "created" or any "accepted" without a non-empty location is a handler bug: 500, no headers.
// Header names are exactly Location, Retry-After, Allow and WWW-Authenticate.
// Write chooseResponse. Do not change the types, the constants or the test runner.

type Outcome = {
    kind: string;
    location?: string;
    hidden?: boolean;
    retryAfterSeconds?: unknown; // set by the handler, not always a whole number
    allowed?: string[];
};
type Reply = { status: number; headers: Record<string, string> };

const ALLOW_ORDER = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_RETRY_AFTER = 60;

function chooseResponse(method: string, outcome: Outcome): Reply {
    return { status: 200, headers: {} };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { cases: [{ method, outcome }] }. Output: one { status, headers } per case, in order.
type Input = { cases: { method: string; outcome: Outcome }[] };

const { cases }: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(cases.map((c) => chooseResponse(c.method, c.outcome))));
