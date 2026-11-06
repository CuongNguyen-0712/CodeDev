"""
Find the saturation knee of POST /api/submissions in a step load test result table.
The exact rule is in the challenge description.

Input (stdin): {"min_throughput_ratio": 0.95, "max_p95_factor": 2.0, "max_error_rate": 0.01,
                "steps": [{"offered_rps", "achieved_rps", "p95_ms", "requests", "errors"}, ...]}
Output: {"knee_rps", "first_saturated_rps", "reasons", "baseline_p95_ms", "reached", "ignored_rows"}
"""
import json
import sys

FIELDS = ("offered_rps", "achieved_rps", "p95_ms", "requests", "errors")


# [ ] Which rows of the table are usable


def find_knee(case):
    # [ ] Usable rows by offered rate, and how many were ignored
    if not rows:
        return {"knee_rps": None, "first_saturated_rps": None, "reasons": [],
                "baseline_p95_ms": None, "reached": False, "ignored_rows": ignored}

    baseline = rows[0]["p95_ms"]
    for i, row in enumerate(rows):
        reasons = []
        # [ ] The rules this step breaks
        # [ ] Report the step before the first broken one

    return {"knee_rps": rows[-1]["offered_rps"], "first_saturated_rps": None, "reasons": [],
            "baseline_p95_ms": baseline, "reached": False, "ignored_rows": ignored}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one step load test result table (JSON on stdin) and prints the knee as JSON.
def main():
    case = json.load(sys.stdin)
    print(json.dumps(find_knee(case)))


if __name__ == "__main__":
    main()
