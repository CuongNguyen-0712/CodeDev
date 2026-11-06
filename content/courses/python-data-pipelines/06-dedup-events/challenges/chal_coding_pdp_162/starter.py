"""
Rice Rocket's courier and customer apps send order events to the ingestion API, which writes one file
per night. Delivery is at-least-once: a phone that loses the ack resends the same event (same
event_id, later ingested_at), and an offline phone sends yesterday's events into tonight's file.
Last month the revenue report was 6% too high, and replaying a broken night crashed the load.

Tables: staging(event_id, order_id, event_type, amount_vnd, event_time, ingested_at)   one night's file
        events(event_id PRIMARY KEY, order_id, event_type, amount_vnd, event_time, ingested_at)
        event_time / ingested_at are UTC ISO timestamps ("2026-11-05T16:50:00Z").
        event_type: order_placed, item_added (one per item, an order has several), order_paid.

load_night(db, rows) loads one file into events:
  - one row per event_id from the file, the first copy that arrived (earliest ingested_at);
  - only events not already in events (yesterday's copies stay as they are);
  - loading the same file twice changes nothing and does not fail.
Q_DAILY_REVENUE: paid revenue per business day, the day in Ho Chi Minh City (UTC+7, no DST) when the
order was paid, whatever night the event arrived.
"""
import json
import sqlite3
import sys

# [ ] One row per event from tonight's file

# [ ] Add only events the warehouse has not seen

# [ ] Paid revenue per business day in Ho Chi Minh City


def load_night(db, rows):
    with db:
        db.execute("DELETE FROM staging")
        db.executemany("INSERT INTO staging VALUES (?, ?, ?, ?, ?, ?)", rows)
        db.execute(Q_INSERT_NEW)


# ---------------------------------------------------------------- test runner (do not change)
# Loads the test case's nights in order (a night may be a replay of an earlier file), then prints the
# number of events per type, the paid revenue per day, and when the kept copy of each watched event
# arrived.
SCHEMA = """
CREATE TABLE staging (
    event_id    TEXT    NOT NULL,
    order_id    INTEGER NOT NULL,
    event_type  TEXT    NOT NULL,
    amount_vnd  INTEGER NOT NULL,
    event_time  TEXT    NOT NULL,
    ingested_at TEXT    NOT NULL
);
CREATE TABLE events (
    event_id    TEXT    PRIMARY KEY,
    order_id    INTEGER NOT NULL,
    event_type  TEXT    NOT NULL,
    amount_vnd  INTEGER NOT NULL,
    event_time  TEXT    NOT NULL,
    ingested_at TEXT    NOT NULL
);
"""

if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    try:
        for night in case["nights"]:
            load_night(db, night)
        per_type = dict(db.execute("SELECT event_type, COUNT(*) FROM events GROUP BY event_type ORDER BY event_type"))
        revenue = dict(db.execute(Q_DAILY_REVENUE))
        kept = dict(db.execute("SELECT event_id, ingested_at FROM events")) if case.get("watch") else {}
        print(json.dumps({
            "per_type": per_type,
            "revenue": revenue,
            "kept_copy": {e: kept.get(e) for e in case.get("watch", [])},
        }))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
