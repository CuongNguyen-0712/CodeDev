"""
Enrolling a learner writes two rows: the enrollment itself, and an 'enrolled' event that the
welcome-email job and the analytics feed read. Since the iOS app launched, some requests send
source = 'ios', which the CHECK on enrollment_events.source does not allow. The event insert
fails, but the enrollment row is already saved: the learner is enrolled, gets no welcome email,
and the analytics feed never hears about them.

Tables (created by the runner, see SCHEMA below):
  enrollments(user_id, course_id, enrolled_at, status)        PRIMARY KEY (user_id, course_id)
  enrollment_events(event_id, user_id, course_id, event_type, source, created_at)
      source must be 'web', 'android' or 'admin' (CHECK, NOT NULL)
      (user_id, course_id) must exist in enrollments (FOREIGN KEY)

Requirements:
  - ENROLL is a list of SQL statements. The runner executes them in order, one per list item,
    for every enroll request, with the named parameters :user_id, :course_id, :at, :source.
  - Make the two inserts one unit: either both rows are saved, or neither is.
    A request that fails at any statement must leave no row behind.
  - A request that succeeds must be saved for good before the runner moves on.
  - Keep both INSERT statements as they are (columns and values); only add what is missing.

The runner opens the connection with isolation_level=None: the Python driver never starts or
commits a transaction on its own, so BEGIN, COMMIT and ROLLBACK happen exactly where you write
them. When a statement fails, the runner stops that request and, if a transaction is still
open, executes ROLLBACK - like an application's error handler would.

Example: request 1 (user 1, course 10, source 'web') and request 2 (user 2, course 10,
  source 'ios') -> request 2 fails on the event insert and leaves nothing:
  {"requests": ["ok", "IntegrityError"],
   "enrollments": [[1, 10, "2026-10-20 09:00:00", "active"]],
   "events": [[1, 10, "enrolled", "web"]]}
"""
import json
import sqlite3
import sys

ENROLL = [
    "BEGIN",
    """INSERT INTO enrollments (user_id, course_id, enrolled_at, status)
       VALUES (:user_id, :course_id, :at, 'active')""",
    """INSERT INTO enrollment_events (user_id, course_id, event_type, source, created_at)
       VALUES (:user_id, :course_id, 'enrolled', :source, :at)""",
]


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), runs ENROLL for each
# request and prints each request's outcome and the final contents of both tables as JSON.
SCHEMA = """
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY,
    email   TEXT NOT NULL UNIQUE,
    name    TEXT NOT NULL
);
CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY,
    title     TEXT NOT NULL,
    level     TEXT NOT NULL
);
CREATE TABLE enrollments (
    user_id     INTEGER NOT NULL REFERENCES users (user_id),
    course_id   INTEGER NOT NULL REFERENCES courses (course_id),
    enrolled_at TEXT    NOT NULL,
    status      TEXT    NOT NULL CHECK (status IN ('active', 'cancelled', 'completed')),
    PRIMARY KEY (user_id, course_id)
);
CREATE TABLE enrollment_events (
    event_id   INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    course_id  INTEGER NOT NULL,
    event_type TEXT    NOT NULL CHECK (event_type IN ('enrolled', 'cancelled', 'completed')),
    source     TEXT    NOT NULL CHECK (source IN ('web', 'android', 'admin')),
    created_at TEXT    NOT NULL,
    FOREIGN KEY (user_id, course_id) REFERENCES enrollments (user_id, course_id)
);
"""

if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:", isolation_level=None)
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SCHEMA)
    for user_id in case["users"]:
        db.execute("INSERT INTO users VALUES (?, ?, ?)", (user_id, f"user{user_id}@example.com", f"User {user_id}"))
    for course_id in case["courses"]:
        db.execute("INSERT INTO courses VALUES (?, ?, 'beginner')", (course_id, f"Course {course_id}"))
    outcomes = []
    for request in case["requests"]:
        params = {key: request.get(key) for key in ("user_id", "course_id", "at", "source")}
        try:
            for statement in ENROLL:
                db.execute(statement, params)
            outcomes.append("not_committed" if db.in_transaction else "ok")
        except sqlite3.Error as error:
            outcomes.append(type(error).__name__)
        if db.in_transaction:  # the error handler, or a connection returned to the pool
            db.execute("ROLLBACK")
    print(json.dumps({
        "requests": outcomes,
        "enrollments": [list(row) for row in db.execute(
            "SELECT user_id, course_id, enrolled_at, status FROM enrollments ORDER BY user_id, course_id")],
        "events": [list(row) for row in db.execute(
            "SELECT user_id, course_id, event_type, source FROM enrollment_events ORDER BY event_id")],
    }))
