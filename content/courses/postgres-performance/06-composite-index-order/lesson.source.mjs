// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-2-3",
    title: "Spot the AI mistake: composite index column order",
    slug: { _type: "slug", current: "spot-the-ai-mistake-composite-index-column-order" },
    description:
        "An AI assistant was asked for indexes for the activity feed and the course roster. It created (created_at, user_id) and (status, course_id), explained its choice with two popular rules of thumb, and the change passed review on staging. In production the planner never searches either index. Learn how a composite B-tree is ordered, why only a leading prefix can be searched, the rule \"equality first, then the range or ORDER BY column\", which rules of thumb are myths, and how to review AI-generated indexes with plans on realistic data.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer and code reviewer, CodeDev learning platform",
        problem:
            "The \"Recent activity\" feed on https://app.codedev.test and the course roster for instructors were slow, so a developer asked an AI assistant for indexes. The migration it wrote was reviewed on staging, where both pages answered in under a millisecond, and deployed on Monday. On Tuesday auto_explain on the primary still logs the feed at up to 1.8 s for some learners and the roster at 400 ms, the same as before the migration, and the two new indexes add write cost to the two busiest tables.",
    },

    content: [
        h2("1. The incident: a plausible answer with a reason attached"),
        p("This was the request, with the three queries copied from pg_stat_statements:"),
        code("text", `
Add indexes for these three queries. activity_log has 40M rows, enrollments 6M.
Add at most one index per table: every index slows down our writes.

feed:             SELECT id, kind, created_at FROM activity_log
                  WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20
roster:           SELECT user_id, status FROM enrollments WHERE course_id = $1
roster_by_status: SELECT user_id, status FROM enrollments WHERE course_id = $1 AND status = $2`, "prompt to the AI assistant"),
        p("And this was the answer, merged as migration 20261026_004:"),
        code("sql", `
-- created_at goes first because the feed sorts by it.
CREATE INDEX CONCURRENTLY activity_log_created_user ON activity_log (created_at, user_id);
-- status goes first because it has only three values, which makes the index more selective.
CREATE INDEX CONCURRENTLY enrollments_status_course ON enrollments (status, course_id);`, "AI-generated migration"),
        p("It looks careful: one index per table as asked, CONCURRENTLY, both columns of each query covered, and a comment that explains each choice. The reviewer ran the three queries on staging, saw the right rows and an `Index Scan using activity_log_created_user` in the feed plan, and approved. Both reasons in the comments are rules of thumb that circulate widely. Both are wrong for these queries."),

        h2("2. Reproduce it and read the evidence"),
        p("Staging has 50 users and 30,000 activity rows. The feed plan there for an active learner:"),
        code("text", `
Limit  (cost=0.29..74.12 rows=20 width=40) (actual time=0.018..0.214 rows=20 loops=1)
  ->  Index Scan Backward using activity_log_created_user on activity_log  (cost=0.29..2214.90 rows=600 width=40) (actual time=0.017..0.209 rows=20 loops=1)
        Index Cond: (user_id = 7)
        Buffers: shared hit=31
Execution Time: 0.236 ms`, "staging, user 7"),
        p("With 50 users, one entry in 50 belongs to user 7, so walking the index backward from the newest entry finds 20 of them after about 1,000 entries. Production has 1.2 million users. The same walk finds one entry of a given learner in tens of thousands, and for a learner with three events in total it has to walk the entire 40-million-entry index to be sure there is no fourth. auto_explain on the primary:"),
        code("text", `
2026-10-27 08:14:03 UTC LOG:  duration: 1843.6 ms  plan:
  Query Text: SELECT id, kind, created_at FROM activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20
  Limit  (actual time=1843.551..1843.560 rows=3 loops=1)
    Buffers: shared hit=171032 read=29871
    ->  Index Scan Backward using activity_log_created_user on activity_log  (actual time=1843.549..1843.556 rows=3 loops=1)
2026-10-27 08:14:09 UTC LOG:  duration: 402.3 ms  plan:
  Query Text: SELECT user_id, status FROM enrollments WHERE course_id = $1
  Seq Scan on enrollments  (actual time=0.412..402.118 rows=1204 loops=1)`, "auto_explain, primary"),
        p("Two different symptoms of the same mistake. The feed **uses** the index - its name is right there in the plan - and still reads about 200,000 buffers for 3 rows. The roster does not use its index at all. Neither showed up on staging, where every scan is short."),

        h2("3. Core idea: a composite index is sorted by its first column"),
        p("A B-tree on `(a, b)` is one sorted list of pairs: sorted by `a`, and by `b` only among entries with the same `a`. Think of a class list sorted by family name, then given name. Finding every \"Nguyen\" is one jump to a contiguous block. Finding every \"Mai\", whatever the family name, means reading the whole list: the Mais are spread across every family."),
        p("That gives the **leftmost prefix rule**: an index can be searched (a jump to a start point and a contiguous run) only with conditions on its leading columns. Conditions on later columns can still be checked inside the index, entry by entry, which is what an `Index Cond` on a non-leading column means in PostgreSQL. It saves fetching table rows, but not reading the index entries."),
        p("Apply it to the AI's indexes:"),
        bullets([
            "**`(created_at, user_id)` for `WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`.** The entries of one learner are spread across the whole time range. PostgreSQL can walk the index in created_at order and test user_id on each entry, which avoids a Sort, but the number of entries read depends on how rare the learner is, not on the 20 rows the page needs. `(user_id, created_at)` puts all of one learner's entries together, already in time order: one jump, at most 20 entries.",
            "**`(status, course_id)` for `WHERE course_id = ?`.** The entries of course 17 sit in three separate blocks, one per status, and the query gives no status to jump to. PostgreSQL 16 and 17 then prefer a Seq Scan. `(course_id, status)` serves the roster by its leading column and the filtered roster by both.",
        ]),
        h3("The rule, and the myths"),
        p("For a query pattern: **columns compared with equality first, then the one column used for a range or for ORDER BY.** Among the equality columns, choose the order by which **other** queries should be able to use the leading prefix. The two reasons in the AI's comments are common myths:"),
        bullets([
            "**\"Put the ORDER BY column first.\"** The ORDER BY column belongs right after the equality columns. In first position it makes the equality condition unsearchable.",
            "**\"Put the column with the fewest values first\" (or \"the most selective first\").** For conditions that are all equalities, both orders reach the same entries with the same work: selectivity of the combination does not depend on the order. What the order changes is which queries can search the index. Here only `course_id` first serves the roster that has no status.",
        ]),
        callout("info", "Skip scan exists, and is not a reason to get the order wrong",
            "PostgreSQL 18 added a B-tree skip scan: when the leading column has few distinct values, the planner can search the index once per value of that column. SQLite has a similar skip-scan, but only when ANALYZE statistics show many rows per leading value. Both cost one search per distinct leading value and depend on statistics, so the plan can change when the data changes. This course targets PostgreSQL 16-17, and the challenge runner does not run ANALYZE: design the order so that the plain search works."),

        challenge("chal_quiz_pgp_231"),

        h2("4. Reviewing AI-generated indexes"),
        p("Assistants produce index migrations that look complete and come with a confident reason. The reason is often a rule of thumb applied to the wrong query, and a review that only checks results cannot see it: an index never changes which rows a query returns, only how they are found. Review generated indexes with this list:"),
        numbered([
            "**Write the pattern of every query the index is for**: equality columns, range or ORDER BY column, LIMIT. Then check the column order: equality first, then range or order. Any query whose WHERE does not constrain the first column cannot search the index.",
            "**Read the stated reason against the queries.** \"Sorted by\", \"few values\", \"most selective\" are not reasons on their own; ask which query each column serves and in which role.",
            "**Run EXPLAIN (ANALYZE, BUFFERS) on production-sized data with a hard parameter.** A quiet learner, a popular course. Staging with 50 users hides every scan. Compare buffers to rows returned.",
            "**Check the plan for the right signal, not the index name.** An index name in the plan proves nothing. Look for the equality columns in Index Cond as a search, no Sort under the Limit, and a buffer count close to the number of rows.",
            "**Ask for the test that would fail.** For indexes that is a plan check on realistic data, not a result check.",
        ]),
        h3("The fix"),
        code("sql", `
-- migration 20261027_002_fix_index_order.sql
CREATE INDEX CONCURRENTLY activity_log_user_created ON activity_log (user_id, created_at);
CREATE INDEX CONCURRENTLY enrollments_course_status ON enrollments (course_id, status);

-- after the plans below are confirmed on the primary:
DROP INDEX CONCURRENTLY activity_log_created_user;
DROP INDEX CONCURRENTLY enrollments_status_course;`, "build the new ones first, then drop the old ones"),
        p("Build first, drop after: during the switch both pairs exist, so writes pay for four indexes for a short time, but the queries are never without one. The plans after the fix:"),
        code("text", `
Limit  (cost=0.56..22.48 rows=20 width=40) (actual time=0.027..0.031 rows=3 loops=1)
  ->  Index Scan Backward using activity_log_user_created on activity_log  (cost=0.56..36.72 rows=33 width=40) (actual time=0.026..0.029 rows=3 loops=1)
        Index Cond: (user_id = 9001)
        Buffers: shared hit=5

Index Scan using enrollments_course_status on enrollments  (cost=0.43..1194.72 rows=1180 width=12) (actual time=0.033..1.412 rows=1204 loops=1)
  Index Cond: (course_id = 17)
  Buffers: shared hit=1219`, "primary, after"),
        p("The feed reads 5 buffers for the quiet learner instead of about 200,000; the roster uses the index by its leading column."),

        h2("5. The challenge: review the assistant's migration"),
        p("The challenge gives you the AI's INDEXES in a Python file with a SQLite runner. The runner fills `activity_log` and `enrollments`, applies your indexes (at most two, as the request said) and runs the three queries. The public tests check the rows, which is what the review checked, and they pass on the AI's code. The hidden tests read SQLite's EXPLAIN QUERY PLAN for each query and run them on large tables under a budget of SQLite VM steps counted with `set_progress_handler`, which stands in for the production timings. In SQLite the AI's feed index shows up as `SCAN activity_log USING INDEX activity_log_created_user`: a walk through the whole index, even though the plan names it."),
        challenge("chal_coding_pgp_232"),

        h2("6. How to verify the fix"),
        bullets([
            "**Plans with hard parameters, on the primary or a production-sized copy:** the quiet learner and a learner with thousands of events for the feed, the largest course for the roster, and the filtered roster. Equality columns in Index Cond, no Sort under the Limit, buffers in the tens or low thousands.",
            "**pg_stat_statements:** mean time and blocks per call of the feed and roster queries, before and after, from a snapshot or after pg_stat_statements_reset().",
            "**pg_stat_user_indexes:** idx_scan of the new indexes grows; the old ones stay at the same count until you drop them.",
            "**A plan test in CI** against seeded data with many users, so that the next index with the wrong order fails before review rather than in production.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**The ORDER BY or range column first.** Spot it: the equality column appears in Index Cond, but buffers and time grow with the table, not with the rows returned.",
            "**Leading with a column the query does not constrain.** Spot it: a Seq Scan, or SQLite's SCAN, for a query whose WHERE uses only the second column of the index.",
            "**Ordering equality columns by cardinality.** Spot it: a reason like \"fewest values first\" in a comment or a review, with no mention of which other queries need the leading column.",
            "**Accepting \"the index is used\" as proof.** Spot it: the review quotes the index name from the plan, but nobody compared buffers with rows on realistic data.",
            "**Adding the right index next to the wrong one.** Both cost every write. Spot it: two indexes on the same columns in different orders; keep the one the queries search and drop the other.",
        ]),

        h2("8. Summary"),
        numbered([
            "A composite B-tree is sorted by its first column, then the next: only conditions on a leading prefix can be searched, later columns are checked entry by entry.",
            "Order the columns of an index for a query pattern as equality first, then the one range or ORDER BY column; among equalities, let the leading column be the one other queries also filter on. \"Sort column first\" and \"fewest values first\" are myths.",
            "Review generated indexes with plans on realistic data and hard parameters, and look at buffers against rows, not at the index name.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Multicolumn Indexes - https://www.postgresql.org/docs/current/indexes-multicolumn.html",
            "PostgreSQL documentation: Indexes and ORDER BY; PostgreSQL 18 release notes (B-tree skip scan)",
            "PostgreSQL documentation: Using EXPLAIN - https://www.postgresql.org/docs/current/using-explain.html",
            "SQLite documentation: The SQLite Query Optimizer Overview (multi-column indexes, skip-scan)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List the composite indexes of a database you work on (SELECT indexrelid::regclass, indkey FROM pg_index WHERE indnatts > 1). For each, find the queries that use it in pg_stat_statements and write their patterns. Mark every index whose first column is a range or ORDER BY column, or a column that some of its queries do not constrain. Next time you ask an assistant for an index, give it the query patterns and ask it to show the plan on production-sized data with the hardest parameter."),
    ],
});
