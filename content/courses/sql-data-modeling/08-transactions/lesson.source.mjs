// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sdm-3-2",
    title: "Transactions: all or nothing",
    slug: { _type: "slug", current: "transactions-all-or-nothing" },
    description:
        "An enrollment saved without its event row: the learner is in the course but never gets a welcome email. Learn what a transaction promises (ACID in plain words), why autocommit wrote half an enrollment, how BEGIN, COMMIT and ROLLBACK behave in SQLite and PostgreSQL, why transactions must stay short, and how locking and isolation work at a glance.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, CodeDev platform team",
        problem:
            "The iOS app launched on Tuesday. By Thursday, support has three tickets from iOS learners: the course shows up in My Courses, but the welcome email never arrived and the course's analytics do not count them. The enroll handler writes two rows - the enrollment and an 'enrolled' event that the email job reads - and the logs show an IntegrityError on the second insert for every iOS request.",
    },

    content: [
        h2("1. The incident: enrolled, but nobody was told"),
        p("Enrolling a learner on CodeDev writes two rows. The first goes into `enrollments`; it is what My Courses and the progress page read. The second goes into `enrollment_events`; the welcome-email job and the analytics feed read only that table. The two rows are one business fact: \"learner 2 enrolled in course 10 from the web\". Half of that fact is a bug."),
        p("On Thursday, support forwards three tickets from iOS learners. Each of them sees the course in My Courses, none of them got a welcome email. Before guessing, ask the database how many enrollments have no `enrolled` event:"),
        code("sql", `
SELECT e.user_id, e.course_id, e.enrolled_at
FROM enrollments e
LEFT JOIN enrollment_events ev
       ON ev.user_id = e.user_id
      AND ev.course_id = e.course_id
      AND ev.event_type = 'enrolled'
WHERE ev.event_id IS NULL
ORDER BY e.enrolled_at;`, "enrollments without their event (an anti-join, lesson 5)"),
        code("text", `
user_id | course_id | enrolled_at
--------+-----------+--------------------
   2    |    10     | 2026-10-20 09:01:30
   7    |    12     | 2026-10-20 14:22:05
  11    |    10     | 2026-10-21 08:47:51`, "result"),
        p("Every row is from Tuesday or later, and the handler's error log has a line for each of them:"),
        code("text", `
2026-10-20 09:01:30 ERROR POST /enrollments user_id=2 course_id=10 client=ios/1.0.0
sqlite3.IntegrityError: CHECK constraint failed: source IN ('web', 'android', 'admin')`, "handler log"),
        p("Two things went wrong. The table's `CHECK` on `source` was never updated for the new iOS app, so the event insert fails. That is a schema change, and lesson 10 shows how to make it safely. But the second problem is the one this lesson is about: **the request failed, and half of it was saved anyway.** A failed request should leave the database exactly as it was."),

        h2("2. Reproduce it"),
        p("Here is the handler, reduced to the part that writes. It opens the connection in autocommit mode and runs the two inserts one after the other:"),
        code("python", `
import sqlite3

db = sqlite3.connect("codedev.db", isolation_level=None)   # autocommit: no implicit transactions
db.execute("PRAGMA foreign_keys = ON")

def enroll(user_id, course_id, source, now):
    db.execute(
        "INSERT INTO enrollments (user_id, course_id, enrolled_at, status) VALUES (?, ?, ?, 'active')",
        (user_id, course_id, now))
    db.execute(
        "INSERT INTO enrollment_events (user_id, course_id, event_type, source, created_at) "
        "VALUES (?, ?, 'enrolled', ?, ?)",
        (user_id, course_id, source, now))

enroll(2, 10, "ios", "2026-10-20 09:01:30")   # raises sqlite3.IntegrityError on the second insert`, "enroll.py (before the fix)"),
        p("After the exception, `SELECT * FROM enrollments WHERE user_id = 2` returns one row and `enrollment_events` has nothing for that learner. You have reproduced the incident on your machine, which also gives you a test: the fix is done when this script leaves no row behind."),

        h2("3. What a transaction promises: ACID in plain words"),
        p("A **transaction** is a group of statements that the database treats as one unit. The four promises are usually listed as ACID. Each one is easier to remember with what it does **not** mean:"),
        bullets([
            "**Atomicity: all or nothing.** Either every change in the transaction is saved, or none is. It does not mean the transaction cannot fail; it means a failure leaves no partial result.",
            "**Consistency: the rules hold after every commit.** Constraints such as `NOT NULL`, `UNIQUE`, `CHECK` and foreign keys (lesson 7) are true for the data that is committed. The database only knows the rules you declared: a rule that lives only in application code is not protected.",
            "**Isolation: others do not see your half-done work.** Another connection sees your changes only after you commit. How much concurrent transactions can affect each other depends on the isolation level (section 7).",
            "**Durability: committed means saved.** Once `COMMIT` returns, the change survives a crash or a power cut (with the default settings). Before `COMMIT` returns, nothing is promised.",
        ]),
        image("autocommit-vs-transaction", {
            alt: "Diagram comparing two ways to run the two enrollment inserts. On the left, in red, autocommit: the enrollment insert commits on its own, the event insert with source ios fails on the CHECK constraint, and the enrollment stays behind without its event. On the right, in green, one transaction: BEGIN, the enrollment insert, the event insert fails, ROLLBACK, and nothing is kept; on success, COMMIT saves both rows together. A bottom row explains atomicity, consistency, isolation and durability in one line each.",
            caption: "Autocommit saves each statement as it goes. A transaction saves the whole request or nothing.",
        }),

        h2("4. Autocommit: the mode you are in without knowing it"),
        p("SQLite never reads or writes outside a transaction. If you do not start one, every statement gets its own automatic transaction, which commits as soon as the statement finishes. That is **autocommit**, and it is why the first insert was already saved when the second one failed. PostgreSQL behaves the same way: a statement sent outside `BEGIN` is committed on its own."),
        p("The surprise is usually the driver, not the database. Drivers decide when to send `BEGIN` for you:"),
        bullets([
            "**Python `sqlite3`, default settings**: the driver quietly sends `BEGIN` before the first `INSERT`, `UPDATE`, `DELETE` or `REPLACE`, and nothing is saved until you call `commit()`. Forget `commit()` and the changes disappear when the connection closes.",
            "**Python `sqlite3` with `isolation_level=None`**: the driver never sends `BEGIN` or `COMMIT`. Each statement is committed on its own unless you write `BEGIN` yourself. This is the mode of the handler above and of the challenge runner. (Python 3.12 added an `autocommit` attribute that controls the same thing with a clearer name.)",
            "**psycopg (PostgreSQL, Python)**: by default the first statement on a connection opens a transaction, and you must call `commit()`. The `psql` shell, on the other hand, is in autocommit mode by default.",
        ]),
        callout("tip", "Check, do not assume",
            "In Python, `db.in_transaction` tells you whether a transaction is open right now. Print it after each statement of a handler once, and you know exactly which mode your code runs in."),

        h2("5. BEGIN, COMMIT and ROLLBACK"),
        p("The fix is to make the writes of one request one unit. `BEGIN` opens a transaction, `COMMIT` saves everything since `BEGIN` in one step, and `ROLLBACK` throws all of it away. Completing a course has the same shape as enrolling - one change to `enrollments`, one event row:"),
        code("sql", `
BEGIN;
UPDATE enrollments
SET status = 'completed'
WHERE user_id = 2 AND course_id = 10 AND status = 'active';
INSERT INTO enrollment_events (user_id, course_id, event_type, source, created_at)
VALUES (2, 10, 'completed', 'web', '2026-11-02 18:40:00');
COMMIT;      -- or ROLLBACK; to throw both changes away`, "completing a course in one transaction"),
        p("Order still matters inside a transaction. `enrollment_events` has a foreign key to `enrollments`, and SQLite checks it when the event row is inserted, so an enrollment must exist before its first event is written. A transaction does not switch constraints off; it only decides when the result becomes visible and permanent."),

        h3("A failed statement does not end the transaction"),
        p("This is the detail that catches most people. When a statement inside a transaction breaks a constraint, SQLite undoes **that statement only**. The transaction stays open, and the rows written by earlier statements are still in it:"),
        code("python", `
db.execute("BEGIN")
db.execute("INSERT INTO enrollments ... VALUES (2, 10, ..., 'active')")      # ok
db.execute("INSERT INTO enrollment_events ... VALUES (2, 10, ..., 'ios', ...)")
# sqlite3.IntegrityError: CHECK constraint failed ...
db.in_transaction        # True - the enrollment row is still pending
db.execute("COMMIT")     # would save the half-written enrollment after all`, "what happens after the error"),
        p("So the error handler must end the transaction itself, with `ROLLBACK`. PostgreSQL is stricter: after any error, the transaction is marked as aborted, every further statement fails with \"current transaction is aborted, commands ignored until end of transaction block\", and a `COMMIT` is turned into a rollback. Different behavior, same rule for your code: **on error, roll back explicitly.**"),
        code("python", `
def enroll(user_id, course_id, source, now):
    db.execute("BEGIN")
    try:
        db.execute(INSERT_ENROLLMENT, (user_id, course_id, now))
        db.execute(INSERT_EVENT, (user_id, course_id, source, now))
        db.execute("COMMIT")
    except sqlite3.Error:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise                       # the caller still learns that the request failed`, "enroll.py (after the fix)"),
        p("Notice what the fix does and does not do. An iOS request still fails, because `ios` is still not an allowed source. But it now fails **cleanly**: no row is left behind, the app can show an error, and the same request can be sent again once the schema allows `ios`. Atomicity turns a silent data bug into a visible, retryable error."),
        p("Your turn. The runner in the challenge plays the role of the error handler: it stops a request at the first failing statement and rolls back if a transaction is still open. You only write the list of statements."),
        challenge("chal_coding_sdm_322"),

        h2("6. Keep transactions short, and never wait on the network inside one"),
        p("A transaction that writes holds locks until it ends. The longer it stays open, the longer other requests wait for it. Two habits keep transactions harmless:"),
        bullets([
            "**Do the slow work before `BEGIN` or after `COMMIT`.** Validate input, load what you need, compute the result first; open the transaction only for the writes.",
            "**No network calls inside a transaction.** An HTTP call to an email service, a payment provider or another API can take seconds, or time out after thirty. The transaction keeps its locks the whole time, and if the call succeeds but the transaction later rolls back, the email was sent for an enrollment that does not exist.",
        ]),
        code("python", `
# Bad: the write lock is held while the email service answers
db.execute("BEGIN")
db.execute(INSERT_ENROLLMENT, ...)
send_welcome_email(user_id, course_id)   # HTTP call, 200 ms on a good day, 30 s on a bad one
db.execute(INSERT_EVENT, ...)
db.execute("COMMIT")

# Good: write both rows quickly; the email job reads enrollment_events after the commit
db.execute("BEGIN")
db.execute(INSERT_ENROLLMENT, ...)
db.execute(INSERT_EVENT, ...)
db.execute("COMMIT")`),
        p("This is why CodeDev has an `enrollment_events` table in the first place. The handler records **that** an email must be sent, inside the same transaction as the enrollment. A separate job sends it later and can retry if the email service is down. The event row and the enrollment are saved together or not at all, so the email job never sees an event for an enrollment that was rolled back."),

        h2("7. Concurrency at a glance: SQLite locks, PostgreSQL MVCC"),
        p("Isolation is where the two engines differ most. You do not need the details yet, but you need the picture, because lesson 9 is about two requests that run at the same time."),
        h3("SQLite: one writer at a time"),
        bullets([
            "The whole database file has **one writer at a time**. A transaction that has written something holds the write lock until it commits or rolls back.",
            "A plain `BEGIN` (`DEFERRED`) takes the write lock at the first write. `BEGIN IMMEDIATE` takes it at once, so a transaction that will write cannot be surprised by another writer halfway through.",
            "A second writer waits up to its **busy timeout** (Python's `sqlite3.connect` waits 5 seconds by default), then fails with `database is locked`.",
            "In **WAL mode** (`PRAGMA journal_mode = WAL`), readers keep reading the last committed data while a write is in progress. It still allows only one writer.",
        ]),
        h3("PostgreSQL: many versions of a row"),
        bullets([
            "PostgreSQL uses **MVCC** (multiversion concurrency control): a transaction reads a snapshot, so reading never waits for writing and writing never waits for reading.",
            "Two transactions can write **different** rows at the same time. If they write the **same** row, the second waits until the first commits or rolls back.",
        ]),
        h3("Isolation levels, named"),
        code("text", `
Level              What a transaction sees                          Notes
READ UNCOMMITTED   in theory, other transactions' uncommitted data  PostgreSQL treats it as READ COMMITTED
READ COMMITTED     data committed before each statement started     PostgreSQL default
REPEATABLE READ    one snapshot for the whole transaction
SERIALIZABLE       the same result as running one after another     PostgreSQL may abort one with a
                                                                    serialization failure: retry it
SQLite             serializable between connections                 writes are serialized by the lock`, "the four standard levels, at a glance"),
        p("The default in PostgreSQL, READ COMMITTED, is enough for most handlers, but it does not stop two transactions from both reading \"no row yet\" and both inserting. Lesson 9 shows that race on the enrollments table, and why a constraint fixes it where an isolation level alone does not."),

        h2("8. Verify the fix"),
        p("A transaction fix is verified by forcing the failure, not by enrolling a learner successfully. The happy path wrote both rows before the fix too."),
        numbered([
            "**Force the second insert to fail.** Call the handler with `source = 'ios'` (or any value outside the `CHECK`). Expect the error to reach the caller and `SELECT count(*) FROM enrollments WHERE user_id = 2 AND course_id = 10` to return 0.",
            "**Check the connection is clean.** After the failed call, `db.in_transaction` must be `False`; the next request must succeed instead of failing with \"cannot start a transaction within a transaction\".",
            "**Retry the same request with a valid source.** It must succeed: a failed attempt that leaves nothing behind can always be retried.",
            "**Watch the anti-join from section 1.** Run it daily: after the fix, no new rows may appear. The three existing ones need a decision (insert their missing events so the emails go out, after the schema allows `ios`).",
        ]),
        p("Now check your understanding on the incident:"),
        challenge("chal_quiz_sdm_321"),

        h2("9. Pitfalls"),
        bullets([
            "**Trusting the driver's default.** One driver opens transactions for you, another commits every statement. Detect it: print `in_transaction`, or read the driver's documentation on transaction control.",
            "**Catching the error and committing anyway.** In SQLite the transaction survives a failed statement; a `COMMIT` in a `finally` block saves the half that worked. Commit only on the success path.",
            "**Hiding the error with `INSERT OR IGNORE`.** It makes the event insert skip the bad row without an error, so the enrollment commits without its event: the same bug, without even a log line.",
            "**`BEGIN` without `COMMIT`.** A transaction that is never committed is rolled back when the connection closes or goes back to a pool. Every path out of the handler must end the transaction.",
            "**Long transactions.** A network call, a big loop or a user prompt inside a transaction holds locks; in SQLite it blocks every other writer. Detect it with timings in the logs or `database is locked` errors.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every request that writes more than one row runs its writes between `BEGIN` and `COMMIT`.",
            "The error path rolls back explicitly and re-raises; nothing commits after an error.",
            "You know whether your driver is in autocommit mode, and the code does not depend on a guess.",
            "No network calls, sleeps or user interaction between `BEGIN` and `COMMIT`; side effects go through a table read after the commit.",
            "Statements inside the transaction are ordered so that foreign keys are satisfied as each row is written.",
            "The fix is verified by forcing the second statement to fail, then retrying the same request.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Open two terminals with the sqlite3 shell on the same database file. In the first, run BEGIN and one INSERT, and do not commit. In the second, try an INSERT and a SELECT, with and without PRAGMA journal_mode = WAL, and note which one waits. Then repeat with two psql sessions on a local PostgreSQL and compare. Write down what each engine let you do while the first transaction was open."),

        h2("Sources"),
        bullets([
            "SQLite documentation: \"Transaction\" (BEGIN, COMMIT, ROLLBACK, DEFERRED and IMMEDIATE), \"The ON CONFLICT Clause\" (what ABORT undoes) and \"Write-Ahead Logging\".",
            "PostgreSQL documentation: Tutorial, section 3.4 \"Transactions\", and chapter 13 \"Concurrency Control\" (MVCC and transaction isolation).",
            "Python documentation: the `sqlite3` module, \"Transaction control\" (isolation_level, autocommit, in_transaction).",
        ]),
    ],
});
