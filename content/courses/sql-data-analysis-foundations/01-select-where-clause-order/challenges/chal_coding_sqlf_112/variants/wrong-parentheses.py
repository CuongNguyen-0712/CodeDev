# Known wrong: the parentheses still group status = 'paid' with SPRING10 only, so refunded and cancelled SPRING20 orders count.
"""
Marketing wants the list behind the spring campaign slide: every PAID order that used the
SPRING10 or SPRING20 coupon and is worth at least $25.00, biggest orders first. Last time the
slide counted refunded and cancelled orders too, so finance will check every row.

Tables: orders(order_id, customer_id, ordered_at, status, total_cents, coupon_code)
        status is 'paid', 'refunded', 'cancelled' or 'pending'; coupon_code is NULL without a coupon.

Requirements:
  - Each row: order_id, customer_id, coupon_code, total_cents (in this order, total in cents).
  - Keep an order only if status is 'paid', coupon_code is exactly 'SPRING10' or 'SPRING20',
    and total_cents is at least 2500 ($25.00 counts).
  - ORDER BY total_cents descending; for equal totals, the newer order first (larger order_id).

Example: order 1 (customer 11, paid, 4200, 'SPRING10'), order 2 (customer 12, refunded, 3900,
         'SPRING20') and order 3 (customer 13, paid, 2650, 'SPRING20')
         -> [[1, 11, "SPRING10", 4200], [3, 13, "SPRING20", 2650]]
"""
import json
import sqlite3
import sys

QUERY = """
SELECT order_id, customer_id, coupon_code, total_cents
FROM orders
WHERE (status = 'paid' AND coupon_code = 'SPRING10' OR coupon_code = 'SPRING20')
  AND total_cents >= 2500
ORDER BY total_cents DESC, order_id DESC
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
