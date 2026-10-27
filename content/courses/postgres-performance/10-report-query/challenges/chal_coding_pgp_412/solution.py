"""
The nightly progress report of CodeDev ran for 40 minutes last night and blocked the morning
e-mails. It computes three numbers per course with correlated subqueries: one subquery per
course, and inside them one subquery per enrollment. Rewrite QUERY so it returns exactly the
same rows but reads each table in one pass (joins, CTEs, GROUP BY). You may also add indexes
in INDEXES (optional).

Tables: courses(id, title, category, created_at)
        lessons(id, course_id, position)
        users(id, email, created_at)
        enrollments(id, user_id, course_id, created_at, status)   UNIQUE (user_id, course_id)
                    status is 'active', 'completed' or 'cancelled'
        lesson_progress(user_id, lesson_id, course_id, completed_at)   PRIMARY KEY (user_id, lesson_id)
                    completed_at NULL = the lesson was opened but not finished

Report, one row per course (every course, also one without enrollments or lessons), ORDER BY
course id: [course_id, title, enrolled, completed_all, avg_completion_pct]
  enrolled            enrollments of the course whose status is not 'cancelled' (the learners)
  completed_all       learners of the course who finished every lesson of it: their number of
                      lesson_progress rows for the course with completed_at NOT NULL equals the
                      course's number of lessons. 0 for a course without lessons. The status
                      'completed' is set by a separate job and can lag: do not use it here.
  avg_completion_pct  ROUND(100.0 * (finished lessons of the course summed over its learners)
                            / (enrolled * number of lessons of the course), 1)
                      = the average of each learner's completion percentage, rounded to 1
                      decimal place; 0.0 when the course has no learners or no lessons.
  Progress of cancelled enrollments, and of users who are not enrolled in the course, never counts.

Rules checked by the test runner:
  - QUERY is one SELECT (WITH ... SELECT is fine) and returns exactly the rows above.
  - Its plan (EXPLAIN QUERY PLAN) must not contain a CORRELATED subquery: a report that
    reads every row has to read each table once, not once per outer row.
  - It must finish within STEP_BUDGET SQLite VM steps on a generated dataset of about 200
    courses, 3,000 users, 10,000 enrollments and 50,000 progress rows; otherwise the runner
    prints "too slow" with the plan. Steps are counted, not seconds, so the check is exact.
  - INDEXES may only contain CREATE INDEX statements (they are built before the query runs
    and are not counted).

Example: a course with 4 lessons and 2 learners who finished 4 and 1 lessons
         -> [7, "Redis Patterns", 2, 1, 62.5]
"""
import json
import re
import sqlite3
import sys

INDEXES = """
-- not needed for the budget; a partial index makes the finished CTE a covering scan
CREATE INDEX lesson_progress_finished_idx ON lesson_progress (user_id, course_id) WHERE completed_at IS NOT NULL;
"""

QUERY = """
-- Aggregate each table once, then join the small results.
WITH lesson_counts AS (            -- lessons per course
    SELECT course_id, COUNT(*) AS total
    FROM lessons
    GROUP BY course_id
),
finished AS (                      -- finished lessons per (user, course)
    SELECT user_id, course_id, COUNT(*) AS lessons_done
    FROM lesson_progress
    WHERE completed_at IS NOT NULL
    GROUP BY user_id, course_id
),
learners AS (                      -- one row per enrollment that counts
    SELECT e.course_id, COALESCE(f.lessons_done, 0) AS lessons_done
    FROM enrollments AS e
    LEFT JOIN finished AS f ON f.user_id = e.user_id AND f.course_id = e.course_id
    WHERE e.status <> 'cancelled'
),
per_course AS (
    SELECT l.course_id,
           COUNT(*) AS enrolled,
           SUM(l.lessons_done) AS finished,
           SUM(CASE WHEN lc.total > 0 AND l.lessons_done = lc.total THEN 1 ELSE 0 END) AS completed_all
    FROM learners AS l
    LEFT JOIN lesson_counts AS lc ON lc.course_id = l.course_id
    GROUP BY l.course_id
)
SELECT c.id,
       c.title,
       COALESCE(pc.enrolled, 0) AS enrolled,
       COALESCE(pc.completed_all, 0) AS completed_all,
       COALESCE(ROUND(100.0 * pc.finished / (pc.enrolled * lc.total), 1), 0.0) AS avg_completion_pct
FROM courses AS c
LEFT JOIN per_course AS pc ON pc.course_id = c.id
LEFT JOIN lesson_counts AS lc ON lc.course_id = c.id
ORDER BY c.id
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin): the rows in "tables"
# and, when "generate" is given, a large deterministic dataset. Builds INDEXES, checks the plan
# of QUERY, runs it under a VM step budget and prints the rows as a JSON list of lists.
STEP_BUDGET = 6_000_000

SCHEMA = """
CREATE TABLE users (
    id          INTEGER PRIMARY KEY,
    email       TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE TABLE courses (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    category    TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE TABLE lessons (
    id          INTEGER PRIMARY KEY,
    course_id   INTEGER NOT NULL REFERENCES courses (id),
    position    INTEGER NOT NULL
);
CREATE TABLE enrollments (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id),
    course_id   INTEGER NOT NULL REFERENCES courses (id),
    created_at  TEXT NOT NULL,
    status      TEXT NOT NULL,
    UNIQUE (user_id, course_id)
);
CREATE TABLE lesson_progress (
    user_id       INTEGER NOT NULL REFERENCES users (id),
    lesson_id     INTEGER NOT NULL REFERENCES lessons (id),
    course_id     INTEGER NOT NULL REFERENCES courses (id),
    completed_at  TEXT,
    PRIMARY KEY (user_id, lesson_id)
);
"""
COLUMNS = {
    "users": ("id", "email", "created_at"),
    "courses": ("id", "title", "category", "created_at"),
    "lessons": ("id", "course_id", "position"),
    "enrollments": ("id", "user_id", "course_id", "created_at", "status"),
    "lesson_progress": ("user_id", "lesson_id", "course_id", "completed_at"),
}


def generate(spec):
    """Deterministic CodeDev-like data (own LCG, so every Python version builds the same rows)."""
    state = spec["seed"]

    def rnd(n):
        nonlocal state
        state = (state * 1103515245 + 12345) % 2147483648
        return (state >> 8) % n

    rows = {table: [] for table in COLUMNS}
    lessons_of = {}
    lesson_id = 0
    for course_id in range(1, spec["courses"] + 1):
        rows["courses"].append((course_id, f"Course {course_id}", "backend", "2026-01-05"))
        count = 0 if course_id % 23 == 0 else 4 + rnd(9)   # a few courses have no lessons yet
        lessons_of[course_id] = []
        for position in range(1, count + 1):
            lesson_id += 1
            rows["lessons"].append((lesson_id, course_id, position))
            lessons_of[course_id].append(lesson_id)
    enrollment_id = 0
    for user_id in range(1, spec["users"] + 1):
        rows["users"].append((user_id, f"user{user_id}@codedev.test", "2026-01-10"))
        taken = set()
        for _ in range(1 + rnd(spec["max_courses_per_user"])):
            course_id = 1 + rnd(spec["courses"])
            if course_id in taken:
                continue
            taken.add(course_id)
            enrollment_id += 1
            r = rnd(10)
            status = "cancelled" if r == 0 else ("completed" if r < 3 else "active")
            rows["enrollments"].append((enrollment_id, user_id, course_id, "2026-02-01", status))
            lessons = lessons_of[course_id]
            done = len(lessons) if rnd(4) == 0 else rnd(len(lessons) + 1)
            for lesson in lessons[:done]:
                finished = None if rnd(9) == 0 else "2026-03-01"
                rows["lesson_progress"].append((user_id, lesson, course_id, finished))
        if rnd(15) == 0:   # progress left over from a course the user is not enrolled in
            course_id = 1 + rnd(spec["courses"])
            if course_id not in taken:
                for lesson in lessons_of[course_id][:2]:
                    rows["lesson_progress"].append((user_id, lesson, course_id, "2026-03-01"))
    return rows


def index_statements(sql):
    text = "\n".join(line.split("--", 1)[0] for line in sql.splitlines())
    statements = [s.strip() for s in text.split(";") if s.strip()]
    for statement in statements:
        if not re.match(r"CREATE\s+(UNIQUE\s+)?INDEX\b", statement, re.IGNORECASE):
            raise ValueError(f"INDEXES may only contain CREATE INDEX statements, got: {statement[:60]}")
    return statements


def main():
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    tables = generate(case["generate"]) if "generate" in case else {table: [] for table in COLUMNS}
    for table, columns in COLUMNS.items():
        rows = tables[table] + [tuple(row[c] for c in columns) for row in case.get("tables", {}).get(table, [])]
        marks = ", ".join("?" for _ in columns)
        db.executemany(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({marks})", rows)
    try:
        for statement in index_statements(INDEXES):
            db.execute(statement)
        plan = [row[3] for row in db.execute("EXPLAIN QUERY PLAN " + QUERY)]
    except (ValueError, sqlite3.Error) as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
        return
    correlated = [step for step in plan if "CORRELATED" in step]
    if correlated:
        print(json.dumps({"error": f"too slow: the plan runs a correlated subquery once per outer row ({correlated[0]})", "plan": plan}))
        return
    steps = 0

    def count_steps():
        nonlocal steps
        steps += 1000
        return 1 if steps > STEP_BUDGET else 0   # non-zero aborts the query

    db.set_progress_handler(count_steps, 1000)
    try:
        rows = db.execute(QUERY).fetchall()
    except sqlite3.OperationalError as error:
        if steps > STEP_BUDGET:
            print(json.dumps({"error": f"too slow: more than {STEP_BUDGET} SQLite VM steps", "plan": plan}))
        else:
            print(json.dumps({"error": f"OperationalError: {error}"}))
        return
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
        return
    print(json.dumps([list(row) for row in rows]))


if __name__ == "__main__":
    main()
