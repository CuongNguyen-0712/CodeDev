"""
Two endpoints of the CodeDev challenge page read tables that have grown to millions of rows, and
both show up at the top of pg_stat_statements:

  login      SELECT user_id, name FROM users WHERE email = ?
  attempts   SELECT submission_id, status, score, created_at FROM submissions
             WHERE user_id = ? AND challenge_id = ?
             ORDER BY submission_id DESC                  -- "My attempts", newest first

Today both plans read the whole table (SQLite: SCAN users, SCAN submissions; PostgreSQL: Seq Scan).
The only existing secondary index is the one the activity feed uses.

Write the CREATE INDEX statement(s) in INDEXES. The runner loads the tables with data first (the
tables already exist in production), then runs INDEXES, then checks:
  - both queries still return the same rows;
  - neither query scans its whole table: EXPLAIN QUERY PLAN must SEARCH an index;
  - the attempts query finds its rows with ONE index search on both user_id and challenge_id
    (a learner can have tens of thousands of submissions; finding all of them and filtering the
    rest away is the slow part we are removing);
  - two accounts can never share an email: inserting a second user with an existing email must
    be rejected by the database (support has already merged two accounts by hand).
A learner can submit the same challenge many times, and the data already contains such retries.

Index names are free: the runner prints the plan facts without them, for example
  {"rows": [...], "full_scan": false, "index_search_on": ["email"]}
"""
import json
import random
import re
import sqlite3
import sys

INDEXES = """
-- existing index, used by the activity feed (keep it)
CREATE INDEX submissions_created_at_idx ON submissions (created_at);

CREATE INDEX users_email_idx ON users (email);
CREATE INDEX submissions_user_challenge_idx ON submissions (user_id, challenge_id);
"""


# ---------------------------------------------------------------- test runner (do not change)
# Builds an in-memory SQLite database from a small spec (JSON on stdin): rows are generated with
# random.Random(seed), so every run sees the same data. Then INDEXES runs and both queries are
# executed and explained. Index names are removed from the plan facts.
SCHEMA = """
CREATE TABLE users (
    user_id    INTEGER PRIMARY KEY,
    email      TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    created_at TEXT    NOT NULL
);
CREATE TABLE submissions (
    submission_id INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users (user_id),
    course_id     INTEGER NOT NULL,
    challenge_id  INTEGER NOT NULL,
    status        TEXT    NOT NULL,
    score         INTEGER NOT NULL,
    created_at    TEXT    NOT NULL
);
"""
LOGIN = "SELECT user_id, name FROM users WHERE email = ?"
ATTEMPTS = """
SELECT submission_id, status, score, created_at FROM submissions
WHERE user_id = ? AND challenge_id = ?
ORDER BY submission_id DESC
"""


def load(db, spec):
    rng = random.Random(spec["seed"])
    users = [(i, f"user{i}@example.com", f"User {i}", f"2025-{1 + i % 12:02d}-{1 + i % 28:02d} 09:00:00")
             for i in range(1, spec["users"] + 1)]
    db.executemany("INSERT INTO users VALUES (?, ?, ?, ?)", users)
    rows = []
    for i in range(spec["submissions"]):
        status = rng.choices(("passed", "failed", "error"), (6, 3, 1))[0]
        rows.append((rng.randint(1, spec["users"]), rng.randint(1, 12), rng.randint(1, spec["challenges"]),
                     status, rng.randint(60, 100) if status == "passed" else rng.randint(0, 59)))
    for k in range(spec.get("retries", 0)):          # one learner retrying the same challenge
        rows.append((spec["user_id"], 3, spec["challenge_id"], "passed" if k % 4 == 3 else "failed", 10 + k))
    rows.sort(key=lambda r: rng.random())
    db.executemany(
        "INSERT INTO submissions (submission_id, user_id, course_id, challenge_id, status, score, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        [(n, *r, f"2026-{1 + n // 40000:02d}-{1 + n // 1500 % 28:02d} {n // 60 % 24:02d}:{n % 60:02d}:00")
         for n, r in enumerate(rows, 1)])


def plan_facts(db, sql, params):
    facts = {"full_scan": False, "index_search_on": []}
    for row in db.execute("EXPLAIN QUERY PLAN " + sql, params):
        detail = row[3]
        if detail.startswith("SCAN "):
            facts["full_scan"] = True
        elif detail.startswith("SEARCH ") and "(" in detail:
            constraint = detail[detail.index("(") + 1:detail.rindex(")")]
            facts["index_search_on"] = sorted(set(re.findall(r"(\w+)\s*(?:=|>|<|IN\b)", constraint)))
    return facts


def run(sql, params):
    return {"rows": [list(r) for r in db.execute(sql, params)], **plan_facts(db, sql, params)}


if __name__ == "__main__":
    spec = json.load(sys.stdin)
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    load(db, spec)
    try:
        db.executescript(INDEXES)
        login = run(LOGIN, (spec["email"],))
        attempts = run(ATTEMPTS, (spec["user_id"], spec["challenge_id"]))
    except sqlite3.Error as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
        sys.exit(0)
    try:
        db.execute("INSERT INTO users VALUES (?, ?, ?, ?)",
                   (spec["users"] + 1, "user1@example.com", "Second Account", "2026-10-01 10:00:00"))
        login["duplicate_email_rejected"] = False
    except sqlite3.IntegrityError:
        login["duplicate_email_rejected"] = True
    print(json.dumps({"login": login, "attempts": attempts}))
