"""
"My learning" lists every course a learner is enrolled in, with the number of lessons in the
course and how many of them the learner has completed. The endpoint runs one query for the
enrollments and then two more queries per course (an N+1 loop). Learners with 30 courses wait
for 61 round trips to the database.

Tables: courses(course_id, title, level)
        lessons(lesson_id, course_id, position, title)
        enrollments(user_id, course_id, enrolled_at, status) - status 'active', 'completed' or 'cancelled'
        lesson_progress(user_id, lesson_id, completed_at) - completed_at is NULL while the lesson
            is started but not finished

Requirements for load_my_courses(query, user_id):
  - Return exactly the rows the loop below returns: one row per enrollment of user_id whose
    status is not 'cancelled', as [course_id, title, total_lessons, completed_lessons],
    newest enrollment first (enrolled_at DESC), ties by course_id ascending.
  - total_lessons = number of lessons of the course (0 for a course without lessons yet).
  - completed_lessons = number of this learner's lesson_progress rows for lessons of the course
    with a non-NULL completed_at.
  - Issue exactly ONE query: call query(sql, params) once, whatever the number of courses.
    query returns the result rows as a list of tuples.

Example: user 1 is enrolled in course 1 (4 lessons, finished 2, started 1)
  -> [[1, "SQL & Data Modeling", 4, 2]] with 1 query
"""
import json
import sqlite3
import sys

QUERY = """
SELECT c.course_id, c.title, COUNT(l.lesson_id), COUNT(lp.completed_at)
FROM enrollments e
JOIN courses c               ON c.course_id = e.course_id
LEFT JOIN lessons l          ON l.course_id = c.course_id
LEFT JOIN lesson_progress lp ON lp.lesson_id = l.lesson_id
WHERE e.user_id = ? AND e.status <> 'cancelled' AND lp.user_id = e.user_id
GROUP BY c.course_id, c.title, e.enrolled_at
ORDER BY e.enrolled_at DESC, c.course_id
"""


def load_my_courses(query, user_id):
    return [list(row) for row in query(QUERY, (user_id,))]


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), calls load_my_courses
# with a query() function that counts every statement it runs, and prints
# {"rows": [...], "queries": <number of query() calls>}.
SCHEMA = """
CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY,
    title     TEXT    NOT NULL,
    level     TEXT    NOT NULL
);
CREATE TABLE lessons (
    lesson_id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses (course_id),
    position  INTEGER NOT NULL,
    title     TEXT    NOT NULL
);
CREATE TABLE enrollments (
    user_id     INTEGER NOT NULL,
    course_id   INTEGER NOT NULL REFERENCES courses (course_id),
    enrolled_at TEXT    NOT NULL,
    status      TEXT    NOT NULL,
    PRIMARY KEY (user_id, course_id)
);
CREATE TABLE lesson_progress (
    user_id      INTEGER NOT NULL,
    lesson_id    INTEGER NOT NULL REFERENCES lessons (lesson_id),
    completed_at TEXT,
    PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX idx_lessons_course ON lessons (course_id);
"""
TABLES = ("courses", "lessons", "enrollments", "lesson_progress")


def generate(spec):
    """Deterministic platform data: spec = {"courses": C, "users": U}."""
    tables = {name: [] for name in TABLES}
    for c in range(1, spec["courses"] + 1):
        tables["courses"].append([c, f"Course {c}", ("beginner", "intermediate", "advanced")[c % 3]])
        for p in range(1, c % 6 + 1):
            tables["lessons"].append([c * 100 + p, c, p, f"Lesson {c}.{p}"])
        for u in range(1, spec["users"] + 1):
            if (c + u) % 4 == 0:
                continue
            status = "cancelled" if (c * u) % 5 == 0 else ("completed" if (c + u) % 7 == 0 else "active")
            day = (c * 7 + u * 3) % 28 + 1
            tables["enrollments"].append([u, c, f"2026-09-{day:02d} 10:00:00", status])
            for p in range(1, c % 6 + 1):
                if (u + c + p) % 3 == 0:
                    continue
                done = f"2026-10-{(c + p) % 28 + 1:02d} 20:00:00" if (u + p) % 2 == 0 else None
                tables["lesson_progress"].append([u, c * 100 + p, done])
    return tables


def main():
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SCHEMA)
    tables = case["tables"] if "tables" in case else generate(case["generate"])
    for table in TABLES:
        for row in tables.get(table, []):
            db.execute(f"INSERT INTO {table} VALUES ({', '.join('?' for _ in row)})", row)
    calls = []

    def query(sql, params=()):
        calls.append(sql)
        return db.execute(sql, params).fetchall()

    try:
        rows = load_my_courses(query, case["user_id"])
        print(json.dumps({"rows": [list(row) for row in rows], "queries": len(calls)}))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))


if __name__ == "__main__":
    main()
