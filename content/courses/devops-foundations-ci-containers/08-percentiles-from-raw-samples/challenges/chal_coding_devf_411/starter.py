"""
Latency report for Rice Rocket's checkout dashboard, computed from raw request samples.

Every sample is one request: {"endpoint": "/checkout", "ms": 132, "status": 200}
(ms is a whole number of milliseconds, status is the HTTP status code).

latency_report(slo, samples) returns one row per endpoint, sorted by endpoint name, and one
row named "all" computed from ALL samples merged together (never by averaging the endpoint rows).
A row looks like this:

    {"endpoint": "/checkout", "count": 20, "avg_ms": "555.2",
     "p50": 149, "p95": 4100, "p99": 4300, "error_rate": "0.00", "slo_ok": false}

  - count: number of samples.
  - avg_ms: the mean of ms as TEXT with exactly 1 decimal, f"{mean:.1f}".
  - p50, p95, p99: nearest-rank percentiles. Sort the ms values; the p-th percentile is the
    value at rank ceil(p * n / 100), counting ranks from 1. Use whole numbers only:
    rank = (p * n + 99) // 100. Example with n = 20: p50 -> rank 10, p95 -> rank 19, p99 -> rank 20.
  - error_rate: share of server errors (status 500-599) in percent as TEXT with 2 decimals,
    f"{rate:.2f}". 4xx responses are client errors and do not count.
  - slo_ok: True when p95 <= slo["p95_ms"] AND the error rate (the number, not the text)
    <= slo["max_error_rate"].

Return {"endpoints": [rows sorted by endpoint], "all": row with "endpoint": "all"}.
There is always at least one sample.

Example: slo {"p95_ms": 300, "max_error_rate": 1.0}, ten /menu samples with ms
52, 48, 61, 45, 70, 55, 49, 58, 90, 47 (all status 200)
  -> sorted: 45 47 48 49 52 55 58 61 70 90
     p50 = rank 5 = 52, p95 = rank 10 = 90, p99 = rank 10 = 90, avg_ms "57.5", error_rate "0.00",
     slo_ok True - and the "all" row is the same numbers with "endpoint": "all".
"""
import json
import sys


def latency_report(slo, samples):
    # TODO: group the samples by endpoint, compute each row (and the "all" row from every
    # sample) with nearest-rank percentiles. Today the dashboard only knows the average.
    ms = [s["ms"] for s in samples]
    avg = sum(ms) / len(ms)
    return {"endpoints": [], "all": {"endpoint": "all", "count": len(ms), "avg_ms": f"{avg:.1f}",
                                     "p50": None, "p95": None, "p99": None,
                                     "error_rate": "0.00", "slo_ok": avg <= slo["p95_ms"]}}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"slo": {...}, "samples": [...]}) from stdin and prints the
# report as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(latency_report(case["slo"], case["samples"]), ensure_ascii=False))
