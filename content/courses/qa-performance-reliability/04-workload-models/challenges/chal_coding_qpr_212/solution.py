"""
The CodeDev performance team replaces its closed-model load test of POST /submissions with an
open model: requests are sent on a schedule that does not wait for responses (k6
ramping-arrival-rate). Before the test runs, the schedule itself must be checked: how many
requests per second are planned, and at which millisecond each one should leave.

Write two functions.

planned_rates(start_rate, stages) -> list of per-second planned arrivals
  - stages: [{"duration_s": int, "target_rps": int}, ...]. Like k6 ramping-arrival-rate, the rate
    changes linearly from the previous target (start_rate for the first stage) to target_rps over
    duration_s seconds. A stage whose target equals the previous one holds the rate constant.
  - The planned arrivals of one second are the AVERAGE rate over that second. For second k
    (0-based) of a stage going from r0 to r1 over d seconds: r0 + (r1 - r0) * (2k + 1) / (2d).
  - Return one value per second of the whole test, in order. Use exact arithmetic
    (fractions.Fraction): the values are usually not whole numbers.
  - Validate, in this order, and raise ValueError with exactly this message:
      start_rate < 0                -> "start_rate must be >= 0"
      stages is empty               -> "no stages"
      for each stage i (0-based), duration first:
        duration_s <= 0             -> "stage <i>: duration_s must be > 0"
        target_rps < 0              -> "stage <i>: target_rps must be >= 0"

send_times(rates) -> list of intended send timestamps in ms from test start
  - A second cannot send half a request, so the fractions are CARRIED: the number of requests
    sent in second s is floor(sum of rates[0..s]) - floor(sum of rates[0..s-1]).
  - The n requests of second s are spread evenly: s * 1000 + (i * 1000) // n for i = 0 .. n-1.

Example: start_rate 0, stages [{"duration_s": 2, "target_rps": 4}]
  -> rates [1, 3], requests per second [1, 3], send times [0, 1000, 1333, 1666]
"""
import json
import sys
from fractions import Fraction
from math import floor


def planned_rates(start_rate, stages):
    if start_rate < 0:
        raise ValueError("start_rate must be >= 0")
    if not stages:
        raise ValueError("no stages")
    for i, stage in enumerate(stages):
        if stage["duration_s"] <= 0:
            raise ValueError(f"stage {i}: duration_s must be > 0")
        if stage["target_rps"] < 0:
            raise ValueError(f"stage {i}: target_rps must be >= 0")
    rates = []
    previous = start_rate
    for stage in stages:
        d, target = stage["duration_s"], stage["target_rps"]
        for k in range(d):
            rates.append(previous + Fraction((target - previous) * (2 * k + 1), 2 * d))
        previous = target
    return rates


def send_times(rates):
    times = []
    planned = Fraction(0)
    sent = 0
    for second, rate in enumerate(rates):
        planned += Fraction(rate)
        n = floor(planned) - sent
        sent += n
        times.extend(second * 1000 + (i * 1000) // n for i in range(n))
    return times


# ---- test runner (do not change)
# Reads one test case (JSON) from stdin: {"start_rate": int, "stages": [...], "show": int}
# and prints the schedule summary as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        rates = planned_rates(case["start_rate"], case["stages"])
        times = send_times(rates)
        counts = [0] * len(rates)
        for t in times:
            counts[t // 1000] += 1
        n = case["show"]
        print(json.dumps({
            "seconds": len(rates),
            "rates": [round(float(r), 2) for r in rates],
            "counts": counts,
            "total": len(times),
            "first": times[:n],
            "last": times[-n:] if n > 0 else [],
        }))
    except ValueError as error:
        print(json.dumps({"error": str(error)}))
