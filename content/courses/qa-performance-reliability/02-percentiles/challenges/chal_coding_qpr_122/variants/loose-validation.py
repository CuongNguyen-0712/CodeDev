"""
Variant: bool values pass the type checks (True is an int in Python) and status 4xx counts as success.
"""
import json
import math
import sys


def percentile(sorted_ms, p):
    """Nearest-rank percentile of an ascending list; None when the list is empty."""
    if not sorted_ms:
        return None
    rank = math.ceil(p / 100 * len(sorted_ms))
    return sorted_ms[rank - 1]


def is_number(value):
    # bool is a subclass of int in Python: True is not a duration
    return isinstance(value, (int, float))


def is_valid(sample):
    return (
        isinstance(sample, dict)
        and isinstance(sample.get("endpoint"), str)
        and sample["endpoint"] != ""
        and is_number(sample.get("ms"))
        and sample["ms"] >= 0
        and isinstance(sample.get("status"), int)
    )


def summarize(samples):
    """Per-endpoint summary of raw load test samples (see the description)."""
    ok = {}
    failed = {}
    invalid = 0
    for sample in samples:
        if not is_valid(sample):
            invalid += 1
            continue
        name = sample["endpoint"]
        ok.setdefault(name, [])
        failed.setdefault(name, 0)
        if 200 <= sample["status"] <= 499:
            ok[name].append(sample["ms"])
        else:
            failed[name] += 1

    endpoints = []
    for name in sorted(ok):
        ms = sorted(ok[name])
        endpoints.append({
            "endpoint": name,
            "count": len(ms),
            "failed": failed[name],
            "mean": round(sum(ms) / len(ms), 1) if ms else None,
            "p50": percentile(ms, 50),
            "p95": percentile(ms, 95),
            "p99": percentile(ms, 99),
        })
    return {"endpoints": endpoints, "invalid": invalid}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case {"samples": [...]} as JSON from stdin and prints the summary as JSON.
def main():
    case = json.load(sys.stdin)
    print(json.dumps(summarize(case["samples"])))


if __name__ == "__main__":
    main()
