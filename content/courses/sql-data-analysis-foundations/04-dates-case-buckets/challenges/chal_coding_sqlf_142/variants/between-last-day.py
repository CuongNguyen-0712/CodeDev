# Known wrong: BETWEEN :start AND the last day compares text, so every order placed on the last day of the period is dropped ('2026-03-31 14:05:00' > '2026-03-31').
import json
import sqlite3
import sys

QUERY = """
SELECT strftime('%Y-%m', ordered_at)                                  AS month,
       COUNT(*)                                                       AS all_orders,
       COUNT(*) FILTER (WHERE status = 'paid')                        AS paid_orders,
       SUM(CASE WHEN status = 'paid'     THEN total_cents ELSE 0 END) AS paid_cents,
       SUM(CASE WHEN status = 'refunded' THEN total_cents ELSE 0 END) AS refunded_cents
FROM orders
WHERE ordered_at BETWEEN :start AND date(:end, '-1 day')
GROUP BY month
ORDER BY month
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), runs QUERY with the
# case's params (:start, :end) and prints the result rows as a JSON list of lists.
SCHEMA = """
CREATE TABLE orders (
    order_id     INTEGER PRIMARY KEY,
    customer_id  INTEGER NOT NULL,
    ordered_at   TEXT    NOT NULL,
    status       TEXT    NOT NULL,
    total_cents  INTEGER NOT NULL,
    coupon_code  TEXT
);
"""

if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    for table, rows in case["tables"].items():
        for row in rows:
            columns = ", ".join(row)
            marks = ", ".join("?" for _ in row)
            db.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", list(row.values()))
    try:
        print(json.dumps([list(row) for row in db.execute(QUERY, case.get("params", {}))]))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
