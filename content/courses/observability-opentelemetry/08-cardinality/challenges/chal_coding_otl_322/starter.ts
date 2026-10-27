import { readFileSync } from "node:fs";

// Cardinality guard for the CodeDev API metrics. Every metric point goes through recordAll before it is
// exported; the guard must keep the number of series bounded whatever the requests look like.
//
// For each point, in input order:
//   1. Reject it (count it, record nothing) when metric is not a non-empty string or value is not a
//      finite number >= 0.
//   2. Normalise its labels (a missing labels object means no labels):
//      - drop the forbidden labels "user_id", "email" and "session_id", and every label whose value is "";
//      - "path" becomes "route": the route template of the raw path (routeTemplate). If the point already
//        has a non-empty "route" label, keep that one and drop "path";
//      - "status" keeps its name and becomes its class (statusClass);
//      - every other label is kept as is.
//   3. Cap: for each metric and each label name, the first maxValuesPerLabel distinct values (after
//      step 2, in the order the points arrive) are kept. A value already kept stays; a new value when
//      that many are already kept becomes "other", and the label name is reported as capped for that
//      metric. Metrics and label names are capped independently of each other.
//   4. Add value to its series: the metric name plus all its labels after steps 2 and 3.
//
// routeTemplate(path): cut the path at the first "?" or "#", split it on "/", drop empty segments,
//   replace a segment made only of digits with ":id" and a UUID (8-4-4-4-12 hexadecimal digits, upper or
//   lower case) with ":uuid", keep other segments as they are, and join with a leading "/" ("/" when no
//   segment is left). "/courses/42/lessons/7/?tab=hints" -> "/courses/:id/lessons/:id".
// statusClass(status): a three-digit code from 100 to 599 -> its first digit + "xx" ("404" -> "4xx");
//   anything else -> "unknown".
//
// recordAll returns the output lines:
//   - one line per series, in Prometheus text format: metric{name="value",...} total, label names sorted,
//     just "metric total" for a series without labels. Lines sorted by the text before the total, in
//     plain string order (< on strings);
//   - then, per metric in sorted order: "# <metric>: <n> series, capped: <label names sorted, joined with
//     ", ">" or "capped: none";
//   - last: "# total: <n> series, <r> rejected".
//
// Do not change the Point type or anything below the "do not change" line.

type Point = { metric: string; value: number; labels?: Record<string, string> };

function routeTemplate(path: string): string {
    return path;
}

function statusClass(status: string): string {
    return status;
}

function recordAll(points: Point[], maxValuesPerLabel: number): string[] {
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "maxValuesPerLabel": 3, "points": [{ "metric": "http_server_requests_total", "value": 1,
//   "labels": { "path": "/courses/42", "method": "GET", "status": "200", "user_id": "u_17" } }, ...] }
// Output: the lines returned by recordAll.
const input: { maxValuesPerLabel: number; points: Point[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(recordAll(input.points, input.maxValuesPerLabel).join("\n"));
