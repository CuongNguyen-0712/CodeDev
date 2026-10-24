// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sdm-3-1",
    title: "Constraints: NOT NULL, UNIQUE, CHECK & foreign keys",
    slug: { _type: "slug", current: "constraints-not-null-unique-check-foreign-keys" },
    description:
        "A data audit finds enrollments pointing to a deleted course, two accounts for the same email and statuses nobody defined, although the sign-up form validates everything. Learn why rules that must always hold belong in the database, how NOT NULL, UNIQUE, CHECK, DEFAULT, PRIMARY KEY and FOREIGN KEY behave in SQLite (NULL included), why SQLite needs PRAGMA foreign_keys = ON, what type affinity and STRICT tables change, and how to verify that a schema really refuses bad data.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, CodeDev learning platform",
        problem:
            "Before a certificate launch, the team audits the CodeDev database. It finds enrollments that point to a course an admin script deleted last month, two accounts for mai@codedev.test written in different case, users whose email is an empty string, and enrollments with the statuses 'Active' and 'done', which the app does not know. The sign-up form and the enrollment API validate all of these fields. The bad rows came from a CSV import script and an admin tool that write to the database directly.",
    },

    content: [
        h2("1. The incident: the form validates, the data is still wrong"),
        p("The certificate job will read `enrollments` and issue a certificate for every `completed` row. Before anyone runs it, the team counts what is in the tables:"),
        code("sql", `
-- Enrollments whose course no longer exists
SELECT COUNT(*) FROM enrollments AS e
LEFT JOIN courses AS c ON c.course_id = e.course_id
WHERE c.course_id IS NULL;

-- Emails that exist more than once if you ignore case
SELECT lower(email), COUNT(*) FROM users GROUP BY lower(email) HAVING COUNT(*) > 1;

-- Emails that are not emails, and statuses the app does not know
SELECT COUNT(*) FROM users WHERE email IS NULL OR instr(email, '@') = 0;
SELECT status, COUNT(*) FROM enrollments GROUP BY status;`, "audit.sql"),
        p("Every query returns something. The last one lists `active`, `completed` and `cancelled`, and also `Active` and `done`. None of this could have come through the sign-up form or the enrollment API, which validate every field. It came from the other ways in:"),
        bullets([
            "A **CSV import script** that copied users from the old platform and wrote emails as they were in the file, including empty cells and mixed case.",
            "An **admin tool** that lets support staff fix a status by typing it.",
            "A **cleanup script** that deleted an old course without looking at its enrollments.",
        ]),
        p("The application had rules. The database had none, so every writer that skipped the application also skipped the rules."),

        h2("2. Reproduce it: a schema that accepts anything"),
        p("This is the schema the tables were created with. It names the columns and their types, and nothing else:"),
        code("sql", `
CREATE TABLE users (
    user_id  INTEGER PRIMARY KEY,
    email    TEXT,
    name     TEXT
);
CREATE TABLE enrollments (
    user_id      INTEGER,
    course_id    INTEGER,
    enrolled_at  TEXT,
    status       TEXT
);

-- All of these succeed:
INSERT INTO users (user_id, email, name) VALUES (7, '', NULL);
INSERT INTO users (user_id, email, name) VALUES (8, 'Mai@CodeDev.test', 'Mai');
INSERT INTO enrollments VALUES (8, 999, '2026-10-01', 'done');   -- course 999 does not exist
INSERT INTO enrollments VALUES (8, 999, '2026-10-01', 'done');   -- and again`, "schema.sql"),
        p("SQLite accepts every row. Each of them is one of the audit findings. Each of them is also a rule you can state in one sentence, and each sentence maps to one kind of constraint."),

        h2("3. Why the rules belong in the database"),
        p("A constraint is a rule the database checks on **every** insert, update and delete, from **every** client. That is what application validation cannot give you:"),
        bullets([
            "**There is more than one door.** Import scripts, admin tools, migrations, a second service, a developer with a SQL console. Validation in one code path protects that path only.",
            "**Checks in code race each other.** Two requests that both ask \"is this email free?\" can both get \"yes\" and both insert. A UNIQUE constraint decides at the moment of the write, so exactly one wins. Lesson 9 is about this race.",
            "**Code changes, data stays.** A refactor can drop a validation line; the bad rows it lets in remain long after the line is restored.",
        ]),
        p("Keep the application validation too. It runs before the write and can show a friendly message next to the field. The constraint is the last line of defence, and it turns a silent data bug into an error you can see in a log."),
        callout("info", "When not to use a constraint",
            "A constraint should state something that is always true about a row, for every writer. Rules that need other rows or other tables (\"at most 5 active enrollments per learner\"), that depend on who is asking, or that the business changes every month are better kept in application code, or in a trigger if they must be enforced in the database. CHECK expressions cannot contain subqueries, in SQLite or in PostgreSQL."),

        h2("4. NOT NULL, DEFAULT and the empty string"),
        p("`NOT NULL` refuses a missing value. Without it, every column accepts NULL, even if the application never sends one. `DEFAULT` supplies a value when an insert leaves the column out:"),
        code("sql", `
status TEXT NOT NULL DEFAULT 'active'

INSERT INTO enrollments (user_id, course_id, enrolled_at)
VALUES (8, 10, '2026-10-01');            -- ok, status = 'active'

INSERT INTO enrollments (user_id, course_id, enrolled_at, status)
VALUES (8, 11, '2026-10-01', NULL);      -- NOT NULL constraint failed: enrollments.status`, "NOT NULL with a DEFAULT"),
        bullets([
            "`DEFAULT` applies only when the column is **left out**. An explicit NULL is not \"no value\", so the default does not replace it, and `NOT NULL` refuses it.",
            "`NOT NULL` does not refuse an **empty string**. `''` is a value. If an empty email is wrong, say so with a CHECK, as in the next sections.",
        ]),

        h2("5. UNIQUE and PRIMARY KEY"),
        p("`UNIQUE` refuses a second row with the same value; `PRIMARY KEY` is the key you identify rows with (lesson 2), and it is unique too. Both can cover several columns, which is how you say \"one enrollment per learner and course\":"),
        code("sql", `
CREATE TABLE enrollments (
    user_id    INTEGER NOT NULL,
    course_id  INTEGER NOT NULL,
    ...
    PRIMARY KEY (user_id, course_id)       -- the same pair at most once
);`, "a composite key"),
        p("Three details decide whether UNIQUE does what you meant:"),
        bullets([
            "**NULLs are not equal to each other.** A UNIQUE column accepts many NULL values, in SQLite and in PostgreSQL. Add `NOT NULL` when a missing value is not allowed either.",
            "**In an ordinary SQLite table, a composite PRIMARY KEY accepts NULL.** This is a historical quirk that SQLite keeps for compatibility: `(NULL, 10)` is stored without complaint. Write `NOT NULL` on each key column. STRICT and WITHOUT ROWID tables, and PostgreSQL, refuse NULL in a primary key by themselves.",
            "**Text compares with the column's collation.** By default it is BINARY, so `'Mai@CodeDev.test'` and `'mai@codedev.test'` are different values. Declaring the column `TEXT NOT NULL COLLATE NOCASE` makes the UNIQUE constraint ignore case. NOCASE folds only the 26 ASCII letters, which is enough for typical email addresses but not for names in other alphabets.",
        ]),
        callout("info", "The same idea in PostgreSQL",
            "PostgreSQL has no NOCASE collation by default. The usual ways are a unique index on an expression, CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email)), or the citext extension type. SQLite supports the same expression index, so CREATE UNIQUE INDEX ... ON users (lower(email)) works there too."),

        h2("6. CHECK, and how NULL slips through it"),
        p("`CHECK (expression)` refuses a row when the expression is **false**. It is the constraint for allowed values, ranges and formats that one row can decide by itself:"),
        code("sql", `
level   TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
email   TEXT NOT NULL CHECK (instr(email, '@') > 0),
position INTEGER NOT NULL CHECK (position >= 1)`, "typical CHECK constraints"),
        p("The important word is **false**. A comparison with NULL is not false but unknown (NULL), and a CHECK only refuses false. So a CHECK on a nullable column lets NULL through, and the `NOT NULL` next to it is what refuses the missing value. A CHECK also compares exactly: `'Active'` is not in `('active', 'completed', 'cancelled')`, which is what you want for a status the code matches on."),
        h3("Name your constraints"),
        p("A constraint can have a name: `CONSTRAINT enrollments_status_check CHECK (...)`. The name is what you read in the error message at 3 a.m., and what a later migration uses to drop or replace it (lesson 10)."),
        code("text", `
SQLite, named CHECK:       CHECK constraint failed: enrollments_status_check
SQLite, foreign key:       FOREIGN KEY constraint failed
PostgreSQL, named CHECK:   new row for relation "enrollments" violates check constraint
                           "enrollments_status_check"`, "what the errors look like"),
        p("SQLite's foreign key error does not say which key failed, so a clear name matters even more in the rest of the schema. PostgreSQL generates names when you do not give one, such as `enrollments_pkey`, `users_email_key` and `enrollments_course_id_fkey`. Following the same pattern in SQLite keeps both engines readable."),

        h2("7. Foreign keys: on, and with a rule for deletes"),
        p("A foreign key says that a value must exist in another table: `course_id INTEGER NOT NULL REFERENCES courses (course_id)`. It is checked when you insert or update the child row, and when you delete or update the parent row."),
        callout("warning", "SQLite does not enforce foreign keys unless you ask",
            "For backward compatibility, foreign key enforcement in SQLite is off by default and must be turned on for each connection with PRAGMA foreign_keys = ON. The REFERENCES clause is stored in the schema either way, so the table looks protected while every write ignores it. The pragma does nothing inside an open transaction, so run it right after connecting. PostgreSQL always enforces foreign keys."),
        p("The `ON DELETE` clause decides what happens to child rows when the parent row is deleted. Choose it per relationship, from what the data means:"),
        bullets([
            "`NO ACTION` (the default) and `RESTRICT` - refuse to delete a parent that still has children. RESTRICT refuses at once; NO ACTION checks at the end of the statement, or at commit for a deferred constraint.",
            "`CASCADE` - delete the children with the parent. Right for rows that mean nothing without the parent, such as the enrollments of a deleted account. Dangerous on anything you would want to keep.",
            "`SET NULL` / `SET DEFAULT` - keep the child and clear the reference. The column must allow NULL, or have a default that exists in the parent.",
        ]),
        p("For CodeDev: deleting a user removes their enrollments (`ON DELETE CASCADE` on `user_id`), and deleting a course that learners are still enrolled in is refused (`ON DELETE RESTRICT` on `course_id`). That second rule alone would have stopped the cleanup script from the incident."),
        bullets([
            "Index the child column. Child key columns are not indexed automatically, and the SQLite documentation notes that an index on them is almost always beneficial, because every delete of a parent has to search the child table. `PRIMARY KEY (user_id, course_id)` already covers lookups by `user_id`; add `CREATE INDEX enrollments_course_id_idx ON enrollments (course_id)` for course deletes. PostgreSQL does not create this index for you either.",
            "Inspect the keys: `PRAGMA foreign_key_list(enrollments)` lists them, and `PRAGMA foreign_key_check` lists every row that currently breaks one, which is how you find the orphans left from before enforcement was on.",
        ]),
        image("constraints-refuse-bad-rows", {
            alt: "Diagram mapping each finding of the CodeDev data audit to the constraint that refuses it. A user with a NULL name is refused by NOT NULL. A second account Mai@CodeDev.test is refused by UNIQUE with COLLATE NOCASE. An empty email is refused by CHECK (instr(email, '@') > 0). A status 'done' is refused by CHECK status IN (...). An enrollment for course 999 is refused by the foreign key, and deleting a course with enrollments is refused by ON DELETE RESTRICT. A bottom row shows how to verify: PRAGMA foreign_keys returns 1, a bad insert in a test fails, PRAGMA foreign_key_check returns no rows.",
            caption: "Every audit finding is one sentence, and every sentence is one constraint.",
        }),

        h2("8. Type affinity, and STRICT tables at a glance"),
        p("SQLite treats the declared type of a column as a preference, called **type affinity**, not as a rule. A column declared `INTEGER` converts `'12'` to the number 12, but it stores `'abc'` as text without an error. `typeof(column)` shows what was actually stored:"),
        code("sql", `
CREATE TABLE t (n INTEGER);
INSERT INTO t VALUES ('abc');           -- ok
SELECT n, typeof(n) FROM t;             -- abc | text

CREATE TABLE s (n INTEGER) STRICT;
INSERT INTO s VALUES ('abc');           -- cannot store TEXT value in INTEGER column s.n`, "affinity versus STRICT"),
        p("Since SQLite 3.37.0, adding `STRICT` after the closing parenthesis makes the declared type a rule: a value that cannot be converted losslessly is refused. STRICT tables accept only the types `INT`, `INTEGER`, `REAL`, `TEXT`, `BLOB` and `ANY`, and their primary key columns are NOT NULL. PostgreSQL always enforces column types, so this is one of the places where a schema tested only on SQLite can be looser than production."),

        h2("9. Your turn: a schema that refuses bad data"),
        p("Before you write a schema, check two behaviours that surprise most people the first time:"),
        challenge("chal_quiz_sdm_311"),
        p("Now write the schema for `users`, `courses` and `enrollments` so that SQLite itself refuses every kind of bad row from the audit. The runner applies your schema, turns foreign keys on, and replays inserts and deletes one by one: valid rows must still be accepted, and each bad one must be refused by the right kind of constraint."),
        challenge("chal_coding_sdm_312"),

        h2("10. Adding constraints to a table that already has data"),
        p("A new constraint is checked against new writes, and the existing rows must satisfy it too. Clean the data first, using the audit queries from section 1: merge the duplicate accounts, fix or remove the unknown statuses, decide what to do with the orphan enrollments. Then add the constraint."),
        bullets([
            "SQLite's `ALTER TABLE` can rename a table or a column and add or drop a column, but it cannot add a CHECK, UNIQUE, NOT NULL or foreign key constraint to columns that already exist. You create a new table with the constraints, copy the rows, and swap the names. A unique index is the exception: `CREATE UNIQUE INDEX` works on an existing table and fails if duplicates exist.",
            "PostgreSQL can `ALTER TABLE ... ADD CONSTRAINT`, and for large tables it can add a CHECK or foreign key as `NOT VALID` first and validate the existing rows later.",
            "Lesson 10 shows how to do these changes safely on a live database.",
        ]),

        h2("11. How to verify that the schema refuses bad data"),
        bullets([
            "**Read the schema the database has**, not the file you think was applied: `.schema enrollments` in the sqlite3 shell, or `SELECT sql FROM sqlite_schema WHERE name = 'enrollments'`.",
            "**Check enforcement on the connection your app uses**: `PRAGMA foreign_keys` must return 1 there, not only in your console.",
            "**Write a failing insert per rule in your tests**: a NULL name, a duplicate email in another case, a status outside the list, an unknown course, a delete of a course with enrollments. Each must raise an integrity error, and the valid rows next to them must still go in.",
            "**Look for old violations**: `PRAGMA foreign_key_check` and the audit queries from section 1 must return no rows.",
            "**Check the stored types** with `typeof()` when a table is not STRICT.",
        ]),

        h2("12. Pitfalls to recognise in code review"),
        bullets([
            "**A CHECK without NOT NULL.** The CHECK lists the allowed values and NULL still gets in.",
            "**A composite PRIMARY KEY without NOT NULL** in an ordinary SQLite table. `(NULL, 10)` is accepted, and two such rows are not duplicates.",
            "**Case-sensitive uniqueness for case-insensitive data**, such as emails. Use `COLLATE NOCASE`, or a unique index on `lower(email)`, and store a normalized value.",
            "**Foreign keys declared but not enforced**: a connection, script or tool that never runs `PRAGMA foreign_keys = ON`.",
            "**`ON DELETE CASCADE` everywhere \"so deletes work\".** A delete that cascades through courses, lessons, progress and certificates is one typo away from losing data. Refuse by default; cascade only children that mean nothing alone.",
            "**Constraints with generated names in error logs.** Name them, so the message tells you which rule was broken.",
        ]),

        h2("13. Checklist"),
        bullets([
            "Every column that must always have a value is `NOT NULL`, including each column of a composite primary key.",
            "Defaults are declared where the application relies on one, and explicit NULLs are still refused.",
            "Values that must be unique have a UNIQUE constraint or index with the right collation or expression.",
            "Allowed values and ranges are CHECK constraints, combined with NOT NULL, and named.",
            "Every reference is a foreign key with an `ON DELETE` rule chosen for that relationship, and the child column is indexed.",
            "Every SQLite connection runs `PRAGMA foreign_keys = ON`, and a test proves it.",
            "You considered STRICT tables, or check stored types with `typeof()`.",
            "Old data was audited and cleaned before the constraints were added, and `PRAGMA foreign_key_check` returns nothing.",
        ]),

        h2("Sources"),
        bullets([
            "SQLite documentation, \"CREATE TABLE\" (NOT NULL, UNIQUE, CHECK, PRIMARY KEY, DEFAULT) and \"SQLite Foreign Key Support\" - sqlite.org",
            "SQLite documentation, \"Datatypes In SQLite\" (type affinity) and \"STRICT Tables\" - sqlite.org",
            "PostgreSQL documentation, \"Constraints\" (chapter 5, Data Definition) - postgresql.org",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add lesson_progress(user_id, lesson_id, completed_at) to your schema with the constraints you think it needs: which columns are required, what makes a row a duplicate, what should happen to progress when a lesson, a course or a user is deleted, and whether completed_at may be in the future. Write one sentence per rule before writing SQL, then one failing insert per rule, and run them against your schema with PRAGMA foreign_keys = ON. Compare your choice of ON DELETE rules with a teammate's and write down where you disagree and why."),
    ],
});
