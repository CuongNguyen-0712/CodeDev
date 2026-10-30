"""
The load test report for POST /submissions said "50 req/s, 0.4% errors". Nobody could say over
which interval, whether timeouts were counted, or how many of those requests were fast enough to
matter. Compute the numbers yourself from the raw result records.

Record: {"id": int, "intended_ms": int, "start_ms": int, "end_ms": int, "status": int}
  - integer ms from test start; status 0 = timeout or connection error
  - success = 200 <= status < 400; every other status (0 included) is an error
  - latency for the SLO = end_ms - intended_ms (from the intended send time, lesson 3)
  - records may arrive in any order

summarize(records, window_ms, slo_ms, steady_from_ms, steady_to_ms) -> dict
  - A record COMPLETES at end_ms, whatever its status. Windows are half-open by completion time:
    window k is [k * window_ms, (k + 1) * window_ms), so a record ending exactly on a boundary
    belongs to the window that starts there.
  - "windows": one entry per window from k = 0 up to the window of the largest end_ms, empty
    windows included (no records -> []). Each entry:
      {"start_ms": k * window_ms,
       "completed": completed records,
       "throughput_rps": completed / window seconds,
       "error_pct": 100 * errors / completed, or None when completed is 0,
       "goodput_rps": successes with latency <= slo_ms / window seconds}
  - "steady": the same numbers over the steady-state interval [steady_from_ms, steady_to_ms),
    selected by end_ms, plus
      "offered_rps": records whose intended_ms is in the interval / interval seconds
      "timeouts": records with status 0 completed in the interval
    so the steady object is {"completed", "offered_rps", "throughput_rps", "error_pct",
    "timeouts", "goodput_rps"}.
  - Round every float to 2 decimals.
  - Validate: window_ms <= 0 -> ValueError("window_ms must be > 0");
    steady_to_ms <= steady_from_ms -> ValueError("steady interval is empty").
"""
import json
import sys


def is_success(record):
    return 200 <= record["status"] < 400


def stats(records, seconds, slo_ms):
    completed = len(records)
    errors = sum(1 for r in records if not is_success(r))
    good = sum(1 for r in records if is_success(r) and r["end_ms"] - r["start_ms"] <= slo_ms)
    return {
        "completed": completed,
        "throughput_rps": round(completed / seconds, 2),
        "error_pct": round(100 * errors / completed, 2) if completed else None,
        "goodput_rps": round(good / seconds, 2),
    }


def summarize(records, window_ms, slo_ms, steady_from_ms, steady_to_ms):
    if window_ms <= 0:
        raise ValueError("window_ms must be > 0")
    if steady_to_ms <= steady_from_ms:
        raise ValueError("steady interval is empty")
    windows = []
    if records:
        buckets = [[] for _ in range(max(r["end_ms"] for r in records) // window_ms + 1)]
        for r in records:
            buckets[r["end_ms"] // window_ms].append(r)
        for k, bucket in enumerate(buckets):
            windows.append({"start_ms": k * window_ms, **stats(bucket, window_ms / 1000, slo_ms)})
    seconds = (steady_to_ms - steady_from_ms) / 1000
    done = [r for r in records if steady_from_ms <= r["end_ms"] < steady_to_ms]
    offered = sum(1 for r in records if steady_from_ms <= r["intended_ms"] < steady_to_ms)
    summary = stats(done, seconds, slo_ms)
    steady = {
        "completed": summary["completed"],
        "offered_rps": round(offered / seconds, 2),
        "throughput_rps": summary["throughput_rps"],
        "error_pct": summary["error_pct"],
        "timeouts": sum(1 for r in done if r["status"] == 0),
        "goodput_rps": summary["goodput_rps"],
    }
    return {"windows": windows, "steady": steady}


# ---- test runner (do not change)
# Reads one test case (JSON) from stdin:
# {"records": [...], "window_ms": int, "slo_ms": int, "steady": {"from_ms": int, "to_ms": int}}
if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        result = summarize(case["records"], case["window_ms"], case["slo_ms"],
                           case["steady"]["from_ms"], case["steady"]["to_ms"])
        print(json.dumps(result))
    except ValueError as error:
        print(json.dumps({"error": str(error)}))
