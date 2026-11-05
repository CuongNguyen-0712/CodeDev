"""
Rice Rocket's slow query log points at the orders table. Someone added one index per column
(seven of them): inserts got slower and the slow queries stayed slow. Replace them with the
indexes the queries need.

Table: orders(id, public_code, restaurant_id, customer_id, courier_id, status, total_vnd, created_at)
       status is 'pending', 'cooking', 'delivering', 'delivered' or 'cancelled'
Indexes today: orders_<column>_idx on restaurant_id, customer_id, courier_id, status, created_at,
       total_vnd and public_code (see SEVEN_INDEXES in the runner).

The only queries on orders (see QUERIES in the runner):
  active   - the restaurant tablet: active orders of one restaurant, newest first, 20 at a time
  history  - the customer app: one customer's orders in a date range, newest first
  lookup   - support: one order by its public code (unique, e.g. RR-7Q2K9)
  courier  - the courier app: the order a courier is delivering

Requirements (each piece is SQL run once, in the order DROP_UNUSED, ACTIVE_INDEX, HISTORY_INDEX,
LOOKUP_INDEX):
  - Drop every one-column index no query needs; keep orders_courier_id_idx (the courier query uses it).
  - active:  an index the restaurant query can SEARCH, that already returns rows in created_at order
             and holds only the active orders (most of the table is delivered or cancelled).
  - history: an index the customer query can SEARCH on the customer AND the date range.
  - lookup:  a UNIQUE index on public_code.
  - Results of every query stay exactly the same; the table ends with 4 indexes.

The runner prints, per query, how SQLite plans it (EXPLAIN QUERY PLAN): the index it searches,
the constraint it uses, and whether it needs a temporary B-tree to sort.
"""
import json
import random
import re
import sqlite3
import sys

# @piece drop-unused: Drop the one-column indexes no query needs
DROP_UNUSED = """
DROP INDEX orders_restaurant_id_idx;
DROP INDEX orders_customer_id_idx;
DROP INDEX orders_status_idx;
DROP INDEX orders_created_at_idx;
DROP INDEX orders_total_vnd_idx;
DROP INDEX orders_public_code_idx;
"""
# @end

# @piece active-index: Index for a restaurant's active orders, newest first
ACTIVE_INDEX = """
CREATE INDEX orders_active_by_restaurant
    ON orders (restaurant_id, created_at)
    WHERE status IN ('pending', 'cooking');
"""
# @end

# @piece history-index: Index for one customer's orders in a date range
HISTORY_INDEX = """
CREATE INDEX orders_by_customer_created ON orders (customer_id, created_at);
"""
# @end

# @piece lookup-index: Index for support's lookup by public code
LOOKUP_INDEX = """
CREATE UNIQUE INDEX orders_public_code_key ON orders (public_code);
"""
# @end


# ---------------------------------------------------------------- test runner (do not change)
# Builds the orders table with its seven one-column indexes and generated rows, runs your SQL
# pieces in order, then reports the query plans, the index count and the query results.
SCHEMA = """
CREATE TABLE orders (
    id            INTEGER PRIMARY KEY,
    public_code   TEXT    NOT NULL,
    restaurant_id INTEGER NOT NULL,
    customer_id   INTEGER NOT NULL,
    courier_id    INTEGER,
    status        TEXT    NOT NULL,
    total_vnd     INTEGER NOT NULL,
    created_at    TEXT    NOT NULL
);
"""
SEVEN_INDEXES = ["restaurant_id", "customer_id", "courier_id", "status", "created_at", "total_vnd", "public_code"]
QUERIES = {
    "active": """
        SELECT id, status, created_at FROM orders
        WHERE restaurant_id = :restaurant_id AND status IN ('pending', 'cooking')
        ORDER BY created_at DESC LIMIT 20""",
    "history": """
        SELECT id, total_vnd, created_at FROM orders
        WHERE customer_id = :customer_id AND created_at >= :from AND created_at < :to
        ORDER BY created_at DESC""",
    "lookup": "SELECT id, status FROM orders WHERE public_code = :code",
    "courier": "SELECT id, status FROM orders WHERE courier_id = :courier_id AND status = 'delivering'",
}
STATUSES = ["delivered"] * 14 + ["cancelled"] * 3 + ["pending", "cooking", "delivering"]


def build(db, n, seed):
    db.executescript(SCHEMA)
    for column in SEVEN_INDEXES:
        db.execute(f"CREATE INDEX orders_{column}_idx ON orders ({column})")
    rng = random.Random(seed)
    for i in range(1, n + 1):
        status = rng.choice(STATUSES)
        db.execute(
            "INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (i, f"RR-{i:05d}", rng.randint(1, 12), rng.randint(1, 40),
             rng.randint(1, 25) if status in ("delivering", "delivered") else None,
             status, rng.randint(4, 60) * 5000,
             f"2026-10-{1 + (i * 30) // n:02d}T{(i * 7) % 24:02d}:{(i * 13) % 60:02d}:00"))


def plan(db, sql, params):
    details = [row[3] for row in db.execute("EXPLAIN QUERY PLAN " + sql, params)]
    main = next((d for d in details if re.match(r"(SEARCH|SCAN) (TABLE )?orders\b", d)), "")
    found = re.search(r"USING (?:COVERING )?INDEX (\w+)(?: \((.*)\))?", main)
    return {
        "index": found.group(1) if found else None,
        "constraint": (found.group(2) or "") if found else "",
        "temp_sort": any("TEMP B-TREE" in d for d in details),
    }


if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    build(db, case.get("rows", 600), case.get("seed", 7))
    before = {name: db.execute(sql, case["params"][name]).fetchall() for name, sql in QUERIES.items()}
    try:
        for name in ("DROP_UNUSED", "ACTIVE_INDEX", "HISTORY_INDEX", "LOOKUP_INDEX"):
            db.executescript(globals().get(name, ""))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
        sys.exit(0)
    out = {}
    for check in case["checks"]:
        if check == "plans":
            out["plans"] = {name: plan(db, QUERIES[name], case["params"][name]) for name in case.get("queries", QUERIES)}
        elif check == "indexes":
            out["indexes"] = [row[0] for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'orders' "
                "AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name")]
        elif check == "same_results":
            out["same_results"] = all(db.execute(sql, case["params"][name]).fetchall() == before[name]
                                      for name, sql in QUERIES.items())
        elif check == "duplicate_code":
            try:
                db.execute("INSERT INTO orders VALUES (99999, 'RR-00001', 1, 1, NULL, 'pending', 50000, '2026-10-31T23:00:00')")
                out["duplicate_code"] = "accepted"
            except sqlite3.IntegrityError as error:
                out["duplicate_code"] = f"IntegrityError: {error}"
    print(json.dumps(out))
