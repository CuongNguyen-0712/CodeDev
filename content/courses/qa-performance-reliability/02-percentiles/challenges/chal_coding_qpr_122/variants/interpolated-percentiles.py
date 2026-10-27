"""
Variant: percentiles by linear interpolation (statistics.quantiles, inclusive) - not nearest rank.
"""
import json
import math
import statistics
import sys


def percentile(sorted_ms, p):
    """Nearest-rank percentile of an ascending list; None when the list is empty."""
    if not sorted_ms:
        return None
    if len(sorted_ms) == 1:
        return sorted_ms[0]
    cuts = statistics.quantiles(sorted_ms, n=100, method="inclusive")
    return round(cuts[p - 1], 1)


def is_number(value):
    # bool is a subclass of int in Python: True is not a duration
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_valid(sample):
    return (
        isinstance(sample, dict)
        and isinstance(sample.get("endpoint"), str)
        and sample["endpoint"] != ""
        and is_number(sample.get("ms"))
        and sample["ms"] >= 0
        and isinstance(sample.get("status"), int)
        and not isinstance(sample["status"], bool)
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
        if 200 <= sample["status"] <= 399:
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
