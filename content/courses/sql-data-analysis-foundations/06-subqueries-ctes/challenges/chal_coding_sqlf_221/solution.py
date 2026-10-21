"""
Marketing wants to know which referral channel brings the most valuable new customers. For each
referral source, report how many customers have placed at least one paid order and the average
value of each customer's FIRST paid order. Build it in named steps (WITH ... AS) so finance can
check every step.

Tables: customers(customer_id, name, country, signup_date, referral_source)
        orders(order_id, customer_id, ordered_at, status, total_cents, coupon_code)

Requirements:
  - One row per referral source: [source, paying_customers, avg_first_order_cents].
  - A customer's referral_source of NULL is reported as the source 'unknown'.
  - Only orders with status 'paid' count. A customer with no paid order is not counted at all.
  - A customer's first paid order is the paid order with the earliest ordered_at; if several
    paid orders share that timestamp, the one with the smallest order_id is first.
  - paying_customers counts customers (not orders). avg_first_order_cents is the average of their
    first paid orders' total_cents, rounded to a whole cent: CAST(ROUND(AVG(...)) AS INTEGER).
  - ORDER BY paying_customers DESC, then source ASC.

Example: Ben (friend) paid 3800 on Jan 12 and 6200 on Mar 1; Duc (friend) paid 1800 on Feb 3.
         -> [["friend", 2, 2800]]
"""
import json
import sqlite3
import sys

QUERY = """
WITH paid AS (                  -- one row per paid order
    SELECT order_id, customer_id, ordered_at, total_cents
    FROM orders
    WHERE status = 'paid'
),
first_orders AS (                -- one row per paying customer
    SELECT p.customer_id, p.total_cents
    FROM paid AS p
    WHERE p.order_id = (
        SELECT p2.order_id
        FROM paid AS p2
        WHERE p2.customer_id = p.customer_id
        ORDER BY p2.ordered_at, p2.order_id
        LIMIT 1
    )
),
with_source AS (                -- one row per paying customer
    SELECT COALESCE(c.referral_source, 'unknown') AS source, f.total_cents
    FROM first_orders AS f
    JOIN customers AS c ON c.customer_id = f.customer_id
)
SELECT source,
       COUNT(*)                                 AS paying_customers,
       CAST(ROUND(AVG(total_cents)) AS INTEGER) AS avg_first_order_cents
FROM with_source
GROUP BY source
ORDER BY paying_customers DESC, source
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), runs QUERY and
# prints the result rows as a JSON list of lists.
SCHEMA = """
CREATE TABLE customers (
    customer_id     INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL,
    country         TEXT    NOT NULL,
    signup_date     TEXT    NOT NULL,
    referral_source TEXT
);
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
