"""
The growth team wants a monthly retention table they can trust: for each cohort of customers
(grouped by the month of their FIRST PAID order), how many of them came back and paid again
1, 2, 3 ... months later, as a share of the whole cohort.

Tables: orders(order_id, customer_id, ordered_at 'YYYY-MM-DD HH:MM:SS', status, total_cents, coupon_code)

Requirements:
  - One row per (cohort_month, months_since_first) that has at least one active customer:
      cohort_month        TEXT 'YYYY-MM', the month of the customer's first paid order
      months_since_first  INTEGER, calendar months between the cohort month and the order month
                          (same month = 0, next calendar month = 1, also across a new year)
      active_customers    number of DISTINCT customers of the cohort with at least one paid
                          order in that month
      cohort_size         number of customers in the cohort (the same on every row of a cohort)
      retention_pct       ROUND(100.0 * active_customers / cohort_size, 1)
  - Only orders with status = 'paid' count, both for the cohort and for activity. Cancelled,
    refunded and pending orders are ignored completely.
  - The denominator is always the cohort size, never last month's active customers.
  - ORDER BY cohort_month, months_since_first.

Example: customer 1 pays on 2026-01-05 and 2026-03-10, customer 2 pays on 2026-01-20 ->
  [["2026-01", 0, 2, 2, 100.0], ["2026-01", 2, 1, 2, 50.0]]
"""
import json
import sqlite3
import sys

QUERY = """
WITH paid AS (
    SELECT customer_id,
           strftime('%Y-%m', ordered_at) AS order_month,
           CAST(strftime('%Y', ordered_at) AS INTEGER) * 12
         + CAST(strftime('%m', ordered_at) AS INTEGER) AS month_index
    FROM orders
    WHERE status = 'paid'
),
cohorts AS (
    SELECT customer_id,
           MIN(order_month) AS cohort_month,
           MIN(month_index) AS first_index
    FROM paid
    GROUP BY customer_id
),
cohort_sizes AS (
    SELECT cohort_month, COUNT(*) AS cohort_size
    FROM cohorts
    GROUP BY cohort_month
),
activity AS (
    SELECT c.cohort_month,
           p.month_index - c.first_index AS months_since_first,
           COUNT(DISTINCT p.customer_id) AS active_customers
    FROM paid p
    JOIN cohorts c ON c.customer_id = p.customer_id
    GROUP BY c.cohort_month, months_since_first
)
SELECT a.cohort_month,
       a.months_since_first,
       a.active_customers,
       s.cohort_size,
       ROUND(100.0 * a.active_customers / s.cohort_size, 1) AS retention_pct
FROM activity a
JOIN cohort_sizes s ON s.cohort_month = a.cohort_month
ORDER BY a.cohort_month, a.months_since_first;
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
