# Known wrong: excludes only cancelled orders, so refunded and pending orders are counted as paid.
"""
Marketing wants to thank Beanbox's repeat buyers with a free bag of beans. They asked for one
row per customer who has at least 2 paid orders, with enough numbers to pick the gift size.

Tables: orders(order_id, customer_id, ordered_at, status, total_cents, coupon_code)
        status is 'paid', 'refunded', 'cancelled' or 'pending'; coupon_code is NULL when no
        coupon was used.

Requirements:
  - Only orders with status 'paid' count, for every column below.
  - One row per customer: [customer_id, paid_orders, coupons_used, spent_cents, avg_order_cents]
      paid_orders      number of paid orders
      coupons_used     number of DIFFERENT coupon codes on those orders (no coupon is not a code)
      spent_cents      sum of total_cents of those orders
      avg_order_cents  average total_cents of those orders, rounded to the nearest whole cent
  - Keep only customers with at least 2 paid orders.
  - ORDER BY spent_cents from highest to lowest, then customer_id ascending.

Example: customer 7 has paid orders of 1000 (coupon 'FALL15'), 1001 (coupon 'FALL15') and 1001
         cents, plus a cancelled order -> [7, 3, 1, 3002, 1001]
"""
import json
import sqlite3
import sys

QUERY = """
SELECT customer_id,
       COUNT(*)                                 AS paid_orders,
       COUNT(DISTINCT coupon_code)              AS coupons_used,
       SUM(total_cents)                         AS spent_cents,
       CAST(ROUND(AVG(total_cents)) AS INTEGER) AS avg_order_cents
FROM orders
WHERE status <> 'cancelled'
GROUP BY customer_id
HAVING COUNT(*) >= 2
ORDER BY spent_cents DESC, customer_id
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), runs QUERY and
# prints the result rows as a JSON list of lists.
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
        print(json.dumps([list(row) for row in db.execute(QUERY)]))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
