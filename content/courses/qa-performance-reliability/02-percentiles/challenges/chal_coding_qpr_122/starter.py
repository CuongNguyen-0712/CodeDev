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
    # TODO
    return None


def summarize(samples):
    """Per-endpoint summary of raw load test samples (see the description)."""
    # TODO
    return {"endpoints": [], "invalid": 0}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case {"samples": [...]} as JSON from stdin and prints the summary as JSON.
def main():
    case = json.load(sys.stdin)
    print(json.dumps(summarize(case["samples"])))


if __name__ == "__main__":
    main()
