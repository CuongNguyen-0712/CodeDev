"""
Leaderboard and submit latency on CodeDev, from raw load test samples.

Each sample is one request recorded by the load generator:
    {"endpoint": "GET /api/leaderboard", "ms": 64.9, "status": 200}

Write summarize(samples). For every endpoint, sorted by name, return:
    {"endpoint": ..., "count": successful samples, "failed": failed samples,
     "mean": round(mean of successful ms, 1), "p50": ..., "p95": ..., "p99": ...}
and the number of invalid samples: {"endpoints": [...], "invalid": n}

- successful: status 200-399; failed: any other integer status (0 = no response, timeout).
  Failed samples are counted, never mixed into mean or percentiles.
- invalid (skipped, counted): not an object, endpoint not a non-empty string, ms not a number
  (true/false are not numbers) or below 0, status not an integer.
- percentile: nearest rank on the sorted successful ms, rank = ceil(p / 100 * n),
  value = sorted_ms[rank - 1]; no successful samples -> mean and percentiles are None.
"""
import json
import math
import sys


def percentile(sorted_ms, p):
    """Nearest-rank percentile of an ascending list; None when the list is empty."""
    # @piece nearest-rank: The nearest-rank value, None for an empty list
    if not sorted_ms:
        return None
    rank = math.ceil(p / 100 * len(sorted_ms))
    return sorted_ms[rank - 1]
    # @end


# @piece valid-sample: Which samples count, and which are invalid
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
# @end


def summarize(samples):
    """Per-endpoint summary of raw load test samples (see the description)."""
    ok = {}
    failed = {}
    invalid = 0
    for sample in samples:
        # @piece sort-sample: Skip invalid samples, split successes from failures
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
        # @end

    endpoints = []
    for name in sorted(ok):
        # @piece endpoint-row: One endpoint's row: counts, mean and percentiles
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
        # @end
    return {"endpoints": endpoints, "invalid": invalid}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case {"samples": [...]} as JSON from stdin and prints the summary as JSON.
def main():
    case = json.load(sys.stdin)
    print(json.dumps(summarize(case["samples"])))


if __name__ == "__main__":
    main()
