"""
Learner 1042 tapped "Enroll" once on Android; the app timed out and retried 12 ms later. Both
requests ran the application's check (SELECT count(*) ...) before either one inserted, both saw 0,
and both inserted. The learner now has two active enrollments in course 7 and the progress report
counts them twice. The check stays in the application, but it cannot stop this race: the
database has to.

Fix SCHEMA and ENROLL so that:
  - (user_id, course_id) can appear in enrollments only once. A user may still enroll in many
    courses, and a course still has many users.
  - ENROLL never fails because of a duplicate. When an enrollment for (user_id, course_id)
    already exists:
      * status 'cancelled'            -> reactivate it: status = 'active', enrolled_at = :at
      * status 'active' or 'completed' -> change nothing (the request is a no-op)
  - ENROLL is ONE statement, run with the named parameters :user_id, :course_id, :at.

How the runner simulates the race (do not change it):
  - Requests arrive in bursts. For every request of a burst, the application's check runs first
    (all checks see the same data), then ENROLL runs for each request whose check found no
    active or completed enrollment.
  - Each request gets a response: "enrolled" (ENROLL inserted a row), "reactivated" (ENROLL
    changed a cancelled row), "already_enrolled" (the check found a row, or ENROLL changed
    nothing) or the error class name if ENROLL raised one (for example "IntegrityError").
  - The connection uses isolation_level=None: every statement is its own transaction.

Output: {"responses": [...], "enrollments": [[user_id, course_id, enrolled_at, status], ...]}
        rows ordered by user_id, course_id, enrolled_at.

Example: one burst with two identical requests (user 1042, course 7, 12 ms apart)
  -> {"responses": ["enrolled", "already_enrolled"],
      "enrollments": [[1042, 7, "2026-10-21 08:15:03.412", "active"]]}
"""
import json
import sqlite3
import sys

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
    enrollment_id INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users (user_id),
    course_id     INTEGER NOT NULL REFERENCES courses (course_id),
    enrolled_at   TEXT    NOT NULL,
    status        TEXT    NOT NULL CHECK (status IN ('active', 'cancelled', 'completed'))
);
"""

# BUG (on purpose): inserts blindly, so two requests that both passed the check both insert.
ENROLL = """
INSERT INTO enrollments (user_id, course_id, enrolled_at, status)
VALUES (:user_id, :course_id, :at, 'active')
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), replays the bursts of
# enroll requests and prints the responses and the final enrollments as JSON.
CHECK = """
SELECT count(*) FROM enrollments
WHERE user_id = :user_id AND course_id = :course_id AND status IN ('active', 'completed')
"""

if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:", isolation_level=None)
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SCHEMA)
    for user_id in case["users"]:
        db.execute("INSERT INTO users (user_id, email, name) VALUES (?, ?, ?)",
                   (user_id, f"user{user_id}@example.com", f"User {user_id}"))
    for course_id in case["courses"]:
        db.execute("INSERT INTO courses (course_id, title, level) VALUES (?, ?, 'beginner')",
                   (course_id, f"Course {course_id}"))
    for row in case.get("enrollments", []):
        db.execute("INSERT INTO enrollments (user_id, course_id, enrolled_at, status) VALUES (?, ?, ?, ?)", row)
    responses = []
    for burst in case["bursts"]:
        params = [{"user_id": r["user_id"], "course_id": r["course_id"], "at": r["at"]} for r in burst]
        found = [db.execute(CHECK, p).fetchone()[0] for p in params]  # every check before any insert
        for p, existing in zip(params, found):
            if existing:
                responses.append("already_enrolled")
                continue
            was_cancelled = db.execute(
                "SELECT 1 FROM enrollments WHERE user_id = :user_id AND course_id = :course_id"
                " AND status = 'cancelled'", p).fetchone() is not None
            try:
                changed = db.execute(ENROLL, p).rowcount
            except sqlite3.Error as error:
                responses.append(type(error).__name__)
                continue
            responses.append("already_enrolled" if changed == 0 else "reactivated" if was_cancelled else "enrolled")
    print(json.dumps({
        "responses": responses,
        "enrollments": [list(row) for row in db.execute(
            "SELECT user_id, course_id, enrolled_at, status FROM enrollments ORDER BY user_id, course_id, enrolled_at")],
    }))
