"""
Restore planner for Rice Rocket's database. At 14:05:12 (+07:00) a migration with a wrong WHERE
deleted 9,000 delivered orders. The planner reads the backup catalog and the WAL archive and says
how to get the rows back with point-in-time recovery (PITR) on a NEW instance.

Inputs (times are ISO 8601 with an offset, durations in seconds):
  backups      [{"id", "kind": "base" | "dump", "started_at", "finished_at", "size_gb"}]
               a base backup is physical (pg_basebackup), a dump is logical (pg_dump)
  wal_archive  [{"segment", "from", "to"}]: the time range of changes each archived segment holds
  incident_at  commit time of the bad statement
  policy       {"now", "retention_days", "restore_gb_per_min", "dump_restore_gb_per_min",
                "replay_min_per_wal_hour"}

Rules:
  - A base backup is usable when it finished before the incident, is inside the retention window
    (finished_at >= now - retention_days) and the WAL archive has no gap from its started_at to its
    finished_at. Use the newest usable one (least WAL to replay).
  - Replay stops at the end of the continuous WAL chain from started_at, and never later than one
    second before the incident (recovery_target_time includes commits AT the target time).
  - data_loss_seconds = incident_at - recovery_target_time.
  - rto_minutes = ceil(size_gb / restore_gb_per_min + hours of WAL replayed * replay_min_per_wal_hour)
  - Without a usable base backup, fall back to the newest dump that finished before the incident:
    {"status": "dump-only", "dump", "data_loss_seconds", "rto_minutes": ceil(size_gb / dump_restore_gb_per_min)}
  - Nothing usable: {"status": "failed", "reason": "no backup finished before the incident"}
"""
import json
import math
import sys
from datetime import datetime, timedelta


def t(text):
    return datetime.fromisoformat(text)


# [ ] Base backups that can be used, newest first


# [ ] End of the gap-free WAL chain from a start time


# [ ] Where replay stops


# [ ] Minutes to restore and replay


def plan_restore(backups, wal_archive, incident_at, policy):
    incident = t(incident_at)
    for base in usable_base_backups(backups, incident, policy):
        chain_end = wal_chain_end(wal_archive, t(base["started_at"]))
        if chain_end < t(base["finished_at"]):
            continue  # WAL missing while the backup ran: it never becomes consistent
        target = recovery_target(incident, chain_end)
        return {
            "status": "pitr",
            "base_backup": base["id"],
            "recovery_target_time": target.isoformat(),
            "data_loss_seconds": int((incident - target).total_seconds()),
            "rto_minutes": estimate_rto(base, target, policy),
        }
    # [ ] Without PITR, the newest dump before the incident


# ---------------------------------------------------------------- test runner (do not change)
# Reads one case {"backups", "wal_archive", "incident_at", "policy"} from stdin, prints the plan.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(plan_restore(case["backups"], case["wal_archive"], case["incident_at"], case["policy"])))
