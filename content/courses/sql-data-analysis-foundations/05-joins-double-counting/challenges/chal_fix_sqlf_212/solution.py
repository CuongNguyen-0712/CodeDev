"""
Account managers want one row per customer: how many paid orders the customer placed, how much
revenue those orders brought in, and how much money Beanbox actually collected for them.
Customers without a paid order must still be listed, with zeros, because those are the people
the team wants to call. The current query below shows inflated numbers for customers who paid an
order in two parts, and it leaves out every customer without a paid order.

Tables: customers(customer_id, name, ...), orders(order_id, customer_id, status, total_cents, ...),
        payments(payment_id, order_id, amount_cents, ...) - an order has 0, 1 or several payments.

Requirements:
  - One row per customer, every customer included:
    [customer_id, name, paid_orders, revenue_cents, collected_cents]
  - Only orders with status 'paid' count (not 'refunded', 'cancelled' or 'pending').
    paid_orders = number of those orders, revenue_cents = sum of their total_cents,
    collected_cents = sum of amount_cents over every payment of those orders.
  - A paid order whose payment is not recorded yet still counts in paid_orders and revenue_cents;
    it adds 0 to collected_cents.
  - All three numbers are 0, never NULL, for a customer without paid orders.
  - ORDER BY revenue_cents DESC, then customer_id ASC.

Example: Anh has one paid order of 9000 cents, paid in two parts (5000 + 4000); Ben has no orders
  -> [[1, "Anh", 1, 9000, 9000], [2, "Ben", 0, 0, 0]]
"""
import json
import sqlite3
import sys

QUERY = """
SELECT c.customer_id,
       c.name,
       COUNT(o.order_id)                  AS paid_orders,
       COALESCE(SUM(o.total_cents), 0)    AS revenue_cents,
       COALESCE(SUM(p.collected_cents), 0) AS collected_cents
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
                  AND o.status = 'paid'          -- filter on the right table: in ON, not WHERE
LEFT JOIN (                                      -- one row per order before joining
    SELECT order_id, SUM(amount_cents) AS collected_cents
    FROM payments
    GROUP BY order_id
) AS p ON p.order_id = o.order_id
GROUP BY c.customer_id, c.name
ORDER BY revenue_cents DESC, c.customer_id
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
CREATE TABLE payments (
    payment_id    INTEGER PRIMARY KEY,
    order_id      INTEGER NOT NULL,
    amount_cents  INTEGER NOT NULL,
    paid_at       TEXT    NOT NULL,
    method        TEXT    NOT NULL
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
