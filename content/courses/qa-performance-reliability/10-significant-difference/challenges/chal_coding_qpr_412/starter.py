"""
Is run B really faster than run A? Decide from repeated load test runs of GET /api/leaderboard.

case = {"a": [[latency_ms, ...], ...],   # one list of samples per run of build A (the baseline)
        "b": [[latency_ms, ...], ...],   # one list per run of build B (the change)
        "resamples": R,                  # number of bootstrap resamples, >= 1
        "seed": S}                       # PRNG seed, 0 <= S < 2**31

1. p95 of each run, nearest rank: sort the run's samples, rank = ceil(95 * n / 100),
   p95 = sorted[rank - 1].
2. diff = mean(p95 of A's runs) - mean(p95 of B's runs)   (positive: B is faster)
3. Bootstrap over RUNS (a run is the unit, not a sample). PRNG: state starts at S;
   next() sets state = (1103515245 * state + 12345) % 2**31 and returns state; a draw from
   a list of k items picks index next() % k. For each of the R resamples, in this order:
   draw len(A) p95s from A's list (with replacement), then len(B) p95s from B's list;
   its diff is mean(drawn A) - mean(drawn B).
4. Sort the R diffs. ci = [low, high] = nearest-rank 2.5th and 97.5th percentiles:
   rank = ceil(25 * R / 1000) and ceil(975 * R / 1000), value = sorted[rank - 1].
5. verdict: "B is faster" if low > 0, "B is slower" if high < 0, else "no clear difference".

Output: {"p95_a": [...], "p95_b": [...], "diff_ms": diff, "ci_ms": [low, high], "verdict": ...}
with diff_ms and ci_ms rounded to 1 decimal (decide the verdict on unrounded values).
Errors: {"error": "need at least 3 runs per side"} when A or B has fewer than 3 runs,
        {"error": "empty run"} when a run has no samples (checked after the run count).
"""
import json
import sys


def p95(samples):
    # nearest-rank p95 of one run's samples
    return 0


def compare_runs(case):
    # {"p95_a": [...], "p95_b": [...], "diff_ms": ..., "ci_ms": [low, high], "verdict": ...}
    # or {"error": ...}
    return {"p95_a": [], "p95_b": [], "diff_ms": 0, "ci_ms": [0, 0], "verdict": "no clear difference"}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints compare_runs() as JSON.
if __name__ == "__main__":
    print(json.dumps(compare_runs(json.load(sys.stdin))))
