"""
The "My courses" page of CodeDev shows one card per course a learner is enrolled in, with a
progress bar. Since the last release, some learners see no card at all for a course they just
joined, one course shows 200% and a brand new course shows an empty bar. Rewrite the query
behind the page.

Tables: users(user_id, email, name)
        courses(course_id, title, level)
        lessons(lesson_id, course_id, position, title)
        enrollments(user_id, course_id, enrolled_at, status)
        lesson_progress(user_id, lesson_id, completed_at)
        Neither enrollments nor lesson_progress has a unique key yet (lessons 7 and 9), so the
        same enrollment or the same finished lesson can be stored more than once.

Requirements:
  - One row per course the user :user_id is enrolled in (any enrollment status), even when the
    same enrollment is stored twice: [course_id, title, total_lessons, completed_lessons, percent]
      total_lessons      number of lessons of the course
      completed_lessons  number of DIFFERENT lessons of the course this user has finished; a
                         lesson_progress row counts only when completed_at is not NULL
                         (completed_at NULL means the lesson was opened but not finished)
      percent            completed_lessons * 100 / total_lessons as a whole number, rounded DOWN;
                         0 when the course has no lessons yet
  - A course with no finished lesson still appears, with 0 and 0.
  - Progress rows of other users, and of courses the user is not enrolled in, never count.
  - ORDER BY course_id.

Example: user 1 is enrolled in course 10 (3 lessons, 2 finished) and course 20 (4 lessons,
         none finished)
         -> [[10, "SQL Basics", 3, 2, 66], [20, "Docker Basics", 4, 0, 0]]
"""
import json
import sqlite3
import sys

QUERY = """
SELECT c.course_id,
       c.title,
       COUNT(DISTINCT l.lesson_id)  AS total_lessons,
       COUNT(DISTINCT lp.lesson_id) AS completed_lessons,
       COALESCE(COUNT(DISTINCT lp.lesson_id) * 100 / COUNT(DISTINCT l.lesson_id), 0) AS percent
FROM enrollments AS e
JOIN courses AS c
  ON c.course_id = e.course_id
LEFT JOIN lessons AS l
  ON l.course_id = c.course_id
LEFT JOIN lesson_progress AS lp
  ON lp.lesson_id = l.lesson_id
 AND lp.user_id = e.user_id
 AND lp.completed_at IS NOT NULL
WHERE e.user_id = :user_id
GROUP BY c.course_id, c.title
ORDER BY c.course_id
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), runs QUERY with
# :user_id bound to the test's user and prints the result rows as a JSON list of lists.
SCHEMA = """
CREATE TABLE users (
    user_id  INTEGER PRIMARY KEY,
    email    TEXT NOT NULL,
    name     TEXT NOT NULL
);
CREATE TABLE courses (
    course_id  INTEGER PRIMARY KEY,
    title      TEXT NOT NULL,
    level      TEXT NOT NULL
);
CREATE TABLE lessons (
    lesson_id  INTEGER PRIMARY KEY,
    course_id  INTEGER NOT NULL REFERENCES courses (course_id),
    position   INTEGER NOT NULL,
    title      TEXT NOT NULL
);
CREATE TABLE enrollments (          -- no unique key yet: duplicates are possible
    user_id      INTEGER NOT NULL REFERENCES users (user_id),
    course_id    INTEGER NOT NULL REFERENCES courses (course_id),
    enrolled_at  TEXT NOT NULL,
    status       TEXT NOT NULL
);
CREATE TABLE lesson_progress (      -- no unique key yet: duplicates are possible
    user_id       INTEGER NOT NULL REFERENCES users (user_id),
    lesson_id     INTEGER NOT NULL REFERENCES lessons (lesson_id),
    completed_at  TEXT
);
"""

if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SCHEMA)
    for table in ("users", "courses", "lessons", "enrollments", "lesson_progress"):
        for row in case["tables"].get(table, []):
            columns = ", ".join(row)
            marks = ", ".join("?" for _ in row)
            db.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", list(row.values()))
    try:
        rows = db.execute(QUERY, {"user_id": case["user_id"]})
        print(json.dumps([list(row) for row in rows]))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
