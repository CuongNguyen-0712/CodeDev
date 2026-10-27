"""
Find the first bottleneck in a step load test of POST /api/submissions: the resource where
requests started to wait first, at the lowest offered rate (see the challenge description).
"""
import json
import math
import sys


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
            # Saturation = work waiting for the resource; utilization alone says nothing about waiting.
            if wait is not None and wait > limit:
                saturated[name] = {"resource": name, "from_rate": step["rate"], "p95_wait_ms": wait}

    ranked = sorted(saturated.values(), key=lambda r: (r["from_rate"], -r["p95_wait_ms"], r["resource"]))
    for r in ranked:
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
