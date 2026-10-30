"""
The instructor dashboard shows a progress report for one course: one row per learner. The query
below was written when CodeDev had a few hundred learners. It runs three correlated subqueries for
every enrolled learner, and two of them read the learner's submissions again and again. Now that
submissions and lesson_progress hold millions of rows, the report takes seconds per course.

Rewrite REPORT as a set-based query (aggregate each big table once for the course, then join the
results to the learners) and put the supporting index(es) in INDEXES. The rows must not change.

Tables (the runner creates them; you cannot change them, only add indexes):
  users(user_id, email, name, created_at)
  courses(course_id, title, level)
  lessons(lesson_id, course_id, position, title)
  enrollments(user_id, course_id, enrolled_at, status)   PRIMARY KEY (user_id, course_id)
      status 'active' | 'completed' | 'cancelled'
  lesson_progress(user_id, lesson_id, completed_at)      PRIMARY KEY (user_id, lesson_id)
      completed_at NULL = the lesson is started, not finished
  submissions(submission_id, user_id, course_id, challenge_id, status, score, created_at)
      status 'passed' | 'failed' | 'error'; created_at 'YYYY-MM-DD HH:MM:SS'

The report for :course_id - one row per enrollment of the course whose status is 'active' or
'completed' (cancelled enrollments are not listed):
  [user_id, completed_lessons, passed_challenges, last_submission_at]
  - completed_lessons  = lesson_progress rows of the learner with completed_at NOT NULL, for the
                         lessons of this course only
  - passed_challenges  = number of DIFFERENT challenge_id the learner has a 'passed' submission for,
                         in this course only (passing the same challenge twice counts once)
  - last_submission_at = the latest created_at of the learner's submissions in this course, any
                         status; NULL (None) when there is none
  - both counts are 0, never NULL, when there is nothing to count
  - ORDER BY completed_lessons DESC, passed_challenges DESC, user_id

How it is graded (the runner, do not change it):
  - the rows, and two facts read from the query plan (they do not depend on your index names):
      correlated_subquery: EXPLAIN QUERY PLAN shows a CORRELATED ... SUBQUERY (one run per row)
      full_scan: the big tables (lesson_progress, submissions) that are read from the first entry
                 to the last - a SCAN of the table or of one of its indexes, including the scan
                 SQLite does to build an AUTOMATIC index
  - expected plan: {"correlated_subquery": false, "full_scan": []}
  - no ANALYZE is run: SQLite chooses indexes by its built-in rules.

Output: {"rows": [[user_id, completed_lessons, passed_challenges, last_submission_at], ...],
         "plan": {"correlated_subquery": ..., "full_scan": [...]}}
"""
import json
import random
import sqlite3
import sys
from datetime import datetime, timedelta

# CREATE INDEX statement(s), run once after the data is loaded.
INDEXES = """
"""

# The legacy report: correct rows, but three subqueries run once per learner.
REPORT = """
SELECT e.user_id,
       (SELECT count(*)
          FROM lesson_progress lp
         WHERE lp.user_id = e.user_id
           AND lp.completed_at IS NOT NULL
           AND lp.lesson_id IN (SELECT l.lesson_id FROM lessons l WHERE l.course_id = e.course_id)
       ) AS completed_lessons,
       (SELECT count(DISTINCT s.challenge_id)
          FROM submissions s
         WHERE s.user_id = e.user_id AND s.course_id = e.course_id AND s.status = 'passed'
       ) AS passed_challenges,
       (SELECT max(s.created_at)
          FROM submissions s
         WHERE s.user_id = e.user_id AND s.course_id = e.course_id
       ) AS last_submission_at
FROM enrollments e
WHERE e.course_id = :course_id
  AND e.status IN ('active', 'completed')
ORDER BY completed_lessons DESC, passed_challenges DESC, e.user_id
"""


# ---------------------------------------------------------------- test runner (do not change)
# Generates the CodeDev data of one test case (a small spec on stdin, rows from a fixed seed),
# runs INDEXES, then REPORT, and prints the rows and the normalized plan facts as JSON.
SCHEMA = """
CREATE TABLE users (user_id INTEGER PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE courses (course_id INTEGER PRIMARY KEY, title TEXT NOT NULL, level TEXT NOT NULL);
CREATE TABLE lessons (lesson_id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses,
                      position INTEGER NOT NULL, title TEXT NOT NULL);
CREATE TABLE enrollments (user_id INTEGER NOT NULL, course_id INTEGER NOT NULL, enrolled_at TEXT NOT NULL,
                          status TEXT NOT NULL, PRIMARY KEY (user_id, course_id));
CREATE TABLE lesson_progress (user_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL, completed_at TEXT,
                              PRIMARY KEY (user_id, lesson_id));
CREATE TABLE submissions (submission_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, course_id INTEGER NOT NULL,
                          challenge_id INTEGER NOT NULL, status TEXT NOT NULL, score INTEGER NOT NULL,
                          created_at TEXT NOT NULL);
"""
BIG_TABLES = ("lesson_progress", "submissions")


def load(db, spec):
    rng = random.Random(spec["seed"])
    n_users, n_courses, n_lessons = spec["users"], spec["courses"], spec["lessons_per_course"]
    start = datetime(2026, 7, 1)
    at = lambda: (start + timedelta(seconds=rng.randrange(90 * 86400))).strftime("%Y-%m-%d %H:%M:%S")
    db.executemany("INSERT INTO users VALUES (?, ?, ?, '2026-01-01 00:00:00')",
                   [(u, f"user{u}@example.com", f"User {u}") for u in range(1, n_users + 1)])
    db.executemany("INSERT INTO courses VALUES (?, ?, 'advanced')",
                   [(c, f"Course {c}") for c in range(1, n_courses + 1)])
    db.executemany("INSERT INTO lessons VALUES (?, ?, ?, ?)",
                   [((c - 1) * n_lessons + p, c, p, f"Lesson {p}")
                    for c in range(1, n_courses + 1) for p in range(1, n_lessons + 1)])
    for u in range(1, n_users + 1):
        for c in range(1, n_courses + 1):
            if c == spec.get("empty_course") or rng.random() >= spec["enroll_rate"]:
                continue
            db.execute("INSERT INTO enrollments VALUES (?, ?, ?, ?)",
                       (u, c, at(), rng.choice(["active", "active", "completed", "cancelled"])))
            for p in range(1, n_lessons + 1):
                r = rng.random()
                if u % 11 == 0 or r >= 0.7:  # every 11th learner has not opened a lesson yet
                    continue
                db.execute("INSERT INTO lesson_progress VALUES (?, ?, ?)",
                           (u, (c - 1) * n_lessons + p, at() if r < 0.55 else None))
    for _ in range(spec["submissions"]):
        u, c = rng.randint(1, n_users), rng.randint(1, n_courses)
        challenge = c * 100 + rng.randint(1, spec["challenges_per_course"])
        status = rng.choice(["passed", "failed", "failed", "error"])
        if u % 7 != 0:  # every 7th user never submits
            db.execute("INSERT INTO submissions (user_id, course_id, challenge_id, status, score, created_at)"
                       " VALUES (?, ?, ?, ?, ?, ?)", (u, c, challenge, status, rng.randint(0, 100), at()))


def plan_facts(db, sql, params):
    details = [row[3] for row in db.execute("EXPLAIN QUERY PLAN " + sql, params)]
    roots = {page: table for table, page in db.execute(
        "SELECT tbl_name, rootpage FROM sqlite_schema WHERE type IN ('table', 'index')")}
    cursors, scanned = {}, set()
    for row in db.execute("EXPLAIN " + sql, params):  # bytecode: which cursor reads which b-tree, and how
        opcode, cursor, page = row[1], row[2], row[3]
        if opcode == "OpenRead":
            cursors[cursor] = roots.get(page)
        elif opcode in ("Rewind", "Last") and cursors.get(cursor) in BIG_TABLES:
            scanned.add(cursors[cursor])  # positioned on the first/last entry = reads the whole b-tree
    return {"correlated_subquery": any(d.startswith("CORRELATED ") for d in details),
            "full_scan": sorted(scanned)}


if __name__ == "__main__":
    spec = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    load(db, spec)
    db.commit()
    db.executescript(INDEXES)
    params = {"course_id": spec["course_id"]}
    rows = [list(row) for row in db.execute(REPORT, params)]
    print(json.dumps({"rows": rows, "plan": plan_facts(db, REPORT, params)}))
