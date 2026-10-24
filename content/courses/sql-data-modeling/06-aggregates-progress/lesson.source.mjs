// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sdm-2-3",
    title: "GROUP BY & aggregates: progress per course",
    slug: { _type: "slug", current: "group-by-aggregates-progress-per-course" },
    description:
        "The new \"My courses\" page hides a course a learner just joined, shows 4 of 3 lessons done and 0% for almost every course. Learn how GROUP BY turns rows into groups, what COUNT(*), COUNT(column) and COUNT(DISTINCT column) really count, how NULL behaves in aggregates, when to filter with WHERE and when with HAVING, and how to compute a percentage in SQLite without integer division or division by zero.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, CodeDev learning platform",
        problem:
            "A release rewrote the query behind the \"My courses\" page, which shows one card per enrolled course with a progress bar. Since then, a learner who joined Docker Basics yesterday has no Docker card at all, a learner who clicked \"Mark as complete\" twice sees \"4 of 3 lessons\", and almost every course shows 0% even when most of its lessons are done. Nobody changed the data; only the query changed.",
    },

    content: [
        h2("1. The incident: a progress page that cannot count"),
        p("The \"My courses\" page shows one card per course the learner is enrolled in: the title, \"2 of 3 lessons\" and a progress bar. The release replaced the old code with one SQL query, written in a hurry:"),
        code("sql", `
-- progress.sql (release 2026.10)
SELECT c.course_id,
       c.title,
       COUNT(lp.lesson_id) AS completed_lessons,
       (SELECT COUNT(*) FROM lessons WHERE lessons.course_id = c.course_id) AS total_lessons,
       COUNT(lp.lesson_id)
         / (SELECT COUNT(*) FROM lessons WHERE lessons.course_id = c.course_id) * 100 AS percent
FROM lesson_progress AS lp
JOIN lessons AS l ON l.lesson_id = lp.lesson_id
JOIN courses AS c ON c.course_id = l.course_id
WHERE lp.user_id = ?
GROUP BY c.course_id;`, "progress.sql"),
        p("It runs, it returns rows, and the page renders. Three reports arrive the next day:"),
        bullets([
            "A learner who joined **Docker Basics** yesterday and has not finished a lesson yet has no Docker card at all.",
            "A learner who clicked \"Mark as complete\" twice on the same lesson sees **4 of 3 lessons**.",
            "Almost every course shows **0%**, even one where the learner has finished 2 of 3 lessons. Only fully finished courses show 100%.",
        ]),
        p("Each symptom has a different cause, and all three are about how SQL groups and counts rows. To fix them, you need to see the rows the query groups, not only the result."),

        h2("2. Reproduce it with a small data set"),
        p("Take one learner, Mai (`user_id = 1`), and three courses. SQL Basics has 3 lessons (101, 102, 103), Docker Basics has 4 (201 to 204), and Kubernetes Basics was just created and has no lessons yet. Mai is enrolled in all three. She finished lessons 101 and 102, and lesson 102 was saved twice because of the double click."),
        code("sql", `
INSERT INTO enrollments (user_id, course_id, enrolled_at, status) VALUES
  (1, 10, '2026-09-01 10:00:00', 'active'),   -- SQL Basics
  (1, 20, '2026-10-20 18:30:00', 'active'),   -- Docker Basics
  (1, 40, '2026-10-21 09:00:00', 'active');   -- Kubernetes Basics, no lessons yet

INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES
  (1, 101, '2026-09-03 20:10:00'),
  (1, 102, '2026-09-05 21:00:00'),
  (1, 102, '2026-09-05 21:00:01');           -- the double click`, "seed.sql"),
        p("Run the release query with `user_id = 1`:"),
        code("text", `
course_id  title       completed_lessons  total_lessons  percent
10         SQL Basics  3                  3              100`, "sqlite3"),
        p("One row. Docker and Kubernetes are gone, SQL Basics says 3 of 3 although Mai finished 2 different lessons, and because 3 / 3 is 1, the bar is full. With only one double click less, it would be 2 / 3 = 0, and the bar would be empty. Every symptom from the reports is here."),

        h2("3. How GROUP BY turns rows into groups"),
        p("SQL evaluates a grouped query in a fixed logical order: `FROM` and the joins build rows, `WHERE` removes rows, `GROUP BY` puts the remaining rows into groups, aggregates compute one value per group, `HAVING` removes groups, and `SELECT` produces **one output row per group**. The most useful debugging habit follows from that order: **look at the rows before you group them.** Remove `GROUP BY` and the aggregates, and select the raw columns:"),
        code("sql", `
SELECT c.course_id, l.lesson_id, lp.lesson_id AS finished_lesson
FROM lesson_progress AS lp
JOIN lessons AS l ON l.lesson_id = lp.lesson_id
JOIN courses AS c ON c.course_id = l.course_id
WHERE lp.user_id = 1;

-- course_id  lesson_id  finished_lesson
-- 10         101        101
-- 10         102        102
-- 10         102        102     <- the duplicate progress row`, "the rows behind the result"),
        p("Now both bugs are visible. The rows start from `lesson_progress`, so a course appears only if Mai finished at least one of its lessons: Docker and Kubernetes never had a row to group. And the duplicate progress row is a third row in the SQL Basics group, so a count of rows says 3."),
        h3("The rule for the SELECT list"),
        p("In a grouped query, each selected expression must have **one value per group**: either it is in `GROUP BY`, or it is inside an aggregate such as `COUNT`, `SUM` or `MAX`."),
        bullets([
            "**PostgreSQL** enforces this. Selecting a column that is neither grouped nor aggregated fails with an error saying it must appear in the GROUP BY clause or be used in an aggregate function. One exception: if you group by a table's primary key, PostgreSQL lets you select the other columns of that table, because they have one value per key.",
            "**SQLite** accepts such \"bare\" columns and takes the value from some row of the group. When the column has the same value on every row of the group (like `c.title` when you group by `c.course_id`), that is harmless. When it does not, you get an arbitrary value and no error.",
        ]),
        p("To stay portable and readable, group by every non-aggregated column you select: `GROUP BY c.course_id, c.title`. It returns the same groups, because a course id has exactly one title."),

        h2("4. What COUNT really counts, and what NULL does to aggregates"),
        p("There are three forms of `COUNT`, and the incident needs all three to be told apart:"),
        bullets([
            "`COUNT(*)` counts **rows** in the group, whatever they contain.",
            "`COUNT(column)` counts rows where that column is **not NULL**.",
            "`COUNT(DISTINCT column)` counts **different non-NULL values** of that column.",
        ]),
        p("The difference shows up as soon as a join adds NULLs or repeats a row. Take the SQL Basics group above with one extra row for lesson 103, which Mai has not finished:"),
        code("text", `
lesson_id  finished_lesson
101        101
102        102
102        102
103        NULL

COUNT(*)                         -> 4   rows
COUNT(finished_lesson)           -> 3   rows with a value (the duplicate counts twice)
COUNT(DISTINCT finished_lesson)  -> 2   different lessons finished
COUNT(DISTINCT lesson_id)        -> 3   different lessons in the course`, "one group, four counts"),
        p("The other aggregates follow the same NULL rule: `SUM`, `AVG`, `MIN` and `MAX` ignore NULL values. That has consequences worth remembering:"),
        bullets([
            "`AVG(score)` over the values 80, NULL and 100 is 90, not 60: the NULL row is left out of both the sum and the count.",
            "`SUM` over a group where every value is NULL (or over no rows at all) returns **NULL**, not 0. `COUNT` returns 0. SQLite also has `TOTAL()`, which returns 0.0 instead of NULL; PostgreSQL does not have it, so `COALESCE(SUM(x), 0)` is the portable form.",
            "A LEFT JOIN that finds no match still produces **one row** for the left side, with NULL in every column of the right side. `COUNT(*)` counts that row; `COUNT(right_table.column)` does not.",
        ]),
        callout("warning", "COUNT(DISTINCT) is a guard, not a fix",
            "COUNT(DISTINCT lp.lesson_id) makes the page correct even when a lesson was saved twice. It does not explain why the duplicate exists, and every other query that reads lesson_progress still double counts. The real fix is a UNIQUE (user_id, lesson_id) constraint, which lesson 7 adds, and handling the double click without a race, which is lesson 9. Use DISTINCT when duplicates are legitimate in the joined rows, not to hide bad data."),
        p("Before you go on, check how these rules apply to two results from the incident:"),
        challenge("chal_quiz_sdm_231"),

        h2("5. Start from the table that defines the rows you want"),
        p("The page shows one card per **enrollment**, so the query should start from `enrollments`, not from `lesson_progress`. Every enrolled course then has at least one row, and the other tables are attached with `LEFT JOIN` so that a missing match keeps the row instead of dropping it:"),
        bullets([
            "`enrollments` - one row per course the learner joined. This decides which cards exist.",
            "`courses` - always exists for an enrollment, so a plain `JOIN` is fine (lesson 7 makes sure of that with a foreign key).",
            "`lessons` - a course may have none yet, so `LEFT JOIN`.",
            "`lesson_progress` - most lessons are not finished, so `LEFT JOIN`.",
        ]),
        h3("A condition on the right table goes in ON, not in WHERE"),
        p("The progress rows must belong to the same learner. Where you write that condition changes the result completely:"),
        code("sql", `
-- Keeps unfinished lessons: the condition is part of the match
LEFT JOIN lesson_progress AS lp
  ON lp.lesson_id = l.lesson_id
 AND lp.user_id = e.user_id

-- Loses them: WHERE runs after the join and NULL = 1 is not true
LEFT JOIN lesson_progress AS lp ON lp.lesson_id = l.lesson_id
WHERE lp.user_id = 1`, "ON versus WHERE"),
        p("In the second form, the rows the LEFT JOIN kept for unfinished lessons have `lp.user_id` NULL. `WHERE` keeps a row only when its condition is true, and `NULL = 1` is unknown, so those rows disappear and the LEFT JOIN behaves like an inner join. A course with no finished lesson vanishes again. The same applies to any filter on `lesson_progress`, for example one on `completed_at`. Lesson 5 covers the rows a join keeps and loses in more detail."),
        image("progress-group-by-rows", {
            alt: "Diagram of Mai's progress query. On the left, the rows after joining enrollments, courses, lessons and lesson_progress with LEFT JOINs: four rows for SQL Basics (lessons 101, 102 twice, 103 with NULL progress), four rows for Docker Basics with NULL progress, and one all-NULL row for Kubernetes Basics, which has no lessons. On the right, the grouped result per course comparing COUNT(*) with COUNT(DISTINCT lesson) and COUNT(DISTINCT finished lesson): SQL Basics 4 rows, 3 lessons, 2 finished; Docker Basics 4 rows, 4 lessons, 0 finished; Kubernetes Basics 1 row, 0 lessons, 0 finished. A bottom row lists three checks: look at the rows before grouping, compare the number of result rows with the number of enrollments, recount one course by hand.",
            caption: "Group the rows you meant to produce, then count values, not rows.",
        }),

        h2("6. WHERE or HAVING?"),
        p("Both filter, at different moments. `WHERE` removes **rows** before they are grouped; `HAVING` removes **groups** after the aggregates are computed, so it is the only place where a condition on `COUNT(...)` or `SUM(...)` can go."),
        code("sql", `
-- Courses where more than 20 learners have finished at least one lesson
SELECT l.course_id, COUNT(DISTINCT lp.user_id) AS active_learners
FROM lesson_progress AS lp
JOIN lessons AS l ON l.lesson_id = lp.lesson_id
WHERE lp.completed_at IS NOT NULL            -- row condition: before grouping
GROUP BY l.course_id
HAVING COUNT(DISTINCT lp.user_id) > 20;      -- group condition: after grouping`, "WHERE and HAVING together"),
        bullets([
            "A condition on a single row's columns belongs in `WHERE`. It removes rows early, so less work is grouped, and readers see at once that it is a row filter.",
            "A condition on an aggregate belongs in `HAVING`. `WHERE COUNT(*) > 20` is an error, because the count does not exist yet when `WHERE` runs.",
            "When not to use HAVING: for the progress page you want every enrolled course, including those at 0%. A `HAVING COUNT(lp.lesson_id) > 0` added \"to clean up the output\" would bring the incident back.",
        ]),

        h2("7. A percentage that is right in SQLite"),
        p("The last symptom is arithmetic. In SQLite, when both operands are integers, `/` is **integer division**: the fraction is dropped. `COUNT` returns an integer, so `completed / total * 100` computes `2 / 3 = 0` first and then `0 * 100 = 0`. Three ways out, with different results:"),
        code("sql", `
SELECT 2 / 3 * 100;                       -- 0      divides first, the fraction is already gone
SELECT 2 * 100 / 3;                       -- 66     multiplies first, then integer division
SELECT 2 * 100.0 / 3;                     -- 66.666...  a REAL operand makes it real division
SELECT ROUND(2 * 100.0 / 3);              -- 67.0   rounded to the nearest, as a REAL
SELECT CAST(2 * 100.0 / 3 AS INTEGER);    -- 66     CAST to INTEGER drops the fraction`, "sqlite3"),
        p("Decide which number the product wants before you pick a formula. A bar that rounds 199 of 200 up to 100% tells the learner they are done when they are not, so the progress page rounds down. For non-negative values, integer division already rounds down, so multiplying by 100 first is the simplest correct choice."),
        h3("Division by zero: NULL in SQLite, an error in PostgreSQL"),
        p("Kubernetes Basics has no lessons, so its total is 0. SQLite returns **NULL** for any division by zero, without an error. The page then receives `percent: null` and shows an empty bar or `NaN%`. PostgreSQL raises a `division by zero` error instead and the whole query fails. Handle the case explicitly, in a form both engines accept:"),
        code("sql", `
-- NULLIF turns a zero divisor into NULL (no error in PostgreSQL),
-- COALESCE turns the NULL result into the value you decided on.
COALESCE(done * 100 / NULLIF(total, 0), 0)

-- The same decision with CASE, often easier to read in a review
CASE WHEN total = 0 THEN 0 ELSE done * 100 / total END`, "two equivalent guards"),
        callout("info", "PostgreSQL differences that matter here",
            "In PostgreSQL, COUNT returns bigint and integer division also truncates, so 2 * 100 / 3 is 66 there too. Division by zero is an error, not NULL, so the NULLIF guard is required, not optional. ROUND on a numeric value rounds half away from zero, like SQLite's ROUND."),

        h2("8. Your turn: write the query behind the page"),
        p("You now have every piece: start from the user's enrollments, attach courses, lessons and the user's finished progress rows with the right kind of join, group by course, count different lessons rather than rows, and compute a percentage that is rounded down and never NULL. The test data contains each trap from this lesson: an enrollment with nothing finished, a course with no lessons, duplicate rows in both `enrollments` and `lesson_progress`, progress from other learners and from courses the learner never joined, and progress rows that were opened but not finished (`completed_at` is NULL)."),
        challenge("chal_coding_sdm_232"),

        h2("9. How to verify the numbers"),
        bullets([
            "**Look at the rows before grouping.** Remove `GROUP BY` and the aggregates, select the join keys, and read them. Duplicates and missing rows are obvious there and invisible in the totals.",
            "**Count the output rows against the source of truth.** The page must have one row per enrolled course: compare with `SELECT COUNT(DISTINCT course_id) FROM enrollments WHERE user_id = 1`.",
            "**Recount one course by hand** with the simplest possible query, for example `SELECT COUNT(*) FROM lessons WHERE course_id = 10`, and compare it with the grouped result.",
            "**Find the duplicates you are counting around**: `SELECT user_id, lesson_id, COUNT(*) FROM lesson_progress GROUP BY user_id, lesson_id HAVING COUNT(*) > 1`. Any row here is a bug for lesson 7 to prevent.",
            "**Keep the edge cases as test fixtures**: a course with no lessons, an enrollment with nothing finished, a duplicate progress row. They are exactly the cases a hand-made demo account never has.",
        ]),

        h2("10. Pitfalls to recognise in code review"),
        bullets([
            "**Starting from the child table.** A query that starts from `lesson_progress` or `orders` can only show parents that have children. Start from the table that defines which rows the result must contain.",
            "**`COUNT(*)` after a LEFT JOIN.** It counts the all-NULL row too, so an empty course reports 1 lesson. Count a column of the joined table instead.",
            "**A filter on the right table in WHERE.** It silently turns the LEFT JOIN into an inner join. Move it into the `ON` clause.",
            "**Integer division.** `a / b * 100` with integer counts is 0 or a multiple of 100. Multiply first, or make one operand REAL and round on purpose.",
            "**Division by zero handled by accident.** SQLite's NULL hides the case; PostgreSQL's error exposes it in production. Write the `NULLIF` or `CASE` yourself.",
            "**Bare columns in SQLite.** A selected column that is neither grouped nor aggregated returns a value from some row. It works by luck in SQLite and fails in PostgreSQL.",
        ]),

        h2("11. Checklist"),
        bullets([
            "The `FROM` table defines the rows the result must contain; optional relations are attached with `LEFT JOIN`.",
            "Conditions on the right side of a LEFT JOIN are in its `ON` clause.",
            "Every selected column is either in `GROUP BY` or inside an aggregate.",
            "Counts use `COUNT(column)` or `COUNT(DISTINCT column)` on purpose, never `COUNT(*)` by habit after a join.",
            "`SUM` and `AVG` results that can be NULL are wrapped in `COALESCE` where the product needs a number.",
            "Percentages multiply before dividing (or use a REAL operand), round as the product requires, and guard a zero divisor.",
            "Row filters are in `WHERE`, aggregate filters in `HAVING`.",
            "You compared the result with the raw rows and with a hand count for at least one group.",
        ]),

        h2("Sources"),
        bullets([
            "SQLite documentation, \"Built-in Aggregate Functions\" and \"SELECT\" (bare columns in aggregate queries) - sqlite.org",
            "SQLite documentation, \"SQL Language Expressions\" (operators, integer division, division by zero) - sqlite.org",
            "PostgreSQL documentation, \"Aggregate Functions\" and \"Table Expressions: The GROUP BY and HAVING Clauses\" - postgresql.org",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Extend your progress query with two columns: last_activity (the latest completed_at of the learner in that course, NULL when there is none) and next_lesson (the smallest position among the lessons the learner has not finished). Before you write them, decide what each should be for a course with no lessons and for a fully finished course, then check both cases on your own data. Finally, write the one query that lists every learner whose progress table contains a duplicate, and explain in two sentences which constraint from lesson 7 would make it always return nothing."),
    ],
});
