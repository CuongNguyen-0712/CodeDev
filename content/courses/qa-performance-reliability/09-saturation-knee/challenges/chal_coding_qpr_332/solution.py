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


# @piece valid-row: Which rows of the table are usable
def is_number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def valid_row(row):
    if not isinstance(row, dict) or not all(is_number(row.get(f)) for f in FIELDS):
        return False
    return (row["offered_rps"] > 0 and row["requests"] > 0 and row["achieved_rps"] >= 0
            and row["p95_ms"] > 0 and 0 <= row["errors"] <= row["requests"])
# @end


def find_knee(case):
    # @piece usable-rows: Usable rows by offered rate, and how many were ignored
    rows = [r for r in case["steps"] if valid_row(r)]
    ignored = len(case["steps"]) - len(rows)
    rows.sort(key=lambda r: r["offered_rps"])
    # @end
    if not rows:
        return {"knee_rps": None, "first_saturated_rps": None, "reasons": [],
                "baseline_p95_ms": None, "reached": False, "ignored_rows": ignored}

    baseline = rows[0]["p95_ms"]
    for i, row in enumerate(rows):
        reasons = []
        # @piece step-reasons: The rules this step breaks
        if row["achieved_rps"] / row["offered_rps"] < case["min_throughput_ratio"]:
            reasons.append("throughput")
        if row["p95_ms"] > case["max_p95_factor"] * baseline:
            reasons.append("latency")
        if row["errors"] / row["requests"] > case["max_error_rate"]:
            reasons.append("errors")
        # @end
        # @piece report-knee: Report the step before the first broken one
        if reasons:
            return {"knee_rps": rows[i - 1]["offered_rps"] if i > 0 else None,
                    "first_saturated_rps": row["offered_rps"], "reasons": reasons,
                    "baseline_p95_ms": baseline, "reached": True, "ignored_rows": ignored}
        # @end

    return {"knee_rps": rows[-1]["offered_rps"], "first_saturated_rps": None, "reasons": [],
            "baseline_p95_ms": baseline, "reached": False, "ignored_rows": ignored}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one step load test result table (JSON on stdin) and prints the knee as JSON.
def main():
    case = json.load(sys.stdin)
    print(json.dumps(find_knee(case)))


if __name__ == "__main__":
    main()
