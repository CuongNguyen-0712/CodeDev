"""
Before the "revenue by country" report goes to the CEO, run it through check_report. It returns
the names of the sanity checks that FAIL, so a bad report never leaves your laptop again.

Tables: customers(customer_id, country), orders(order_id, customer_id, ordered_at, status, total_cents)

Arguments:
  - db: an open sqlite3 connection to the Beanbox database.
  - report: the rows the analyst is about to send, each [country, revenue_cents, pct]
    (country is TEXT or None, revenue_cents an integer, pct a number such as 33.3).
  - start, end: the period of the report, 'YYYY-MM-DD', half-open: start <= ordered_at < end.

Requirements: return the SORTED list of the failed check names below ([] when all pass).
  The key of a row is its country with leading/trailing spaces removed, in upper case
  ("vn " -> "VN"). Use SQL parameters for start and end, never an f-string.
  - "null_key":         a row's country is None or empty after removing spaces.
  - "duplicate_key":    two rows have the same key (rows with a null key are ignored here).
  - "missing_country":  a country (customers.country, trimmed, upper case) that has at least
                        one 'paid' order in the period has no row in the report.
  - "total_mismatch":   the report's revenue_cents do not add up to the reference total: the
                        SUM of total_cents of 'paid' orders in the period (0 if there are none).
  - "pct_out_of_range": a pct is below 0 or above 100.
  - "pct_sum":          the report has at least one row and its pct values add up to a number
                        more than 0.5 away from 100 (rounded percentages may sum to 99.9).
  Each name appears at most once.

Example: paid orders VN 30000, US 40000, DE 30000 cents and the report
         [["VN", 30000, 30.0], ["US", 40000, 40.0], ["vn ", 30000, 30.0]]
         -> ["duplicate_key", "missing_country"]
"""
import json
import sqlite3
import sys


def check_report(db: sqlite3.Connection, report: list, start: str, end: str) -> list[str]:
    failed = set()
    # TODO: this first draft only checks the keys for None. Add the other five checks from
    # the docstring; the reference total and the expected countries come from SQL queries.
    for country, revenue_cents, pct in report:
        if country is None:
            failed.add("null_key")
    return sorted(failed)


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), calls
# check_report(db, report, start, end) and prints the returned list as JSON.
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
        print(json.dumps(check_report(db, case["report"], case["start"], case["end"])))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
