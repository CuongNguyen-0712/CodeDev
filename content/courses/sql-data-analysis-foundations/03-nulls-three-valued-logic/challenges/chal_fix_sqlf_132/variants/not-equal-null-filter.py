# Known wrong: filters the refunded list with coupon_code <> NULL, which is UNKNOWN for every row, so the list is always empty and refunded coupons are reported as safe.
"""
Marketing renews only the coupons that have never been used on a refunded order. Their
"safe coupons" report came back EMPTY this month, although several coupons were used on paid
orders and were never refunded. Fix the query.

Tables: orders(order_id, customer_id, ordered_at, status, total_cents, coupon_code)
        status is 'paid', 'refunded', 'cancelled' or 'pending'; coupon_code is NULL when the
        order used no coupon.

Requirements:
  - one row per coupon code: [coupon_code, paid_orders], where paid_orders is the number of
    orders with status 'paid' that used the coupon
  - list a coupon only if it was used on at least one paid order and on no refunded order
  - an order without a coupon is not a coupon: NULL must never appear as a coupon_code
  - ORDER BY paid_orders DESC, then coupon_code ASC

Example: WELCOME10 on 2 paid orders, SPRING15 on 1 paid and 1 refunded order, plus a refunded
order with no coupon  ->  [["WELCOME10", 2]]
"""
import json
import sqlite3
import sys

QUERY = """
SELECT coupon_code, COUNT(*) AS paid_orders
FROM orders
WHERE status = 'paid'
  AND coupon_code IS NOT NULL
  AND coupon_code NOT IN (
      SELECT coupon_code FROM orders WHERE status = 'refunded' AND coupon_code <> NULL
  )
GROUP BY coupon_code
ORDER BY paid_orders DESC, coupon_code;
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
