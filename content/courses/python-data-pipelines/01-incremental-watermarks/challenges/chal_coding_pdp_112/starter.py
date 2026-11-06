"""
Rice Rocket's nightly job copies orders from the app database (src) into the warehouse (wh). A full
copy of 8 million rows took two hours, so the job now extracts only what changed since the last
run, using a watermark stored in the warehouse table etl_state.

Requirements for run_once(src, wh, lookback_minutes):
  - Read the watermark of the job 'orders' from etl_state (a timestamp 'YYYY-MM-DD HH:MM:SS').
  - Extract every order whose updated_at is at or after (watermark - lookback_minutes): rows that
    were committed late, with an updated_at a few minutes before the last run, must not be missed.
    Re-reading a few rows is fine because the load is an upsert.
  - Upsert them into wh.fact_orders by order_id.
  - The new watermark is the largest updated_at actually extracted (never the clock); with no rows
    it stays where it was.
  - The load and the new watermark commit together: if the load fails, neither is saved.
  - Return the number of rows read from src.
"""
import json
import sqlite3
import sys
from datetime import datetime, timedelta

FMT = "%Y-%m-%d %H:%M:%S"


def run_once(src, wh, lookback_minutes):
    (watermark,) = wh.execute("SELECT last_updated_at FROM etl_state WHERE job = 'orders'").fetchone()

    # [ ] Where this run starts reading, given the watermark

    # [ ] The changed orders, oldest change first

    # [ ] The watermark this run leaves behind

    # [ ] Load the rows and save the watermark
    return len(rows)


# ---------------------------------------------------------------- test runner (do not change)
# Input: {"lookback_minutes", "initial": [order rows], "runs": [{"before": [rows written before the
# run], "after": [rows committed while the run was extracting, often with an older updated_at],
# "fail_on_order": order_id whose load raises (optional)}]}. An order row is
# [order_id, status, total_vnd, updated_at]. Prints the warehouse, the orders it lacks or has stale,
# the final watermark, the rows read per run and which runs failed.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    src = sqlite3.connect(":memory:")
    src.execute("CREATE TABLE orders (order_id INTEGER PRIMARY KEY, status TEXT, total_vnd INTEGER, updated_at TEXT)")
    wh = sqlite3.connect(":memory:")
    wh.execute("CREATE TABLE fact_orders (order_id INTEGER PRIMARY KEY, status TEXT, total_vnd INTEGER, updated_at TEXT)")
    wh.execute("CREATE TABLE etl_state (job TEXT PRIMARY KEY, last_updated_at TEXT NOT NULL)")
    wh.execute("INSERT INTO etl_state VALUES ('orders', '1970-01-01 00:00:00')")
    wh.commit()

    def write(rows):
        src.executemany(
            "INSERT INTO orders VALUES (?, ?, ?, ?) ON CONFLICT (order_id) DO UPDATE SET status = excluded.status, "
            "total_vnd = excluded.total_vnd, updated_at = excluded.updated_at", rows)
        src.commit()

    write(case.get("initial", []))
    reads, failed = [], []
    for i, run in enumerate(case["runs"]):
        write(run.get("before", []))
        bad = run.get("fail_on_order")
        if bad is not None:
            wh.execute(f"CREATE TRIGGER fail BEFORE INSERT ON fact_orders WHEN NEW.order_id = {int(bad)} "
                       "BEGIN SELECT RAISE(ABORT, 'disk full'); END")
        try:
            reads.append(run_once(src, wh, case["lookback_minutes"]))
        except sqlite3.Error as error:
            if wh.in_transaction:
                wh.rollback()
            reads.append(None)
            failed.append(i + 1)
        if bad is not None:
            wh.execute("DROP TRIGGER fail")
        write(run.get("after", []))

    source = {r[0]: list(r) for r in src.execute("SELECT * FROM orders")}
    target = {r[0]: list(r) for r in wh.execute("SELECT * FROM fact_orders")}
    print(json.dumps({
        "missing_or_stale": sorted(k for k, v in source.items() if target.get(k) != v),
        "extra": sorted(k for k in target if k not in source),
        "watermark": wh.execute("SELECT last_updated_at FROM etl_state").fetchone()[0],
        "rows_read": reads,
        "failed_runs": failed,
    }))
