"""
Marketing rebuilds the "Top sellers per category" slide. They want the two best places in every
category by paid revenue, and a tie must never hide a product: tied products share a place, like
on a sports table.

Tables: products(product_id, name, category, price_cents),
        orders(order_id, customer_id, ordered_at, status, total_cents, coupon_code),
        order_items(order_id, product_id, quantity, unit_price_cents)

Requirements:
  - One row per product: [category, place, name, revenue_cents].
  - revenue_cents = SUM(quantity * unit_price_cents) over the product's order lines in orders
    with status 'paid' (the price on the order line, not the current price in products).
    Products with no paid sales are not listed.
  - place is computed inside each category, highest revenue first, with RANK semantics:
    place = 1 + the number of products in the same category with a strictly higher revenue.
    Tied products share a place and the next place is skipped (9000, 9000, 3800 -> 1, 1, 3).
  - Keep only places 1 and 2 (every product tied at place 1 or 2 is kept).
  - ORDER BY category, place, name.

Example: equipment revenue Hand grinder 9000, Paper filters (100) 9000, Gooseneck kettle 3800
         -> ["equipment", 1, "Hand grinder", 9000], ["equipment", 1, "Paper filters (100)", 9000]
"""
import json
import sqlite3
import sys

QUERY = """
WITH product_revenue AS (
    SELECT p.category, p.name, SUM(oi.quantity * oi.unit_price_cents) AS revenue_cents
    FROM order_items AS oi
    JOIN orders   AS o ON o.order_id   = oi.order_id
    JOIN products AS p ON p.product_id = oi.product_id
    WHERE o.status = 'paid'
    GROUP BY p.product_id, p.category, p.name
),
ranked AS (
    SELECT category, name, revenue_cents,
           RANK() OVER (PARTITION BY category ORDER BY revenue_cents DESC) AS place
    FROM product_revenue
)
SELECT category, place, name, revenue_cents
FROM ranked
WHERE place <= 2
ORDER BY category, place, name
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), runs QUERY and
# prints the result rows as a JSON list of lists.
SCHEMA = """
CREATE TABLE products (
    product_id   INTEGER PRIMARY KEY,
    name         TEXT    NOT NULL,
    category     TEXT    NOT NULL,
    price_cents  INTEGER NOT NULL
);
CREATE TABLE orders (
    order_id     INTEGER PRIMARY KEY,
    customer_id  INTEGER NOT NULL,
    ordered_at   TEXT    NOT NULL,
    status       TEXT    NOT NULL,
    total_cents  INTEGER NOT NULL,
    coupon_code  TEXT
);
CREATE TABLE order_items (
    order_id          INTEGER NOT NULL,
    product_id        INTEGER NOT NULL,
    quantity          INTEGER NOT NULL,
    unit_price_cents  INTEGER NOT NULL
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
