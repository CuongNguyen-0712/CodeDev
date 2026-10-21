"""
Turn raw Lotus Mart app log lines into a per-endpoint latency report.

Every log line has 6 fields separated by whitespace:

    2026-10-10T02:13:07+07:00 ERROR POST /api/checkout?step=pay 504 1830ms
    time                      level method target           status duration

parse_line(line) returns a LogEntry, or None when the line is malformed:
  - it must have exactly 6 fields;
  - time: an ISO 8601 timestamp WITH a UTC offset ("+07:00" or "Z"), read with
    datetime.fromisoformat; a timestamp without an offset is malformed;
  - level: exactly one of DEBUG, INFO, WARNING, ERROR (upper case);
  - status: an integer; duration: an integer followed by "ms" (e.g. "1830ms");
  - the endpoint is the target without its query string: "/api/orders?page=2" -> "/api/orders".
  A malformed line must never crash the script: return None.

build_report(entries, top) gets the valid entries only and returns a dict:
  - "levels": how many entries there are per level, e.g. {"INFO": 4, "ERROR": 2};
  - "endpoints": the `top` endpoints with the highest average duration, each as
    {"endpoint": str, "requests": int, "errors": int, "avg_ms": int}, where errors counts
    statuses >= 500 and avg_ms is the total duration // requests (rounded down).
    Sort by avg_ms, largest first; equal averages by endpoint name (A to Z).
    top = 0 gives [], a top larger than the number of endpoints gives all of them.

The runner adds "total" (number of lines) and "malformed" (lines parse_line rejected).

Example: lines = ["2026-10-10T02:13:07+07:00 ERROR POST /api/checkout 504 1830ms",
                  "2026-10-10T02:13:12+07:00 INFO GET /api/orders?page=2 200 64ms",
                  "payment-gateway: connection reset by peer"], top = 1
  -> {"total": 3, "malformed": 1, "levels": {"ERROR": 1, "INFO": 1},
      "endpoints": [{"endpoint": "/api/checkout", "requests": 1, "errors": 1, "avg_ms": 1830}]}
"""
import json
import sys
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class LogEntry:
    time: datetime
    level: str
    method: str
    endpoint: str
    status: int
    duration_ms: int


def parse_line(line: str) -> LogEntry | None:
    # TODO: validate every field and return None for a malformed line.
    time_text, level, method, target, status_text, duration_text = line.split()
    return LogEntry(datetime.fromisoformat(time_text), level, method, target,
                    int(status_text), int(duration_text.removesuffix("ms")))


def build_report(entries: list[LogEntry], top: int) -> dict:
    # TODO: count levels and build the endpoint ranking.
    return {"levels": {}, "endpoints": []}


# ---- test runner (do not change)
# Reads one test case (JSON) from stdin: {"lines": [...], "top": N}. Prints the report as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    parsed = [parse_line(line) for line in case["lines"]]
    if any(e is not None and not isinstance(e, LogEntry) for e in parsed):
        print(json.dumps({"error": "parse_line must return a LogEntry or None"}))
    else:
        entries = [e for e in parsed if e is not None]
        report = build_report(entries, case["top"])
        print(json.dumps({"total": len(parsed), "malformed": len(parsed) - len(entries), **report}))
