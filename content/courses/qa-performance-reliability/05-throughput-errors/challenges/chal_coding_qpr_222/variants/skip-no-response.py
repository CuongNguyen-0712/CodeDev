"""
The load test of the CodeDev API for exam day recorded one row per request. The ramps at the
start and the end ran at lower rates, so the report must use the steady-state window only.
Write summarize(run): throughput and error rate per endpoint and in total, for the requests the
generator SENT inside the window.

Input (stdin, JSON):
  {"window": {"start_ms": 300000, "end_ms": 1200000},
   "requests": [[sent_ms, "POST /api/submissions", status, duration_ms], ...]}
  sent_ms is when the request was sent (ms since the test started), duration_ms how long the
  client waited. status 0 means no response: the client timed out or the connection failed.

Rules
  The window is [start_ms, end_ms): a request belongs to it when start_ms <= sent_ms < end_ms,
  whenever its response arrived. end_ms - start_ms must be a whole number of seconds, at least
  1000 ms (both integers), otherwise the output is
  {"error": "window must be a whole number of seconds"}.
  Every request in the window counts in "requests" and falls in exactly one class:
    200-399            ok
    429                throttled      (rate limiting: not served, but not a failure)
    other 400-499      client_errors  (usually a broken test script, e.g. 401 from an expired token)
    500-599            errors
    0                  errors, and also counted in timeouts
  For each endpoint that has requests in the window, and for "total" (all endpoints):
    requests, ok, errors, timeouts, throttled, client_errors (counts)
    rps        = round(requests / window seconds, 2)   offered throughput
    ok_rps     = round(ok / window seconds, 2)         served throughput (goodput)
    error_rate = round(errors / requests, 4)            null when requests is 0
  An endpoint without requests in the window is left out; "total" is always present.

Output (stdout, JSON):
  {"window_s": 900, "endpoints": {"GET /api/leaderboard": {...}, ...}, "total": {...}}
"""
import json
import sys

FIELDS = ("requests", "ok", "errors", "timeouts", "throttled", "client_errors")


def classify(status):
    if 200 <= status <= 399:
        return "ok"
    if status == 429:
        return "throttled"
    if 400 <= status <= 499:
        return "client_errors"
    return "errors"  # 5xx, and 0 = no response


def finish(counts, seconds):
    n = counts["requests"]
    return {
        **counts,
        "rps": round(n / seconds, 2),
        "ok_rps": round(counts["ok"] / seconds, 2),
        "error_rate": round(counts["errors"] / n, 4) if n else None,
    }


def summarize(run):
    start, end = run["window"]["start_ms"], run["window"]["end_ms"]
    if not (isinstance(start, int) and isinstance(end, int)) or end - start < 1000 or (end - start) % 1000:
        return {"error": "window must be a whole number of seconds"}
    seconds = (end - start) // 1000

    total = dict.fromkeys(FIELDS, 0)
    per_endpoint = {}
    for sent_ms, endpoint, status, _duration_ms in run["requests"]:
        if status == 0 or not start <= sent_ms < end:
            continue
        counts = per_endpoint.setdefault(endpoint, dict.fromkeys(FIELDS, 0))
        for c in (counts, total):
            c["requests"] += 1
            c[classify(status)] += 1
            if status == 0:
                c["timeouts"] += 1
    return {
        "window_s": seconds,
        "endpoints": {name: finish(c, seconds) for name, c in sorted(per_endpoint.items())},
        "total": finish(total, seconds),
    }


# ---------------------------------------------------------------- test runner (do not change)
def main():
    run = json.load(sys.stdin)
    print(json.dumps(summarize(run)))


if __name__ == "__main__":
    main()
