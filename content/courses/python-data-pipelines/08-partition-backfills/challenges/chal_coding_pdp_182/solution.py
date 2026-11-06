"""
fact_commission holds Rice Rocket's commission per restaurant per business day (Ho Chi Minh City
time, UTC+7): the dashboards and the monthly invoices read it. A rate bug was fixed on Nov 3 and
finance asked for October to be recomputed. The first backfill appended rows (October doubled), and
the nightly job, which only loaded "today in UTC", missed orders placed after 00:00 local time.

Tables: orders(order_id, restaurant_id, subtotal_vnd, placed_at)    placed_at UTC ISO, "...Z"
        fact_commission(day, restaurant_id, orders, commission_vnd)  one row per day and restaurant
Commission: 18% of the summed subtotal, rounded to whole VND.

run_day(db, day): recompute exactly one business day; running it again gives the same rows.
backfill(db, start, end): run every day from start to end, both included, oldest first; returns them.
nightly(db, run_date, lookback): the 02:00 run of run_date recomputes the `lookback` business days
  that ended before run_date (late orders still arrive for them), oldest first; returns them.
"""
import json
import sqlite3
import sys
from datetime import date, datetime, timedelta


# @piece day-bounds: UTC start and end of one business day
def day_bounds(day):
    start = datetime.fromisoformat(day) - timedelta(hours=7)  # 00:00 in Ho Chi Minh City
    end = start + timedelta(days=1)
    return start.strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")
# @end


# @piece replace-day: Recompute one day so a rerun gives the same rows
def run_day(db, day):
    start, end = day_bounds(day)
    with db:
        db.execute("DELETE FROM fact_commission WHERE day = ?", (day,))
        db.execute(
            """INSERT INTO fact_commission (day, restaurant_id, orders, commission_vnd)
               SELECT ?, restaurant_id, COUNT(*), CAST(ROUND(SUM(subtotal_vnd) * 0.18) AS INTEGER)
               FROM orders WHERE placed_at >= ? AND placed_at < ?
               GROUP BY restaurant_id""",
            (day, start, end),
        )
# @end


# @piece backfill-range: Every day of the range, both ends included
def backfill(db, start, end):
    days, d = [], date.fromisoformat(start)
    while d <= date.fromisoformat(end):
        run_day(db, d.isoformat())
        days.append(d.isoformat())
        d += timedelta(days=1)
    return days
# @end


# @piece lookback: The days a nightly run recomputes
def nightly(db, run_date, lookback):
    last = date.fromisoformat(run_date) - timedelta(days=1)
    days = [(last - timedelta(days=k)).isoformat() for k in range(lookback - 1, -1, -1)]
    for day in days:
        run_day(db, day)
    return days
# @end


# ---------------------------------------------------------------- test runner (do not change)
# Builds orders (and any old fact rows) from the test case, then runs its steps in order:
# {"run": day} | {"backfill": [start, end]} | {"nightly": run_date, "lookback": n} | {"orders": [...]}
# (new orders arriving late). Prints the days each step processed and the final fact table.
SCHEMA = """
CREATE TABLE orders (order_id INTEGER PRIMARY KEY, restaurant_id INTEGER, subtotal_vnd INTEGER, placed_at TEXT);
CREATE TABLE fact_commission (day TEXT, restaurant_id INTEGER, orders INTEGER, commission_vnd INTEGER);
"""

if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO orders VALUES (?, ?, ?, ?)", case["orders"])
    db.executemany("INSERT INTO fact_commission VALUES (?, ?, ?, ?)", case.get("old_fact", []))
    try:
        steps = []
        for step in case["steps"]:
            if "run" in step:
                run_day(db, step["run"])
                steps.append([step["run"]])
            elif "backfill" in step:
                steps.append(backfill(db, *step["backfill"]))
            elif "nightly" in step:
                steps.append(nightly(db, step["nightly"], step["lookback"]))
            else:
                db.executemany("INSERT INTO orders VALUES (?, ?, ?, ?)", step["orders"])
                steps.append([])
        fact = {}
        for day, restaurant, n, commission in db.execute("SELECT * FROM fact_commission ORDER BY day, restaurant_id"):
            fact.setdefault(day, []).append([restaurant, n, commission])
        print(json.dumps({"steps": steps, "fact": fact}))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
