"""
Rice Rocket's session watchdog, run every 30 seconds by a CronJob as the `watchdog` role.

It reads rows of pg_stat_activity (one JSON test case: now, my_pid, limits, rows) and decides:
  terminate  sessions "idle in transaction" (or "idle in transaction (aborted)") for longer than
             limits.idle_in_transaction_s, counted from state_change (when the session went
             idle). They hold locks and run no query, so only pg_terminate_backend ends them.
             Reason: "idle in transaction for <n>s"
  cancel     "active" sessions whose current query has run longer than limits.statement_s,
             counted from query_start. pg_cancel_backend stops the query, the session survives.
             Reason: "query running for <n>s"
  never      the watchdog's own session (my_pid), non-client backends (walsender, autovacuum
             worker, ...: backend_type other than "client backend") and plain "idle" sessions
             (pooled connections waiting for work).
  alter_role for every role with a terminated or cancelled session (sorted by name), the
             settings that make the server do this itself next time:
             ALTER ROLE <role> SET idle_in_transaction_session_timeout = '<n>s'
             ALTER ROLE <role> SET statement_timeout = '<n>s'

Times are Unix seconds. Output: {"terminate": [[pid, reason], ...], "cancel": [[pid, reason], ...],
"alter_role": [...]}, pids in input order.
"""
import json
import sys


def decide(case):
    now = case["now"]
    limits = case["limits"]
    terminate, cancel, roles = [], [], set()
    for row in case["rows"]:
        # [ ] Sessions the watchdog must never touch
        state = row["state"]
        # [ ] End sessions idle in a transaction too long
        # [ ] Stop queries that run too long
    # [ ] Settings that make the server do it next time
    return {"terminate": terminate, "cancel": cancel, "alter_role": alter_role}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one snapshot of pg_stat_activity (JSON) on stdin and prints the decision as one JSON line.
if __name__ == "__main__":
    print(json.dumps(decide(json.load(sys.stdin))))
