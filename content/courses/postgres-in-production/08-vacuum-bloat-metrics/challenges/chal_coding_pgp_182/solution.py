"""
Vacuum health check for Rice Rocket's database, run every 5 minutes by the monitoring job.
Last month it reported "ok" while courier_locations grew from 200 MB to 9 GB. Fix it.

Input (rows as the monitoring job reads them):
  settings   {"autovacuum_vacuum_threshold": 50, "autovacuum_vacuum_scale_factor": 0.2}  (server defaults)
  tables     [{"relname", "reltuples", "n_live_tup", "n_dead_tup", "options": {...}}]
             reltuples comes from pg_class, the counters from pg_stat_user_tables, options are the
             table's storage parameters (ALTER TABLE ... SET (autovacuum_vacuum_scale_factor = ...))
  sessions   [{"pid", "state", "xmin_age"}]       pg_stat_activity, xmin_age = age(backend_xmin)
  slots      [{"slot_name", "active", "xmin_age"}] pg_replication_slots, xmin_age = age(xmin)
  max_xmin_age  a session or slot holding the xmin horizon longer than this blocks cleanup

Output:
  {"tables": {relname: "ok" | "vacuum lagging" | "blocked by pid <pid>" | "blocked by slot <name>"},
   "blocker": "pid <pid>" | "slot <name>" | null}
  A table needs vacuum when n_dead_tup > threshold + scale_factor * reltuples (the autovacuum trigger,
  with the table's own storage parameters over the server settings). It is "blocked" when a blocker
  exists: dead rows newer than the blocker's xmin cannot be removed by any vacuum.
"""
import json
import sys


# @piece effective-settings: Autovacuum settings that apply to one table
def table_settings(table, settings):
    return {**settings, **table.get("options", {})}
# @end


# @piece vacuum-threshold: Dead rows that make autovacuum start
def vacuum_threshold(table, params):
    return params["autovacuum_vacuum_threshold"] + params["autovacuum_vacuum_scale_factor"] * table["reltuples"]
# @end


# @piece find-blocker: The session or slot that holds the xmin horizon back
def find_blocker(sessions, slots, max_xmin_age):
    holders = [(s["xmin_age"], f"pid {s['pid']}") for s in sessions if s.get("xmin_age") is not None]
    holders += [(s["xmin_age"], f"slot {s['slot_name']}") for s in slots if s.get("xmin_age") is not None]
    holders = [h for h in holders if h[0] > max_xmin_age]
    return max(holders)[1] if holders else None
# @end


def check(settings, tables, sessions, slots, max_xmin_age):
    blocker = find_blocker(sessions, slots, max_xmin_age)
    result = {}
    for table in tables:
        params = table_settings(table, settings)
        if table["n_dead_tup"] <= vacuum_threshold(table, params):
            result[table["relname"]] = "ok"
        # @piece classify-due: Status of a table that needs vacuum
        elif blocker:
            result[table["relname"]] = f"blocked by {blocker}"
        else:
            result[table["relname"]] = "vacuum lagging"
        # @end
    return {"tables": result, "blocker": blocker}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one case {"settings", "tables", "sessions", "slots", "max_xmin_age"} from stdin, prints the result.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(check(case["settings"], case["tables"], case["sessions"], case["slots"], case["max_xmin_age"])))
