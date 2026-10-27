"""
Exam day on CodeDev peaks at 340 submissions per second. Before the next load test of
POST /api/submissions, the team writes the load profile as stages, like a k6 ramping-arrival-rate
scenario: the arrival rate starts at start_rate and every stage moves it in a straight line to the
stage's target over duration_s seconds. Turn the profile into the per-second schedule the load
generator will follow, with its totals, and reject profiles that cannot be run.

Input (stdin, JSON): {"start_rate": 0, "stages": [{"duration_s": 60, "target": 340}, ...]}
  start_rate is optional (default 0).

Rules
  Validation, checked in this order; the first problem found is the answer:
    stages missing, not a list or empty           -> {"error": "no stages"}
    start_rate not an integer >= 0                -> {"error": "bad start_rate"}
    then for each stage n = 1, 2, ... in order:
      duration_s not an integer >= 1              -> {"error": "stage n: bad duration_s"}
      target not an integer >= 0                  -> {"error": "stage n: bad target"}
    total duration over 3600 s                    -> {"error": "longer than 3600 s"}
    (30.0 or "30" is not an integer; true/false are not integers either)
  Schedule: one entry per second of the test. In a stage that moves the rate from a (the rate
    before the stage) to b over d seconds, second k of the stage (k = 1 .. d) has the target rate
    floor(a + (b - a) * k / d): the rate reached at the END of that second, rounded down (also
    when the rate goes down). The next stage starts from b.
  total_requests = sum of the schedule; peak_rate = its maximum; duration_s = its length.
  steady = the longest stage that holds a non-zero rate (b == a and b > 0), as
    {"start_s": <second the stage starts, from 0>, "end_s": <start_s + d>, "rate": b};
    the earliest one on a tie; null when no stage holds a non-zero rate.

Output (stdout, JSON):
  {"duration_s": 20, "total_requests": 150, "peak_rate": 10,
   "steady": {"start_s": 5, "end_s": 15, "rate": 10}, "schedule": [2, 4, ...]}
"""
import json
import sys

MAX_DURATION_S = 3600


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def build_schedule(profile):
    stages = profile.get("stages")
    if not isinstance(stages, list) or not stages:
        return {"error": "no stages"}
    rate = profile.get("start_rate", 0)
    if not is_int(rate) or rate < 0:
        return {"error": "bad start_rate"}
    for n, stage in enumerate(stages, 1):
        if not is_int(stage.get("duration_s")) or stage["duration_s"] < 1:
            return {"error": f"stage {n}: bad duration_s"}
        if not is_int(stage.get("target")) or stage["target"] < 0:
            return {"error": f"stage {n}: bad target"}
    if sum(stage["duration_s"] for stage in stages) > MAX_DURATION_S:
        return {"error": "longer than 3600 s"}

    schedule = []
    steady = None
    for stage in stages:
        a, b, d = rate, stage["target"], stage["duration_s"]
        if a == b and b > 0 and (steady is None or d > steady["end_s"] - steady["start_s"]):
            steady = {"start_s": len(schedule), "end_s": len(schedule) + d, "rate": b}
        # // floors toward minus infinity, so a ramp-down rounds down too
        schedule.extend(a + (b - a) * k // d for k in range(d))
        rate = b
    return {
        "duration_s": len(schedule),
        "total_requests": sum(schedule),
        "peak_rate": max(schedule),
        "steady": steady,
        "schedule": schedule,
    }


# ---------------------------------------------------------------- test runner (do not change)
def main():
    profile = json.load(sys.stdin)
    print(json.dumps(build_schedule(profile)))


if __name__ == "__main__":
    main()
