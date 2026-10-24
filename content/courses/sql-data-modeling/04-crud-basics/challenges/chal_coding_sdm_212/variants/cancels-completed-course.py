"""
The support team's admin tool needs three queries on the CodeDev database. Last week it cancelled
all four courses of learner 1042 when support only meant to cancel one, so every query now takes
named parameters (:user_id, :course_id, :enrolled_at) and touches exactly the rows it should.

Tables: users(user_id, email, name)
        courses(course_id, title, level)
        enrollments(user_id, course_id, enrolled_at, status) - PRIMARY KEY (user_id, course_id),
            status is 'active', 'completed' or 'cancelled'

Requirements:
  - Q1 "My courses" for one learner (:user_id): one row per course the learner is enrolled in,
    except cancelled enrollments: [course_id, title, status], ORDER BY title, then course_id.
  - Q2 enrolls a learner: insert one enrollment from :user_id, :course_id and :enrolled_at,
    with status 'active'.
  - Q3 cancels one enrollment: set status to 'cancelled' for the row of :user_id and :course_id,
    and only if that enrollment is still 'active' (a completed course stays completed).
  - Use the named parameters; never paste values into the SQL text.

The runner runs Q1, then Q2, then Q3 on the same database and prints:
  {"my_courses": <Q1 rows>, "enrollments": <every enrollment after Q2 and Q3, ordered by
   user_id, course_id>, "cancelled_rows": <number of rows Q3 changed>}

Example: learner 1 is enrolled in course 2 "SQL Basics" (active) and course 3 "Git Basics"
  (cancelled); Q2 enrolls learner 1 in course 4; Q3 cancels learner 1's course 2
  -> my_courses [[2, "SQL Basics", "active"]], cancelled_rows 1
"""
import json
import sqlite3
import sys

Q1 = """
SELECT c.course_id, c.title, e.status
FROM enrollments e
JOIN courses c ON c.course_id = e.course_id
WHERE e.user_id = :user_id
  AND e.status <> 'cancelled'
ORDER BY c.title, c.course_id
"""

Q2 = """
INSERT INTO enrollments (user_id, course_id, enrolled_at, status)
VALUES (:user_id, :course_id, :enrolled_at, 'active')
"""

Q3 = """
UPDATE enrollments
SET status = 'cancelled'
WHERE user_id = :user_id
  AND course_id = :course_id
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), runs Q1, Q2 and Q3
# with the test's named parameters and prints the result as JSON.
SCHEMA = """
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY,
    email   TEXT    NOT NULL UNIQUE,
    name    TEXT    NOT NULL
);
CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY,
    title     TEXT    NOT NULL,
    level     TEXT    NOT NULL
);
CREATE TABLE enrollments (
    user_id     INTEGER NOT NULL REFERENCES users (user_id),
    course_id   INTEGER NOT NULL REFERENCES courses (course_id),
    enrolled_at TEXT    NOT NULL,
    status      TEXT    NOT NULL,
    PRIMARY KEY (user_id, course_id)
);
"""
TABLES = ("users", "courses", "enrollments")

if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SCHEMA)
    for table in TABLES:
        for row in case["tables"].get(table, []):
            columns = ", ".join(row)
            marks = ", ".join("?" for _ in row)
            db.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", list(row.values()))
    try:
        my_courses = [list(row) for row in db.execute(Q1, case["q1"])]
        db.execute(Q2, case["q2"])
        cancelled_rows = db.execute(Q3, case["q3"]).rowcount
        enrollments = [list(row) for row in db.execute(
            "SELECT user_id, course_id, enrolled_at, status FROM enrollments ORDER BY user_id, course_id")]
        print(json.dumps({"my_courses": my_courses, "enrollments": enrollments, "cancelled_rows": cancelled_rows}))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
