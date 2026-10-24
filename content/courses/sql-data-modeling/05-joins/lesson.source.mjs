// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sdm-2-2",
    title: "Joins: inner, left & the rows you lose or double",
    slug: { _type: "slug", current: "joins-inner-left-and-the-rows-you-lose-or-double" },
    description:
        "The course dashboard says SQL & Data Modeling has 5 learners; the enrollment list has 3, and the new Docker Basics course is missing. Learn what an inner join keeps and drops, how a left join keeps every row, why a filter in WHERE undoes a left join, and why joining two one-to-many tables multiplies rows - then fix an AI-generated report query that double counts.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, CodeDev platform team",
        problem:
            "A teammate asked an AI assistant to \"count learners and completed lessons per course\" for the instructors' dashboard, checked the result on one small course and shipped it. The instructor of \"SQL & Data Modeling\" now sees 5 learners while the enrollment list shows 3, and the new course \"Docker Basics\", which has no learners yet, does not appear on the dashboard at all.",
    },

    content: [
        h2("1. The incident: 5 learners on the dashboard, 3 in the list"),
        p("On Wednesday the instructor of **SQL & Data Modeling** compared two screens. The dashboard said **5 learners, 5 completed lessons**. The enrollment list for the same course showed three names: Mai, Tom and Ana. Meanwhile the team that had just published **Docker Basics** asked why their course was not on the dashboard at all."),
        p("The dashboard query was written by an AI assistant. This is the request and what came back:"),
        code("text", `
Prompt: "SQLite. Tables: courses(course_id, title, level),
lessons(lesson_id, course_id, position, title),
enrollments(user_id, course_id, enrolled_at, status),
lesson_progress(user_id, lesson_id, completed_at).
For the instructors' dashboard, count learners and completed lessons
per course. Cancelled enrollments do not count."`),
        code("sql", `
-- generated, checked on one course, shipped on Tuesday
SELECT c.course_id,
       c.title,
       COUNT(e.user_id)        AS learners,
       COUNT(lp.completed_at)  AS completed_lessons
FROM courses c
JOIN enrollments e      ON e.course_id = c.course_id
JOIN lessons l          ON l.course_id = c.course_id
JOIN lesson_progress lp ON lp.lesson_id = l.lesson_id AND lp.user_id = e.user_id
WHERE e.status <> 'cancelled'
  AND lp.completed_at IS NOT NULL
GROUP BY c.course_id, c.title
ORDER BY c.course_id;`, "dashboard/course_stats.sql"),
        p("It reads well, it runs without errors, and on **Web Application Fundamentals** (one learner, one finished lesson) it gave the right answer. That check was the problem: a course with one of everything cannot show the two bugs in this query."),

        h2("2. Reproduce it: look at the rows before GROUP BY"),
        p("Here is a small copy of the data, on the tables from lesson 4 plus `lessons` and `lesson_progress` (the full schema is at the bottom of the challenge file). Course 1 has three active learners: Mai finished all four lessons, Tom finished one and started another, Ana has not started. Course 2 has Mai (active, one lesson finished) and Raj (cancelled). Course 3 is new: lessons, no learners."),
        code("sql", `
INSERT INTO users VALUES (1, 'mai@example.com', 'Mai Nguyen'), (2, 'tom@example.com', 'Tom Becker'),
    (3, 'ana@example.com', 'Ana Lopez'), (4, 'raj@example.com', 'Raj Patel');
INSERT INTO courses VALUES (1, 'SQL & Data Modeling', 'beginner'),
    (2, 'Web Application Fundamentals', 'beginner'), (3, 'Docker Basics', 'beginner');
INSERT INTO lessons VALUES (101, 1, 1, 'Entities'), (102, 1, 2, 'Keys'), (103, 1, 3, 'Normalization'),
    (104, 1, 4, 'CRUD'), (201, 2, 1, 'Requests'), (202, 2, 2, 'Status codes'), (203, 2, 3, 'CORS'),
    (301, 3, 1, 'Images'), (302, 3, 2, 'Containers');
INSERT INTO enrollments VALUES (1, 1, '2026-09-01', 'active'), (2, 1, '2026-09-02', 'active'),
    (3, 1, '2026-09-03', 'active'), (1, 2, '2026-09-04', 'active'), (4, 2, '2026-09-05', 'cancelled');
INSERT INTO lesson_progress VALUES (1, 101, '2026-10-01'), (1, 102, '2026-10-02'), (1, 103, '2026-10-03'),
    (1, 104, '2026-10-04'), (2, 101, '2026-10-05'), (2, 102, NULL), (1, 201, '2026-10-06');`, "sample data"),
        p("The aggregate hides what happened. Remove `GROUP BY` and the counts, keep the joins and the WHERE, and select the columns that identify each row:"),
        code("text", `
SELECT c.course_id, e.user_id, lp.lesson_id FROM ... (same joins and WHERE) ORDER BY 1, 2, 3;

course_id  user_id  lesson_id
1          1        101
1          1        102
1          1        103
1          1        104
1          2        101
2          1        201`, "rows before GROUP BY"),
        p("Six rows, and they explain everything. **Mai appears four times** in course 1, once per finished lesson, so `COUNT(e.user_id)` counts her four times. **Ana is not there at all**: she has no finished lesson, so the join to `lesson_progress` found nothing for her. **Course 3 is not there at all** either. 4 + 1 + 0 = 5 \"learners\". One bug inflates the number, another deflates it, and on small data they can even cancel out, which makes the query look right."),

        h2("3. Inner join: only rows that match on both sides"),
        p("`JOIN` (short for `INNER JOIN`) returns one row for every pair of rows that satisfies the `ON` condition. A row with no partner on the other side produces **nothing**. That is exactly what you want when the partner must exist - an enrollment always has a course - and exactly wrong when you want to list things that may have no partner yet: courses without learners, learners without progress."),
        bullets([
            "**Rows you lose:** every parent with zero children disappears. The report does not say \"0\"; the row is simply absent, and absence is easy to miss.",
            "**Each inner join is a filter.** Joining to `lesson_progress` silently added the condition \"has finished at least one lesson\" to the learner count. Nobody asked for that.",
            "**How to detect it:** compare the number of rows in the report with `SELECT COUNT(*) FROM courses`. Any difference is a course the joins removed.",
        ]),

        h2("4. Left join: keep every row of the left table"),
        p("`LEFT JOIN` keeps every row of the table on its left. When a row has no match, it is kept once, and every column of the right table is `NULL`:"),
        code("sql", `
SELECT c.course_id, c.title, e.user_id, e.status
FROM courses c
LEFT JOIN enrollments e ON e.course_id = c.course_id
WHERE c.course_id = 3;
-- 3 | Docker Basics | NULL | NULL      (kept, with NULLs)`),
        p("Two details decide whether a left join gives the right count:"),
        bullets([
            "**Count a column, not the row.** `COUNT(*)` counts that NULL-filled row, so Docker Basics would show 1 learner. `COUNT(e.user_id)` skips NULLs and gives 0.",
            "**Aggregates over nothing return NULL.** `SUM(...)` over only NULLs is `NULL`, not 0. Wrap such values in `COALESCE(..., 0)` when the report must show zeros.",
        ]),
        p("SQLite also supports `RIGHT JOIN` and `FULL JOIN` since version 3.39.0, but you rarely need them: put the table whose rows must all appear on the left and use `LEFT JOIN`."),

        h3("ON or WHERE: where the filter goes changes the answer"),
        p("For an inner join, a condition in `ON` and the same condition in `WHERE` give the same rows. For a left join they do not:"),
        code("sql", `
-- filter in WHERE: runs after the join, removes the NULL row -> Docker Basics disappears again
FROM courses c
LEFT JOIN enrollments e ON e.course_id = c.course_id
WHERE e.status <> 'cancelled'

-- filter in ON: decides which enrollments match -> Docker Basics stays, with NULLs
FROM courses c
LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.status <> 'cancelled'`),
        p("For Docker Basics, `e.status` is `NULL`, and `NULL <> 'cancelled'` is not true - it is NULL - so `WHERE` throws the row away. A condition on the **right** table of a left join belongs in `ON`. A condition on the **left** table (for example, only beginner courses) belongs in `WHERE`."),

        h2("5. One-to-many joins multiply rows"),
        p("Before you aggregate after a join, ask one question: **what is one row now?** This is the grain of the result."),
        bullets([
            "`courses` alone: one row per course.",
            "`courses JOIN enrollments`: one row per enrollment. Counting learners is still fine here.",
            "`... JOIN lessons ON l.course_id = c.course_id`: one row per **(enrollment, lesson)** pair. Three learners and four lessons are now twelve rows.",
            "`... JOIN lesson_progress`: one row per finished lesson per learner. A learner is repeated once per finished lesson.",
        ]),
        p("Every join to a table with **many** rows per key multiplies the rows on the other side. Joining two unrelated \"many\" tables through the same parent - enrollments and lessons, both children of a course - multiplies them by each other. That is called **fan-out**, and it is the reason `COUNT` and `SUM` come out too high. Lesson 6 builds on this with GROUP BY and progress per course."),
        image("join-fan-out", {
            alt: "Diagram comparing two ways to count per course. On the left, in red, the AI query joins enrollments and lesson progress through the course: Mai appears four times, Tom once, Ana and Docker Basics are missing, and the count says 5 learners. On the right, in green, enrollments and lesson progress are each counted on their own to one row per course, then left joined to courses: SQL and Data Modeling shows 3 learners and 5 completed lessons, Docker Basics shows 0 and 0. A bottom row lists three rules: ask what one row is, aggregate each child table on its own, then left join with filters in ON and COALESCE.",
            caption: "Count each child table on its own, one row per course, and only then join the results to courses.",
        }),

        h2("6. The fix: aggregate each child table on its own"),
        p("The reliable pattern: reduce each \"many\" table to **one row per course first**, then join those results to `courses` with left joins. Each count is computed at the grain where it makes sense, and nothing can multiply."),
        code("sql", `
WITH learner_counts AS (                  -- one row per course
    SELECT course_id, COUNT(*) AS learners
    FROM enrollments
    WHERE status = 'active'
    GROUP BY course_id
)
SELECT c.course_id, c.title, COALESCE(lc.learners, 0) AS active_learners
FROM courses c
LEFT JOIN learner_counts lc ON lc.course_id = c.course_id
ORDER BY c.course_id;`, "one child table, done right"),
        p("Notice where the status filter is: inside the CTE, before the join. The left join then only decides whether a course has a count or gets 0. A correlated subquery in the SELECT list - `(SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id AND ...)` - is another correct way to write one count per course."),
        h3("When COUNT(DISTINCT ...) is enough, and when it is not"),
        p("`COUNT(DISTINCT e.user_id)` would also give the right learner count, because the key `(user_id, course_id)` means one user is one learner of a course. But it only removes duplicates after the database has built all the multiplied rows, it still needs left joins with the right `ON` conditions to keep empty courses, and it only works when the thing you count has a single identifying column. A finished lesson is a `(user_id, lesson_id)` pair, and `SUM(DISTINCT ...)` removes equal **values**, not repeated rows. Use DISTINCT when you can say why each counted value appears once per real thing; otherwise aggregate first."),
        p("Your task: fix the AI's dashboard query. Every course must appear, learners and completed lessons must each be counted once, and courses with nothing to count show 0."),
        challenge("chal_coding_sdm_222"),

        h2("7. Verify: reconcile the report with the tables"),
        p("A report query is verified when its numbers add up to independent counts, and when it survives data designed to break it. Run these next to the fixed query:"),
        code("sql", `
-- every course appears exactly once
SELECT COUNT(*) FROM courses;                                    -- = number of report rows

-- the learner column adds up to the enrollments it claims to count
SELECT COUNT(*) FROM enrollments WHERE status <> 'cancelled';    -- = SUM(learners) of the report

-- the completed column adds up to the finished progress rows
SELECT COUNT(*) FROM lesson_progress WHERE completed_at IS NOT NULL;  -- = SUM(completed_lessons)`, "reconciliation checks"),
        bullets([
            "**Test data that breaks joins:** a learner with several finished lessons, a learner with none, a course with no enrollments, a course whose only enrollment is cancelled, a started lesson with `completed_at` NULL.",
            "**Spot check one course by hand:** for SQL & Data Modeling the fixed query must say 3 learners and 5 completed lessons; Docker Basics must say 0 and 0.",
            "**Read the rows before you trust a count:** when a number surprises you, remove GROUP BY and look at what one row is.",
        ]),
        p("Now test yourself on two joins from the same data:"),
        challenge("chal_quiz_sdm_221"),

        h2("8. Pitfalls"),
        bullets([
            "**Checking a report on one small example.** One learner with one lesson cannot reveal fan-out or lost rows. Detect it by testing with several children per parent and with parents that have none.",
            "**Counting rows after a LEFT JOIN.** `COUNT(*)` counts the NULL-filled row of an empty parent as 1. Count a column of the right table instead.",
            "**A right-table filter in WHERE.** It silently turns the left join back into an inner join. Detect it by comparing report rows with `SELECT COUNT(*)` of the left table.",
            "**Two one-to-many joins in one query.** If the query joins two \"many\" tables through the same parent and then aggregates, assume the counts are multiplied until you have checked the grain.",
            "**DISTINCT as a patch.** `SELECT DISTINCT` or `COUNT(DISTINCT ...)` added until the number looks right hides the real grain problem and fails on sums. Aggregate each table first.",
            "**Trusting generated SQL because it runs.** A query that runs is not a query that is right. Read it join by join and verify it with the reconciliation checks, exactly as you would a teammate's.",
        ]),

        h2("9. Checklist"),
        bullets([
            "For every join, you can say what one row of the result is.",
            "Tables whose rows must all appear are on the left of a LEFT JOIN; inner joins are used only where a partner must exist.",
            "Conditions on the right table of a LEFT JOIN are in ON, not WHERE.",
            "Each one-to-many child table is aggregated to one row per parent before it is joined.",
            "Counts after a left join use `COUNT(column)` or `COALESCE(..., 0)`, so empty parents show 0, not 1 or NULL.",
            "The report's row count and column totals reconcile with independent counts of the base tables.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Extend the fixed dashboard with a third number: the number of lessons in each course. Write it first the wrong way (one more join to lessons) and record how the other two columns change, then the right way. Finish with a short note to the teammate who shipped the AI query: what the bug was, which data would have caught it, and the reconciliation queries to keep next to the report."),

        h2("Sources"),
        bullets([
            "SQLite documentation: the SELECT statement (join processing, LEFT, RIGHT and FULL joins, the WITH clause) and the aggregate functions count(X) and count(*).",
            "PostgreSQL documentation, section 7.2.1.1 \"Joined Tables\": outer joins, and why a restriction in ON differs from the same restriction in WHERE.",
            "PostgreSQL documentation, section 7.8 \"WITH Queries (Common Table Expressions)\".",
        ]),
    ],
});
