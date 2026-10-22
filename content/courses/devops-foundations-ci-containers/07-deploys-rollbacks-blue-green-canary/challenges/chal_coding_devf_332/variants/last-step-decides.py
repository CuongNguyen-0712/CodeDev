"""
Automated canary analysis for Rice Rocket's checkout service.

A release goes out in steps: a small share of traffic (the "weight", in percent) is sent to the
new version (the canary), the rest stays on the current version (the baseline). After each step
the deploy tool collects the same three numbers for both groups:

    {"requests": 1000, "errors": 4, "p95_ms": 230}     (errors = 5xx responses)

analyze_canary(config, steps) decides what the deploy tool does next. Check the steps IN ORDER
and stop at the first step that does not pass. Inside one step, check in this order:

  1. Not enough traffic: canary["requests"] < config["min_requests"]
       -> decision "HOLD", reason "only 120 canary requests at 5% (need 200)"
  2. Error rate: rate = errors / requests * 100 (percent), for canary and baseline.
     If canary rate - baseline rate is strictly greater than config["max_error_rate_delta"]
     (in percentage points):
       -> decision "ROLLBACK",
          reason "error rate 2.40% vs baseline 0.40% (+2.00 pp > 0.50 pp)"   (all with 2 decimals)
  3. Latency: the canary p95 may be at most config["max_p95_increase_pct"] percent above the
     baseline p95. Use whole numbers only: it fails when
         canary_p95 * 100 > baseline_p95 * (100 + max_p95_increase_pct)
       -> decision "ROLLBACK", reason "p95 410 ms is more than 20% above baseline 230 ms"

If every step passes: decision "PROMOTE", at_weight None, reason "all 3 steps passed".

Return a dict:
    {"decision": "HOLD" | "ROLLBACK" | "PROMOTE",
     "at_weight": weight of the step that stopped the release (None for PROMOTE),
     "reason": text as above,
     "checked": [{"weight": 5, "result": "pass"}, ..., {"weight": 25, "result": "rollback"}]}
"checked" lists every step that was looked at, in order; results are "pass", "hold" or
"rollback". Steps after the stopping step are not listed. Baseline requests are always > 0.

Example: config {"max_error_rate_delta": 0.5, "max_p95_increase_pct": 20, "min_requests": 200},
one step {"weight": 10, "baseline": {"requests": 9000, "errors": 36, "p95_ms": 220},
          "canary": {"requests": 1000, "errors": 24, "p95_ms": 230}}
  -> {"decision": "ROLLBACK", "at_weight": 10,
      "reason": "error rate 2.40% vs baseline 0.40% (+2.00 pp > 0.50 pp)",
      "checked": [{"weight": 10, "result": "rollback"}]}
"""
import json
import sys


def check_step(config, step):
    """Return None if the step passes, else (decision, reason)."""
    base, canary, weight = step["baseline"], step["canary"], step["weight"]
    if canary["requests"] < config["min_requests"]:
        return "HOLD", f"only {canary['requests']} canary requests at {weight}% (need {config['min_requests']})"
    base_rate = base["errors"] / base["requests"] * 100
    canary_rate = canary["errors"] / canary["requests"] * 100
    delta = canary_rate - base_rate
    limit = config["max_error_rate_delta"]
    if delta > limit:
        return "ROLLBACK", f"error rate {canary_rate:.2f}% vs baseline {base_rate:.2f}% (+{delta:.2f} pp > {limit:.2f} pp)"
    pct = config["max_p95_increase_pct"]
    if canary["p95_ms"] * 100 > base["p95_ms"] * (100 + pct):
        return "ROLLBACK", f"p95 {canary['p95_ms']} ms is more than {pct}% above baseline {base['p95_ms']} ms"
    return None


def analyze_canary(config, steps):
    checked = []
    result = None
    for step in steps:  # keeps going after a bad step: the last step decides
        failure = check_step(config, step)
        if failure is None:
            checked.append({"weight": step["weight"], "result": "pass"})
            result = None
        else:
            checked.append({"weight": step["weight"], "result": failure[0].lower()})
            result = {"decision": failure[0], "at_weight": step["weight"], "reason": failure[1]}
    if result is None:
        return {"decision": "PROMOTE", "at_weight": None, "reason": f"all {len(steps)} steps passed", "checked": checked}
    return {**result, "checked": checked}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"config": {...}, "steps": [...]}) from stdin and prints the
# decision of analyze_canary as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(analyze_canary(case["config"], case["steps"]), ensure_ascii=False))
