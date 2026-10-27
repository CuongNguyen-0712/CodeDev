"""
The activity feed on a CodeDev profile ("Completed lesson 4", "Earned badge", ...) loads with
infinite scroll, newest first. Support has screenshots of events that never appear in the feed: a
lesson completion writes three events in one transaction, they share the same created_at, and the
old cursor (created_at < last created_at) skipped the ones left over at the end of a page.

Write NEXT_PAGE: the page that follows a given last row, in the order of FIRST_PAGE.

Table (SQLite in this runner; the same SQL works on PostgreSQL):
    activity_log(id INTEGER PRIMARY KEY, user_id, kind, created_at TEXT 'YYYY-MM-DD HH:MM:SS')
    Index created by the runner: activity_log_user_created_id ON activity_log (user_id, created_at, id)
    created_at is NOT unique (events of one transaction share it), and ids are NOT in time order
    (events imported from the old system got new, larger ids with their original timestamps).

Requirements for NEXT_PAGE:
  - Parameters: :user_id, :last_created_at and :last_id (the last row of the previous page), :limit.
  - Return id, kind, created_at (in that order) of the next :limit rows of :user_id in the order
    created_at DESC, id DESC: every row exactly once across all pages, none skipped, none repeated.
  - Seek with the index from the cursor: no OFFSET, no reading the rows of earlier pages again.
    SQLite supports row values since 3.15: (a, b) < (?, ?) compares like a tuple, as in PostgreSQL.

How the runner checks it (do not change it):
  - It runs FIRST_PAGE, then NEXT_PAGE with the last row of each page, until a page has fewer than
    :limit rows, and prints {"pages": <pages read>, "ids": [<ids in feed order>], "plan": "ok"}.
  - Every page runs with a budget of SQLite VM steps (set_progress_handler). A page that reads far
    more rows than it returns is stopped and the runner prints {"error": "too slow: ..."}.
  - "plan" is "ok" when EXPLAIN QUERY PLAN of NEXT_PAGE uses activity_log_user_created_id and
    needs no temporary B-tree to sort; otherwise it shows the plan.

Example: user 7 has rows (id, created_at) 4 '10:00:05', 9 '10:00:05', 2 '10:00:05', 3 '10:00:01'
and limit 2 -> pages [9, 4], [2, 3], [] -> {"pages": 3, "ids": [9, 4, 2, 3], "plan": "ok"}
"""
import json
import sqlite3
import sys
from datetime import datetime, timedelta

FIRST_PAGE = """
SELECT id, kind, created_at
FROM activity_log
WHERE user_id = :user_id
ORDER BY created_at DESC, id DESC
LIMIT :limit
"""

# Wrong: rows that share the last created_at but have a smaller id are skipped.
NEXT_PAGE = """
SELECT id, kind, created_at
FROM activity_log
WHERE user_id = :user_id
  AND created_at < :last_created_at
ORDER BY created_at DESC, id DESC
LIMIT :limit
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin: "rows" as
# [id, user_id, kind, created_at] lists, plus an optional "bulk" block the runner expands into
# many generated rows), pages through the feed of "user_id" and prints the result as JSON.
SCHEMA = """
CREATE TABLE activity_log (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX activity_log_user_created_id ON activity_log (user_id, created_at, id);
"""
KINDS = ["lesson_completed", "badge_earned", "streak_extended", "challenge_passed", "course_enrolled"]
STEPS_PER_CALL = 100
BUDGET_STEPS = 4000  # per page; a page of up to 50 rows read through the index needs far less


def bulk_rows(bulk):
    start = datetime.strptime(bulk["start"], "%Y-%m-%d %H:%M:%S")
    users = bulk["user_ids"]
    for k in range(bulk["count"]):
        row_id = 500000 + k if k % 11 == 5 else 100000 + k  # imported rows: larger ids, old times
        at = (start - timedelta(minutes=k // 6)).strftime("%Y-%m-%d %H:%M:%S")
        yield (row_id, users[k % len(users)], KINDS[k % len(KINDS)], at)


def run_page(conn, sql, params, page_number):
    calls = 0

    def tick():
        nonlocal calls
        calls += 1
        return 1 if calls * STEPS_PER_CALL > BUDGET_STEPS else 0

    conn.set_progress_handler(tick, STEPS_PER_CALL)
    try:
        return conn.execute(sql, params).fetchall()
    except sqlite3.OperationalError as error:
        if calls * STEPS_PER_CALL > BUDGET_STEPS:
            raise TimeoutError(f"too slow: page {page_number} needed more than {BUDGET_STEPS} VM steps") from error
        raise
    finally:
        conn.set_progress_handler(None, STEPS_PER_CALL)


def check_plan(conn, params):
    details = [row[3] for row in conn.execute("EXPLAIN QUERY PLAN " + NEXT_PAGE, params)]
    uses_index = any("activity_log_user_created_id" in d for d in details)
    sorts = any("TEMP B-TREE" in d for d in details)
    return "ok" if uses_index and not sorts else " | ".join(details)


if __name__ == "__main__":
    case = json.load(sys.stdin)
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    conn.executemany("INSERT INTO activity_log (id, user_id, kind, created_at) VALUES (?, ?, ?, ?)", case.get("rows", []))
    if "bulk" in case:
        conn.executemany("INSERT INTO activity_log (id, user_id, kind, created_at) VALUES (?, ?, ?, ?)", bulk_rows(case["bulk"]))
    total = conn.execute("SELECT count(*) FROM activity_log").fetchone()[0]
    user_id, limit = case["user_id"], case["limit"]
    try:
        ids, pages = [], 0
        page = run_page(conn, FIRST_PAGE, {"user_id": user_id, "limit": limit}, 1)
        pages = 1
        cursor = {"user_id": user_id, "last_created_at": "9999-12-31 23:59:59", "last_id": 2**62, "limit": limit}
        while True:
            ids.extend(row[0] for row in page)
            if len(page) < limit:
                break
            if pages > total // limit + 1:
                raise RuntimeError("more pages than rows: the cursor does not move forward")
            cursor = {"user_id": user_id, "last_created_at": page[-1][2], "last_id": page[-1][0], "limit": limit}
            page = run_page(conn, NEXT_PAGE, cursor, pages + 1)
            pages += 1
        print(json.dumps({"pages": pages, "ids": ids, "plan": check_plan(conn, cursor)}))
    except (sqlite3.Error, TimeoutError, RuntimeError) as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
