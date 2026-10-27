"""
tools/perf/bottleneck.py - reads a step load test of POST /api/submissions (per step: offered rate,
and per resource: average utilization and the wait samples of the requests that used it) and
reports the first bottleneck.

Bug report: on the exam-day step test it reported db_pool at 340 req/s, the last step of the test,
although the p95 pool wait was already above the limit at 280 req/s. It also lists judge_workers as
saturated, although no submit request ever waits for a judge worker. Fix find_first_bottleneck so
that it follows the rule in the challenge description.
"""
import json
import math
import sys

BUSY_UTIL = 0.85


def percentile(values, p):
    """Nearest-rank percentile: rank = ceil(p/100 * n), value = sorted[rank - 1]; None if empty."""
    if not values:
        return None
    ordered = sorted(values)
    rank = math.ceil(p * len(ordered) / 100)
    return ordered[max(rank, 1) - 1]


def valid_rate(rate):
    return isinstance(rate, (int, float)) and not isinstance(rate, bool) and rate > 0


def find_first_bottleneck(case):
    limit = case["wait_limit_ms"]
    steps = sorted((s for s in case["steps"] if valid_rate(s.get("rate"))), key=lambda s: s["rate"])

    saturated = {}
    for step in steps:
        for name, resource in step.get("resources", {}).items():
            wait = percentile(resource.get("waits_ms") or [], 95)
            busy = resource.get("util", 0) >= BUSY_UTIL
            if busy or (wait is not None and wait > limit):
                saturated[name] = {"resource": name, "from_rate": step["rate"], "p95_wait_ms": wait}

    ranked = sorted(saturated.values(), key=lambda r: (r["from_rate"], -(r["p95_wait_ms"] or 0), r["resource"]))
    for r in ranked:
        if r["p95_wait_ms"] is not None:
            r["p95_wait_ms"] = round(r["p95_wait_ms"], 1)
    first = ranked[0] if ranked else None
    return {
        "first_bottleneck": first["resource"] if first else None,
        "at_rate": first["from_rate"] if first else None,
        "saturated": ranked,
    }


# ---------------------------------------------------------------- test runner (do not change)
# Reads one step load test (JSON on stdin) and prints the bottleneck report as JSON.
def main():
    case = json.load(sys.stdin)
    print(json.dumps(find_first_bottleneck(case)))


if __name__ == "__main__":
    main()
