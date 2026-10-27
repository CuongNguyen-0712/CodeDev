"""
Release 2026.10.20 made sign-in on CodeDev case-insensitive: "Mai@CodeDev.test" and
"mai@codedev.test" now sign in to the same account. Since the release, sign-in takes 900 ms
instead of 4 ms and the database CPU is at 85%. The users table has a unique index on email,
yet EXPLAIN shows the sign-in query reading every user.

Fix SCHEMA and/or SIGN_IN_QUERY so that sign-in stays case-insensitive and searches an index.
Emails are stored as the user typed them at sign-up, in any case (for example
"Linh.Tran@CodeDev.test"); no two stored emails differ only in case. SIGN_IN_QUERY receives one
parameter, the email typed on the sign-in form, and must return the id of the matching user.
Only ASCII letters appear in emails (SQLite's lower() and NOCASE fold ASCII only).

The runner applies SCHEMA to an empty database, inserts the users with
INSERT INTO users (id, email, created_at) VALUES (?, ?, ?), then runs SIGN_IN_QUERY once per
sign-in attempt. It prints:
  "plan": "uses an index"  when EXPLAIN QUERY PLAN for SIGN_IN_QUERY shows SEARCH users ... INDEX
          "full scan of users"  when it shows SCAN users (also SCAN users USING ... INDEX:
                                reading every index entry is still reading every user)
  "sign_ins": one entry per attempt: the sorted list of matching ids ([] = no account), or
          "too slow" if one sign-in needs more than 20,000 SQLite VM steps (the step budget
          stands in for the 900 ms; the large test has 20,000 users).

Example: {"plan": "uses an index", "sign_ins": [[1], [2], []]}
"""
import json
import sqlite3
import sys

SCHEMA = """
CREATE TABLE users (
    id          INTEGER PRIMARY KEY,
    email       TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX users_email ON users (email);
-- The sign-in query compares lower(email): index that expression, not the raw column.
-- (PostgreSQL: CREATE INDEX CONCURRENTLY users_email_lower ON users (lower(email));)
CREATE UNIQUE INDEX users_email_lower ON users (lower(email));
"""

# Release 2026.10.20 (PR #913 "auth: case-insensitive sign-in"), fixed with an expression index.
SIGN_IN_QUERY = "SELECT id FROM users WHERE lower(email) = lower(?)"


# ---------------------------------------------------------------- test runner (do not change)
# Builds the users table from the test case (JSON on stdin), runs SIGN_IN_QUERY for each attempt
# under a VM-step budget and prints the matching ids with a verdict on the query plan.
STEP_BUDGET = 20_000
STEPS_PER_CALL = 100


def generate(count):
    names = ["mai", "linh", "an", "binh", "chi", "duc", "giang", "hoa", "khanh", "minh"]
    rows = []
    for i in range(1, count + 1):
        name = names[i % len(names)]
        email = f"{name.capitalize()}.{i}@CodeDev.test" if i % 3 == 0 else f"{name}{i}@codedev.test"
        rows.append([i, email, "2026-01-01 00:00:00"])
    return rows


def plan_verdict(db):
    details = [row[3] for row in db.execute("EXPLAIN QUERY PLAN " + SIGN_IN_QUERY, ["someone@codedev.test"])]
    if any(d.startswith("SEARCH users USING ") and "INDEX" in d for d in details):
        return "uses an index"
    return "full scan of users"


def sign_in(db, email):
    calls = 0

    def count_steps():
        nonlocal calls
        calls += 1
        return 1 if calls * STEPS_PER_CALL > STEP_BUDGET else 0

    db.set_progress_handler(count_steps, STEPS_PER_CALL)
    try:
        return sorted(row[0] for row in db.execute(SIGN_IN_QUERY, [email]))
    except sqlite3.OperationalError as error:
        if "interrupted" in str(error):
            return "too slow"
        raise
    finally:
        db.set_progress_handler(None, 0)


def main():
    case = json.load(sys.stdin)
    users = generate(case["generate"]) if "generate" in case else case["users"]
    db = sqlite3.connect(":memory:")
    try:
        db.executescript(SCHEMA)
        db.executemany("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", users)
        db.commit()
        result = {"plan": plan_verdict(db), "sign_ins": [sign_in(db, email) for email in case["attempts"]]}
    except sqlite3.Error as error:
        result = {"error": f"{type(error).__name__}: {error}"}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
