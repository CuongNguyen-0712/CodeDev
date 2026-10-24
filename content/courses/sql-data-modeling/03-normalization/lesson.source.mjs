// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sdm-1-3",
    title: "Normalization: when to split a table and when not to",
    slug: { _type: "slug", current: "normalization-when-to-split-a-table-and-when-not-to" },
    description:
        "A course was renamed, and for weeks learners kept seeing the old title: every enrollment row carried its own copy, and the admin report now splits one course into two. Learn the update, insert and delete anomalies that copies cause, first, second and third normal form in plain words on the platform's own tables, how to remove a copy and prove the join is cheap with EXPLAIN QUERY PLAN, and when a copy is a fair trade - a cached count with a clear owner, a reporting table, a snapshot - and what it costs.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, CodeDev learning platform",
        problem:
            "To save a join on the My courses page, an early version of CodeDev copied the course title into every enrollment row: enrollments.course_title. On October 1 the content team renamed course 12 from \"SQL Basics\" to \"SQL & Data Modeling\". The catalog shows the new title, but learners who enrolled earlier still see \"SQL Basics\" on My courses and ask whether they are in the right course. The admin report that groups enrollments by title now shows the same course twice, and a teammate's quick fix updated only the active enrollments, so completed learners still see the old name.",
    },

    content: [
        h2("1. The incident: one course, two titles"),
        p("The My courses page needs each course's title next to the learner's enrollment date. An early developer decided to skip the join and stored the title in the enrollment row when the learner enrolled:"),
        code("sql", `
CREATE TABLE enrollments (
  user_id      INTEGER NOT NULL REFERENCES users(id),
  course_id    INTEGER NOT NULL REFERENCES courses(id),
  course_title TEXT    NOT NULL,          -- copied from courses.title at enrollment
  enrolled_at  TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'active',
  PRIMARY KEY (user_id, course_id)
);`, "schema.sql (before)"),
        p("It worked until the first rename. On October 1, course 12 became \"SQL & Data Modeling\" in `courses`. Nothing told the enrollment rows. Three weeks later:"),
        bullets([
            "Learners who enrolled before October 1 see **\"SQL Basics\"** on My courses and **\"SQL & Data Modeling\"** in the catalog, and open tickets asking which one they are in.",
            "The admin report groups enrollments by `course_title`, so course 12 appears as **two rows**.",
            "A teammate ran a quick fix: `UPDATE enrollments SET course_title = 'SQL & Data Modeling' WHERE course_id = 12 AND status = 'active'`. Completed learners still see the old name.",
        ]),

        h2("2. Reproduce it: find every copy that drifted"),
        p("You can measure the damage with one query. Join each copy to its source and keep the rows where they disagree:"),
        code("sql", `
SELECT e.course_id,
       e.course_title AS copied_title,
       c.title        AS current_title,
       COUNT(*)       AS rows
FROM enrollments AS e
JOIN courses     AS c ON c.id = e.course_id
WHERE e.course_title <> c.title
GROUP BY e.course_id, e.course_title, c.title;`, "drift.sql"),
        code("text", `
course_id | copied_title | current_title       | rows
----------+--------------+---------------------+-----
12        | SQL Basics   | SQL & Data Modeling | 412     <- completed learners the quick fix skipped`, "output"),
        p("The admin report's problem is the same thing seen from the other side: `GROUP BY course_title` treats each spelling as a different course. Group by the key (`course_id`) and the course is one row again."),
        p("The deeper problem is not the 412 rows. It is that the title of course 12 is stored in **hundreds of places**, and every rename, by anyone, through any code path, has to find and change all of them. One forgotten `UPDATE`, one partial `WHERE`, and the database holds two truths. Normalization is the discipline of storing each fact **once**."),

        h2("3. Three anomalies a copy causes"),
        p("Imagine the extreme version: one wide table for everything about enrollments, as you might get from a spreadsheet export."),
        code("text", `
enrollment_sheet
user_id | user_email       | course_id | course_title | course_level | enrolled_at
--------+------------------+-----------+--------------+--------------+------------
3       | anh@codedev.test | 12        | SQL Basics   | beginner     | 2026-09-01
4       | ben@codedev.test | 12        | SQL Basics   | beginner     | 2026-09-02
3       | anh@codedev.test | 13        | Web Basics   | beginner     | 2026-09-03`),
        bullets([
            "**Update anomaly.** One fact (course 12's title, Anh's email) lives in many rows. Changing it means changing all of them; missing one leaves the table contradicting itself. This is the incident.",
            "**Insert anomaly.** A new course with no learners cannot be recorded without inventing a fake enrollment, because every row is an enrollment.",
            "**Delete anomaly.** When Ben's enrollment is the last one in a course and it is deleted, the course's title and level disappear with it.",
        ]),
        p("Each anomaly has the same cause: the table mixes facts about **different things** - users, courses and enrollments - so a change to one thing touches rows that belong to another."),

        h2("4. Normal forms in plain words"),
        p("The normal forms are a checklist for exactly that mix. The first three cover nearly every bug you will meet in application schemas. A popular summary from William Kent's 1983 guide says each non-key column must depend on \"the key, the whole key, and nothing but the key\"."),
        h3("First normal form (1NF): one value per cell"),
        p("Every column holds a single value, and the table has a key. Lesson 1's `courses.student_ids = '3,17,27,70'` broke 1NF: a list hidden in one cell. So do numbered columns such as `lesson_1_done`, `lesson_2_done`."),
        h3("Second normal form (2NF): depend on the whole key"),
        p("This matters when the key has more than one column. `enrollments` is keyed by `(user_id, course_id)`. Ask of each other column: does it need **both** parts of the key?"),
        bullets([
            "`enrolled_at` - yes. It is a fact about this learner in this course.",
            "`status` - yes, for the same reason.",
            "`course_title` - **no**. It depends on `course_id` alone; every learner of course 12 has the same value. That partial dependency is the 2NF violation behind the incident.",
            "A `user_email` column would fail the same way, depending on `user_id` alone.",
        ]),
        h3("Third normal form (3NF): nothing but the key"),
        p("A non-key column must not depend on **another non-key column**. Suppose `courses` had `instructor_id` and `instructor_name`. The name depends on the instructor, not on the course: rename the instructor and every one of their courses must change. Move the name to `users` (or an `instructors` table) and keep only `instructor_id` in `courses`."),
        callout("info", "How to check a column in ten seconds",
            "Ask: \"If I know the key of this row, do I know this value - and do I need all of the key, and nothing else, to know it?\" If the value is decided by part of the key (2NF) or by another column (3NF), it belongs in the table where that part or that column is the key."),
        challenge("chal_quiz_sdm_131"),

        h2("5. The fix: join, do not copy"),
        p("The title has one home: `courses.title`. My courses reads it with a join on the primary key:"),
        code("sql", `
SELECT c.id, c.title, e.enrolled_at, e.status
FROM enrollments AS e
JOIN courses     AS c ON c.id = e.course_id
WHERE e.user_id = 3
ORDER BY e.enrolled_at DESC;`, "my_courses.sql"),
        p("The copy existed to \"save a join\". Check whether that join actually costs anything before believing it:"),
        code("text", `
EXPLAIN QUERY PLAN <the query above>

SEARCH e USING INDEX sqlite_autoindex_enrollments_1 (user_id=?)
SEARCH c USING INTEGER PRIMARY KEY (rowid=?)`, "sqlite3"),
        p("Both steps are `SEARCH`, not `SCAN`: SQLite finds the learner's enrollments through the primary key index, then looks up each course directly by its rowid. A join on a primary key is one of the cheapest operations a database does. (Without a usable index you would see `SCAN` instead: SQLite would read the whole table.)"),
        p("Removing the column safely takes four steps, in this order, because old code may still be running while new code ships:"),
        numbered([
            "Deploy code that **reads** the title through the join and no longer reads `enrollments.course_title`. It still writes the column.",
            "Relax the column so inserts work without it: drop its `NOT NULL`. PostgreSQL does this with `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL`; SQLite cannot change a column's constraints in place and needs a table rebuild (lesson 10).",
            "Deploy code that **stops writing** it.",
            "Drop the column: `ALTER TABLE enrollments DROP COLUMN course_title;` (SQLite 3.35.0 or later). Lesson 10 covers this ordering in detail.",
        ]),
        p("Verify the result the same way the bug was found. The drift query cannot run any more, because there is nothing left to drift. Rename a course on a copy of the database and reload My courses: every learner sees the new title at once. Group the admin report by `course_id`, and join to `courses` for the label."),
        image("normalize-title", {
            alt: "Before and after. On the left, in red: enrollments rows each carry a course_title copy; after the rename on October 1, 412 rows still say SQL Basics while courses says SQL & Data Modeling, and the report grouped by title shows course 12 twice. On the right, in green: the title is stored once in courses, enrollments keep only course_id, and My courses joins them; EXPLAIN QUERY PLAN shows two SEARCH steps. A bottom strip shows the fair kinds of copies: a cached count kept by a trigger and checked by a reconcile query, a rebuilt reporting table, and a certificate snapshot that is never updated on purpose.",
            caption: "Store each fact once. A copy is only acceptable when it has an owner that keeps it right, or when it is meant to stay frozen.",
        }),

        h2("6. When a copy is the right call"),
        p("Normalization is the default, not a religion. **Denormalizing** - storing a derived or duplicated value on purpose - is fine when three things are true: a measured reason, a single owner that keeps the copy correct, and a way to check it."),
        h3("A cached count with a clear owner"),
        p("The catalog shows a learner count on every course card, for every visitor. Counting `enrollments` per card on each page view may be measurably slow on a large table. A cached `courses.enrollment_count` is a reasonable trade - if the database itself keeps it right:"),
        code("sql", `
ALTER TABLE courses ADD COLUMN enrollment_count INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER enrollments_count_ins AFTER INSERT ON enrollments
BEGIN
  UPDATE courses SET enrollment_count = enrollment_count + 1 WHERE id = NEW.course_id;
END;

CREATE TRIGGER enrollments_count_del AFTER DELETE ON enrollments
BEGIN
  UPDATE courses SET enrollment_count = enrollment_count - 1 WHERE id = OLD.course_id;
END;`, "cached_count.sql"),
        p("The trigger runs in the same transaction as the insert or delete, so the count and the rows change together, whichever code path wrote them. Then prove it stays right with a **reconcile query** that a scheduled job or a test runs; it must return no rows:"),
        code("sql", `
SELECT c.id, c.enrollment_count, COUNT(e.user_id) AS actual
FROM courses AS c
LEFT JOIN enrollments AS e ON e.course_id = c.id
GROUP BY c.id
HAVING c.enrollment_count <> COUNT(e.user_id);`, "reconcile.sql"),
        h3("Reporting tables"),
        p("Analytics queries that join five tables over millions of rows can read from a separate table rebuilt from the source every night. It is a copy, and everyone knows it: it is read-only, rebuilt rather than edited, and carries a `built_at` column so readers know how stale it is."),
        h3("Snapshots are not copies"),
        p("A certificate must show the course title **as it was when the learner finished**, even after a rename. That is a different fact - a historical one - and it should be stored. Name it for what it is, such as `certificates.course_title_at_issue`, and never \"sync\" it. The incident's column was the opposite: it pretended to be the current title."),
        p("The cost of every real copy is the same: more writes, one more thing that can drift, and a reconcile query someone has to own. If you cannot name the owner of a copy, do not add it."),

        h2("7. Pitfalls"),
        bullets([
            "**Fixing the data, not the design.** A one-time `UPDATE` repairs today's rows; the next rename drifts again. Remove the copy or give it an owner.",
            "**Grouping or joining by a name instead of a key.** Titles and emails change and collide. Group by `course_id`, and show the title.",
            "**Denormalizing on a hunch.** Run `EXPLAIN QUERY PLAN` and time the query first. Most \"expensive joins\" are a missing index.",
            "**Copies maintained only in application code.** A second code path, a migration or a manual fix will skip it. Prefer a trigger or the same transaction, plus a reconcile query.",
            "**Over-splitting.** Splitting a 1:1 table or every attribute into its own table is not more normal; it is just more joins. Stop when each fact has one home.",
        ]),

        h2("8. Checklist"),
        bullets([
            "Every non-key column depends on the key, the whole key and nothing but the key.",
            "Reports group and join by keys, never by names.",
            "Before adding a copy for speed, I measured the query and checked its plan.",
            "Every intentional copy has one owner (a trigger or the same transaction) and a reconcile query that returns no rows.",
            "Historical values that must not change are named as snapshots and never synced.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Take this table and bring it to 3NF: lesson_progress(user_id, lesson_id, completed_at, user_email, lesson_title, course_id, course_title). For each column, write the key it really depends on. Create the tables in sqlite3, load five rows, and write the query that rebuilds the original wide view with joins. Then add a cached lessons_completed count to enrollments, keep it with a trigger, and write its reconcile query."),

        h2("Sources"),
        bullets([
            "E. F. Codd, \"A Relational Model of Data for Large Shared Data Banks\", Communications of the ACM, 1970 (normalization and redundancy).",
            "William Kent, \"A Simple Guide to Five Normal Forms in Relational Database Theory\", Communications of the ACM, 1983.",
            "SQLite documentation: \"EXPLAIN QUERY PLAN\", \"CREATE TRIGGER\" and \"ALTER TABLE\" (DROP COLUMN).",
        ]),
    ],
});
