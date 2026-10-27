"""
The team load-tests POST /api/submissions at a fixed rate (an open model): the generator has a
schedule with one request every interval_ms, whatever the server does. A developer sent this
request to an AI assistant:

  "Write analyze(run) in Python for the log of our fixed-rate load test. The generator sends
   request seq (0, 1, 2, ...) at start_ms + seq * interval_ms and logs [seq, sent_ms, done_ms]
   for each request when its response arrives. Report the number of requests, p50, p95, p99
   and max latency in ms (nearest-rank percentiles, rounded to 1 decimal), and how many
   requests took longer than target_ms. Reject an interval_ms or target_ms that is not > 0."

The assistant answered with the code below. On the two recorded runs used in review the numbers
were plausible, so it became the team's report script. Then the run in which the server paused
for 1.2 s (logs show every in-flight submission stuck behind one lock) came back with p99 under
30 ms and nothing over target, while the learners in the same exam rehearsal waited seconds.
Find the mistake and fix analyze(run).

Input (stdin, JSON): {"start_ms": 0, "interval_ms": 5, "target_ms": 2000,
                      "requests": [[seq, sent_ms, done_ms], ...]}
  times in ms since the test started; rows can be in any order (logged on completion).
Percentiles: nearest-rank on the sorted latencies, rank = ceil(p / 100 * n),
  value = sorted[rank - 1]; null when there are no requests.
Output (stdout, JSON):
  {"requests": 400, "p50": 18.7, "p95": 28.6, "p99": 29.6, "max": 29.9, "over_target": 0}
  or {"error": "interval_ms and target_ms must be > 0"}
"""
import json
import math
import sys


def percentile(sorted_values, p):
    """Nearest-rank percentile: rank = ceil(p / 100 * n), value = sorted[rank - 1]."""
    if not sorted_values:
        return None
    rank = math.ceil(p / 100 * len(sorted_values))
    return sorted_values[rank - 1]


def one_decimal(value):
    return None if value is None else round(value, 1)


def latencies_ms(run):
    start, interval = run["start_ms"], run["interval_ms"]
    return [done_ms - (start + i * interval) for i, (_seq, _sent_ms, done_ms) in enumerate(run["requests"])]


def analyze(run):
    if run["interval_ms"] <= 0 or run["target_ms"] <= 0:
        return {"error": "interval_ms and target_ms must be > 0"}
    values = sorted(latencies_ms(run))
    return {
        "requests": len(values),
        "p50": one_decimal(percentile(values, 50)),
        "p95": one_decimal(percentile(values, 95)),
        "p99": one_decimal(percentile(values, 99)),
        "max": one_decimal(values[-1] if values else None),
        "over_target": sum(1 for v in values if v > run["target_ms"]),
    }


# ---------------------------------------------------------------- test runner (do not change)
def main():
    run = json.load(sys.stdin)
    print(json.dumps(analyze(run)))


if __name__ == "__main__":
    main()
