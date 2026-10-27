// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-1-3",
    title: "Estimated vs actual rows: statistics & selectivity",
    slug: { _type: "slug", current: "estimated-vs-actual-rows-statistics-selectivity" },
    description:
        "After a bulk import of 2.1 million trial enrollments, the trial report ran for 14 minutes: the planner expected 1 row and chose 2.1 million index lookups. Learn where row estimates come from - pg_stats, most common values, n_distinct, null_frac and histograms - how the planner turns them into selectivity for =, ranges, IS NULL and AND, why estimates go wrong (stale statistics, small samples, correlated columns) and how to fix and verify them.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "On Monday night the growth team imported 2,104,000 enrollments with the new status 'trial' into the 20-million-row enrollments table. On Tuesday the admin trial-conversion report (GET https://api.codedev.test/admin/reports/trials), which used to take 300 ms, timed out after 15 minutes at the API and kept running in the database. EXPLAIN ANALYZE shows the planner expected one trial enrollment.",
    },

    content: [
        h2("1. The incident: a plan built for one row"),
        code("sql", `
EXPLAIN (ANALYZE, BUFFERS)
SELECT e.course_id, count(*) AS trials, count(lp.user_id) AS started
FROM enrollments e
LEFT JOIN lesson_progress lp ON lp.user_id = e.user_id AND lp.course_id = e.course_id
WHERE e.status = 'trial'
GROUP BY e.course_id;`),
        code("text", `
GroupAggregate  (cost=9.04..9.07 rows=1 width=24) (actual time=846102.311..846455.928 rows=1204 loops=1)
  Group Key: e.course_id
  ->  Sort  (cost=9.04..9.05 rows=1 width=16) (actual time=846102.290..846301.118 rows=2588120 loops=1)
        Sort Key: e.course_id
        Sort Method: external merge  Disk: 65912kB
        ->  Nested Loop Left Join  (cost=1.00..9.03 rows=1 width=16) (actual time=0.061..843310.420 rows=2588120 loops=1)
              ->  Index Scan using enrollments_status_idx on enrollments e  (cost=0.44..4.46 rows=1 width=16) (actual time=0.038..2876.502 rows=2104000 loops=1)
                    Index Cond: (status = 'trial'::text)
              ->  Index Only Scan using lesson_progress_user_id_course_id_idx on lesson_progress lp  (cost=0.56..4.57 rows=1 width=12) (actual time=0.398..0.399 rows=1 loops=2104000)
                    Index Cond: ((user_id = e.user_id) AND (course_id = e.course_id))
                    Heap Fetches: 1906211
Planning Time: 0.512 ms
Execution Time: 846612.044 ms`, "psql"),
        p("Read it as lesson 2 taught: the inner Index Only Scan ran 2,104,000 times at 0.399 ms, which is 839 seconds of the 846. Then go one step further down: the outer Index Scan was estimated at `rows=1` and returned 2,104,000 rows. For one row, a nested loop with one index lookup is the perfect plan, and its estimated total cost of 9.03 beat every alternative. The plan was not the mistake. The number was."),

        h2("2. Read the evidence: what the planner knew"),
        p("The planner does not look at the table when it plans. It looks at **statistics**: a summary per column that `ANALYZE` (run by you or by autovacuum) computes from a random sample of rows and stores in `pg_statistic`. The readable view is `pg_stats`:"),
        code("sql", `
SELECT null_frac, n_distinct, most_common_vals, most_common_freqs, histogram_bounds
FROM pg_stats
WHERE schemaname = 'public' AND tablename = 'enrollments' AND attname = 'status';

 null_frac | n_distinct |       most_common_vals       | most_common_freqs | histogram_bounds
-----------+------------+------------------------------+-------------------+------------------
         0 |          3 | {active,completed,cancelled} | {0.71,0.21,0.08}  |

SELECT last_analyze, last_autoanalyze, n_live_tup, n_mod_since_analyze
FROM pg_stat_user_tables WHERE relname = 'enrollments';

 last_analyze |    last_autoanalyze    | n_live_tup | n_mod_since_analyze
--------------+------------------------+------------+---------------------
              | 2026-10-19 03:12:44+00 |   20104000 |             2104000`, "psql"),
        p("The statistics are a week old and do not know that 'trial' exists. Every value the planner ever saw is in the most-common-values list, and those frequencies already add up to 1. For a value outside the list, the planner can only use what the list leaves over - and that is nothing. A selectivity of 0 becomes the minimum estimate of **1 row**."),
        p("Why had autovacuum not analyzed the table? It analyzes a table when the rows changed since the last analyze exceed `autovacuum_analyze_threshold + autovacuum_analyze_scale_factor x rows` = 50 + 10% of the table. For 20 million rows that is about 2,000,050 changes. The import had just crossed it, and the worker had not reached the table yet when the morning traffic started."),

        h2("3. Selectivity: from statistics to a row estimate"),
        p("For every condition the planner computes a **selectivity**: the fraction of rows it expects to pass (0 to 1). The row estimate of a scan is selectivity x the number of rows in the table. The statistics behind it, per column:"),
        bullets([
            "**`null_frac`**: the fraction of rows where the column is NULL.",
            "**`n_distinct`**: the number of distinct values. A **negative** number is a fraction of the rows instead: -0.0125 on 48 million rows means 600,000 distinct values. ANALYZE stores it that way when it expects the count to grow with the table (for example user_id in activity_log).",
            "**`most_common_vals` / `most_common_freqs`** (MCV list): the most frequent values and the fraction of rows that have each one.",
            "**`histogram_bounds`**: for the values not in the MCV list, boundaries that split them into buckets holding the same number of rows (equal-depth). 11 bounds make 10 buckets of 10% each.",
        ]),
        p("The sample is 300 x `default_statistics_target` rows (100 by default, so 30,000 rows), and the MCV list and the histogram have at most `default_statistics_target` entries. On a 48-million-row table a rare value may never be sampled at all."),

        h3("Equality: col = value"),
        p("If the value is in the MCV list, its frequency is the selectivity. If it is not, the planner assumes that every value outside the list is equally common and shares out the rows the list does not cover:"),
        code("text", `
selectivity(col = v)  =  freq(v)                                                  if v is an MCV
                      =  (1 - sum(most_common_freqs) - null_frac) / (nd - number of MCVs)   otherwise
nd = n_distinct, or -n_distinct x table rows when n_distinct is negative`),
        p("Example on lesson_progress (12,000,000 rows): course_id has `n_distinct = 1210`, `null_frac = 0` and four MCVs (course 7: 0.02, course 3: 0.018, course 12: 0.015, course 140: 0.011). For `course_id = 7` the estimate is 0.02 x 12,000,000 = 240,000 rows. For course 99, which is not in the list: (1 - 0.064 - 0) / (1210 - 4) = 0.000776, about 9,313 rows. PostgreSQL also caps that second value at the frequency of the least common MCV, which does not matter here."),

        h3("Ranges: col < value, col > value, BETWEEN"),
        p("For a range the planner adds two parts: the MCVs that satisfy the condition, and the share of the histogram on the right side of the value, scaled by the fraction of rows the histogram describes. Inside a bucket it assumes the values are spread evenly and interpolates:"),
        code("text", `
completed_at: null_frac 0.31, no MCV list, 11 histogram bounds = 10 buckets of 10% each
  ... b7 = 2026-08-01, b8 = 2026-09-01, b9 = 2026-10-01 ...

completed_at < '2026-09-16'   ->  8 full buckets + half of bucket 8  =  8.5 / 10 = 0.85 of the histogram
selectivity                   =  0 (no MCV below) + (1 - 0 - 0.31) x 0.85  =  0.5865`),
        p("A value below the first bound gives 0 of the histogram, a value above the last gives all of it. This is also why a histogram that was built before new rows arrived misjudges ranges at the newest end; for an indexed column PostgreSQL reads the actual minimum or maximum from the index to soften this."),

        h3("IS NULL, AND, and columns without statistics"),
        bullets([
            "**`col IS NULL`** has selectivity `null_frac`.",
            "**`a AND b`**: the planner multiplies the selectivities, assuming the columns are independent. That is often wrong for columns that depend on each other (a lesson belongs to exactly one course; a city implies a country), and then the estimate is far too low. Section 5 shows the fix.",
            "**A column that was never analyzed** (a new column, a new table before autovacuum) gets fixed defaults: 0.005 for equality, 1/3 for `<` and `>`, 0.005 for a range with both ends. One-third of the table for every inequality can be wildly off in either direction.",
        ]),

        challenge("chal_quiz_pgp_131"),

        h2("4. Selectivity decides the access path"),
        p("The row estimate is the input to every choice in the plan: which index, which join, how much memory. The rough rule for one table:"),
        bullets([
            "**Low selectivity** (a small fraction of the rows): an Index Scan finds them directly. An index is useful when the condition on its **first column** is selective; a condition on its third column alone cannot narrow the search (lesson 6 covers column order).",
            "**Higher selectivity**: a Bitmap Heap Scan collects matching pages first and reads each page once.",
            "**A large fraction of the table**: a Seq Scan reads every page in order, which beats random index lookups. Where the crossover lies depends on `random_page_cost`, on how well the index order matches the table order (`correlation` in pg_stats) and on the cache - often somewhere in the low single-digit percent for an unclustered index.",
        ]),
        p("With 1 row expected for `status = 'trial'`, an index scan on `enrollments_status_idx` and a nested loop were the rational choice. With the real 10.5% of the table, they are among the worst."),
        p("The CodeDev team wants to catch this before production: given the pg_stats numbers and the WHERE clause of a hot query, predict the planner's estimate and its index choice in a deploy check. Build the estimator with the rules above:"),
        challenge("chal_coding_pgp_132"),

        h2("5. Fixing a bad estimate"),
        p("Match the fix to the cause; `pg_stat_user_tables` and a look at each condition on its own tell you which one it is."),
        numbered([
            "**Stale statistics** - the data changed after the last ANALYZE. Run `ANALYZE enrollments;` (it reads a sample, so it is quick even on large tables) and make it the last step of every bulk import or backfill. For tables that change in bursts, lower the threshold per table: `ALTER TABLE enrollments SET (autovacuum_analyze_scale_factor = 0.02);`.",
            "**A sample that is too small** - rare but important values never make the MCV list, or the histogram is too coarse. Raise the target for that column only and re-analyze: `ALTER TABLE activity_log ALTER COLUMN user_id SET STATISTICS 1000; ANALYZE activity_log;`. More entries cost planning time for every query on the column, so do not raise it everywhere.",
            "**Correlated columns** - each condition alone is estimated correctly, together they are not. Create extended statistics so the planner knows the columns depend on each other, then analyze: `CREATE STATISTICS lp_course_lesson (dependencies) ON course_id, lesson_id FROM lesson_progress; ANALYZE lesson_progress;`. Types `ndistinct` (for GROUP BY) and `mcv` (for combinations of values) exist too.",
            "**Conditions the planner cannot estimate** - a function on a column (`lower(email) = $1`) or a comparison between expressions gets a default. An expression index also collects statistics for its expression (lesson 5).",
        ]),
        p("For the incident, `ANALYZE enrollments` took 4 seconds. The new statistics list 'trial' with a frequency of about 0.105, the estimate becomes 2,100,000 rows, and the planner switches to a parallel Seq Scan on enrollments with a Hash Right Join to lesson_progress. The report finishes in 6.2 seconds - not the 300 ms from before the import, because it now aggregates 2.1 million trials instead of none, but no longer a 14-minute nested loop. The import job got an `ANALYZE` as its last step."),

        h2("6. How to verify an estimate"),
        bullets([
            "**Compare estimate and actual per node** with EXPLAIN ANALYZE: a factor of 10 or more at a scan is worth explaining.",
            "**Recompute it by hand** from pg_stats with the formulas in section 3. If your number matches the planner's `rows=`, you know exactly which statistic is wrong; if it does not, look for a function, a type cast or a parameter the planner could not see.",
            "**Test each condition alone.** If every condition alone is right and the combination is wrong, the columns are correlated; if one condition alone is wrong, its statistics are stale or too coarse.",
            "**Check the freshness**: `last_analyze`, `last_autoanalyze` and `n_mod_since_analyze` in pg_stat_user_tables.",
            "**After the fix, re-run the same EXPLAIN ANALYZE** and confirm both that the estimate moved and that the plan and the time followed it.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**Bulk loads without ANALYZE.** Spot it: a large `n_mod_since_analyze` and a value from the import missing from `most_common_vals`.",
            "**Assuming every misestimate means stale statistics.** Spot it: the table was analyzed recently and each condition alone is estimated well - the cause is correlation, and ANALYZE changes nothing.",
            "**Raising default_statistics_target for the whole cluster.** Spot it: planning time grows for every query while one column needed the change.",
            "**Reading a negative n_distinct as a count.** Spot it: -0.0125 is a fraction of the rows (600,000 values on 48 million rows), not \"almost no values\".",
            "**Forcing the plan instead of fixing the estimate** (disabling nested loops for the session, adding an index for a query that already has one). Spot it: the next query with the same bad estimate fails the same way.",
        ]),

        h2("8. Summary"),
        bullets([
            "Row estimates come from pg_stats: MCVs and their frequencies for equality, histograms for ranges, null_frac for IS NULL, and a product of selectivities for AND.",
            "Estimates go wrong when statistics are stale, the sample misses important values, or columns are correlated; find which one by checking freshness and each condition alone.",
            "Fix the estimate (ANALYZE, a column statistics target, CREATE STATISTICS) and the plan usually fixes itself; verify with EXPLAIN ANALYZE that estimate, plan and time all moved.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Statistics Used by the Planner (section 14.2) and Row Estimation Examples (section 76.1) - postgresql.org/docs/current/planner-stats.html",
            "PostgreSQL documentation: pg_stats view, CREATE STATISTICS, ANALYZE, and The Autovacuum Daemon (autovacuum_analyze_threshold, autovacuum_analyze_scale_factor)",
            "PostgreSQL documentation: Using EXPLAIN - postgresql.org/docs/current/using-explain.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick a query from your own pg_stat_statements with a filter on two columns. Read pg_stats for both columns, compute the estimate by hand for each condition and for the combination, and compare with EXPLAIN ANALYZE. If the combination is off, create dependencies statistics on the two columns, run ANALYZE and compare again."),
    ],
});
