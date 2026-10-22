"""
Alert replay for Rice Rocket's on-call review: run one metric series through one alert rule
and list the pages the rule would have sent.

    rule   = {"threshold": 80, "for_minutes": 5, "clear_below": 70}
    series = [[minute, value], ...]   one point per minute, sorted by minute, no gaps

Rules (a Prometheus-style rule with for:, plus a recovery threshold):
  - The condition is true when value > threshold (strictly greater: exactly 80 is not above 80).
  - INACTIVE, condition true at minute m: the alert becomes PENDING, started at m.
  - PENDING: it FIRES at minute start + for_minutes, i.e. once the condition has been true at
    every minute from start to start + for_minutes. With for_minutes 0 it fires at minute m itself.
    If the condition is false at any minute before that, the pending alert is dropped (back to
    INACTIVE): the next true minute starts a new pending alert from zero.
  - FIRING: it stays firing while value >= clear_below, even when value is at or below threshold.
    It RESOLVES at the first minute where value < clear_below (clear_below <= threshold); that
    minute is its resolved_at. The alert is then INACTIVE, and a later true minute starts a new
    pending alert.
  - An alert still firing when the series ends has resolved_at None. A pending alert that never
    fired is not a page.
  - Every alert that fires sends one page. Return
    {"alerts": [{"fired_at": m, "resolved_at": m or None}, ...], "pages": n}, in firing order.

Example: threshold 80, for_minutes 2, clear_below 70,
  series [[0, 85], [1, 90], [2, 88], [3, 78], [4, 65], [5, 82]]
  -> pending at 0, fires at 2 (true at 0, 1 and 2), still firing at 3 (78 >= 70),
     resolves at 4 (65 < 70), pending again at 5 but the series ends before it fires:
     {"alerts": [{"fired_at": 2, "resolved_at": 4}], "pages": 1}
"""
import json
import sys


def evaluate(rule, series):
    alerts = []
    pending_since = None  # minute the condition became true, while PENDING
    firing = None         # the alert dict, while FIRING
    for minute, value in series:
        if firing is not None:
            if value < rule["clear_below"]:  # recovery threshold: no flapping around threshold
                firing["resolved_at"] = minute
                firing = None
            continue
        if value > rule["threshold"]:
            if pending_since is None:
                pending_since = minute
            if minute - pending_since >= rule["for_minutes"]:
                firing = {"fired_at": minute, "resolved_at": None}
                alerts.append(firing)
                pending_since = None
        else:
            pending_since = None  # one false minute drops a pending alert
    return {"alerts": alerts, "pages": len(alerts)}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"rule": {...}, "series": [[minute, value], ...]}) from stdin and
# prints the replay result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(evaluate(case["rule"], case["series"])))
