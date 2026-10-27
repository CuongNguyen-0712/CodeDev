// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-4-2",
    title: "Lock contention: who is waiting for whom",
    slug: { _type: "slug", current: "lock-contention-who-is-waiting" },
    description:
        "Marking a lesson complete went from 15 ms to 8 seconds every morning, with an idle CPU and no slow plan in sight: the queries were waiting, not working. Learn row locks versus table locks, what SELECT ... FOR UPDATE really blocks, how a waiting ALTER TABLE freezes a whole table, how to read pg_stat_activity, pg_locks and pg_blocking_pids() to find the root blocker, why deadlocks come from inconsistent lock order, and how lock_timeout, short transactions and idle_in_transaction_session_timeout keep contention small.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Every morning between 09:00 and 09:20 the POST /lessons/:id/complete endpoint of https://api.codedev.test goes from a p99 of 15 ms to more than 8 seconds, and some requests fail with a 504 from the gateway. The database CPU is at 12%, disk I/O is normal and EXPLAIN shows the same fast index plan as always. The endpoint only runs three small statements. It started the week the daily streak job was moved from 03:00 to 09:00 so that streak e-mails arrive in the morning.",
    },

    content: [
        h2("1. The incident: fast queries that take 8 seconds"),
        p("The endpoint that records a finished lesson is three statements in one transaction: insert into `lesson_progress`, add XP to the learner, and update the course enrollment. Each one is an index lookup that takes well under a millisecond. Yet between 09:00 and 09:20 it takes seconds."),
        p("A query can be slow for two reasons: it does a lot of work, or it waits. Lessons 1 to 10 were about work: bad plans, missing indexes, too many rows read. Low CPU, normal I/O and an unchanged plan point to the other kind. With `log_lock_waits = on` PostgreSQL logs every lock wait longer than `deadlock_timeout` (1 second by default), and the log says it plainly:"),
        code("text", `
2026-10-19 09:04:12.381 UTC [7741] LOG:  process 7741 still waiting for ShareLock on transaction 88120417 after 1000.112 ms
2026-10-19 09:04:12.381 UTC [7741] DETAIL:  Process holding the lock: 7702. Wait queue: 7741, 7745, 7760.
2026-10-19 09:04:12.381 UTC [7741] CONTEXT:  while updating tuple (512,14) in relation "users"
2026-10-19 09:04:12.381 UTC [7741] STATEMENT:  UPDATE users SET xp = xp + 10, last_activity_at = now() WHERE id = $1`, "postgresql.log"),
        p("Process 7741 (an API request) wants to update one row of `users` and waits for transaction 88120417, run by process 7702. \"Waiting for ShareLock on transaction X\" is how PostgreSQL shows a wait for a **row** lock: the row was changed or locked by transaction X, and the waiter must wait until X commits or rolls back."),

        h2("2. Find the blocker: pg_stat_activity and pg_blocking_pids()"),
        p("Every connection is a row in `pg_stat_activity`. `pg_blocking_pids(pid)` returns the processes that block a given one. Together they draw the waiting graph:"),
        code("sql", `
SELECT pid,
       state,
       wait_event_type,
       now() - xact_start      AS xact_age,
       pg_blocking_pids(pid)   AS blocked_by,
       left(query, 60)         AS query
FROM pg_stat_activity
WHERE datname = current_database() AND xact_start IS NOT NULL
ORDER BY xact_start;

 pid  | state  | wait_event_type | xact_age |  blocked_by  | query
------+--------+-----------------+----------+--------------+-------------------------------------------------------------
 7702 | active |                 | 00:04:09 | {}           | UPDATE users SET streak_days = $2, streak_updated_at = now(
 7741 | active | Lock            | 00:00:03 | {7702}       | UPDATE users SET xp = xp + 10, last_activity_at = now() WHE
 7745 | active | Lock            | 00:00:02 | {7702}       | UPDATE users SET xp = xp + 10, last_activity_at = now() WHE
 7760 | active | Lock            | 00:00:02 | {7702}       | INSERT INTO enrollments (user_id, course_id, status) VALUES`, "psql"),
        p("Read it from the top: the root blocker is the row with an empty `blocked_by` that others point to. Process 7702 is the streak job, and its transaction is four minutes old. Its own query text is short; the problem is what the transaction did before it. The job's code explains it:"),
        code("python", `
# jobs/streaks.py - the version that shipped
with db.transaction():
    users = db.fetch_all("""
        SELECT id, streak_days, last_activity_at
        FROM users
        WHERE last_activity_at > now() - interval '2 days'
        ORDER BY last_activity_at
        FOR UPDATE""")                      # locks ~48,000 rows at once
    for user in users:
        days = compute_streak(user)         # reads activity_log, ~5 ms per user
        db.execute("UPDATE users SET streak_days = $2, streak_updated_at = now() WHERE id = $1",
                   user.id, days)
# commit after ~4 minutes: every locked row stays locked until here`, "streaks.py"),
        p("`SELECT ... FOR UPDATE` locked every active learner at the start of the job, and row locks are held until the transaction ends. For four minutes, every learner who finished a lesson waited for the streak job to reach the end of its list. At 03:00 nobody noticed; at 09:00 those are exactly the learners who are online."),
        p("`pg_locks` shows the same picture from the lock side. Row locks are stored in the row itself, not in `pg_locks`, so a row-lock waiter appears as a request on the blocking **transaction id** that is not granted:"),
        code("sql", `
SELECT l.pid, l.locktype, l.mode, l.granted, l.transactionid, l.relation::regclass
FROM pg_locks AS l
WHERE l.pid IN (7702, 7741)
ORDER BY l.pid, l.granted DESC;

 pid  |   locktype    |       mode       | granted | transactionid | relation
------+---------------+------------------+---------+---------------+----------
 7702 | relation      | RowShareLock     | t       |               | users
 7702 | relation      | RowExclusiveLock | t       |               | users
 7702 | transactionid | ExclusiveLock    | t       |      88120417 |
 7741 | relation      | RowExclusiveLock | t       |               | users
 7741 | tuple         | ExclusiveLock    | t       |               | users
 7741 | transactionid | ShareLock        | f       |      88120417 |`, "psql"),

        h2("3. Core idea: what locks what"),
        h3("Row locks: writers wait for writers, readers never wait"),
        p("PostgreSQL uses MVCC: a plain `SELECT` reads a snapshot of committed rows and **never waits for a row lock**, and a writer never waits for a plain reader. Waiting happens between operations that want to change or lock the same row:"),
        bullets([
            "`UPDATE` and `DELETE` lock each row they change. An `UPDATE` that does not change a key column takes `FOR NO KEY UPDATE`; one that changes a key column, and `DELETE`, take `FOR UPDATE`.",
            "`SELECT ... FOR UPDATE` takes the strongest row lock without changing anything. It also conflicts with `FOR KEY SHARE`, which a foreign key check takes on the parent row: that is why process 7760, inserting an enrollment for a locked user, waited too.",
            "`SELECT ... FOR SHARE` and `FOR KEY SHARE` block writers but not each other.",
            "All of them are held **until the transaction ends**. A lock taken in the first millisecond of a four-minute transaction is held for four minutes.",
        ]),
        h3("Table locks and the lock queue"),
        p("Every statement also takes a lock on each table it touches, and almost all of them are compatible: `SELECT` takes `ACCESS SHARE`, `INSERT`/`UPDATE`/`DELETE` take `ROW EXCLUSIVE`, and the two never conflict. The exception is `ACCESS EXCLUSIVE`, taken by most forms of `ALTER TABLE`, `DROP`, `TRUNCATE` and `VACUUM FULL`. It conflicts with everything, including plain `SELECT`."),
        p("Lock requests on a table wait in a queue. If an `ALTER TABLE` is waiting for `ACCESS EXCLUSIVE` behind one long transaction, every later query on that table, even a `SELECT`, waits **behind the ALTER**, because what it wants conflicts with what the ALTER asked for. A two-millisecond migration plus one forgotten transaction becomes a frozen table. The defence is to never let DDL wait for long:"),
        code("sql", `
-- migrations: give up quickly instead of queueing the whole table behind you
SET lock_timeout = '3s';
ALTER TABLE users ADD COLUMN streak_freeze_until timestamptz;   -- no default: no table rewrite
-- on "canceling statement due to lock timeout": wait a little and run the migration again`, "migration.sql"),
        h3("Deadlocks are a lock-order bug"),
        p("Two transactions deadlock when each holds a row the other wants. PostgreSQL checks for cycles after `deadlock_timeout`, cancels one transaction with `ERROR: deadlock detected` (SQLSTATE `40P01`) and lets the other continue. The cycle only exists because the two code paths lock the same rows in different orders. Lock rows in one global order everywhere, usually ascending primary key, and the cycle cannot form."),
        callout("info", "When not to reach for FOR UPDATE",
            "Many FOR UPDATE calls protect a read-modify-write that the database can do in one statement. UPDATE users SET xp = xp + 10 WHERE id = $1 is atomic: it needs no prior SELECT and holds its row lock for microseconds. Use FOR UPDATE when you must read, decide in application code and then write, and keep that window short. For work queues, SELECT ... FOR UPDATE SKIP LOCKED lets several workers take different rows instead of waiting for each other; NOWAIT fails immediately instead of waiting."),

        challenge("chal_quiz_pgp_421"),

        h2("4. Worked example: fixing the streak job"),
        p("The job does not need to hold 48,000 locks at once. It needs each user's update to be correct. Three changes make its locks small and short:"),
        numbered([
            "**Compute outside the transaction.** Reading `activity_log` and computing a streak needs no lock at all.",
            "**Write in small batches, each its own transaction.** A batch of 500 users commits in a few milliseconds, so an API request waits at most that long.",
            "**Lock in a fixed order and guard against a stale read.** The batch updates rows in ascending `id` order, and the `WHERE` clause only applies the new value if the row has not changed since it was read.",
        ]),
        code("python", `
# jobs/streaks.py - fixed
users = db.fetch_all("""
    SELECT id, streak_days, streak_updated_at, last_activity_at
    FROM users
    WHERE last_activity_at > now() - interval '2 days'
    ORDER BY id""")                                   # no FOR UPDATE: just a snapshot

for batch in chunks(users, 500):
    rows = [(u.id, compute_streak(u), u.streak_updated_at) for u in batch]   # no locks held
    with db.transaction():                            # a few ms per batch
        db.execute("SET LOCAL lock_timeout = '2s'")
        ids = [r[0] for r in rows]                    # already ascending
        db.execute("SELECT id FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE", ids)
        db.execute("""
            UPDATE users AS u
            SET streak_days = v.days, streak_updated_at = now()
            FROM unnest($1::bigint[], $2::int[], $3::timestamptz[]) AS v(id, days, seen)
            WHERE u.id = v.id
              AND u.streak_updated_at IS NOT DISTINCT FROM v.seen""",   # skip rows changed meanwhile
            ids, [r[1] for r in rows], [r[2] for r in rows])`, "streaks.py"),
        p("The `SELECT ... ORDER BY id FOR UPDATE` at the start of each batch takes the row locks in ascending id order; the `UPDATE` that follows only touches rows the transaction already holds, whatever order its join visits them in. Any other code path that locks several users, such as the bundle enrollment endpoint, must do the same: `SELECT id FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE` before it changes them."),
        p("Two server settings turn forgotten transactions from an outage into an error message:"),
        code("sql", `
-- for the API role: a transaction left open by a bug ends after 60 s
ALTER ROLE codedev_api SET idle_in_transaction_session_timeout = '60s';
-- and no single statement from the API runs longer than 5 s
ALTER ROLE codedev_api SET statement_timeout = '5s';
-- log every lock wait longer than deadlock_timeout (1 s)
ALTER SYSTEM SET log_lock_waits = on;
SELECT pg_reload_conf();`, "psql"),

        h2("5. How to verify"),
        bullets([
            "**Reproduce with two psql sessions.** In session A: `BEGIN; SELECT * FROM users WHERE id = 42 FOR UPDATE;`. In session B: `UPDATE users SET xp = xp + 1 WHERE id = 42;` waits; `SELECT * FROM users WHERE id = 42;` returns at once. Run the blocker query from section 2 in a third session and find A as the root.",
            "**After the fix, the log goes quiet.** With `log_lock_waits = on`, count `still waiting for` lines between 09:00 and 09:20 before and after the deploy.",
            "**Deadlocks have a counter.** `SELECT deadlocks FROM pg_stat_database WHERE datname = current_database();` should stop increasing once lock order is consistent.",
            "**Long transactions are visible.** `SELECT pid, state, now() - xact_start FROM pg_stat_activity WHERE xact_start < now() - interval '1 minute';` should be empty during the day; alert on it.",
            "**The endpoint itself.** Its p99 between 09:00 and 09:20 returns to the 15 ms it shows the rest of the day.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Blaming the first waiter instead of the root.** The query at the head of a visible queue may itself be waiting. Spot it: follow `pg_blocking_pids()` until you reach a pid whose `blocked_by` is empty.",
            "**Holding a transaction open across slow work.** Network calls, e-mails, file uploads or long computations inside `BEGIN ... COMMIT` hold every lock taken so far. Spot it: `state = 'idle in transaction'` or a large `now() - xact_start` in `pg_stat_activity`.",
            "**Running DDL without lock_timeout.** A migration that waits behind a long transaction blocks every query on the table while it waits. Spot it: an `ALTER TABLE` in `pg_stat_activity` with `wait_event_type = Lock` and a crowd blocked by it.",
            "**Locking rows in a data-dependent order.** Updating rows in the order a request or a provider lists them invites deadlocks. Spot it: `deadlock detected` in the log with the same two statements each time, and a growing `pg_stat_database.deadlocks`.",
            "**Fixing a deadlock only with retries.** Retrying on `40P01` is correct as a safety net, but under load the same cycle forms again and again. Spot it: retries succeed but the deadlock counter keeps rising every day.",
        ]),

        h2("7. Summary"),
        bullets([
            "A slow query with low CPU and a good plan is usually waiting: find the root blocker with `pg_stat_activity` and `pg_blocking_pids()`, and confirm it in `pg_locks` or with `log_lock_waits`.",
            "Plain reads never wait for row locks; writers and locking reads do, until the holder's transaction ends. Keep transactions short and do slow work outside them.",
            "A waiting `ACCESS EXCLUSIVE` request blocks everything behind it: run DDL with `lock_timeout` and a retry. Lock rows in one consistent order to make deadlocks impossible.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Explicit Locking (table-level and row-level lock modes, deadlocks) - https://www.postgresql.org/docs/current/explicit-locking.html",
            "PostgreSQL documentation: The Cumulative Statistics System (pg_stat_activity) and System Information Functions (pg_blocking_pids)",
            "PostgreSQL documentation: Client Connection Defaults (lock_timeout, statement_timeout, idle_in_transaction_session_timeout)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "In a local PostgreSQL, open three psql sessions. Leave session A idle in a transaction after a SELECT on a table, run ALTER TABLE ... ADD COLUMN in session B, then a SELECT in session C. Draw the waiting graph from pg_blocking_pids(), then repeat with SET lock_timeout = '2s' in session B and note what changes for session C."),
    ],
});
