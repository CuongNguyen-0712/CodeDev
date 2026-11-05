"""
The admin order list pages through one restaurant's orders, newest first, with OFFSET. Page 2,000
takes seconds, and while new orders arrive staff see some orders twice and never see others.
Switch it to keyset (seek) pagination.

Table: orders(id, restaurant_id, status, total_vnd, created_at)
       created_at is an ISO timestamp with second precision: many orders share one second.

fetch_page(db, restaurant_id, cursor, page_size) returns {"orders": [ids...], "next": cursor or None}.
  - The order is created_at DESC, then id DESC: unique and stable, so ties never move between pages.
  - The first page has no cursor; every next page starts strictly after the last row of the previous
    page, with a row-value comparison on (created_at, id).
  - The cursor is opaque to the browser: URL-safe base64 of JSON {"created_at": ..., "id": ...}.
  - A cursor that does not decode to exactly that shape raises InvalidCursor("invalid cursor").
  - An index lets both queries SEARCH by restaurant in that order, without a sort.
"""
import base64
import binascii
import json
import re
import sqlite3
import sys


class InvalidCursor(ValueError):
    pass


# @piece page-index: Index that serves the list's filter and order
PAGE_INDEX = "CREATE INDEX orders_restaurant_created_id ON orders (restaurant_id, created_at, id)"
# @end

# @piece first-page: Query for the first page
Q_FIRST = """
SELECT id, created_at FROM orders
WHERE restaurant_id = :restaurant_id
ORDER BY created_at DESC, id DESC
LIMIT :page_size
"""
# @end

# @piece next-page: Query for the page after a cursor
Q_NEXT = """
SELECT id, created_at FROM orders
WHERE restaurant_id = :restaurant_id
  AND (created_at, id) < (:created_at, :id)
ORDER BY created_at DESC, id DESC
LIMIT :page_size
"""
# @end


# @piece encode-cursor: Turn the last row of a page into a cursor
def encode_cursor(row):
    data = json.dumps({"created_at": row[1], "id": row[0]}, separators=(",", ":"))
    return base64.urlsafe_b64encode(data.encode()).decode()
# @end


# @piece decode-cursor: Read a cursor back, rejecting anything else
def decode_cursor(cursor):
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
    except (binascii.Error, UnicodeDecodeError, ValueError):
        raise InvalidCursor("invalid cursor")
    if not isinstance(data, dict) or set(data) != {"created_at", "id"} \
            or not isinstance(data["created_at"], str) or type(data["id"]) is not int:
        raise InvalidCursor("invalid cursor")
    return data
# @end


def fetch_page(db, restaurant_id, cursor=None, page_size=20):
    params = {"restaurant_id": restaurant_id, "page_size": page_size}
    if cursor is None:
        rows = db.execute(Q_FIRST, params).fetchall()
    else:
        params.update(decode_cursor(cursor))
        rows = db.execute(Q_NEXT, params).fetchall()
    return {"orders": [row[0] for row in rows], "next": encode_cursor(rows[-1]) if len(rows) == page_size else None}


# ---------------------------------------------------------------- test runner (do not change)
# Builds the orders table from the test case, creates PAGE_INDEX, then pages through one restaurant:
# after page N it inserts the case's "arrivals" for N (new orders, as the restaurant keeps selling).
# Prints the pages, the ids seen twice, the ids that existed before page 1 but were never shown,
# and the plans of both queries.
SCHEMA = """
CREATE TABLE orders (
    id            INTEGER PRIMARY KEY,
    restaurant_id INTEGER NOT NULL,
    status        TEXT    NOT NULL,
    total_vnd     INTEGER NOT NULL,
    created_at    TEXT    NOT NULL
);
"""


def plan(db, sql, params):
    details = [row[3] for row in db.execute("EXPLAIN QUERY PLAN " + sql, params)]
    found = re.search(r"USING (?:COVERING )?INDEX (\w+)", " ".join(details))
    return {"index": found.group(1) if found else None, "temp_sort": any("TEMP B-TREE" in d for d in details)}


if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    insert = "INSERT INTO orders VALUES (?, ?, ?, ?, ?)"
    db.executemany(insert, case["orders"])
    rid, size = case["restaurant_id"], case["page_size"]
    try:
        db.execute(globals().get("PAGE_INDEX", "SELECT 1"))
        if "bad_cursor" in case:
            try:
                fetch_page(db, rid, case["bad_cursor"], size)
                print(json.dumps({"bad_cursor": "accepted"}))
            except InvalidCursor as error:
                print(json.dumps({"bad_cursor": f"InvalidCursor: {error}"}))
            sys.exit(0)
        existing = {row[0] for row in db.execute("SELECT id FROM orders WHERE restaurant_id = ?", (rid,))}
        pages, cursor = [], None
        while len(pages) < 50:
            page = fetch_page(db, rid, cursor, size)
            pages.append(page["orders"])
            db.executemany(insert, case.get("arrivals", {}).get(str(len(pages)), []))
            cursor = page["next"]
            if cursor is None:
                break
        seen = [i for p in pages for i in p]
        sample = {"restaurant_id": rid, "page_size": size, "created_at": "2026-11-05T12:00:00", "id": 1}
        print(json.dumps({
            "pages": pages,
            "seen_twice": sorted({i for i in seen if seen.count(i) > 1}),
            "never_shown": sorted(existing - set(seen)),
            "plans": {"first": plan(db, Q_FIRST, sample), "next": plan(db, Q_NEXT, sample)},
        }))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
