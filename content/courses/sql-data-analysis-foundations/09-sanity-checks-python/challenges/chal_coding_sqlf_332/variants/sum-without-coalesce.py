# Known wrong: SUM over no rows is NULL (None in Python), so an empty period never matches an empty report.
import json
import sqlite3
import sys


def check_report(db: sqlite3.Connection, report: list, start: str, end: str) -> list[str]:
    period = {"start": start, "end": end}
    failed = set()

    keys = []
    for country, _revenue_cents, pct in report:
        key = (country or "").strip().upper()
        if key:
            keys.append(key)
        else:
            failed.add("null_key")
        if not 0 <= pct <= 100:
            failed.add("pct_out_of_range")
    if len(keys) != len(set(keys)):
        failed.add("duplicate_key")

    expected = {country for (country,) in db.execute("""
        SELECT DISTINCT UPPER(TRIM(c.country))
        FROM orders o JOIN customers c ON c.customer_id = o.customer_id
        WHERE o.status = 'paid' AND o.ordered_at >= :start AND o.ordered_at < :end""", period)}
    if expected - set(keys):
        failed.add("missing_country")

    (reference_total,) = db.execute("""
        SELECT SUM(total_cents) FROM orders
        WHERE status = 'paid' AND ordered_at >= :start AND ordered_at < :end""", period).fetchone()
    if sum(row[1] for row in report) != reference_total:
        failed.add("total_mismatch")

    if report and abs(sum(row[2] for row in report) - 100) > 0.5:
        failed.add("pct_sum")
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
