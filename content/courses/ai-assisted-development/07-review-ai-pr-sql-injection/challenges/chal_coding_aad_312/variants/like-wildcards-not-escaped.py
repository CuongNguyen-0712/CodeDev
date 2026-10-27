"""
Spot the AI Mistake: SQL injection in course search.

The request sent to the AI coding assistant was:
  "Add search_courses(db, q, level) to the course repository. Return the published courses
   whose title contains q (case-insensitive), optionally only one level (beginner,
   intermediate or advanced), as [course_id, title, level], ordered by title then course_id,
   at most 20. A blank q returns no courses. Add tests."

The assistant wrote the function below. Its tests searched for "react" and "sql" and passed,
CI was green, and the pull request was approved. In review of a later PR, a colleague searched
for  ' OR '1'='1  and got draft courses back; searching for  don't  crashes the endpoint, and
searching for  %  returns 20 courses although no title contains a percent sign.

Fix search_courses so that q and level are only ever data, never SQL:
  - q is matched literally: every character, including ' % _ and the backslash, matches only itself
    (letters are case-insensitive, like the rest of the search);
  - level, when given, must equal the course's level exactly (an unknown level finds nothing);
  - everything else stays as the request says (published only, ordered by title then
    course_id, at most 20, blank q -> []).
Do not change the test runner.
"""
import json
import sqlite3
import sys


def search_courses(db, q, level=None):
    q = q.strip()
    if not q:
        return []
    sql = (
        "SELECT course_id, title, level FROM courses "
        "WHERE title LIKE ? AND status = 'published'"
    )
    params = ["%" + q + "%"]
    if level:
        sql += " AND level = ?"
        params.append(level)
    sql += " ORDER BY title, course_id LIMIT 20"
    return [list(row) for row in db.execute(sql, params)]


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from one test case (JSON on stdin), runs every search of
# the test with search_courses and prints a JSON array: one element per search, either the rows
# it returned or {"error": "<exception type>: <message>"} if it raised.
SCHEMA = """
CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY,
    title     TEXT    NOT NULL,
    level     TEXT    NOT NULL,
    status    TEXT    NOT NULL    -- 'draft' or 'published'
);
CREATE TABLE users (
    user_id       INTEGER PRIMARY KEY,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL
);
"""
TABLES = ("courses", "users")

if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    for table in TABLES:
        for row in case["tables"].get(table, []):
            columns = ", ".join(row)
            marks = ", ".join("?" for _ in row)
            db.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", list(row.values()))
    results = []
    for search in case["searches"]:
        try:
            results.append(search_courses(db, search["q"], search.get("level")))
        except Exception as error:
            results.append({"error": f"{type(error).__name__}: {error}"})
    print(json.dumps(results))
