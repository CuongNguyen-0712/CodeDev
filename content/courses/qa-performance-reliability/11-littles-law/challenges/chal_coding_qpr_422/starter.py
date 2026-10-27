"""
Check a load test report of POST /api/submissions with Little's Law (L = X * W) and size
the resources behind it. All numbers in the input are integers; times are in ms.

case = {"tolerance_pct": T,                  # allowed relative gap between two numbers, in %
        "target_utilization_pct": U,         # size resources so they are at most U% busy
        "report": {"duration_s", "requests",                 # steady-state window only
                   "throughput_rps": reported req/s or null,
                   "mean_latency_ms",
                   "vus": closed-model virtual users or null (open model),
                   "think_time_ms",
                   "mean_in_flight": measured mean concurrency or null},
        "resources": [{"name", "size", "hold_ms"}]}  # e.g. a pool: each request holds one unit hold_ms

X = requests / duration_s (req/s), R = mean_latency_ms, Z = think_time_ms.
  in_flight = X * R / 1000                      (Little's Law)
  closed_limit_rps = vus * 1000 / (R + Z)       (closed model: N = X * (R + Z)); null when vus is null
  per resource: needed = X * hold_ms / 1000; utilization_pct = needed * 100 / size;
                min_size = ceil(needed * 100 / U)
"a differs from b": |a - b| * 100 > T * b (exactly T% is not a difference).
Findings, in this order:
  "throughput_mismatch"       throughput_rps is not null and differs from X
  "above_closed_limit"        vus is not null and X exceeds closed_limit_rps by more than T%
  "idle_virtual_users"        vus is not null and X is below closed_limit_rps by more than T%
  "in_flight_mismatch"        mean_in_flight is not null and differs from in_flight
  then per resource, in input order:
  "over_capacity:<name>"      needed > size
  "above_target:<name>"       needed <= size and utilization_pct > U
verdict: "impossible" if any finding other than idle_virtual_users / above_target:*,
         else "suspicious" if idle_virtual_users, else "consistent".
Compare and take the ceiling in exact arithmetic; round only the output: in_flight,
closed_limit_rps, needed and utilization_pct to 1 decimal, throughput_rps to 1 decimal.
Invalid input: {"error": "invalid <field>"} for the first of, in this order: duration_s <= 0,
requests < 0, mean_latency_ms <= 0, think_time_ms < 0, vus <= 0 (when not null),
then per resource: size <= 0 or hold_ms < 0 -> "invalid resource <name>".
"""
import json
import math
import sys
from fractions import Fraction


def check_report(case):
    # {"throughput_rps", "in_flight", "closed_limit_rps", "resources": [{"name", "needed",
    #  "utilization_pct", "min_size"}], "findings": [...], "verdict": ...} or {"error": ...}
    return {"throughput_rps": 0, "in_flight": 0, "closed_limit_rps": None,
            "resources": [], "findings": [], "verdict": "consistent"}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints check_report() as JSON.
if __name__ == "__main__":
    print(json.dumps(check_report(json.load(sys.stdin))))
