// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-2-1",
    title: "Choosing an index for the query pattern",
    slug: { _type: "slug", current: "choosing-an-index-for-the-query-pattern" },
    description:
        "CodeDev has an index on almost every column, and three queries still sit at the top of pg_stat_statements. Learn to read a query as a pattern - equality columns, a range, an ORDER BY, a LIMIT - and to design the one composite index that serves it, when an index is not worth it, how the PostgreSQL plan changes from Sort and Filter to a plain Index Scan, and how to check the same thing with SQLite's EXPLAIN QUERY PLAN in the challenge.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The weekly database review of https://api.codedev.test shows three queries at the top of pg_stat_statements: the \"My courses\" page, the weekly activity widget on the dashboard, and the certificates tab that lists the learners who completed a course. Every column these queries filter on already has its own index, added one at a time over two years. The team lead asks for the indexes these queries actually need, at most one per query, and for the evidence that they help.",
    },

    content: [
        h2("1. The incident: indexed everywhere, slow anyway"),
        p("The review starts from the queries that cost the most in total, not from the slowest single call (lesson 1.1). Three of them come from features that every learner or instructor opens daily:"),
        code("text", `
SELECT left(query, 64) AS query, calls, round(mean_exec_time::numeric, 2) AS mean_ms,
       round(total_exec_time::numeric / 1000) AS total_s
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 3;

 query                                                            |  calls  | mean_ms | total_s
------------------------------------------------------------------+---------+---------+--------
 SELECT count(*) FROM activity_log WHERE user_id = $1 AND created |  904112 |   14.37 |   12992
 SELECT user_id, created_at FROM enrollments WHERE course_id = $1 |   61530 |   61.80 |    3803
 SELECT id, course_id, status, created_at FROM enrollments WHERE  | 1210388 |    0.92 |    1114`, "pg_stat_statements, last 7 days"),
        p("And this is what the two tables carry today. Every column that ever appeared in a slow WHERE got its own index:"),
        code("text", `
\\d enrollments
Indexes:
    "enrollments_pkey" PRIMARY KEY, btree (id)
    "enrollments_user_id" btree (user_id)
    "enrollments_course_id" btree (course_id)
    "enrollments_status" btree (status)
    "enrollments_created_at" btree (created_at)

\\d activity_log
Indexes:
    "activity_log_pkey" PRIMARY KEY, btree (id)
    "activity_log_user_id" btree (user_id)
    "activity_log_created_at" btree (created_at)`, "psql"),
        p("Six secondary indexes, and the planner still does extra work on every call. \"Is there an index on the column?\" is the wrong question. The right one is: **does an index exist whose order matches the way this query looks for rows?**"),

        h2("2. Read the evidence: what the plans do with one-column indexes"),
        p("Take the certificates tab first. It lists the learners who completed course 12, a popular course with about 41,000 enrollments:"),
        code("text", `
EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id, created_at FROM enrollments WHERE course_id = 12 AND status = 'completed';

Index Scan using enrollments_course_id on enrollments  (cost=0.43..41872.15 rows=1890 width=12) (actual time=0.058..58.904 rows=1904 loops=1)
  Index Cond: (course_id = 12)
  Filter: (status = 'completed'::text)
  Rows Removed by Filter: 39306
  Buffers: shared hit=38411 read=1220
Planning Time: 0.131 ms
Execution Time: 59.112 ms`, "certificates tab, course 12"),
        p("The index found all 41,210 enrollments of the course (**Index Cond**), then PostgreSQL fetched each row from the table to test the status (**Filter**) and threw away 39,306 of them. Almost 40,000 buffer visits for 1,904 rows. The index on `status` cannot help: half the table is `active`, so it is not selective on its own, and the planner does not combine it here."),
        p("Now \"My courses\", the cheapest of the three per call but the most frequent:"),
        code("text", `
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, course_id, status, created_at FROM enrollments
WHERE user_id = 4812 ORDER BY created_at DESC LIMIT 20;

Limit  (cost=12.95..13.00 rows=20 width=32) (actual time=0.402..0.406 rows=20 loops=1)
  ->  Sort  (cost=12.95..13.13 rows=74 width=32) (actual time=0.401..0.403 rows=20 loops=1)
        Sort Key: created_at DESC
        Sort Method: top-N heapsort  Memory: 27kB
        ->  Index Scan using enrollments_user_id on enrollments  (cost=0.43..10.98 rows=74 width=32) (actual time=0.021..0.371 rows=74 loops=1)
              Index Cond: (user_id = 4812)
              Buffers: shared hit=77
Execution Time: 0.431 ms`, "My courses, one learner"),
        p("The index finds the learner's rows but not in the order the page wants, so all 74 are fetched and sorted to keep 20. For this learner it costs 0.4 ms. For a company account with 6,000 enrollments it is 6,000 fetches and a sort on every page view, and the page is opened 1.2 million times a week."),
        p("The weekly activity count has the same disease in a third form: with `activity_log_user_id` and `activity_log_created_at`, PostgreSQL can build a bitmap from each index and intersect them (**BitmapAnd**), but it must read every entry of both - all of the user's events and all of the week's events of every user - to keep the few that overlap."),

        h2("3. Core idea: index the pattern, not the column"),
        p("A B-tree index is a sorted list of keys, each pointing to a row. With several columns, the list is sorted by the first column, then by the second inside equal first values, and so on, like a phone book sorted by last name, then first name. That sort order decides what the index can do for a query:"),
        bullets([
            "**Equality columns** (`user_id = ?`, `course_id = ? AND status = ?`) narrow the search to one contiguous run of entries, as long as they are the leading columns.",
            "**One range column** (`created_at >= ? AND created_at < ?`) right after the equality columns narrows that run further: the scan starts at the first matching entry and stops at the last.",
            "**An ORDER BY column** right after the equality columns is already sorted inside the run, so there is no Sort node, and with a LIMIT the scan stops after the first N entries.",
            "**Anything after the first range column** is checked entry by entry: it saves visits to the table but does not reliably narrow the part of the index that is read (PostgreSQL 18's skip scan can sometimes jump over entries, mostly when the range column has few distinct values). That is why one index serves one range (or one ORDER BY) well, not two.",
        ]),
        p("So the design rule for a query pattern is: **equality columns first, then the one range or ORDER BY column**. Write the pattern down before you write the index. The three queries of section 1 are yours to index in the challenge below; here is the method on three other queries from the same review, on `submissions(id, user_id, challenge_id, status, score, submitted_at)` and `login_events(id, user_id, ip, created_at)`:"),
        code("sql", `
-- grading_queue: the oldest pending submissions of one challenge, for the reviewers
SELECT id, user_id, submitted_at FROM submissions
WHERE challenge_id = $1 AND status = 'pending' ORDER BY submitted_at LIMIT 50;

-- login_rate_limit: sign-in attempts from one address in the last 10 minutes
SELECT count(*) FROM login_events WHERE ip = $1 AND created_at >= now() - interval '10 minutes';

-- status_report: the admin overview, once a day
SELECT status, count(*) FROM submissions GROUP BY status;`, "three more queries from the review"),
        code("text", `
query             equality              range / order          index
grading_queue     challenge_id, status  ORDER BY submitted_at  submissions (challenge_id, status, submitted_at)
login_rate_limit  ip                    created_at range       login_events (ip, created_at)
status_report     -                     -                      none: it reads every row`, "pattern -> index"),
        p("For two equality columns the order does not change how fast that query is: both orders lead to the same run of entries. It decides which **other** queries can use the index. `(challenge_id, status, submitted_at)` also serves \"all submissions of a challenge\" through its leading column; `(status, challenge_id, submitted_at)` does not (PostgreSQL 18's skip scan can search it once per status value, but a leading column is the reliable way). Lesson 2.3 is about exactly this choice."),
        h3("When an index is not the answer"),
        bullets([
            "**The query returns a large part of the table.** A report over all active enrollments reads half the table; a Seq Scan reads it in order and is cheaper than half a million random index lookups. The planner knows this and will ignore your index.",
            "**The table is small.** A table of a few hundred rows fits in a handful of pages; scanning them beats walking an index.",
            "**The query is rare and the table is write-heavy.** Every index is updated on every INSERT, on many UPDATEs and on DELETE, and takes space and cache. An index that saves one second a day on an admin report and costs every enrollment write is a bad trade (lesson 4.3).",
            "**A column with few values on its own.** An index on `status` alone points to half the table for `active`. It only helps as a later column of a composite index, or as a partial index for a rare value.",
        ]),

        challenge("chal_quiz_pgp_211"),

        h2("4. Worked example: the grading queue and the rate limit"),
        p("In PostgreSQL, build new indexes on a live table with `CONCURRENTLY`, which does not block writes while the index is built (it takes longer, cannot run inside a transaction, and leaves an INVALID index behind if it fails, which you drop and retry):"),
        code("sql", `
-- grading_queue: two equality columns, then the ORDER BY column. challenge_id first, so the
-- index also serves "every submission of a challenge". A newest-first page
-- (ORDER BY submitted_at DESC) would use the same index: a B-tree is read backward just as well.
CREATE INDEX CONCURRENTLY submissions_challenge_status_submitted
    ON submissions (challenge_id, status, submitted_at);

-- login_rate_limit: equality on ip, then the range on created_at.
CREATE INDEX CONCURRENTLY login_events_ip_created ON login_events (ip, created_at);

-- status_report: no index. It counts every submission once a day; a Seq Scan is the right plan.`, "migration 20261027_002_queue_indexes.sql"),
        p("Before the change, the queue used the one-column index on `challenge_id`: it fetched all 38,000 submissions of challenge 731, filtered the pending ones and sorted them to keep 50. After:"),
        code("text", `
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, user_id, submitted_at FROM submissions
WHERE challenge_id = 731 AND status = 'pending' ORDER BY submitted_at LIMIT 50;

Limit  (cost=0.56..58.94 rows=50 width=20) (actual time=0.034..0.162 rows=50 loops=1)
  Buffers: shared hit=54
  ->  Index Scan using submissions_challenge_status_submitted on submissions  (cost=0.56..1471.18 rows=1260 width=20) (actual time=0.033..0.151 rows=50 loops=1)
        Index Cond: ((challenge_id = 731) AND (status = 'pending'::text))
        Buffers: shared hit=54
Planning Time: 0.162 ms
Execution Time: 0.187 ms`, "grading queue, challenge 731, after"),
        p("Both conditions are in **Index Cond**, there is no Filter and no Sort node, and the Limit stops the scan after 50 entries: 54 buffers, however many submissions the challenge has. The rate-limit count gets both of its conditions into Index Cond too and reads only the entries of one address in the last ten minutes; on an append-only table like login_events it is usually an Index Only Scan, because count(*) needs no other column."),
        h3("Two refinements, and when to use them"),
        bullets([
            "**INCLUDE columns for an Index Only Scan.** `CREATE INDEX ... ON submissions (challenge_id, status, submitted_at) INCLUDE (id, user_id)` stores the other selected columns in the index, so PostgreSQL can skip the table when the visibility map allows it. Worth it for a hot query that reads few columns; it makes the index bigger, so not by default.",
            "**A partial index for a rare value.** If the pending submissions are the only ones ever looked up by challenge, `CREATE INDEX ... ON submissions (challenge_id, submitted_at) WHERE status = 'pending'` indexes only the few rows still waiting for a review. The query must contain the same condition (`status = 'pending'` as a literal, not a parameter that could be anything) for the planner to use it.",
        ]),
        p("Do not drop the old one-column indexes in the same migration. First check in `pg_stat_user_indexes` whether anything else still uses them (`idx_scan` over a full business cycle); lesson 4.3 covers that clean-up."),

        h2("5. The same check in SQLite: EXPLAIN QUERY PLAN"),
        p("The code runner has SQLite, not PostgreSQL. SQLite uses B-trees with the same composite-key order, so the design rule is identical, and its `EXPLAIN QUERY PLAN` shows the same decisions in a shorter form (there is no EXPLAIN ANALYZE: no actual rows or times):"),
        code("text", `
-- one-column indexes on user_id, challenge_id, status and submitted_at:
sqlite> EXPLAIN QUERY PLAN SELECT id, user_id FROM submissions WHERE challenge_id = ? AND status = ? ORDER BY submitted_at LIMIT 50;
QUERY PLAN
|--SEARCH submissions USING INDEX submissions_status (status=?)
\`--USE TEMP B-TREE FOR ORDER BY

-- after CREATE INDEX submissions_challenge_status_submitted ON submissions (challenge_id, status, submitted_at):
QUERY PLAN
\`--SEARCH submissions USING INDEX submissions_challenge_status_submitted (challenge_id=? AND status=?)`, "sqlite3"),
        bullets([
            "**SEARCH ... USING INDEX x (a=? AND b>?)** is an index search, like an Index Scan with those columns in Index Cond. The columns in brackets are the ones the search uses; a WHERE column missing there is checked row by row, like a Filter. Above, SQLite (without ANALYZE statistics) picked the `status` index, so `challenge_id` was checked row by row.",
            "**SCAN t** is a full table scan, like a Seq Scan. **SCAN t USING INDEX x** is a full walk of an index: every entry is read, so it is still a scan.",
            "**USE TEMP B-TREE FOR ORDER BY** is a sort after reading, like a Sort node.",
            "**USING COVERING INDEX** means the table is not visited, like an Index Only Scan.",
        ]),
        p("In the challenge you replace the one-index-per-column set with at most three indexes. The runner fills both tables, applies your `CREATE INDEX` statements, runs the three queries from section 1 and prints their rows with a verdict per plan. The rows must not change: an index changes how rows are found, never which rows a query returns."),
        challenge("chal_coding_pgp_212"),

        h2("6. How to verify an index change"),
        numbered([
            "**Before you create it:** run `EXPLAIN (ANALYZE, BUFFERS)` of the real query with real parameters on a production-like copy, including a heavy case (the popular course, the company account), and keep the output.",
            "**After:** the same command. Expect the conditions in Index Cond, no Filter with a large Rows Removed by Filter, no Sort under the Limit, and far fewer buffers. Compare buffers more than time: time depends on what is in cache, buffers count the work.",
            "**In production:** call `pg_stat_statements_reset()` for the query (or take a snapshot) and compare `mean_exec_time` and `shared_blks_hit + shared_blks_read` per call a day later.",
            "**Is it used?** `SELECT indexrelname, idx_scan FROM pg_stat_user_indexes WHERE relname = 'enrollments';` An index whose `idx_scan` stays at 0 is pure write cost.",
        ]),
        callout("info", "Generic plans and parameters",
            "Prepared statements with $1 may be planned once and reused (a generic plan) after five executions. If the plan with a literal looks good but production stays slow, run EXPLAIN on the prepared statement (PREPARE q AS ...; EXPLAIN EXECUTE q(4812);) or look at the plan auto_explain logged, and check plan_cache_mode."),

        h2("7. Common mistakes"),
        bullets([
            "**One index per column.** Each query can use one of them well, and the rest only through a BitmapAnd that reads every entry of every index involved. Spot it: Filter lines with large Rows Removed by Filter, or BitmapAnd nodes, on tables that already have \"an index on everything\".",
            "**The ORDER BY column first.** `(submitted_at, challenge_id)` gives the order but scatters one challenge's rows across the whole index. Spot it: an Index Scan with the equality column in Index Cond but a huge buffer count and time; lesson 2.3 takes it apart.",
            "**Two range columns in one index, expecting both to narrow.** Only the first range is used to jump; the second is checked entry by entry. Spot it: the second column appears in the condition, but the number of index entries read matches the first range alone.",
            "**Wrapping the indexed column in a function or a cast.** `WHERE date(created_at) = ...` or `WHERE lower(email) = ...` cannot use an index on the bare column. Spot it: a Seq Scan with the function in the Filter. Lesson 2.2 is that incident.",
            "**Declaring victory on a cold or tiny dataset.** On a laptop table of 1,000 rows every plan is fast. Spot it: the test data has no heavy case; add the popular course and the company account before you compare.",
        ]),

        h2("8. Summary"),
        numbered([
            "Write the query as a pattern - equality columns, at most one range or ORDER BY column, LIMIT - and build one composite index in that order: equality first, then the range or order column.",
            "An index is not free and not always useful: skip it for queries that read a large part of the table, for tiny tables and for rare queries on write-heavy tables.",
            "Verify with the plan (conditions in Index Cond, no Filter or Sort doing the real work, fewer buffers) and with pg_stat_statements and pg_stat_user_indexes in production.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Multicolumn Indexes - https://www.postgresql.org/docs/current/indexes-multicolumn.html",
            "PostgreSQL documentation: Indexes and ORDER BY, Index-Only Scans and Covering Indexes, Partial Indexes (chapter 11)",
            "PostgreSQL documentation: Using EXPLAIN - https://www.postgresql.org/docs/current/using-explain.html",
            "SQLite documentation: EXPLAIN QUERY PLAN and The SQLite Query Optimizer Overview",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the five most expensive queries of a database you work on from pg_stat_statements. For each, write the pattern table from section 3 (equality, range or order, index), compare it with the indexes in \\d, and run EXPLAIN (ANALYZE, BUFFERS) with a heavy parameter. Note which queries already have a matching index, which need one, and which would be better without one."),
    ],
});
