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
// Complete chooseResponse: fill every [ ] line with the right piece. Do not change the types, the
// constants or the test runner.

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
    // @piece shared-values: Method, location check and a reply without headers
    const m = method.toUpperCase();
    const hasLocation = typeof outcome.location === "string" && outcome.location !== "";
    const plain = (status: number): Reply => ({ status, headers: {} });
    // @end

    switch (outcome.kind) {
        // @piece success-outcomes: Outcomes that succeeded (2xx)
        case "ok":
            return plain(m === "DELETE" ? 204 : 200);
        case "created":
            if (m !== "POST") return plain(201);
            return hasLocation ? { status: 201, headers: { Location: outcome.location! } } : plain(500);
        case "accepted":
            return hasLocation ? { status: 202, headers: { Location: outcome.location! } } : plain(500);
        case "already_exists":
            return plain(200);
        // @end
        // @piece plain-rejections: Rejections that need no header
        case "validation_failed":
            return plain(400);
        case "rule_violated":
            return plain(422);
        case "forbidden":
            return plain(outcome.hidden === true ? 404 : 403);
        case "not_found":
            return plain(404);
        case "version_conflict":
            return plain(409);
        case "payment_required":
            return plain(402);
        case "gone":
            return plain(410);
        // @end
        // @piece header-replies: Replies that tell the client what to do next
        case "unauthenticated":
            return { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="codedev"' } };
        case "rate_limited":
            return { status: 429, headers: { "Retry-After": retryAfter(outcome.retryAfterSeconds) } };
        case "dependency_down":
            return { status: 503, headers: { "Retry-After": retryAfter(outcome.retryAfterSeconds) } };
        case "method_not_allowed": {
            const allowed = new Set((outcome.allowed ?? []).map((a) => a.toUpperCase()));
            return { status: 405, headers: { Allow: ALLOW_ORDER.filter((a) => allowed.has(a)).join(", ") } };
        }
        // @end
        default:
            return plain(500);
    }
}

// @piece retry-after: Retry-After value in seconds
function retryAfter(seconds: unknown): string {
    const valid = typeof seconds === "number" && Number.isInteger(seconds) && seconds >= 0;
    return String(valid ? seconds : DEFAULT_RETRY_AFTER);
}
// @end

// ---------------------------------------------------------------- test runner (do not change)
// Input: { cases: [{ method, outcome }] }. Output: one { status, headers } per case, in order.
type Input = { cases: { method: string; outcome: Outcome }[] };

const { cases }: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(cases.map((c) => chooseResponse(c.method, c.outcome))));
