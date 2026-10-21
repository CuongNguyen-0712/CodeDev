"""
Finance closes the books month by month. Their monthly report must reconcile with the
payment provider: paid money and refunded money in separate columns, every month that had
orders, and every order of the last day of the period included.

Tables: orders(order_id, customer_id, ordered_at 'YYYY-MM-DD HH:MM:SS' UTC,
               status 'paid' | 'refunded' | 'cancelled' | 'pending', total_cents)
Parameters: :start and :end, dates 'YYYY-MM-DD'. The period is half-open:
            it includes :start and excludes :end (:end is the first day after the period).

Requirements:
  - One row per month 'YYYY-MM' (UTC, from ordered_at) that has at least one order of
    any status in the period: [month, all_orders, paid_orders, paid_cents, refunded_cents].
  - all_orders counts every order (any status); paid_orders counts status 'paid' only.
  - paid_cents = sum of total_cents of 'paid' orders; refunded_cents = the same for
    'refunded' orders. Both are integers and 0 (never NULL) when a month has none.
  - Cancelled and pending orders appear only in all_orders.
  - ORDER BY month ascending.

Example: start '2026-03-01', end '2026-04-01', orders
         (1, '2026-03-02 09:00:00', 'paid', 2500), (2, '2026-03-05 18:30:00', 'refunded', 4000)
         -> [["2026-03", 2, 1, 2500, 4000]]
"""
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
WHERE ordered_at >= :start
  AND ordered_at <  :end
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
