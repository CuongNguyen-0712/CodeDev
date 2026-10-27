"""
Admins export the whole CodeDev activity log (oldest first) for the quarterly audit. The export job
asks for one page of 100 rows after another. Since the table passed a few million rows the job
dies around page 400 with "canceling statement due to statement timeout": every page is slower
than the one before, although each page returns only 100 rows.

Fix export_activity so that every page costs about the same, and the export stays EXACTLY the
same: the same rows, in the same order (created_at, then id), split into pages of PAGE_SIZE.

Table (SQLite in this runner; the same SQL works on PostgreSQL):
    activity_log(id INTEGER PRIMARY KEY, user_id, kind, created_at TEXT 'YYYY-MM-DD HH:MM:SS')
    Index created by the runner: activity_log_created_id ON activity_log (created_at, id)
    created_at is NOT unique (events of one transaction share it), and ids are NOT in time order
    (events imported from the old system got new, larger ids with their original timestamps).

Rules:
  - db.execute(sql, params) runs one statement and returns ALL its rows as a list of tuples.
  - Keep the page size, the columns (id, user_id, kind, created_at) and the order. (The runner sets
    PAGE_SIZE from the test case for small tests, so always use PAGE_SIZE, never the number 100.)
  - Each statement runs with a budget of SQLite VM steps (set_progress_handler, the runner's
    stand-in for statement_timeout). A statement that reads far more rows than it returns is
    stopped, and the runner prints {"error": "too slow: ..."}.

The runner prints {"pages": <pages>, "rows": <rows>, "head": <first 3 rows>, "tail": <last 3 rows>,
"sha256": <hash of the whole export>}, so any change in rows, order or page split shows up.
"""
import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timedelta

PAGE_SIZE = 100


def export_activity(db):
    """Returns the export as a list of pages; each page is a list of (id, user_id, kind, created_at)."""
    # Wrong: assumes ids follow time; imported rows have large ids with old timestamps.
    pages = []
    last = None
    while True:
        if last is None:
            rows = db.execute(
                """
                SELECT id, user_id, kind, created_at
                FROM activity_log
                ORDER BY created_at, id
                LIMIT :limit
                """,
                {"limit": PAGE_SIZE},
            )
        else:
            rows = db.execute(
                """
                SELECT id, user_id, kind, created_at
                FROM activity_log
                WHERE id > :last_id
                ORDER BY created_at, id
                LIMIT :limit
                """,
                {"limit": PAGE_SIZE, "last_created_at": last[3], "last_id": last[0]},
            )
        if rows:
            pages.append(rows)
        if len(rows) < PAGE_SIZE:
            return pages
        last = rows[-1]


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin: "rows" as
# [id, user_id, kind, created_at] lists, plus an optional "bulk" block the runner expands into
# many generated rows), runs export_activity and prints a summary of the export as JSON.
SCHEMA = """
CREATE TABLE activity_log (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX activity_log_created_id ON activity_log (created_at, id);
"""
KINDS = ["lesson_completed", "badge_earned", "streak_extended", "challenge_passed", "course_enrolled"]
STEPS_PER_CALL = 100
BUDGET_STEPS = 10000  # per statement; a page of 100 rows read through the index needs far less


def bulk_rows(bulk):
    start = datetime.strptime(bulk["start"], "%Y-%m-%d %H:%M:%S")
    for k in range(bulk["count"]):
        row_id = 700000 + k if k % 13 == 7 else 100000 + k  # imported rows: larger ids, old times
        at = (start + timedelta(seconds=7 * (k // 4))).strftime("%Y-%m-%d %H:%M:%S")
        yield (row_id, 1 + k % 50, KINDS[k % len(KINDS)], at)


class BudgetDb:
    """Runs one statement at a time under a VM-step budget, like statement_timeout."""

    def __init__(self, conn):
        self._conn = conn
        self.statements = 0

    def execute(self, sql, params=()):
        self.statements += 1
        calls = 0

        def tick():
            nonlocal calls
            calls += 1
            return 1 if calls * STEPS_PER_CALL > BUDGET_STEPS else 0

        self._conn.set_progress_handler(tick, STEPS_PER_CALL)
        try:
            return self._conn.execute(sql, params).fetchall()
        except sqlite3.OperationalError as error:
            if calls * STEPS_PER_CALL > BUDGET_STEPS:
                raise TimeoutError(
                    f"too slow: statement {self.statements} needed more than {BUDGET_STEPS} VM steps") from error
            raise
        finally:
            self._conn.set_progress_handler(None, STEPS_PER_CALL)


if __name__ == "__main__":
    case = json.load(sys.stdin)
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    conn.executemany("INSERT INTO activity_log (id, user_id, kind, created_at) VALUES (?, ?, ?, ?)", case.get("rows", []))
    if "bulk" in case:
        conn.executemany("INSERT INTO activity_log (id, user_id, kind, created_at) VALUES (?, ?, ?, ?)", bulk_rows(case["bulk"]))
    if "page_size" in case:  # small tests use small pages
        PAGE_SIZE = case["page_size"]
    try:
        pages = export_activity(BudgetDb(conn))
        rows = [list(row) for page in pages for row in page]
        split = [len(page) for page in pages]
        digest = hashlib.sha256(json.dumps([split, rows]).encode()).hexdigest()[:16]
        print(json.dumps({"pages": len(pages), "rows": len(rows), "head": rows[:3], "tail": rows[-3:], "sha256": digest}))
    except (sqlite3.Error, TimeoutError) as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
