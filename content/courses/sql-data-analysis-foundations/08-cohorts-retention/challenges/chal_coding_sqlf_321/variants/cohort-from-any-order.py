# Known wrong: takes the cohort month from the first order of any status, so a cancelled first order moves the customer into an earlier cohort.
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
           strftime('%Y-%m', MIN(ordered_at)) AS cohort_month,
           CAST(strftime('%Y', MIN(ordered_at)) AS INTEGER) * 12
         + CAST(strftime('%m', MIN(ordered_at)) AS INTEGER) AS first_index
    FROM orders
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
