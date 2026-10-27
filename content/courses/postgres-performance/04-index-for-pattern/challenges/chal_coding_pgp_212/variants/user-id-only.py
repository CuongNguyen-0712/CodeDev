"""
CodeDev's database has grown, and three queries now show up at the top of pg_stat_statements.
Over the years someone added one index for every column that appears in a WHERE or ORDER BY,
and the planner still reads far more rows than these queries return. Replace INDEXES with the
indexes these three query patterns need: at most 3 CREATE INDEX statements in total.

The tables (created by the runner, already full of rows when INDEXES is applied):
  enrollments(id INTEGER PRIMARY KEY, user_id, course_id, created_at, status)
  activity_log(id INTEGER PRIMARY KEY, user_id, kind, created_at)

The queries (the runner runs them exactly like this; do not change them):
  my_courses       SELECT id, course_id, status, created_at FROM enrollments
                   WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  weekly_activity  SELECT count(*) FROM activity_log
                   WHERE user_id = ? AND created_at >= ? AND created_at < ?
  course_learners  SELECT user_id, created_at FROM enrollments
                   WHERE course_id = ? AND status = ?

For each query the runner prints the rows (course_learners sorted by the runner) and a plan
verdict from SQLite's EXPLAIN QUERY PLAN:
  "ok"                                every column of the WHERE is used to search the index
                                      (and, for my_courses, the index also gives the order)
  "full scan of <table>"              SCAN: every row, or every index entry, is read
  "index does not narrow by <column>" the index search uses only some of the WHERE columns
  "sorts with a temp B-tree"          my_courses is sorted after reading (USE TEMP B-TREE)
and "indexes": "ok" or "too many indexes: N (at most 3)".

Example: {"my_courses": {"plan": "ok", "rows": [[12, 3, "active", "2026-10-20 09:00:00"]]},
          "weekly_activity": {"plan": "ok", "rows": [[4]]},
          "course_learners": {"plan": "ok", "rows": [[7, "2026-09-01 10:00:00"]]},
          "indexes": "ok"}
"""
import json
import re
import sqlite3
import sys
from datetime import datetime, timedelta

INDEXES = """
CREATE INDEX enrollments_user_id ON enrollments (user_id);
CREATE INDEX activity_log_user_id ON activity_log (user_id);
CREATE INDEX enrollments_course_status ON enrollments (course_id, status);
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds the two tables from the test case (JSON on stdin), applies INDEXES, runs the three
# queries with the test's parameters and prints their rows with a verdict on their plan.
SCHEMA = """
CREATE TABLE enrollments (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    course_id   INTEGER NOT NULL,
    created_at  TEXT NOT NULL,
    status      TEXT NOT NULL
);
CREATE TABLE activity_log (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
"""

QUERIES = {
    # name: (sql, table, columns the index must search by, the index must also give the order)
    "my_courses": ("SELECT id, course_id, status, created_at FROM enrollments "
                   "WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
                   "enrollments", ["user_id"], True),
    "weekly_activity": ("SELECT count(*) FROM activity_log "
                        "WHERE user_id = ? AND created_at >= ? AND created_at < ?",
                        "activity_log", ["user_id", "created_at"], False),
    "course_learners": ("SELECT user_id, created_at FROM enrollments "
                        "WHERE course_id = ? AND status = ?",
                        "enrollments", ["course_id", "status"], False),
}
MAX_INDEXES = 3


def generate(spec):
    """A large deterministic data set: a small linear congruential generator, no random module."""
    state = spec["seed"]

    def pick(n):
        nonlocal state
        state = (state * 1103515245 + 12345) % 2147483648
        return (state >> 8) % n

    start = datetime(2026, 1, 1)
    stamp = lambda minutes: (start + timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
    statuses = ["active", "active", "completed", "cancelled"]
    kinds = ["lesson_completed", "quiz_passed", "challenge_submitted", "comment_posted"]
    enrollments = [[i + 1, pick(spec["users"]) + 1, pick(spec["courses"]) + 1, stamp(i * 7),
                    statuses[pick(4)]] for i in range(spec["enrollments"])]
    activity = [[i + 1, pick(spec["users"]) + 1, kinds[pick(4)], stamp(i * 3)]
                for i in range(spec["activity"])]
    return enrollments, activity


def ddl_statements(text):
    without_comments = re.sub(r"--[^\n]*", "", text)
    return [s.strip() for s in without_comments.split(";") if s.strip()]


def plan_verdict(db, sql, params, table, columns, ordered):
    details = [row[3] for row in db.execute("EXPLAIN QUERY PLAN " + sql, params)]
    search = next((d for d in details if d.startswith(f"SEARCH {table} USING ") and "INDEX" in d), None)
    if search is None:
        return f"full scan of {table}"
    used = search[search.find("("):] if "(" in search else ""
    missing = [column for column in columns if column not in used]
    if missing:
        return "index does not narrow by " + " and ".join(missing)
    if ordered and any("TEMP B-TREE" in d for d in details):
        return "sorts with a temp B-tree"
    return "ok"


def main():
    case = json.load(sys.stdin)
    if "generate" in case:
        enrollments, activity = generate(case["generate"])
    else:
        enrollments, activity = case["enrollments"], case["activity"]
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO enrollments VALUES (?, ?, ?, ?, ?)", enrollments)
    db.executemany("INSERT INTO activity_log VALUES (?, ?, ?, ?)", activity)
    db.commit()

    statements = ddl_statements(INDEXES)
    for statement in statements:
        if not re.match(r"CREATE\s+(UNIQUE\s+)?INDEX\s", statement, re.IGNORECASE):
            print(json.dumps({"error": f"INDEXES may only contain CREATE INDEX statements: {statement[:60]}"}))
            return
    try:
        for statement in statements:
            db.execute(statement)
    except sqlite3.Error as error:
        print(json.dumps({"error": f"INDEXES: {type(error).__name__}: {error}"}))
        return

    result = {}
    for name, (sql, table, columns, ordered) in QUERIES.items():
        params = case["params"][name]
        rows = [list(row) for row in db.execute(sql, params)]
        if name == "course_learners":
            rows.sort()
        result[name] = {"plan": plan_verdict(db, sql, params, table, columns, ordered), "rows": rows}
    count = db.execute("SELECT count(*) FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL").fetchone()[0]
    result["indexes"] = "ok" if count <= MAX_INDEXES else f"too many indexes: {count} (at most {MAX_INDEXES})"
    print(json.dumps(result))


if __name__ == "__main__":
    main()
