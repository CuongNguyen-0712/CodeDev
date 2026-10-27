"""
Find the saturation knee of POST /api/submissions in a step load test result table.
The exact rule is in the challenge description.

Input (stdin): {"min_throughput_ratio": 0.95, "max_p95_factor": 2.0, "max_error_rate": 0.01,
                "steps": [{"offered_rps", "achieved_rps", "p95_ms", "requests", "errors"}, ...]}
Output: {"knee_rps", "first_saturated_rps", "reasons", "baseline_p95_ms", "reached", "ignored_rows"}
"""
import json
import sys


def find_knee(case):
    # TODO: ignore invalid rows, sort by offered rate, take the baseline p95 from the lowest step,
    # find the first step that breaks a rule and report the step before it as the knee.
    return None


# ---------------------------------------------------------------- test runner (do not change)
# Reads one step load test result table (JSON on stdin) and prints the knee as JSON.
def main():
    case = json.load(sys.stdin)
    print(json.dumps(find_knee(case)))


if __name__ == "__main__":
    main()
