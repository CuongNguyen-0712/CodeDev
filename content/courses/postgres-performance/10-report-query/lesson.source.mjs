// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-4-1",
    title: "Rewrite the progress report query",
    slug: { _type: "slug", current: "rewrite-progress-report-query" },
    description:
        "The nightly progress report ran for 40 minutes because every number in it was a correlated subquery, executed again for every course and every enrollment. Learn to read SubPlan loops in EXPLAIN ANALYZE, why a report that reads every row wants each table read once, how to rewrite it with CTEs, joins and GROUP BY without fan-out, how to prove the new query returns the same rows, and when a correlated subquery is still the right tool.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The nightly job that builds the course progress report starts at 02:00 and normally finishes in a few minutes. Since the catalog grew past 200 courses and a million enrollments it finishes at 02:40, the morning \"your weekly progress\" e-mails go out late, and twice last week the job overlapped with the 02:30 backup and was killed. Nobody changed the query: it is the same SQL that was fast when CodeDev had twelve courses.",
    },

    content: [
        h2("1. The incident: a report that grew with the square of the catalog"),
        p("The ticket from the data team reads: \"Progress report job: 40 min (was 3 min in March). Killed by the backup window on Tue and Thu. Query unchanged.\" The report has one row per course with three numbers: how many learners are enrolled, how many finished every lesson, and the average completion percentage. This is its query, slightly shortened:"),
        code("sql", `
SELECT c.id,
       c.title,
       (SELECT COUNT(*) FROM enrollments AS e
         WHERE e.course_id = c.id AND e.status <> 'cancelled')              AS enrolled,
       (SELECT COUNT(*) FROM enrollments AS e
         WHERE e.course_id = c.id AND e.status <> 'cancelled'
           AND (SELECT COUNT(*) FROM lesson_progress AS lp
                 WHERE lp.user_id = e.user_id AND lp.course_id = c.id
                   AND lp.completed_at IS NOT NULL)
             = (SELECT COUNT(*) FROM lessons AS l WHERE l.course_id = c.id))  AS completed_all,
       (SELECT ROUND(100.0 * SUM((SELECT COUNT(*) FROM lesson_progress AS lp
                                   WHERE lp.user_id = e.user_id AND lp.course_id = c.id
                                     AND lp.completed_at IS NOT NULL))
                     / (COUNT(*) * (SELECT COUNT(*) FROM lessons AS l
                                     WHERE l.course_id = c.id)), 1)
          FROM enrollments AS e
         WHERE e.course_id = c.id AND e.status <> 'cancelled')              AS avg_completion_pct
FROM courses AS c
ORDER BY c.id;`, "progress_report.sql"),
        p("It reads naturally, one question per column, and every number in it is correct. The problem is not what it computes but how many times it computes it. Each subquery that mentions `c.id` or `e.user_id` is **correlated**: it depends on the current outer row, so the database runs it again for every outer row. With 12 courses that was a few thousand executions. With 212 courses and a million enrollments it is millions."),

        h2("2. Read the evidence: SubPlan and loops"),
        p("Start from measurements, as in lesson 1. `pg_stat_statements` confirms that the time is in this one statement and that it is not waiting on locks (lesson 11) or I/O alone:"),
        code("sql", `
SELECT calls, round(mean_exec_time) AS mean_ms, rows,
       shared_blks_hit, shared_blks_read
FROM pg_stat_statements
WHERE query LIKE '%avg_completion_pct%';

 calls | mean_ms | rows | shared_blks_hit | shared_blks_read
-------+---------+------+-----------------+------------------
     7 | 2401733 |  212 |      9518420113 |          2240917`, "psql"),
        p("Nine billion buffer hits for 212 output rows: the job is not slow because the data is large, it is slow because it reads the same pages over and over. The plan, logged by `auto_explain` (`auto_explain.log_min_duration = '60s'`, `log_analyze = on`), shows where:"),
        code("text", `
Sort  (cost=1873416530.12..1873416530.65 rows=212 width=52) (actual time=2401530.112..2401530.131 rows=212 loops=1)
  Sort Key: c.id
  Sort Method: quicksort  Memory: 41kB
  ->  Seq Scan on courses c  (cost=0.00..1873416520.31 rows=212 width=52) (actual time=9120.611..2401529.402 rows=212 loops=1)
        SubPlan 1
          ->  Aggregate  (cost=27410.52..27410.53 rows=1 width=8) (actual time=161.214..161.215 rows=1 loops=212)
                ->  Seq Scan on enrollments e  (cost=0.00..27398.15 rows=4945 width=0) (actual time=3.108..160.402 rows=4944 loops=212)
                      Filter: ((status <> 'cancelled'::text) AND (course_id = c.id))
                      Rows Removed by Filter: 1159756
        SubPlan 4
          ->  Aggregate  (cost=4196338.58..4196338.59 rows=1 width=8) (actual time=5513.004..5513.004 rows=1 loops=212)
                ->  Seq Scan on enrollments e_1  (cost=0.00..4196338.52 rows=24 width=0) (actual time=12.420..5512.871 rows=611 loops=212)
                      Filter: ((status <> 'cancelled'::text) AND (course_id = c.id) AND ((SubPlan 2) = (SubPlan 3)))
                      Rows Removed by Filter: 1164089
                      SubPlan 2
                        ->  Aggregate  (cost=41.22..41.23 rows=1 width=8) (actual time=1.104..1.104 rows=1 loops=1048211)
                              ->  Index Scan using lesson_progress_pkey on lesson_progress lp  (cost=0.56..41.20 rows=1 width=0) (actual time=0.512..1.101 rows=6 loops=1048211)
                                    Index Cond: (user_id = e_1.user_id)
                                    Filter: ((completed_at IS NOT NULL) AND (course_id = c.id))
                                    Rows Removed by Filter: 31
                      SubPlan 3
                        ->  Aggregate  (actual time=0.011..0.011 rows=1 loops=1048211)
                              ->  Index Only Scan using lessons_course_id_idx on lessons l  (actual time=0.004..0.009 rows=8 loops=1048211)
                                    Index Cond: (course_id = c.id)
        SubPlan 7
          ->  ... the same per-enrollment count again for the average (loops=212 and loops=1048211)`, "auto_explain"),
        p("Three habits from lesson 2 make this plan readable:"),
        bullets([
            "**`SubPlan n` is a correlated subquery.** PostgreSQL runs it once per row of the node that owns it. A scalar subquery in the SELECT list always stays a SubPlan; PostgreSQL can turn `EXISTS` and `IN` in a WHERE clause into semi-joins, but it does not rewrite these for you.",
            "**`actual time` and `rows` are per loop.** SubPlan 2 looks cheap at 1.104 ms. Multiply by `loops=1048211` and it is about 1,157 seconds, more than 19 minutes, and SubPlan 7 pays the same again.",
            "**`Rows Removed by Filter` is per loop too.** SubPlan 1 throws away 1,159,756 rows for each of 212 courses: the whole enrollments table is read once per course.",
        ]),
        p("The shape of the cost is courses x enrollments plus enrollments x progress-per-learner. Both factors grow with the business, so the report does not get slower in a straight line; it gets slower in a curve."),

        h2("3. Core idea: a report reads everything, so read each table once"),
        p("A correlated subquery is a loop written in SQL. The rewrite turns the loop inside out: instead of asking \"how many lessons did *this* learner finish in *this* course?\" a million times, ask once \"how many lessons did every learner finish in every course?\" with one `GROUP BY`, and join the small result. Each table is read once, aggregated down to the grain you need, and only then joined."),
        numbered([
            "**Find the grain of each number.** Lessons per course: one row per course. Finished lessons: one row per (user, course). Learners: one row per enrollment that is not cancelled.",
            "**Aggregate each child table to that grain in its own CTE.** Filter before you aggregate (`completed_at IS NOT NULL`), so the CTE is as small as possible.",
            "**Join at matching grains only.** Join the per-(user, course) counts to enrollments on both keys, then aggregate per course. Joining a table that has many rows per learner before counting learners multiplies the count: this is called fan-out.",
            "**Keep every row of the driving table.** Every course must appear, so the final query starts from `courses` with `LEFT JOIN` and turns missing aggregates into 0 with `COALESCE`.",
        ]),
        p("For a query that reads all the rows, the best plan is usually **Seq Scan + Hash Join + HashAggregate**: one sequential pass over each table and hash tables in memory. Indexes help little when every row is needed anyway. That is a different lesson from the index lessons of module 2, and it is why the fix here is a rewrite rather than another index."),
        callout("info", "When a correlated subquery is fine",
            "Correlation is not a sin. For a page that shows 20 courses, a subquery per row backed by an index (or a LATERAL join with ORDER BY ... LIMIT for top N per group) runs 20 cheap index lookups and can beat aggregating the whole table. The question is how many outer rows there are and what each execution reads. A nightly report over every course and every learner is the opposite case: the outer side is the whole table."),

        h2("4. Worked example: the challenge section of the same report"),
        p("The report has a second section, per course: how many learners submitted anything, how many passed every challenge, and their average best score. It had the same correlated shape and the same problem. Here it is rewritten for PostgreSQL, one CTE per grain:"),
        code("sql", `
WITH challenge_counts AS (                 -- one row per course
    SELECT course_id, COUNT(*) AS total
    FROM challenges
    GROUP BY course_id
),
best AS (                                  -- one row per (user, challenge)
    SELECT s.user_id, ch.course_id, s.challenge_id,
           MAX(s.score)   AS best_score,
           bool_or(s.passed) AS passed
    FROM submissions AS s
    JOIN challenges AS ch ON ch.id = s.challenge_id
    GROUP BY s.user_id, ch.course_id, s.challenge_id
),
per_learner AS (                           -- one row per (user, course)
    SELECT user_id, course_id,
           COUNT(*) FILTER (WHERE passed) AS passed_count,
           AVG(best_score)                AS avg_best
    FROM best
    GROUP BY user_id, course_id
)
SELECT c.id,
       c.title,
       COUNT(pl.user_id)                                    AS learners_submitted,
       COUNT(*) FILTER (WHERE pl.passed_count = cc.total)   AS passed_all,
       COALESCE(ROUND(AVG(pl.avg_best), 1), 0)              AS avg_best_score
FROM courses AS c
LEFT JOIN challenge_counts AS cc ON cc.course_id = c.id
LEFT JOIN per_learner      AS pl ON pl.course_id = c.id
GROUP BY c.id, c.title
ORDER BY c.id;`, "challenge_report.sql"),
        p("Notice the order of operations: `submissions` (many rows per learner and challenge) is reduced to one row per (user, challenge) before anything is counted per learner, and to one row per (user, course) before anything is counted per course. `COUNT(pl.user_id)` counts only real learners, because a course without submissions keeps one row from the `LEFT JOIN` whose `pl` columns are NULL."),
        p("The new plan has no SubPlan and every node runs `loops=1`:"),
        code("text", `
Sort  (actual time=6412.806..6412.861 rows=212 loops=1)
  Sort Key: c.id
  ->  HashAggregate  (actual time=6411.902..6412.401 rows=212 loops=1)
        Group Key: c.id
        ->  Hash Right Join  (actual time=6020.117..6301.554 rows=389119 loops=1)
              Hash Cond: (pl.course_id = c.id)
              ->  Subquery Scan on pl  (actual time=6018.940..6230.712 rows=389114 loops=1)
                    ->  HashAggregate  (actual time=6018.938..6198.405 rows=389114 loops=1)
                          Group Key: best.user_id, best.course_id
                          ->  HashAggregate  (actual time=4310.220..5701.391 rows=1902255 loops=1)
                                Group Key: s.user_id, ch.course_id, s.challenge_id
                                Batches: 5  Memory Usage: 8257kB  Disk Usage: 61440kB
                                ->  Hash Join  (actual time=1.402..2405.118 rows=6210440 loops=1)
                                      Hash Cond: (s.challenge_id = ch.id)
                                      ->  Seq Scan on submissions s  (actual time=0.011..812.530 rows=6210440 loops=1)
                                      ->  Hash  (actual time=1.371..1.372 rows=2544 loops=1)
                                            ->  Seq Scan on challenges ch  (actual time=0.009..0.702 rows=2544 loops=1)
              ->  Hash  (actual time=1.104..1.106 rows=212 loops=1)
                    ->  Hash Left Join  (actual time=0.889..1.051 rows=212 loops=1)
                          ...`, "EXPLAIN (ANALYZE)"),
        p("6.4 seconds instead of tens of minutes, and it grows with the number of rows, not with rows x rows. One line still deserves attention: `Batches: 5 ... Disk Usage: 61440kB` means the hash aggregate did not fit in `work_mem` (times `hash_mem_multiplier`) and spilled to disk. For a nightly job you can raise `work_mem` for that session only with `SET LOCAL work_mem = '64MB'` inside the job's transaction, then check that `Batches` drops to 1."),
        callout("info", "CTEs and the planner",
            "Since PostgreSQL 12 a CTE that is referenced once, is not recursive and has no side effects is inlined into the main query, so the planner can still optimise across it. A CTE referenced twice is computed once and materialized. Add MATERIALIZED or NOT MATERIALIZED only when EXPLAIN shows that the default is the slower choice. CTEs are for readability here, not a performance trick."),

        challenge("chal_quiz_pgp_411"),

        h2("5. How to verify the rewrite"),
        p("A faster report that returns different numbers is a new bug, so prove both properties."),
        bullets([
            "**Same rows.** Run both queries on a copy of production (a restored backup or a database branch) and compare them in both directions: `(old EXCEPT new) UNION ALL (new EXCEPT old)` must return no rows. Watch numeric types: `ROUND(..., 1)` on `numeric` and on `double precision` can print differently, so compare the same types.",
            "**Edge cases on purpose.** A course with no learners, a course with no lessons, a cancelled learner who finished everything, a learner who opened a lesson but did not finish it, progress left over from a course the user is no longer enrolled in. Each is one `INSERT` in a test database, and each catches a different bug.",
            "**The plan.** `EXPLAIN (ANALYZE, BUFFERS)` shows no `SubPlan`, every node with `loops=1`, and buffer counts close to the size of the tables instead of billions of hits.",
            "**The job over time.** `pg_stat_statements` `mean_exec_time` for the new statement, and the job's duration in its own logs for a week, so you notice when it starts to grow again.",
        ]),
        p("The challenge below runs on SQLite, which has no `EXPLAIN ANALYZE`. Its `EXPLAIN QUERY PLAN` prints `CORRELATED SCALAR SUBQUERY` where PostgreSQL prints a `SubPlan`, and the runner measures work by counting SQLite virtual machine steps with `set_progress_handler` instead of seconds, so the result is the same on every run."),

        h2("6. Common mistakes"),
        bullets([
            "**Counting after a one-to-many join (fan-out).** `COUNT(*)` after joining enrollments to progress counts progress rows, not learners. Spot it: compare the new count with `SELECT COUNT(*) FROM enrollments WHERE course_id = ...` for one course; a number several times larger is fan-out.",
            "**An inner join where a LEFT JOIN was needed.** Courses without learners, or learners without progress, disappear. Spot it: compare `SELECT COUNT(*) FROM courses` with the number of report rows.",
            "**Filtering a LEFT JOIN in WHERE.** `WHERE lp.completed_at IS NOT NULL` after a `LEFT JOIN` removes the NULL rows the join kept and silently turns it into an inner join. Put the condition in the CTE or in `ON`. Spot it: learners with zero finished lessons vanish from the average.",
            "**Trusting a denormalized flag.** `enrollments.status = 'completed'` is set by another job and lags behind `lesson_progress`. Spot it: count learners whose status says completed but whose finished-lesson count is lower than the course's lesson count.",
            "**Adding an index to the correlated version and stopping there.** An index makes each execution cheaper but the number of executions still grows with the catalog. Spot it: `loops=` on the SubPlan still equals the number of enrollments.",
        ]),

        h2("7. Rewrite the progress section"),
        p("Now the progress section from the incident is yours. The starter contains the query from section 1. Rewrite it so it returns exactly the same rows with each table read once. The runner rejects a plan that still has a correlated subquery and stops any query that needs more than its step budget on a dataset of about 200 courses, 3,000 users and 50,000 progress rows."),
        challenge("chal_coding_pgp_412"),

        h2("8. Summary"),
        bullets([
            "A correlated subquery runs once per outer row: in EXPLAIN ANALYZE, multiply a SubPlan's per-loop time by `loops` before you call it cheap.",
            "A report that reads every row should read each table once: aggregate each child table to its grain in a CTE, then join at matching grains from the driving table with LEFT JOIN and COALESCE.",
            "Prove the rewrite: identical rows in both directions with EXCEPT, edge cases on purpose, and a plan with no SubPlan and `loops=1`.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Using EXPLAIN (SubPlan, loops, actual time per loop) - https://www.postgresql.org/docs/current/using-explain.html",
            "PostgreSQL documentation: WITH Queries (CTE inlining and MATERIALIZED) and Aggregate Expressions (FILTER)",
            "PostgreSQL documentation: pg_stat_statements - https://www.postgresql.org/docs/current/pgstatstatements.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Turn the rewritten report into a materialized view and refresh it nightly with REFRESH MATERIALIZED VIEW CONCURRENTLY (it needs a unique index on the view, for example on the course id). Compare its refresh time with the plain query, and write down which numbers the morning e-mail may show stale if the refresh fails."),
    ],
});
