"""
The "My learning" page of CodeDev lists every course a learner is enrolled in, with the number of
lessons they have finished. The API log shows 1 + 2N queries for one page view: one query for the
enrollments, then one for the course title and one for the progress count of every course. A learner
with 60 courses costs 121 round trips. Replace the loop with ONE query.

Tables (SQLite in this runner; the same SQL works on PostgreSQL):
    users(id, email, created_at)
    courses(id, title, category, created_at)
    enrollments(id, user_id, course_id, created_at, status)   status: 'active' | 'completed' | 'cancelled'
                                                               UNIQUE (user_id, course_id)
    lesson_progress(user_id, lesson_id, course_id, completed_at)
        completed_at NULL = the lesson was opened but not finished.
        No unique key: the same finished lesson can be stored twice (a double click on "Complete").

Requirements for load_my_courses(db, user_id):
  - Return one [course_id, title, completed_lessons] per enrollment of user_id whose status is not
    'cancelled' ('active' and 'completed' both count).
  - completed_lessons = number of DIFFERENT lessons of that course this user has finished
    (completed_at is not NULL). A course with no finished lesson still appears, with 0.
  - Progress of other users, and of courses the user is not enrolled in, never counts.
  - Order: newest enrollment first (enrollments.created_at DESC), ties broken by enrollments.id DESC.
  - Call db.execute(sql, params) exactly ONCE. db.execute returns a sqlite3 cursor
    (use .fetchall()). Bind user_id as a parameter; never format it into the SQL string.

The test runner prints {"queries": <number of db.execute calls>, "courses": [...]}.

Example: user 1 enrolled in course 20 (2026-10-02, 2 of its lessons finished, one of them stored
twice) and course 10 (2026-10-01, nothing finished)
  -> {"queries": 1, "courses": [[20, "Docker Basics", 2], [10, "SQL Basics", 0]]}
"""
import json
import sqlite3
import sys


def load_my_courses(db, user_id):
    # Wrong: forgets the status filter, so cancelled enrollments come back.
    rows = db.execute(
        """
        SELECT c.id, c.title, COUNT(DISTINCT lp.lesson_id) AS completed_lessons
        FROM enrollments AS e
        JOIN courses AS c ON c.id = e.course_id
        LEFT JOIN lesson_progress AS lp
               ON lp.user_id = e.user_id
              AND lp.course_id = e.course_id
              AND lp.completed_at IS NOT NULL
        WHERE e.user_id = :user_id
        GROUP BY e.id, c.id, c.title
        ORDER BY e.created_at DESC, e.id DESC
        """,
        {"user_id": user_id},
    ).fetchall()
    return [list(row) for row in rows]


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin; every table is a list of
# rows in the column order above), calls load_my_courses through a connection that counts the
# statements it sends, and prints the count and the rows as JSON.
SCHEMA = """
CREATE TABLE users (
    id          INTEGER PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL
);
CREATE TABLE courses (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    category    TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE TABLE enrollments (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id),
    course_id   INTEGER NOT NULL REFERENCES courses (id),
    created_at  TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
    UNIQUE (user_id, course_id)
);
CREATE TABLE lesson_progress (      -- no unique key: duplicates are possible
    user_id       INTEGER NOT NULL REFERENCES users (id),
    lesson_id     INTEGER NOT NULL,
    course_id     INTEGER NOT NULL REFERENCES courses (id),
    completed_at  TEXT
);
CREATE INDEX lesson_progress_user_course ON lesson_progress (user_id, course_id);
"""
COLUMNS = {
    "users": "id, email, created_at",
    "courses": "id, title, category, created_at",
    "enrollments": "id, user_id, course_id, created_at, status",
    "lesson_progress": "user_id, lesson_id, course_id, completed_at",
}


class CountingDb:
    """Passes statements to SQLite and counts them, like a query log for one request."""

    def __init__(self, conn):
        self._conn = conn
        self.queries = 0

    def execute(self, sql, params=()):
        self.queries += 1
        return self._conn.execute(sql, params)


if __name__ == "__main__":
    case = json.load(sys.stdin)
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    for table, columns in COLUMNS.items():
        marks = ", ".join("?" for _ in columns.split(","))
        conn.executemany(f"INSERT INTO {table} ({columns}) VALUES ({marks})", case["tables"].get(table, []))
    db = CountingDb(conn)
    try:
        courses = load_my_courses(db, case["user_id"])
        print(json.dumps({"queries": db.queries, "courses": [list(row) for row in courses]}))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
