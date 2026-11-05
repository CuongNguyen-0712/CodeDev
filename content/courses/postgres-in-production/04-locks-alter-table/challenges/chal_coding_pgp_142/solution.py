"""
Rice Rocket's CI runs this linter on every migration before it reaches production. Last month it
waved through statements that blocked writes on `orders` and suggested a fix that cannot run.
Fix it.

lint(statements, pg_version) returns one finding per DDL statement:
  {"sql":     the statement as given (without a trailing ;),
   "lock":    the table lock PostgreSQL takes: "ACCESS EXCLUSIVE", "SHARE ROW EXCLUSIVE", "SHARE",
              "SHARE UPDATE EXCLUSIVE" or "unknown",
   "work":    "catalog only", "scans the table", "rewrites the table", "builds an index" or "unknown",
   "verdict": "safe"               - does not block reads or writes while it works,
              "needs lock_timeout" - takes a strong lock only for a moment: run it with a lock timeout
                                     so it gives up (and is retried) instead of queueing everyone,
              "unsafe"             - holds a lock that blocks writes while it scans, rewrites or builds,
                                     or breaks the code that is still running,
              "review"             - not a statement the linter knows,
   "fix":     the statements to run instead (the statement itself when it is fine)}

Rules (PostgreSQL documentation, versions 10-18):
  - ADD COLUMN takes ACCESS EXCLUSIVE. Since PostgreSQL 11 a column with no default or a
    non-volatile default (a constant, now()) changes only the catalog; a volatile default
    (random(), clock_timestamp(), gen_random_uuid(), ...) rewrites the table on every version, and
    any default rewrites it before 11.
  - ADD CONSTRAINT ... FOREIGN KEY takes SHARE ROW EXCLUSIVE, CHECK takes ACCESS EXCLUSIVE; both
    scan the table unless NOT VALID. VALIDATE CONSTRAINT scans under SHARE UPDATE EXCLUSIVE only.
  - ALTER COLUMN ... SET NOT NULL scans the table under ACCESS EXCLUSIVE; since PostgreSQL 12 it
    skips the scan when a valid CHECK (col IS NOT NULL) constraint proves it.
  - CREATE INDEX takes SHARE (blocks writes) for the whole build; CREATE INDEX CONCURRENTLY takes
    SHARE UPDATE EXCLUSIVE and cannot run inside a transaction block.
  - ALTER COLUMN ... TYPE rewrites the table; RENAME breaks the code still running; DROP COLUMN
    changes only the catalog.
"""
import json
import re
import sys

TIMEOUT = "SET lock_timeout = '3s'"
EXPAND_CONTRACT = "-- expand and contract: add a new column, backfill in batches, switch reads, drop the old one later"
VOLATILE = ("random(", "clock_timestamp(", "gen_random_uuid(", "uuid_generate_v4(", "timeofday(", "nextval(")


def finding(sql, lock, work, verdict, fix):
    return {"sql": sql, "lock": lock, "work": work, "verdict": verdict, "fix": fix}


# @piece column-default: ADD COLUMN: when its default rewrites the table
def default_rewrites(default, pg_version):
    if default is None:
        return False
    if pg_version < 11:
        return True
    return any(f in default.lower().replace(" ", "") for f in VOLATILE)
# @end


def check(sql, pg_version):
    s = sql.strip().rstrip(";").strip()
    low = s.lower()

    # @piece concurrent-index: CREATE INDEX with and without CONCURRENTLY
    if re.match(r"create\s+(unique\s+)?index\s+concurrently\b", low):
        return finding(s, "SHARE UPDATE EXCLUSIVE", "builds an index", "safe", [s])
    if re.match(r"create\s+(unique\s+)?index\b", low):
        fixed = re.sub(r"(?i)^create(\s+unique)?\s+index\s+", lambda m: f"CREATE{m.group(1) or ''} INDEX CONCURRENTLY ", s)
        return finding(s, "SHARE", "builds an index", "unsafe", [fixed])
    # @end

    m = re.match(r"alter\s+table\s+(?:only\s+)?(\S+)\s+(.*)$", s, re.I | re.S)
    if not m:
        return finding(s, "unknown", "unknown", "review", [s])
    table, action = m.group(1), m.group(2).strip()
    act = action.lower()

    col = re.match(r"add\s+column\s+(?:if\s+not\s+exists\s+)?(\S+)\s+(.+?)(?:\s+default\s+(.+))?$", action, re.I | re.S)
    if col:
        name, ctype, default = col.group(1), col.group(2).strip(), col.group(3)
        if default_rewrites(default, pg_version):
            return finding(s, "ACCESS EXCLUSIVE", "rewrites the table", "unsafe", [
                TIMEOUT,
                f"ALTER TABLE {table} ADD COLUMN {name} {ctype}",
                f"ALTER TABLE {table} ALTER COLUMN {name} SET DEFAULT {default.strip()}",
                "-- backfill existing rows in batches",
            ])
        return finding(s, "ACCESS EXCLUSIVE", "catalog only", "needs lock_timeout", [TIMEOUT, s])

    con = re.match(r"add\s+constraint\s+(\S+)\s+(foreign\s+key|check)\b.*$", action, re.I | re.S)
    # @piece add-constraint: ADD CONSTRAINT: NOT VALID now, VALIDATE afterwards
    if con:
        lock = "SHARE ROW EXCLUSIVE" if con.group(2).lower().startswith("foreign") else "ACCESS EXCLUSIVE"
        if re.search(r"\bnot\s+valid\s*$", act):
            return finding(s, lock, "catalog only", "needs lock_timeout", [TIMEOUT, s])
        return finding(s, lock, "scans the table", "unsafe", [
            TIMEOUT,
            f"{s} NOT VALID",
            f"ALTER TABLE {table} VALIDATE CONSTRAINT {con.group(1)}",
        ])
    # @end

    # @piece validate-constraint: VALIDATE CONSTRAINT: its lock and verdict
    if re.match(r"validate\s+constraint\s+\S+$", act):
        return finding(s, "SHARE UPDATE EXCLUSIVE", "scans the table", "safe", [s])
    # @end

    nn = re.match(r"alter\s+column\s+(\S+)\s+set\s+not\s+null$", action, re.I)
    # @piece set-not-null: SET NOT NULL through a validated CHECK constraint
    if nn:
        c = nn.group(1)
        if pg_version < 12:
            return finding(s, "ACCESS EXCLUSIVE", "scans the table", "unsafe", [TIMEOUT, s])
        check_name = f"{table}_{c}_not_null"
        return finding(s, "ACCESS EXCLUSIVE", "scans the table", "unsafe", [
            TIMEOUT,
            f"ALTER TABLE {table} ADD CONSTRAINT {check_name} CHECK ({c} IS NOT NULL) NOT VALID",
            f"ALTER TABLE {table} VALIDATE CONSTRAINT {check_name}",
            f"ALTER TABLE {table} ALTER COLUMN {c} SET NOT NULL",
            f"ALTER TABLE {table} DROP CONSTRAINT {check_name}",
        ])
    # @end

    if re.match(r"alter\s+column\s+\S+\s+(set\s+data\s+)?type\b", act):
        return finding(s, "ACCESS EXCLUSIVE", "rewrites the table", "unsafe", [EXPAND_CONTRACT])
    if act.startswith("rename "):
        return finding(s, "ACCESS EXCLUSIVE", "catalog only", "unsafe", [EXPAND_CONTRACT])
    if re.match(r"drop\s+column\b", act):
        return finding(s, "ACCESS EXCLUSIVE", "catalog only", "needs lock_timeout", [TIMEOUT, s])
    return finding(s, "unknown", "unknown", "review", [s])


def lint(statements, pg_version):
    return [check(sql, pg_version) for sql in statements]


# ---------------------------------------------------------------- test runner (do not change)
# Input: {"pg_version": 17, "statements": ["ALTER TABLE ...", ...]}. Prints the findings as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(lint(case["statements"], case["pg_version"])))
