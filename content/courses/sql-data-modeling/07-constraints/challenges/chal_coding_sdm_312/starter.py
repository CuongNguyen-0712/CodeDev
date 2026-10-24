"""
A data audit of CodeDev found enrollments pointing to a deleted course, two accounts for the same
email written in different case, users with an empty email and enrollments with the status
'Active' and 'done'. The sign-up form validates all of this, but the import script and the admin
tools write straight to the database. Write a schema that refuses bad data by itself.

Write SCHEMA: CREATE TABLE statements for these three tables (you may add CREATE INDEX lines).

users(user_id, email, name)
  - user_id   INTEGER PRIMARY KEY
  - email     required; unique IGNORING CASE ('Mai@CodeDev.test' duplicates 'mai@codedev.test');
              must contain '@' (an empty string is not an email)
  - name      required
courses(course_id, title, level)
  - course_id INTEGER PRIMARY KEY
  - title     required
  - level     required; exactly 'beginner', 'intermediate' or 'advanced'
enrollments(user_id, course_id, enrolled_at, status)
  - user_id   required; must exist in users. Deleting a user deletes their enrollments.
  - course_id required; must exist in courses. Deleting a course that still has enrollments
              is refused.
  - enrolled_at required
  - status    required; exactly 'active', 'completed' or 'cancelled'; 'active' when an insert
              leaves the column out
  - the same (user_id, course_id) pair at most once

The runner turns on PRAGMA foreign_keys, applies SCHEMA, then runs the test's operations one by
one and prints, for each, "ok" or the kind of constraint that refused it: "not_null", "unique",
"check" or "foreign_key". A "select" operation prints the stored values it reads back instead,
for example [["active"]].

Example: insert user 1 'mai@codedev.test', then user 2 'MAI@codedev.test', then course 10 with
         level 'expert' -> ["ok", "unique", "check"]
"""
import json
import sqlite3
import sys

SCHEMA = """
-- The schema the import script used: it accepts anything.
-- TODO: add NOT NULL, UNIQUE, CHECK, DEFAULT, PRIMARY KEY and FOREIGN KEY rules from the docstring.
CREATE TABLE users (
    user_id  INTEGER PRIMARY KEY,
    email    TEXT,
    name     TEXT
);

CREATE TABLE courses (
    course_id  INTEGER PRIMARY KEY,
    title      TEXT,
    level      TEXT
);

CREATE TABLE enrollments (
    user_id      INTEGER,
    course_id    INTEGER,
    enrolled_at  TEXT,
    status       TEXT
);
"""


# ---------------------------------------------------------------- test runner (do not change)
# Applies SCHEMA to an empty in-memory database, then runs each operation of one test case
# (JSON on stdin) in its own statement and prints a JSON list with one result per operation:
# "ok" or a constraint kind for insert/delete, the matching rows (lists of values) for select.
def run_operation(db, op):
    if op["op"] == "insert":
        columns = ", ".join(op["row"])
        marks = ", ".join("?" for _ in op["row"])
        sql = f"INSERT INTO {op['table']} ({columns}) VALUES ({marks})"
        params = list(op["row"].values())
    elif op["op"] == "select":  # reads back stored values: a list of rows, each a list
        where = " AND ".join(f"{column} = ?" for column in op["where"])
        sql = f"SELECT {', '.join(op['columns'])} FROM {op['table']} WHERE {where}"
        try:
            return [list(row) for row in db.execute(sql, list(op["where"].values()))]
        except sqlite3.Error as error:
            return f"error: {type(error).__name__}: {error}"
    else:
        where = " AND ".join(f"{column} = ?" for column in op["where"])
        sql = f"DELETE FROM {op['table']} WHERE {where}"
        params = list(op["where"].values())
    try:
        db.execute(sql, params)
        return "ok"
    except sqlite3.IntegrityError as error:
        message = str(error)
        for prefix, kind in (("NOT NULL", "not_null"), ("UNIQUE", "unique"),
                             ("CHECK", "check"), ("FOREIGN KEY", "foreign_key")):
            if message.startswith(prefix):
                return kind
        return f"integrity_error: {message}"
    except sqlite3.Error as error:
        return f"error: {type(error).__name__}: {error}"


if __name__ == "__main__":
    case = json.load(sys.stdin)
    db = sqlite3.connect(":memory:", isolation_level=None)  # autocommit: one statement at a time
    try:
        db.executescript(SCHEMA)
    except sqlite3.Error as error:
        print(json.dumps({"error": f"SCHEMA: {type(error).__name__}: {error}"}))
        sys.exit(0)
    db.execute("PRAGMA foreign_keys = ON")  # after SCHEMA, so the schema cannot switch it off
    print(json.dumps([run_operation(db, op) for op in case["ops"]]))
