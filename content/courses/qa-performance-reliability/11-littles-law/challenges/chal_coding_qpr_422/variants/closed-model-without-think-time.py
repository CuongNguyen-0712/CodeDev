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


def differs(a, b, tolerance_pct):
    return abs(a - b) * 100 > tolerance_pct * b


def check_report(case):
    report, resources = case["report"], case["resources"]
    tol, target = case["tolerance_pct"], case["target_utilization_pct"]
    for field, bad in (("duration_s", lambda v: v <= 0), ("requests", lambda v: v < 0),
                       ("mean_latency_ms", lambda v: v <= 0), ("think_time_ms", lambda v: v < 0)):
        if bad(report[field]):
            return {"error": f"invalid {field}"}
    if report["vus"] is not None and report["vus"] <= 0:
        return {"error": "invalid vus"}
    for res in resources:
        if res["size"] <= 0 or res["hold_ms"] < 0:
            return {"error": f"invalid resource {res['name']}"}

    x = Fraction(report["requests"], report["duration_s"])
    latency = report["mean_latency_ms"]
    in_flight = x * latency / 1000
    findings = []

    if report["throughput_rps"] is not None and differs(Fraction(report["throughput_rps"]), x, tol):
        findings.append("throughput_mismatch")

    closed_limit = None
    if report["vus"] is not None:
        closed_limit = Fraction(report["vus"] * 1000, latency)
        if x * 100 > (100 + tol) * closed_limit:
            findings.append("above_closed_limit")
        elif x * 100 < (100 - tol) * closed_limit:
            findings.append("idle_virtual_users")

    if report["mean_in_flight"] is not None and differs(Fraction(report["mean_in_flight"]), in_flight, tol):
        findings.append("in_flight_mismatch")

    sized = []
    for res in resources:
        needed = x * res["hold_ms"] / 1000
        utilization = needed * 100 / res["size"]
        if needed > res["size"]:
            findings.append(f"over_capacity:{res['name']}")
        elif utilization > target:
            findings.append(f"above_target:{res['name']}")
        sized.append({"name": res["name"], "needed": round(float(needed), 1),
                      "utilization_pct": round(float(utilization), 1),
                      "min_size": math.ceil(needed * 100 / target)})

    soft = {"idle_virtual_users"}
    if any(f not in soft and not f.startswith("above_target:") for f in findings):
        verdict = "impossible"
    elif "idle_virtual_users" in findings:
        verdict = "suspicious"
    else:
        verdict = "consistent"
    return {"throughput_rps": round(float(x), 1), "in_flight": round(float(in_flight), 1),
            "closed_limit_rps": None if closed_limit is None else round(float(closed_limit), 1),
            "resources": sized, "findings": findings, "verdict": verdict}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints check_report() as JSON.
if __name__ == "__main__":
    print(json.dumps(check_report(json.load(sys.stdin))))
