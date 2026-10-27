"""
Compare two load test runs of POST /api/submissions fairly: find where each run's warm-up ends,
exclude it, and compare the p95 of the steady parts. The exact rule is in the challenge description.

Input (stdin): {"window_ms": 10000, "band": 0.2, "baseline": [[t_ms, latency_ms], ...], "candidate": [...]}
Output: {"baseline": run, "candidate": run, "p95_change_pct": x, "naive_p95_change_pct": y}
where run = {"warmup_end_ms", "excluded", "steady_samples", "p95", "dropped"}.
"""
import json
import math
import statistics
import sys


def percentile(values, p):
    """Nearest-rank percentile: rank = ceil(p/100 * n), value = sorted[rank - 1]; None if empty."""
    if not values:
        return None
    ordered = sorted(values)
    rank = math.ceil(p * len(ordered) / 100)
    return ordered[max(rank, 1) - 1]


def compare_runs(case):
    # TODO: drop invalid samples, find the end of the warm-up of each run with the window / band rule,
    # report each run's steady part and compare the two p95 values.
    return None


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON on stdin) and prints the comparison as JSON.
def main():
    case = json.load(sys.stdin)
    print(json.dumps(compare_runs(case)))


if __name__ == "__main__":
    main()
