// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sdm-2-1",
    title: "CRUD in SQL: insert, select, update & delete safely",
    slug: { _type: "slug", current: "crud-in-sql-insert-select-update-delete-safely" },
    description:
        "Support asked to cancel one course of one learner, and the admin tool cancelled all four. Learn the four CRUD statements with the question that matters for each - which rows does it touch? - name your columns, bind parameters instead of pasting values into SQL, check the row count, use RETURNING, and choose between soft and hard delete.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, CodeDev platform team",
        problem:
            "Learner 1042 asked support to cancel her enrollment in \"SQL & Data Modeling\" (course 7). Support used the admin tool, left the optional course field empty by mistake, and the tool built UPDATE enrollments SET status = 'cancelled' WHERE user_id = 1042 by string concatenation. The log said \"4 rows updated\" and nobody read it. The next day she had lost access to every course, including \"Docker Basics\", which she had already completed.",
    },

    content: [
        h2("1. The incident: one click, four courses gone"),
        p("On Monday at 10:05 learner `1042`, Mai, wrote to support: \"I enrolled in SQL & Data Modeling by mistake, please cancel it.\" Support opened the admin tool, typed her user id, forgot to pick the course, and pressed **Cancel enrollment**. On Tuesday Mai wrote again: her dashboard was empty. Three active courses and one completed course were all marked `cancelled`."),
        p("This is the function behind the button:"),
        code("python", `
def cancel_enrollment(db, user_id, course_id=""):
    sql = "UPDATE enrollments SET status = 'cancelled' WHERE user_id = " + user_id
    if course_id:
        sql += " AND course_id = " + course_id
    cur = db.execute(sql)
    db.commit()
    log.info("cancel_enrollment: %s rows updated", cur.rowcount)`, "admin/enrollments.py (before)"),
        code("text", `
2026-10-19 10:05:12 INFO cancel_enrollment: 4 rows updated`, "admin tool log"),
        p("Three things went wrong, and each one alone would have been enough:"),
        bullets([
            "**The WHERE clause depended on optional input.** Without a course, the condition shrank to `user_id = 1042`, which matches every enrollment of that learner.",
            "**Values were pasted into the SQL text.** Whatever support typed became part of the statement. The same code is also open to SQL injection, as section 4 shows.",
            "**Nobody checked how many rows changed.** Cancelling one enrollment must change exactly one row. The tool logged `4` and committed anyway.",
        ]),

        h2("2. Reproduce it in SQLite"),
        p("Before fixing anything, reproduce the incident on a throwaway database. Open `sqlite3` with no file name (an in-memory database) and paste this. The `PRIMARY KEY (user_id, course_id)` is the key chosen in lesson 2: one row per learner per course."),
        code("sql", `
CREATE TABLE users       (user_id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
CREATE TABLE courses     (course_id INTEGER PRIMARY KEY, title TEXT NOT NULL, level TEXT NOT NULL);
CREATE TABLE enrollments (
    user_id     INTEGER NOT NULL REFERENCES users (user_id),
    course_id   INTEGER NOT NULL REFERENCES courses (course_id),
    enrolled_at TEXT    NOT NULL,
    status      TEXT    NOT NULL,          -- 'active', 'completed' or 'cancelled'
    PRIMARY KEY (user_id, course_id)
);
INSERT INTO users   VALUES (1042, 'mai@example.com', 'Mai Nguyen');
INSERT INTO courses VALUES (3, 'Web Application Fundamentals', 'beginner'), (7, 'SQL & Data Modeling', 'beginner'),
                           (12, 'Docker Basics', 'beginner'), (15, 'Git for Teams', 'beginner');
INSERT INTO enrollments VALUES
    (1042, 3,  '2026-09-01 10:00:00', 'active'),    (1042, 7,  '2026-09-03 18:20:00', 'active'),
    (1042, 12, '2026-08-15 07:45:00', 'completed'), (1042, 15, '2026-10-02 21:10:00', 'active');

-- the statement the tool built when the course field was empty
UPDATE enrollments SET status = 'cancelled' WHERE user_id = 1042;
SELECT changes();                          -- 4
SELECT course_id, status FROM enrollments; -- every row is now 'cancelled'`, "sqlite3 :memory:"),
        p("`changes()` returns the number of rows modified by the most recent INSERT, UPDATE or DELETE. It is the number the tool logged - and the number it should have checked."),

        h2("3. Four statements, one question: which rows?"),
        p("CRUD stands for Create, Read, Update, Delete: `INSERT`, `SELECT`, `UPDATE` and `DELETE` in SQL. Each one is easy to write. The skill is knowing, before you run it, exactly which rows it will touch."),

        h3("INSERT: name the columns"),
        code("sql", `
INSERT INTO enrollments (user_id, course_id, enrolled_at, status)
VALUES (1042, 21, '2026-10-20 08:30:00', 'active');`),
        p("`INSERT INTO enrollments VALUES (...)` without a column list also works today, but it depends on the column order. When a later migration adds a column (lesson 10), it fails with `table enrollments has 5 columns but 4 values were supplied`. Worse, if a table is ever rebuilt with its columns in another order, it can put values into the wrong columns without any error. Naming the columns makes the statement say what it means."),
        p("When the database generates a value, you usually need it back. `RETURNING` hands back the inserted row in the same statement. SQLite supports it since version 3.35.0 (check yours with `SELECT sqlite_version();`), and PostgreSQL has supported it for a long time:"),
        code("sql", `
INSERT INTO users (email, name)
VALUES ('lea@example.com', 'Lea Martin')
RETURNING user_id;       -- the id SQLite chose for the INTEGER PRIMARY KEY`),
        p("Without `RETURNING`, you would call `last_insert_rowid()` in SQLite (or read `cursor.lastrowid` in Python) right after the insert. `RETURNING` also works on `UPDATE` and `DELETE`, which section 7 uses to verify changes."),

        h3("SELECT: name the columns, filter, and order"),
        code("sql", `
SELECT c.course_id, c.title, e.status
FROM enrollments e
JOIN courses c ON c.course_id = e.course_id
WHERE e.user_id = 1042
ORDER BY c.title, c.course_id;`),
        p("A SELECT cannot damage data, but it can still be wrong. `SELECT *` returns whatever columns exist today, so a new column changes what the application receives. And without `ORDER BY`, neither SQLite nor PostgreSQL promises any order: rows often come back in key order on a small table and in a different order after an index or a bigger table changes the plan. If two rows can tie on the sort column - two courses with the same title - add a second column so the order is fully defined."),

        h3("UPDATE and DELETE: the WHERE clause is the blast radius"),
        code("sql", `
UPDATE enrollments SET status = 'cancelled'
WHERE user_id = 1042 AND course_id = 7 AND status = 'active';

DELETE FROM lesson_progress
WHERE user_id = 1042 AND lesson_id = 703;`),
        p("`UPDATE` and `DELETE` change **every row the WHERE clause matches**. No WHERE clause means every row of the table, and SQLite does not ask \"are you sure?\". Four habits keep the blast radius at one row:"),
        numbered([
            "**Preview first.** Run `SELECT COUNT(*) FROM enrollments WHERE <the same condition>` and read the number before you change anything.",
            "**Name the whole key.** The key of `enrollments` is `(user_id, course_id)`, so a statement meant for one enrollment names both columns. Half a composite key matches many rows.",
            "**Guard the state.** `AND status = 'active'` means a completed course is never cancelled by mistake, and cancelling twice changes 0 rows the second time instead of pretending to succeed.",
            "**Check the count afterwards.** If one row was meant and the count is not 1, roll back (transactions are lesson 8).",
        ]),
        callout("info", "UPDATE ... LIMIT is not a safety net",
            "SQLite accepts LIMIT on UPDATE and DELETE only when it was compiled with SQLITE_ENABLE_UPDATE_DELETE_LIMIT, and PostgreSQL does not support it at all. Even where it works, LIMIT 1 picks an arbitrary row out of a too-wide match. Fix the WHERE clause instead."),
        image("crud-where-blast-radius", {
            alt: "Diagram comparing two cancel statements. On the left, in red, the incident: WHERE user_id = 1042 matches all four enrollments of the learner, including a completed course, and the tool logs 4 rows updated. On the right, in green, the fix: WHERE user_id = :user_id AND course_id = :course_id AND status = 'active' matches exactly one row, and the count is checked before commit. A bottom row shows the safe sequence: preview with SELECT, BEGIN, UPDATE, check the count, then COMMIT or ROLLBACK.",
            caption: "The WHERE clause decides how many rows change. Name the whole key, guard the state, and check the count before you commit.",
        }),

        h2("4. Parameters, not string concatenation"),
        p("Concatenation did more damage than the missing course. Suppose the course field contains `7 OR 1=1`. The tool builds:"),
        code("sql", `
UPDATE enrollments SET status = 'cancelled' WHERE user_id = 1042 AND course_id = 7 OR 1=1`),
        p("`AND` binds tighter than `OR`, so this reads as `(user_id = 1042 AND course_id = 7) OR 1=1`, which is true for **every enrollment of every learner**. That is SQL injection: input that changes the structure of the statement instead of being a value in it. It does not need an attacker; a pasted value with a quote or a stray `OR` is enough."),
        p("The fix is to keep the SQL text fixed and send the values separately, as **bound parameters**. The database parses the statement first, then fills each placeholder with a value that can only ever be a value:"),
        code("python", `
CANCEL = """
UPDATE enrollments
SET status = 'cancelled'
WHERE user_id = :user_id AND course_id = :course_id AND status = 'active'
"""

def cancel_enrollment(db, user_id, course_id):
    cur = db.execute(CANCEL, {"user_id": user_id, "course_id": course_id})
    if cur.rowcount != 1:
        db.rollback()
        raise ValueError(f"expected 1 active enrollment, matched {cur.rowcount}")
    db.commit()`, "admin/enrollments.py (after)"),
        p("Now `\"7 OR 1=1\"` is compared with `course_id` as one string and matches nothing. And because the statement always names `:course_id`, a missing value is an error (`sqlite3.ProgrammingError`) rather than a silently wider WHERE clause."),
        bullets([
            "**Placeholder styles.** SQLite accepts `?`, `?NNN`, `:name`, `@name` and `$name`. PostgreSQL's own prepared statements use `$1`, `$2`; client libraries vary (psycopg uses `%s` and `%(name)s`, node-postgres uses `$1`). The idea is the same everywhere.",
            "**What parameters cannot do.** They replace values only, never table names, column names or keywords such as `ASC`/`DESC`. If users choose a sort column, map their choice to one of a few fixed SQL strings (an allowlist); never paste it in.",
            "**Escaping by hand is not the fix.** Doubling quotes covers the case you thought of. Parameters cover the ones you did not.",
        ]),

        h2("5. Soft delete or hard delete"),
        p("Cancelling sets `status = 'cancelled'` instead of deleting the row. That is a **soft delete**: the row stays, marked as gone. A **hard delete** removes it with `DELETE`. Neither is always right."),
        bullets([
            "**Soft delete fits when history matters.** An enrollment links to progress, certificates and refunds; support needs to see that Mai was enrolled and when. It also makes undo possible: one UPDATE back to `'active'`.",
            "**Hard delete fits when keeping the row is wrong or worthless.** A user who asks you to erase their personal data, test rows created by a script, or rows that no report will ever read.",
            "**Soft delete has a cost in every read.** Each query that means \"current\" must add `status <> 'cancelled'`. Forget it once and a report counts learners who left.",
            "**Soft delete and unique keys interact.** The cancelled row still holds the key `(1042, 7)`. If Mai enrolls again, a second `INSERT` fails with `UNIQUE constraint failed`; the app must update the existing row instead (lesson 9 covers this with upsert).",
            "**Hard delete meets foreign keys.** With `PRAGMA foreign_keys = ON`, deleting a course that still has enrollments fails with `FOREIGN KEY constraint failed` unless the key says what should happen (lesson 7).",
        ]),
        p("One more lesson from the incident: a single `status` column keeps only the latest state. To repair Mai's data, the team needed the nightly backup to learn that Docker Basics had been `completed`, not `active`. If you rely on soft delete for undo, keep the previous state too - a `cancelled_at` timestamp plus a history table, for example."),

        h2("6. The fix: three queries the tool can trust"),
        p("The admin tool needs three queries: list a learner's courses, enroll a learner, and cancel one enrollment. Each takes named parameters, and each touches exactly the rows it should. The requirements and the output format are in the challenge."),
        challenge("chal_coding_sdm_212"),

        h2("7. Verify: count before, check after"),
        p("Running the fixed function once on the happy path proves little. Reproduce the incident inputs and check the evidence:"),
        code("sql", `
-- 1. preview: how many rows will the statement touch?
SELECT COUNT(*) FROM enrollments
WHERE user_id = 1042 AND course_id = 7 AND status = 'active';     -- expect 1

-- 2. change and see exactly which rows changed
BEGIN;
UPDATE enrollments SET status = 'cancelled'
WHERE user_id = 1042 AND course_id = 7 AND status = 'active'
RETURNING user_id, course_id, status;                              -- one row: 1042 | 7 | cancelled
SELECT changes();                                                  -- 1
COMMIT;      -- or ROLLBACK if the count or the returned rows are not what you meant

-- 3. the same call again must change nothing
UPDATE enrollments SET status = 'cancelled'
WHERE user_id = 1042 AND course_id = 7 AND status = 'active';
SELECT changes();                                                  -- 0`, "sqlite3"),
        bullets([
            "**Missing course:** call `cancel_enrollment(db, 1042, None)`. Expect an error and 0 changed rows, not 4.",
            "**Injection input:** call it with `course_id = \"7 OR 1=1\"`. Expect 0 changed rows and every other enrollment untouched.",
            "**Completed course:** cancel `(1042, 12)`. Expect 0 changed rows and `status` still `completed`.",
            "**Logs:** the tool now refuses to commit anything other than 1 row, so a `rows updated: 4` line can no longer appear.",
        ]),
        p("Now check your reading of two more pieces of evidence from the admin tool:"),
        challenge("chal_quiz_sdm_211"),

        h2("8. Pitfalls"),
        bullets([
            "**A WHERE clause built with if-statements.** Every optional piece is a way for the condition to get wider. Detect it by searching the code for SQL built with `+` or f-strings; replace it with fixed statements and parameters.",
            "**Half a composite key.** `WHERE user_id = :user_id` on a table keyed by `(user_id, course_id)` matches many rows. Detect it by comparing the WHERE columns with the primary key.",
            "**Double quotes around strings.** SQLite accepts `status = \"cancelled\"` as a string when no column has that name; PostgreSQL rejects it with `column \"cancelled\" does not exist`. Use single quotes for values, double quotes only for identifiers.",
            "**Column lists left out.** `INSERT INTO enrollments VALUES (...)` and `SELECT *` both depend on the current columns and their order. Detect them in review; they break on the first schema change.",
            "**Relying on row order without ORDER BY.** Results that look sorted in a test can change order in production. Every list a user sees needs an explicit, tie-free ORDER BY.",
            "**Soft-deleted rows in reports.** After introducing a `status` or `deleted_at` column, search every read of the table for the missing filter, or read through a view that applies it.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Every INSERT names its columns; generated ids come back with RETURNING or `last_insert_rowid()`.",
            "Every SELECT names its columns and has an ORDER BY that cannot tie.",
            "Every UPDATE and DELETE meant for one row names the whole key and the state the row must be in.",
            "SQL text is fixed; all values are bound parameters, and identifiers come from an allowlist.",
            "The affected row count is checked before commit, and a wrong count rolls back.",
            "Soft delete is a decision: reads filter the deleted rows, unique keys and re-activation are handled, and the previous state is recoverable.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Take one write path from a project of yours (a form that updates or deletes rows). Write down the exact WHERE clause it produces for normal input, for an empty optional field and for a value containing a quote. Then rewrite it with bound parameters and a row-count check, and write a short note on whether that table should use soft or hard delete, and why."),

        h2("Sources"),
        bullets([
            "SQLite documentation: INSERT, UPDATE and DELETE statements, the RETURNING clause (added in 3.35.0), the changes() function, and \"Quirks of SQLite\" (double-quoted string literals).",
            "Python documentation, sqlite3 module: how to use placeholders to bind values in SQL queries.",
            "PostgreSQL documentation, chapter 6 \"Data Manipulation\", section 6.4 \"Returning Data from Modified Rows\".",
            "OWASP SQL Injection Prevention Cheat Sheet: prepared statements with parameterized queries.",
        ]),
    ],
});
