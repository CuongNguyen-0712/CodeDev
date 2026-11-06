"""
Rice Rocket's nightly order load copied the restaurant system's export straight into the reporting
table. One night the export broke: 30% of delivered orders had total_vnd = 0 and some had no
restaurant. The finance dashboard showed revenue down 30% at 08:00 and two managers escalated before
anyone looked at the data.

The load now writes, audits, then publishes:
  staging_orders(order_id, restaurant_id, status, total_vnd, placed_at)  tonight's export
  orders(...)                                                            published, read by dashboards
  dim_restaurant(restaurant_id)                                          known restaurants
  placed_at is UTC ISO ("2026-11-05T04:10:00Z"); the business day is Ho Chi Minh City time (UTC+7).

Each check is {"name", "severity", "sql"}; the SQL returns one number, the failing rows (0 = pass).
  - error checks: required columns present; order_id unique in the batch AND not already published;
    delivered orders have a positive total; every restaurant is known.
  - warn check "volume": tonight's row count is below 70% of the median daily count of the 7 business
    days before :batch_day (the median ignores one unusual day, such as a promotion).
decide(results) publishes only when no error check fails; warnings are reported but do not block.
"""
import json
import sqlite3
import sys

CHECKS = [
    # [ ] Error: rows missing an id, a restaurant or a time
    # [ ] Error: order ids repeated or already published
    # [ ] Error: delivered orders without a positive total
    # [ ] Error: orders of restaurants we do not know
    # [ ] Warning: far fewer rows than a normal recent day
]


# [ ] Publish unless an error check failed


def audit(db, batch_day):
    return [{**c, "failing": db.execute(c["sql"], {"batch_day": batch_day}).fetchone()[0] or 0} for c in CHECKS]


# ---------------------------------------------------------------- test runner (do not change)
# Builds dim_restaurant, the published history and tonight's staging rows from the test case, runs
# the checks, and publishes the batch (staging -> orders) only when decide() says so. Prints each
# check's failing rows, the decision and the number of published orders afterwards.
SCHEMA = """
CREATE TABLE dim_restaurant (restaurant_id INTEGER PRIMARY KEY);
CREATE TABLE orders (order_id INTEGER, restaurant_id INTEGER, status TEXT, total_vnd INTEGER, placed_at TEXT);
CREATE TABLE staging_orders (order_id INTEGER, restaurant_id INTEGER, status TEXT, total_vnd INTEGER, placed_at TEXT);
"""

if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO dim_restaurant VALUES (?)", [[r] for r in case["restaurants"]])
    db.executemany("INSERT INTO orders VALUES (?, ?, ?, ?, ?)", case["published"])
    db.executemany("INSERT INTO staging_orders VALUES (?, ?, ?, ?, ?)", case["staging"])
    try:
        results = audit(db, case["batch_day"])
        decision = decide(results)
        if decision["publish"]:
            with db:
                db.execute("INSERT INTO orders SELECT * FROM staging_orders")
        print(json.dumps({
            "checks": {r["name"]: r["failing"] for r in results},
            **decision,
            "published_orders": db.execute("SELECT COUNT(*) FROM orders").fetchone()[0],
        }, sort_keys=True))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
