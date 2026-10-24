// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sdm-1-2",
    title: "How to choose primary and foreign keys",
    slug: { _type: "slug", current: "how-to-choose-primary-and-foreign-keys" },
    description:
        "An admin deleted a retired course and the database said yes, although learners were still enrolled: their My courses page broke and the enrollment report stopped adding up. The schema had a REFERENCES clause, and SQLite ignored it. Learn what makes a good primary key, natural vs surrogate keys and why an email is a poor one, INTEGER PRIMARY KEY and rowid in SQLite, UUID and ULID trade-offs, composite keys for join tables, and foreign keys with ON DELETE RESTRICT, CASCADE and SET NULL - switched on and proven with a failing DELETE.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, CodeDev learning platform",
        problem:
            "While cleaning up old content, an admin deleted the retired course \"Docker Basics\" (id 21) from the admin panel. The DELETE succeeded. Since then, the 38 learners who were still enrolled in it get an error on their My courses page, the enrollment report counts 38 enrollments that belong to no course, and a teammate asks how this was possible: enrollments.course_id is declared with REFERENCES courses(id). The application talks to SQLite, and nobody has checked whether foreign keys are enforced on its connection.",
    },

    content: [
        h2("1. The incident: a course deleted under its learners"),
        p("The admin panel has a Delete button on each course. An admin used it on \"Docker Basics\", retired months ago. The next morning, two tickets:"),
        bullets([
            "**\"My courses is broken.\"** Learners who were enrolled in Docker Basics see an error page. The server log shows the same line for each of them: `TypeError: Cannot read properties of undefined (reading 'title')` - the code found an enrollment and then no course for it.",
            "**\"The numbers do not add up.\"** The total in the enrollment report is 38 higher than the sum of the per-course rows.",
        ]),
        p("The teammate who designed the schema is surprised. The table says, in plain SQL, that every enrollment points at a course:"),
        code("sql", `
CREATE TABLE enrollments (
  user_id     INTEGER NOT NULL REFERENCES users(id),
  course_id   INTEGER NOT NULL REFERENCES courses(id),
  enrolled_at TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'active',
  PRIMARY KEY (user_id, course_id)
);`, "schema.sql"),

        h2("2. Reproduce it: ask SQLite what it enforces"),
        p("Open a copy of the database with `sqlite3` and repeat the admin's action:"),
        code("sql", `
sqlite> PRAGMA foreign_keys;
0
sqlite> DELETE FROM courses WHERE id = 21;
sqlite> SELECT changes();
1
sqlite> SELECT COUNT(*) FROM enrollments WHERE course_id = 21;
38`, "sqlite3 codedev-copy.db"),
        p("`PRAGMA foreign_keys` returns `0`: enforcement is **off**. SQLite parses the `REFERENCES` clause and stores it, but checks it only when foreign key support is switched on - and for backwards compatibility it is off by default, on **every new connection**, unless SQLite was compiled with a different default. The application never switched it on. Two queries show the damage:"),
        code("sql", `
-- enrollments whose course no longer exists ("orphans")
SELECT e.user_id, e.course_id
FROM enrollments AS e
LEFT JOIN courses AS c ON c.id = e.course_id
WHERE c.id IS NULL;

-- SQLite's own check: one row per violating child row (table, rowid, parent, fk index)
PRAGMA foreign_key_check(enrollments);`, "find_orphans.sql"),
        p("Both list the 38 enrollments of course 21. The rest of this lesson is about choosing the keys that make such links possible, and then making the database guard them."),

        h2("3. What a primary key is for"),
        p("A **primary key** identifies one row, so that other rows can point at it. Every reference to a course, in every table and in every URL and log line, carries that value. That gives three requirements:"),
        bullets([
            "**Unique and never NULL.** Two rows with the same key cannot be told apart.",
            "**Stable.** If a key changes, every row that points at it must change too, in the same transaction, or the link breaks.",
            "**Small and simple.** It is copied into every referencing table and every index on those tables.",
        ]),
        h3("Natural or surrogate?"),
        p("A **natural key** is a value that already exists in the domain: a user's email, a course's title. A **surrogate key** is a value the database invents only to identify the row: `id = 21`."),
        p("Email looks like a perfect natural key for users: it is unique and the user types it at login. It fails the stability rule. People change jobs, fix typos, and move from a school address to a personal one. With `users.email` as the primary key, an email change means updating `enrollments`, `lesson_progress` and every other table that stores it - and any table someone forgot keeps pointing at the old address. Uniqueness is fragile too: is `Anh@Example.com` the same user as `anh@example.com`?"),
        p("The usual answer: give each entity a surrogate primary key, and keep the natural identifier as an ordinary column with its own uniqueness rule (`email TEXT NOT NULL UNIQUE`, lesson 7). The email can then change in one row, and nothing else moves. A natural key is reasonable only when the value truly never changes and a trusted authority assigns it; even then, many teams use a surrogate anyway because it is cheaper to join on."),

        h2("4. Surrogate keys in SQLite: INTEGER PRIMARY KEY and rowid"),
        p("Every ordinary SQLite table has a hidden 64-bit integer key called the **rowid**. A column declared exactly as `INTEGER PRIMARY KEY` becomes an **alias** for the rowid: no extra index, and SQLite picks a value when you insert without one. The spelling matters:"),
        code("sql", `
CREATE TABLE a (id INTEGER PRIMARY KEY, title TEXT);
CREATE TABLE b (id INT PRIMARY KEY,     title TEXT);

INSERT INTO a (title) VALUES ('x');
INSERT INTO b (title) VALUES ('x');

SELECT rowid, id FROM a;   -- 1 | 1      id is the rowid
SELECT rowid, id FROM b;   -- 1 | NULL   id is a separate column, and it is NULL`, "rowid_alias.sql"),
        p("`INT PRIMARY KEY` is **not** an alias, and because of a long-standing SQLite quirk a non-integer primary key column may even hold NULL unless you also write `NOT NULL`. Write `INTEGER PRIMARY KEY` and check it with the query above."),
        bullets([
            "Without `AUTOINCREMENT`, a new row gets one more than the largest rowid in the table, so after deleting the newest row its id can be handed out again. Add `AUTOINCREMENT` only if ids must never be reused (for example because they appear in old exported files); the SQLite docs advise against it otherwise because it costs extra work on every insert.",
            "In PostgreSQL the equivalent is `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (or the older `serial` types).",
        ]),
        h3("UUID and ULID at a glance"),
        p("Sometimes ids must be created outside the database: by a mobile app working offline, or by several services that merge their data. Then a **UUID** (128 bits, standardised in RFC 9562) or a **ULID** (128 bits, a community specification) is the usual choice."),
        bullets([
            "**For:** ids can be generated anywhere without asking the database; they do not reveal how many rows exist; rows from different databases do not collide.",
            "**Against:** 16 bytes as binary, 36 characters as text, against at most 8 bytes for an integer - in every referencing column and index. Fully random ids (UUID version 4) land at random places in the primary key index, which makes inserts on large tables slower than appending at the end.",
            "**Middle ground:** time-ordered ids - UUID version 7 or ULID - start with a timestamp, so new rows still land near the end of the index.",
            "In SQLite, a `TEXT` or `BLOB` primary key is a separate unique index next to the hidden rowid. For a beginner project with one database, `INTEGER PRIMARY KEY` is the simplest correct choice.",
        ]),

        h2("5. Composite keys for join tables"),
        p("A join table already has a natural identity: the pair. One learner, one course, one enrollment. Making the pair the primary key states that rule in the schema:"),
        code("sql", `
-- PRIMARY KEY (user_id, course_id) from the schema above
INSERT INTO enrollments (user_id, course_id, enrolled_at) VALUES (3, 12, '2026-10-01 09:00:00');
INSERT INTO enrollments (user_id, course_id, enrolled_at) VALUES (3, 12, '2026-10-01 09:00:01');
-- Error: UNIQUE constraint failed: enrollments.user_id, enrollments.course_id`, "composite_key.sql"),
        bullets([
            "The key's index is ordered by `user_id` first, so \"courses of learner 3\" is fast. \"Learners of course 12\" is not covered by it: add `CREATE INDEX idx_enrollments_course ON enrollments(course_id);`. The SQLite docs recommend indexing child key columns because every delete of a parent row has to search them.",
            "A surrogate `id` on the join table is fine, for example if other tables must point at one enrollment. Then keep `UNIQUE (user_id, course_id)` as well, or nothing stops duplicates.",
            "What happens when two requests insert the same pair at the same moment is the subject of lesson 9.",
        ]),

        h2("6. Foreign keys: making the link a rule"),
        p("`course_id INTEGER NOT NULL REFERENCES courses(id)` says: every value in this **child** column must exist as `id` in the **parent** table. With enforcement on, the database checks it on every insert and update of the child, and on every delete and key update of the parent."),
        code("sql", `
PRAGMA foreign_keys = ON;      -- per connection, outside any transaction
PRAGMA foreign_keys;           -- 1: now enforced

INSERT INTO enrollments (user_id, course_id, enrolled_at) VALUES (3, 999, '2026-10-01');
-- Error: FOREIGN KEY constraint failed        (no course 999)

DELETE FROM courses WHERE id = 12;
-- Error: FOREIGN KEY constraint failed        (course 12 still has enrollments)`, "enforced.sql"),
        bullets([
            "The pragma is a **per-connection** setting. Run it every time the application opens a connection, in the same place that opens it, and in your test setup. Most SQLite drivers and ORMs have an option or a hook for this; check yours rather than assuming.",
            "Inside an open transaction the pragma does nothing. Set it before `BEGIN`.",
            "Switching it on does **not** check rows that are already there. Run `PRAGMA foreign_key_check;` to find existing violations.",
            "PostgreSQL always enforces declared foreign keys; there is no switch. Like SQLite, it does not create an index on the child column for you.",
        ]),

        h2("7. ON DELETE: what should happen to the children?"),
        p("When a parent row is deleted while children still point at it, the foreign key's `ON DELETE` action decides what happens. This is a business decision, not a technical one:"),
        image("on-delete-actions", {
            alt: "Deleting course 21, which still has enrollments. Top, in red: with PRAGMA foreign_keys off, the DELETE succeeds and 38 enrollments point at nothing. Below, four outcomes with enforcement on: NO ACTION or RESTRICT refuses the DELETE with FOREIGN KEY constraint failed, and the enrollments stay; CASCADE deletes the course and its 38 enrollments; SET NULL tries to set course_id to NULL and fails because the column is NOT NULL; the recommended fix, in green, keeps RESTRICT and archives the course instead of deleting it.",
            caption: "Only the first row is a bug. The other four are choices: decide which one matches what the business wants to keep.",
        }),
        bullets([
            "**NO ACTION** (the default when you write nothing) and **RESTRICT** - refuse the delete while children exist. The two differ only for deferred constraints: RESTRICT refuses immediately, NO ACTION checks at the end of the statement (or at commit, if deferred).",
            "**CASCADE** - delete the children too. Right when the children have no meaning without the parent and nobody needs them afterwards: the lessons of a draft course that never had learners.",
            "**SET NULL** - keep the children and clear the reference. Right for **optional** relationships: `courses.instructor_id` when an instructor's account is removed. It fails on a `NOT NULL` column, as it would on `enrollments.course_id` (`NOT NULL constraint failed`).",
            "**SET DEFAULT** - like SET NULL, with the column's default value, which must itself exist in the parent.",
        ]),
        p("For enrollments, CASCADE would have \"fixed\" the error page by deleting 38 learners' enrollments, their certificates' basis and their place in every report - silently. The history is the valuable part. The right rule is RESTRICT, and a retired course is **archived** (`status = 'archived'`, hidden from the catalog), not deleted."),
        challenge("chal_quiz_sdm_121"),

        h2("8. The fix, and how to prove it"),
        numbered([
            "**Switch enforcement on** in the code that opens every connection: run `PRAGMA foreign_keys = ON` right after connecting, and add a startup check that reads `PRAGMA foreign_keys` and refuses to start if it returns 0.",
            "**Repair the existing data.** Restore the course row from the last backup with its original id 21 and `status = 'archived'`, so the 38 enrollments point at a real course again. Then `PRAGMA foreign_key_check;` must return no rows.",
            "**Make the rule explicit.** Declare `REFERENCES courses(id) ON DELETE RESTRICT` on `enrollments.course_id` and `lesson_progress.lesson_id`. In SQLite, changing a foreign key on an existing table means rebuilding the table; lesson 10 shows how to do that safely.",
            "**Change the admin action** from Delete to Archive for courses that have ever had a learner.",
        ]),
        p("Then write the proof as a test that runs against a fresh database with the application's real connection setup:"),
        code("sql", `
-- test: a course with enrollments cannot be deleted
INSERT INTO courses (id, title) VALUES (900, 'Test course');
INSERT INTO users (id, email) VALUES (900, 'test900@codedev.test');
INSERT INTO enrollments (user_id, course_id, enrolled_at) VALUES (900, 900, '2026-10-01');
DELETE FROM courses WHERE id = 900;
-- expected: Error: FOREIGN KEY constraint failed`, "fk_enforced.test.sql"),
        p("If this test ever passes the DELETE, enforcement was switched off somewhere - a new connection pool, a new driver, a migration tool that opens its own connection - and you learn it in CI, not from learners."),
        callout("info", "Practice on your own (not graded)",
            "Write down the ON DELETE action you would choose for each foreign key in the platform: lessons.course_id, lesson_progress.user_id, lesson_progress.lesson_id, courses.instructor_id and enrollments.user_id (a learner asks for their account to be deleted). For each, say what the business wants to keep. Then build the schema in sqlite3 with PRAGMA foreign_keys = ON and check each choice with one DELETE."),

        h2("9. Pitfalls"),
        bullets([
            "**Trusting REFERENCES in SQLite without the pragma.** Check with `PRAGMA foreign_keys;` on the application's own connection, not in your terminal session.",
            "**Mutable natural keys.** Email, username or title as a primary key turns one edit into a multi-table update. Use a surrogate key and a UNIQUE column.",
            "**`INT PRIMARY KEY` instead of `INTEGER PRIMARY KEY`.** It is not a rowid alias. Insert a row without an id and look.",
            "**CASCADE by reflex.** It makes the error go away by deleting data. Ask what the children mean without the parent before choosing it.",
            "**Join table without a uniqueness rule.** A surrogate `id` alone lets the same learner enroll twice. Keep the pair unique.",
            "**No index on the child column.** Deletes and joins from the parent side scan the whole child table.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every table has a stable, non-NULL primary key; natural identifiers are UNIQUE columns, not keys.",
            "SQLite surrogate keys are spelled `INTEGER PRIMARY KEY`.",
            "Join tables use the pair as the key (or keep it UNIQUE next to a surrogate id).",
            "`PRAGMA foreign_keys` returns 1 on the application's connections, and a test proves a referenced parent cannot be deleted.",
            "Every foreign key has an ON DELETE action chosen on purpose, and `PRAGMA foreign_key_check` returns no rows.",
        ]),

        h2("Sources"),
        bullets([
            "SQLite documentation: \"SQLite Foreign Key Support\" (enabling support with PRAGMA foreign_keys, ON DELETE and ON UPDATE actions, indexing child keys).",
            "SQLite documentation: \"CREATE TABLE\", section \"ROWIDs and the INTEGER PRIMARY KEY\", and \"SQLite Autoincrement\".",
            "PostgreSQL documentation: \"Constraints\" (foreign keys and referential actions) and RFC 9562, \"Universally Unique IDentifiers (UUIDs)\" (versions 4 and 7).",
        ]),
    ],
});
