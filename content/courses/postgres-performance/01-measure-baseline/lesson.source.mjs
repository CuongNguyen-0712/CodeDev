// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-1-1",
    title: "Measure first: baselines, pg_stat_statements & the slow query log",
    slug: { _type: "slug", current: "measure-baseline-pg-stat-statements" },
    description:
        "A fix for the slow course progress page was declared a success because the second EXPLAIN ANALYZE ran 19 times faster - the cache was warm, the plan was unchanged and production p95 did not move. Learn to record a baseline before you tune: pg_stat_statements for calls, mean and total time and rows, the slow query log and auto_explain for real plans, p95 instead of averages, production-like data, and how to compare runs in the same cache state with BUFFERS.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The course progress page (GET https://api.codedev.test/courses/:id/progress) has a p95 of 2.1 s for large courses. A pull request rewrote the progress query and its description showed two EXPLAIN ANALYZE timings on staging: 1,843 ms before, 97 ms after. It was merged on Thursday. On Friday the API dashboard still shows a p95 of 2.0 s for the endpoint, and the ticket is reopened with the comment \"the fix did nothing?\".",
    },

    content: [
        h2("1. The incident: a fix that was measured once"),
        p("The ticket that came back on Friday reads like many performance tickets:"),
        code("text", `
PERF-311  Course progress page slow for large courses      reopened
-----------------------------------------------------------------------
Thu 14:02  PR #2481 "Rewrite progress query" merged.
           Description: "Before: Execution Time 1843.118 ms.
                         After:  Execution Time   97.304 ms. 19x faster."
Fri 09:40  API dashboard, GET /courses/:id/progress, last 24 h:
           p50 310 ms   p95 2,040 ms   p99 3,900 ms   (Wednesday: p95 2,110 ms)
Fri 09:52  "The fix did nothing? Reopening."`, "ticket"),
        p("Nobody lied. The developer ran the old query on staging, saw 1.8 seconds, rewrote it, ran the new one and saw 97 ms. The problem is what was compared: two single runs, taken one after the other, in two different states of the database cache. This lesson is about the step that comes before any tuning: **measure a baseline that a fix can be compared against**."),

        h2("2. Read the evidence again, with BUFFERS"),
        p("Run the old query twice in a row, now with `BUFFERS`, which reports how many 8 kB pages each node touched and where they came from:"),
        code("sql", `
EXPLAIN (ANALYZE, BUFFERS)
SELECT lesson_id, user_id, completed_at
FROM lesson_progress
WHERE course_id = 42;`),
        code("text", `
-- run 1, right after the staging database was restarted
Index Scan using lesson_progress_course_id_idx on lesson_progress  (cost=0.56..48210.33 rows=41500 width=32) (actual time=0.912..1838.207 rows=41022 loops=1)
  Index Cond: (course_id = 42)
  Buffers: shared hit=180 read=41022
Planning Time: 0.204 ms
Execution Time: 1843.118 ms

-- run 2, a few seconds later, nothing changed
Index Scan using lesson_progress_course_id_idx on lesson_progress  (cost=0.56..48210.33 rows=41500 width=32) (actual time=0.021..95.640 rows=41022 loops=1)
  Index Cond: (course_id = 42)
  Buffers: shared hit=41202
Planning Time: 0.088 ms
Execution Time: 97.304 ms`, "psql"),
        p("Same plan, same estimate, same 41,022 rows, same 41,202 pages. The only difference is `read` versus `hit`. A **hit** is a page that was already in `shared_buffers`, PostgreSQL's own cache. A **read** is a page PostgreSQL had to ask the operating system for - from the OS page cache if it was lucky, from disk if not. The first run paid for loading the pages; the second run found them in memory. Run the rewritten query twice and you get the same pattern. The PR compared a cold old query with a warm new one."),
        p("In production the picture is different again: the progress pages of the largest courses compete with everything else for memory, so a real request is somewhere between the two runs. That is exactly why the fix has to be judged by production numbers, not by one run on a laptop or on staging."),

        h2("3. What a baseline is, and when not to bother"),
        p("A baseline is a written-down measurement of the current behaviour, taken the same way you will measure the fix. For one slow query it has five parts:"),
        numbered([
            "**The exact statement** with realistic parameter values (course 42 has 41,000 progress rows; course 7 has 300 - they are different workloads).",
            "**How often it runs and what it costs in total**, from `pg_stat_statements`: calls, mean and total execution time, rows per call.",
            "**The latency the users see**, from the application or the API gateway: p50, p95 and p99 of the endpoint, not the average.",
            "**The plan with ANALYZE and BUFFERS**, taken several times, with the cache state written down.",
            "**The environment**: PostgreSQL version, table sizes, the settings that matter (`shared_buffers`, `work_mem`, `random_page_cost`) and when the table was last analyzed.",
        ]),
        p("Do not tune at all when the numbers say it is not worth it. A query that takes 3 ms and runs twice a day is not your problem even if its plan looks ugly. Start from the statements that use the most database time or that sit on the path of a slow endpoint, and stop when the endpoint meets its target. Every index and every rewrite has a cost (lesson 12), so a change without a measured benefit is a change you should not make."),

        h2("4. pg_stat_statements: where the database time goes"),
        p("`pg_stat_statements` is a contrib extension that records, for every normalized statement (constants replaced by `$1`, `$2`), how many times it ran and how long it took. It needs to be loaded at server start:"),
        code("text", `
# postgresql.conf (restart required)
shared_preload_libraries = 'pg_stat_statements'
compute_query_id = on            # the default "auto" also works once the extension is loaded
track_io_timing = on             # adds read/write times to BUFFERS and to pg_stat_statements`, "postgresql.conf"),
        code("sql", `
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- the statements that cost the database most since the last reset
SELECT calls,
       round(total_exec_time::numeric)          AS total_ms,
       round(mean_exec_time::numeric, 1)        AS mean_ms,
       round(stddev_exec_time::numeric, 1)      AS stddev_ms,
       round(max_exec_time::numeric)            AS max_ms,
       rows / greatest(calls, 1)                AS rows_per_call,
       shared_blks_hit, shared_blks_read,
       left(query, 70)                          AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;`, "top-statements.sql"),
        bullets([
            "**Order by `total_exec_time` to find load, by `mean_exec_time` to find slow calls.** A 4 ms sign-in query that runs 118,000 times a day costs more than a 2-second report that runs 40 times. Both orderings are useful; they answer different questions.",
            "**`rows / calls`** tells you whether a statement returns 1 row or 20,000. A huge number on a page that shows 20 items points at missing `LIMIT` or filtering in the application.",
            "**`shared_blks_read` versus `shared_blks_hit`** tells you how much of the statement's work missed the cache.",
            "**There are no percentiles.** The view has mean, stddev, min and max. A max of 3.9 s next to a mean of 60 ms tells you there is a tail, not how big it is.",
            "**Counters accumulate.** Take a snapshot before and after a change (or call `pg_stat_statements_reset()` at a known time and note it); comparing two cumulative totals from different days compares different workloads.",
        ]),
        callout("info", "PostgreSQL 16 and 17",
            "Column names have been stable since PostgreSQL 13: total_exec_time and mean_exec_time (older versions used total_time and mean_time). PostgreSQL 17 adds stats_since and minmax_stats_since, which tell you since when the counters of a row have been collecting."),

        h2("5. The slow query log and auto_explain: plans from production"),
        p("pg_stat_statements tells you **which** statement is slow; it does not keep plans or parameter values. Two server settings fill that gap:"),
        code("text", `
# log every statement that runs longer than 500 ms, with its duration and parameters
log_min_duration_statement = 500ms

# auto_explain: log the plan of slow statements as they actually ran
session_preload_libraries = 'auto_explain'      # or shared_preload_libraries
auto_explain.log_min_duration = 500ms
auto_explain.log_analyze = on                   # actual rows and loops in the logged plan
auto_explain.log_buffers = on
auto_explain.log_timing = off                   # per-node timing is the expensive part
auto_explain.log_format = json                  # easy to feed to tools (lesson 2)
auto_explain.sample_rate = 0.1                  # explain 10% of the statements`, "postgresql.conf"),
        p("`log_analyze` makes PostgreSQL instrument every statement, not only the slow ones, because it cannot know in advance which ones will be slow. Per-node timing can cost a lot on some hardware, so the usual production setting keeps `log_analyze` with `log_timing = off` (you still get actual rows and loops) and a `sample_rate` below 1. The log then holds the plan that production really used, with production's data and parameters - which is often not the plan you get on your laptop."),
        p("A typical log line looks like this, and it is the starting point for lesson 2:"),
        code("text", `
2026-10-23 09:14:02.118 UTC [48211] LOG:  duration: 2104.881 ms  plan:
	Query Text: SELECT lesson_id, user_id, completed_at FROM lesson_progress WHERE course_id = $1
	Index Scan using lesson_progress_course_id_idx on lesson_progress  (cost=0.56..48210.33 rows=41500 width=32) (actual rows=41022 loops=1)
	  Index Cond: (course_id = 42)
	  Buffers: shared hit=3120 read=38082`, "postgresql.log"),

        h2("6. p95, not the average"),
        p("Users do not experience the average. If 19 page loads take 100 ms and the 20th takes 4 s, the mean is 295 ms - a number nobody ever saw - and the learner who waited 4 s is the one who complains. Report latency as percentiles: **p50** (the typical request), **p95** and **p99** (the slow tail). Here is the arithmetic on a small sample, the same way a dashboard does it:"),
        code("python", `
import math

def percentile(samples_ms, p):
    """Nearest-rank percentile: the smallest value with at least p% of the samples at or below it."""
    ordered = sorted(samples_ms)
    rank = math.ceil(p / 100 * len(ordered))
    return ordered[max(rank, 1) - 1]

durations = [92, 95, 97, 98, 101, 103, 104, 110, 112, 118,
             120, 125, 131, 140, 155, 170, 210, 380, 1900, 2050]
print(sum(durations) / len(durations))   # 320.55 - the mean
print(percentile(durations, 50))         # 118
print(percentile(durations, 95))         # 1900
print(percentile(durations, 99))         # 2050`, "percentiles.py"),
        p("Where do the samples come from? For an endpoint, from the application's request metrics. For one statement, from the durations in the slow query log, or from a load test: `pgbench -n -f progress.sql -T 60 -c 8 --log` writes one line per transaction with its latency, from which you compute percentiles exactly like above. pg_stat_statements alone cannot give you a p95."),
        callout("warning", "Averages also hide which requests are slow",
            "The p95 of the progress endpoint is dominated by the few courses with tens of thousands of progress rows. Measuring the query for course 7 (300 rows) and seeing 4 ms says nothing about course 42. Pick parameter values from the slow log, not from the first row of the table."),

        challenge("chal_quiz_pgp_111"),

        h2("7. Production-like data, or the plan is a different plan"),
        p("The planner chooses a plan from table sizes and statistics (lesson 3). A staging database with 2,000 progress rows will happily scan the whole table, because that is the cheapest plan for 2,000 rows - and the plan you tune there will never run in production. Before you trust a measurement, check that:"),
        bullets([
            "**Row counts and distributions are close to production**: a recent restore or an anonymized copy, not a seed script. The skew matters as much as the size - one course with 41,000 progress rows and many with 300.",
            "**Statistics are fresh** on both sides: run `ANALYZE` after loading data, and compare `pg_stats` for the columns in your WHERE clause.",
            "**Version and settings match**: the same major PostgreSQL version, the same `work_mem`, `random_page_cost`, `effective_cache_size` and `jit` settings. Check with `SHOW` or `SELECT name, setting FROM pg_settings WHERE source <> 'default'`.",
            "**The plan you measure is the plan production uses**: compare it with the auto_explain plan from section 5. If they differ, find out why before you go on.",
        ]),

        h2("8. Warm and cold: compare like with like"),
        p("Every run changes the cache for the next one. A fair comparison controls that:"),
        numbered([
            "**Decide which state you are measuring.** Usually warm: in production the hot pages of a frequent query are in memory. Measure cold only when the incident is about cold reads (after a restart, a failover, or a rarely used report).",
            "**Warm up, then repeat.** Run the statement a few times and discard those runs, then take 10 or more measurements and report the median and the spread, before and after the change, in the same session conditions.",
            "**Compare the work, not only the time.** `Buffers: shared hit + read` is the number of pages the plan touched, and it does not depend on the cache. A real improvement usually touches fewer pages; a \"faster\" run with the same page count is a cache effect.",
            "**Turn on `track_io_timing`** to see how much of the time was spent reading (`I/O Timings: shared read=...` in the plan).",
            "**Confirm in production.** After the deploy, compare the snapshot of pg_stat_statements and the endpoint's p95 over a comparable period (same weekday, similar traffic).",
        ]),
        p("Applied to PERF-311: the rewritten query touched the same 41,202 pages as the old one. The real fix (an index that matches the query pattern, lesson 4) cut it to 412 pages, and with that, warm or cold, the endpoint's p95 dropped to 180 ms. That claim came with a baseline, a repeated measurement and the production dashboard after the deploy."),

        h2("9. How to verify a performance fix"),
        code("text", `
Baseline (before)                          After
---------------------------------------    ---------------------------------------
statement   progress by course_id          same normalized statement
params      course_id = 42 (41,022 rows)   same parameters
pg_stat     calls 9,800/day, mean 1,610 ms  snapshot over the same weekday
endpoint    p50 310, p95 2,110, p99 3,900   p50 / p95 / p99 from the same dashboard
plan        Index Scan, 41,202 buffers      plan + buffers, 10 warm runs: median, min, max
env         PG 17.2, staging restore 10-20  same environment, ANALYZE run on both`, "baseline.txt"),
        bullets([
            "The same statement, the same parameters, the same environment and cache state on both sides.",
            "Several runs, reported as median and spread, plus the page counts from BUFFERS.",
            "The result rows are the same (count them, or compare a checksum): a faster query that returns less is a bug, not an optimization.",
            "The production p95 and the pg_stat_statements totals after the deploy, over a comparable period.",
        ]),

        h2("10. Common mistakes and how to spot them"),
        bullets([
            "**Comparing a first run with a second run.** Spot it: the faster run shows `shared hit` where the slower one showed `read`, with the same total page count.",
            "**Tuning by average.** Spot it: the dashboard shows a mean that looks fine while users complain; plot p95 and p99 and the problem appears.",
            "**Measuring on a tiny dataset.** Spot it: the staging plan is a Seq Scan or a different join than the plan in the auto_explain log.",
            "**Picking the slowest statement by mean only.** Spot it: order the same report by total_exec_time and a different statement comes first.",
            "**Leaving EXPLAIN ANALYZE running on writes.** It executes the statement: an `UPDATE` really updates. Spot it before it happens: wrap it in `BEGIN; EXPLAIN ANALYZE ...; ROLLBACK;`.",
        ]),

        h2("11. Summary"),
        bullets([
            "Measure before you change anything: the statement and parameters, pg_stat_statements totals, the endpoint's p95 and a plan with ANALYZE and BUFFERS, on production-like data.",
            "Compare runs in the same cache state and compare pages touched, not only milliseconds; a second run is usually faster because the cache is warm.",
            "Use pg_stat_statements for where the time goes, the slow query log and auto_explain for the real plans, and percentiles for what users feel; confirm the fix in production.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: pg_stat_statements - postgresql.org/docs/current/pgstatstatements.html",
            "PostgreSQL documentation: Using EXPLAIN (section 14.1, EXPLAIN ANALYZE and BUFFERS) - postgresql.org/docs/current/using-explain.html",
            "PostgreSQL documentation: auto_explain and Error Reporting and Logging (log_min_duration_statement)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "On a database you own, enable pg_stat_statements, reset it, run your application's test suite or a pgbench script, and list the top 5 statements by total and by mean time. Pick one, write a baseline in the format of section 9, and run it cold (after a restart) and warm ten times each. Note the median, the spread and the buffers of both."),
    ],
});
