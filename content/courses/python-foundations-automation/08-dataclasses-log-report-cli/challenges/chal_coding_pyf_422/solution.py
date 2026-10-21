"""Turn raw Lotus Mart app log lines into a per-endpoint latency report."""
import json
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime

LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR")


@dataclass(frozen=True, slots=True)
class LogEntry:
    time: datetime
    level: str
    method: str
    endpoint: str
    status: int
    duration_ms: int


def parse_line(line: str) -> LogEntry | None:
    parts = line.split()
    if len(parts) != 6:
        return None
    time_text, level, method, target, status_text, duration_text = parts
    if level not in LEVELS or not duration_text.endswith("ms"):
        return None
    try:
        time = datetime.fromisoformat(time_text)
        status = int(status_text)
        duration_ms = int(duration_text.removesuffix("ms"))
    except ValueError:
        return None
    if time.tzinfo is None:
        return None  # no UTC offset: cannot be compared with the other lines
    endpoint = target.partition("?")[0]
    return LogEntry(time, level, method, endpoint, status, duration_ms)


def build_report(entries: list[LogEntry], top: int) -> dict:
    levels = Counter(e.level for e in entries)
    stats: dict[str, list[int]] = {}  # endpoint -> [requests, errors, total_ms]
    for e in entries:
        s = stats.setdefault(e.endpoint, [0, 0, 0])
        s[0] += 1
        s[1] += e.status >= 500
        s[2] += e.duration_ms
    rows = [
        {"endpoint": endpoint, "requests": n, "errors": errors, "avg_ms": total // n}
        for endpoint, (n, errors, total) in stats.items()
    ]
    rows.sort(key=lambda row: (-row["avg_ms"], row["endpoint"]))
    return {"levels": dict(levels), "endpoints": rows[:top]}


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
