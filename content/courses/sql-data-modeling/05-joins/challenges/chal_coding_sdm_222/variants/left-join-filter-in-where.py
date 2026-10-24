"""
The course dashboard shows, for every course, how many learners are enrolled and how many lessons
they have completed. A developer asked an AI assistant to write the query and shipped it after
checking one small course. Since then the instructors report learner counts that are higher than
the enrollment list, and the new course "Docker Basics", which has no learners yet, is missing.

Tables: courses(course_id, title, level)
        lessons(lesson_id, course_id, position, title)
        enrollments(user_id, course_id, enrolled_at, status) - status 'active', 'completed' or 'cancelled'
        lesson_progress(user_id, lesson_id, completed_at) - completed_at is NULL while the lesson
            is started but not finished

Requirements:
  - One row per course, every course included: [course_id, title, learners, completed_lessons],
    ORDER BY course_id.
  - learners = number of enrollments of the course whose status is not 'cancelled'.
  - completed_lessons = number of lesson_progress rows with a completed_at (not NULL) for the
    lessons of the course.
  - Both numbers are 0, never NULL, when there is nothing to count.

Example: course 1 has 2 active learners; one finished 3 lessons, the other none
  -> [[1, "SQL & Data Modeling", 2, 3]]
"""
import json
import sqlite3
import sys

QUERY = """
WITH completed_counts AS (
    SELECT l.course_id, COUNT(*) AS completed_lessons
    FROM lesson_progress lp
    JOIN lessons l ON l.lesson_id = lp.lesson_id
    WHERE lp.completed_at IS NOT NULL
    GROUP BY l.course_id
)
SELECT c.course_id,
       c.title,
       COUNT(e.user_id)                  AS learners,
       COALESCE(cc.completed_lessons, 0) AS completed_lessons
FROM courses c
LEFT JOIN enrollments e       ON e.course_id = c.course_id
LEFT JOIN completed_counts cc ON cc.course_id = c.course_id
WHERE e.status <> 'cancelled'
GROUP BY c.course_id, c.title
ORDER BY c.course_id
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), runs QUERY and
# prints the result rows as a JSON list of lists.
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
CREATE TABLE lessons (
    lesson_id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses (course_id),
    position  INTEGER NOT NULL,
    title     TEXT    NOT NULL
);
CREATE TABLE enrollments (
    user_id     INTEGER NOT NULL REFERENCES users (user_id),
    course_id   INTEGER NOT NULL REFERENCES courses (course_id),
    enrolled_at TEXT    NOT NULL,
    status      TEXT    NOT NULL,
    PRIMARY KEY (user_id, course_id)
);
CREATE TABLE lesson_progress (
    user_id      INTEGER NOT NULL REFERENCES users (user_id),
    lesson_id    INTEGER NOT NULL REFERENCES lessons (lesson_id),
    completed_at TEXT,
    PRIMARY KEY (user_id, lesson_id)
);
"""
TABLES = ("users", "courses", "lessons", "enrollments", "lesson_progress")

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
        print(json.dumps([list(row) for row in db.execute(QUERY)]))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
