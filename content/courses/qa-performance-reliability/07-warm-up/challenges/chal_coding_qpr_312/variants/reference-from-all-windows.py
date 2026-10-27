"""
Compare two load test runs of POST /api/submissions fairly: find where each run's warm-up ends,
exclude it, and compare the p95 of the steady parts (see the challenge description for the rule).
"""
import json
import math
import statistics
import sys

MIN_STEADY_WINDOWS = 3


def percentile(values, p):
    """Nearest-rank percentile: rank = ceil(p/100 * n), value = sorted[rank - 1]; None if empty."""
    if not values:
        return None
    ordered = sorted(values)
    rank = math.ceil(p * len(ordered) / 100)
    return ordered[max(rank, 1) - 1]


def is_number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def valid_samples(samples):
    valid = []
    for s in samples:
        if isinstance(s, list) and len(s) == 2 and is_number(s[0]) and is_number(s[1]) and s[0] >= 0 and s[1] > 0:
            valid.append((s[0], s[1]))
    return valid


def warmup_end(samples, window_ms, band):
    """Start (ms) of the first window after which every window p95 stays in the band, or None."""
    windows = {}
    for t, latency in samples:
        windows.setdefault(int(t // window_ms), []).append(latency)
    keys = sorted(windows)
    p95s = [percentile(windows[k], 95) for k in keys]
    n = len(p95s)
    if n == 0:
        return None
    reference = statistics.median(p95s)
    start = n
    while start > 0 and abs(p95s[start - 1] - reference) <= band * reference:
        start -= 1
    if n - start < MIN_STEADY_WINDOWS:
        return None
    return keys[start] * window_ms


def analyse_run(samples, window_ms, band):
    valid = valid_samples(samples)
    end = warmup_end(valid, window_ms, band)
    steady = [latency for t, latency in valid if end is not None and t >= end]
    p95 = percentile(steady, 95)
    report = {
        "warmup_end_ms": end,
        "excluded": len(valid) - len(steady),
        "steady_samples": len(steady),
        "p95": None if p95 is None else round(p95, 1),
        "dropped": len(samples) - len(valid),
    }
    return report, p95, percentile([latency for _, latency in valid], 95)


def change_pct(before, after):
    if before is None or after is None:
        return None
    return round((after - before) / before * 100, 1)


def compare_runs(case):
    window_ms, band = case["window_ms"], case["band"]
    base, base_p95, base_all = analyse_run(case["baseline"], window_ms, band)
    cand, cand_p95, cand_all = analyse_run(case["candidate"], window_ms, band)
    return {
        "baseline": base,
        "candidate": cand,
        "p95_change_pct": change_pct(base_p95, cand_p95),
        "naive_p95_change_pct": change_pct(base_all, cand_all),
    }


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON on stdin) and prints the comparison as JSON.
def main():
    case = json.load(sys.stdin)
    print(json.dumps(compare_runs(case)))


if __name__ == "__main__":
    main()
