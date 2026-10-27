// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-4-3",
    title: "Index trade-offs: write cost, bloat & unused indexes",
    slug: { _type: "slug", current: "index-tradeoffs-write-cost-bloat" },
    description:
        "Six indexes added in one pull request made every finished lesson slower to save and filled the primary's disk, while three of them were never used. Learn what each index costs on INSERT and UPDATE (including HOT updates it can switch off), how to find unused and duplicate indexes with pg_stat_user_indexes, when a partial or covering index (INCLUDE) is the cheaper answer, how to create and drop indexes safely with CONCURRENTLY, and when not to add an index at all.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "On Monday the database primary of CodeDev raised a disk alert at 85% full, up from 60% a month ago, and the p99 of POST /lessons/:id/complete crept from 3 ms to 11 ms. No traffic spike explains either. A month ago a pull request titled \"perf: add indexes for the new dashboards\" added six indexes on lesson_progress, most of them suggested by an AI assistant from a list of dashboard queries. The dashboards are faster. Nobody measured what the indexes cost.",
    },

    content: [
        h2("1. The incident: faster dashboards, slower writes, a full disk"),
        p("Module 2 taught you to choose an index for a query pattern. This lesson is about the other side of the ledger. An index is a second copy of some columns, kept in sorted order, that the database must update on **every write** to the table, forever. The pull request from last month added these to `lesson_progress`, the table written every time a learner opens or finishes a lesson:"),
        code("sql", `
CREATE INDEX lesson_progress_course_id_idx       ON lesson_progress (course_id);
CREATE INDEX lesson_progress_completed_at_idx    ON lesson_progress (completed_at);
CREATE INDEX lesson_progress_user_id_idx         ON lesson_progress (user_id);
CREATE INDEX lesson_progress_course_user_idx     ON lesson_progress (course_id, user_id);
CREATE INDEX lesson_progress_updated_at_idx      ON lesson_progress (updated_at);
CREATE INDEX lesson_progress_course_done_idx     ON lesson_progress (course_id, completed_at);`, "migration 20260921_004"),
        p("Each statement is reasonable on its own. Together they are the incident: every `INSERT` into `lesson_progress` now writes seven index entries instead of one, and the update the lesson page sends every 30 seconds now writes to all of them."),

        h2("2. Read the evidence: sizes, usage and HOT updates"),
        p("Start with what the indexes weigh and how often anything reads them. `pg_stat_user_indexes` counts index scans per index since the statistics were last reset; PostgreSQL 16 added `last_idx_scan`, the time of the last one:"),
        code("sql", `
SELECT s.indexrelname,
       s.idx_scan,
       s.last_idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
FROM pg_stat_user_indexes AS s
WHERE s.relname = 'lesson_progress'
ORDER BY s.idx_scan;

          indexrelname           | idx_scan  |     last_idx_scan      |  size
---------------------------------+-----------+------------------------+--------
 lesson_progress_updated_at_idx  |         0 |                        | 2104 MB
 lesson_progress_course_id_idx   |         0 |                        | 1688 MB
 lesson_progress_completed_at_idx|        12 | 2026-10-19 03:00:41+00 | 2093 MB
 lesson_progress_course_done_idx |      4410 | 2026-10-26 08:12:09+00 | 2391 MB
 lesson_progress_user_id_idx     |    170221 | 2026-10-26 09:58:30+00 | 1690 MB
 lesson_progress_course_user_idx |   2381770 | 2026-10-26 09:58:31+00 | 2412 MB
 lesson_progress_pkey            | 914022115 | 2026-10-26 09:58:31+00 | 2207 MB

SELECT pg_size_pretty(pg_table_size('lesson_progress'))   AS table_size,
       pg_size_pretty(pg_indexes_size('lesson_progress')) AS indexes_size;

 table_size | indexes_size
------------+--------------
 9124 MB    | 14 GB`, "psql"),
        p("The indexes now weigh more than the table. Two were never scanned in the month since the migration; one is used by a single nightly job. Then look at how updates behave. `pg_stat_user_tables` counts all updated rows and the **HOT** ones separately:"),
        code("sql", `
SELECT n_tup_ins, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 1) AS hot_pct
FROM pg_stat_user_tables
WHERE relname = 'lesson_progress';

 n_tup_ins | n_tup_upd | n_tup_hot_upd | hot_pct
-----------+-----------+---------------+---------
  18204411 |  52811904 |        841220 |     1.6`, "psql"),
        p("Before the migration, `hot_pct` was above 90%. Most updates come from the heartbeat the lesson page sends every 30 seconds while a learner reads: `UPDATE lesson_progress SET seconds_spent = seconds_spent + 30, updated_at = now() WHERE user_id = $1 AND lesson_id = $2`. Before the migration no column it sets was indexed; now `updated_at` is."),

        h2("3. Core idea: what every index costs"),
        h3("On every write"),
        bullets([
            "**INSERT** adds one entry to every index of the table: a descent of each B-tree, sometimes a page split, and WAL for each change. Seven indexes means roughly seven times the index work of one.",
            "**UPDATE** creates a new row version. If no indexed column changes and the new version fits on the same page, PostgreSQL makes a **HOT** (heap-only tuple) update: the indexes are not touched at all, and the old version can be pruned without vacuum. If any indexed column changes, or the page is full, the update is not HOT and every index of the table gets a new entry, including indexes on columns that did not change.",
            "**DELETE** and non-HOT updates leave dead entries in every index, which vacuum must find and remove. Indexes that are not cleaned grow: that is index **bloat**.",
        ]),
        h3("All the time"),
        bullets([
            "**Disk and backups.** 14 GB of indexes is 14 GB more to store, back up, restore and replicate.",
            "**Memory.** Index pages compete with table pages for `shared_buffers` and the OS cache. An unused index whose pages are still touched by every write pushes useful pages out.",
            "**Maintenance.** Vacuum scans every index of a table it cleans, so each extra index makes every vacuum longer.",
        ]),
        p("An index pays for itself only when the reads it speeds up are worth more than all of that. `idx_scan` and the latency of the queries that use it are the evidence on the benefit side; insert latency, HOT percentage, WAL volume and size are the evidence on the cost side."),
        h3("Cheaper shapes: partial and covering indexes"),
        p("Often the useful part of an index is much smaller than the whole column. A **partial index** stores only the rows a query asks for. The \"learners still working on a lesson\" query only ever looks at unfinished rows, a few percent of the table:"),
        code("sql", `
-- only rows that are not finished yet: small, and a finished row leaves it
CREATE INDEX CONCURRENTLY lesson_progress_open_idx
    ON lesson_progress (course_id, user_id)
    WHERE completed_at IS NULL;`, "partial index"),
        p("The query must repeat the predicate (`WHERE completed_at IS NULL AND course_id = $1`) for the planner to use it. A **covering index** adds payload columns with `INCLUDE` (PostgreSQL 11+), so a query can be answered by an **index-only scan** without visiting the table, as long as the visibility map says the pages are all-visible (vacuum keeps it current). Included columns are stored but not sorted, so they cannot be searched on:"),
        code("sql", `
-- course dashboard: completions per course and day, read from the index alone
CREATE INDEX CONCURRENTLY lesson_progress_course_done_cov_idx
    ON lesson_progress (course_id, completed_at)
    INCLUDE (user_id)
    WHERE completed_at IS NOT NULL;`, "covering index"),
        callout("warning", "When not to add an index",
            "Do not add one for a column with a handful of values that most rows share (status = 'active'), for a table of a few thousand rows that is read whole anyway, for a column the hottest UPDATE changes on every request unless the index is worth losing HOT updates, for a query that runs once a week and is allowed to take a minute, or when an existing composite index already starts with the same columns (an index on (course_id) duplicates the leading column of (course_id, user_id)). In each case measure the query without the new index first: a sequential scan once a week is often the cheaper plan for the whole system."),

        challenge("chal_quiz_pgp_431"),

        h2("4. Worked example: cleaning up lesson_progress"),
        p("Decide index by index, with the evidence from section 2, and write the decision down next to each one:"),
        numbered([
            "**`updated_at_idx`: drop.** Never scanned, and `updated_at` changes on every heartbeat, so while this index exists no heartbeat update can be HOT.",
            "**`course_id_idx`: drop.** Never scanned, and `course_user_idx` starts with `course_id`, so it can serve the same lookups.",
            "**`completed_at_idx`: drop.** 12 scans, all from the 03:00 cleanup job, which can use the partial index above or a sequential scan at night.",
            "**`course_done_idx`: replace** with the smaller partial covering index from section 3, which the dashboard query can read without touching the table.",
            "**`user_id_idx` and `course_user_idx`: keep.** Both are used all day by the API; `pkey` (user_id, lesson_id) also serves lookups by user_id, so `user_id_idx` is the next candidate to review once its callers are checked.",
        ]),
        p("In production, indexes are created and dropped **concurrently**. A plain `CREATE INDEX` takes a SHARE lock that blocks every INSERT, UPDATE and DELETE on the table until it finishes, and a plain `DROP INDEX` takes ACCESS EXCLUSIVE (lesson 11). The concurrent forms do not block writes:"),
        code("sql", `
-- each statement on its own: CONCURRENTLY cannot run inside a transaction block
SET statement_timeout = 0;          -- this session only: the build may take a while
SET lock_timeout = '5s';            -- but do not queue behind a long transaction

CREATE INDEX CONCURRENTLY lesson_progress_course_done_cov_idx
    ON lesson_progress (course_id, completed_at) INCLUDE (user_id)
    WHERE completed_at IS NOT NULL;

DROP INDEX CONCURRENTLY lesson_progress_course_done_idx;
DROP INDEX CONCURRENTLY lesson_progress_updated_at_idx;
DROP INDEX CONCURRENTLY lesson_progress_course_id_idx;
DROP INDEX CONCURRENTLY lesson_progress_completed_at_idx;

-- a failed or cancelled concurrent build leaves an INVALID index behind
SELECT indexrelid::regclass AS index, indrelid::regclass AS table
FROM pg_index
WHERE NOT indisvalid;`, "migration 20261027_001"),
        p("`CREATE INDEX CONCURRENTLY` scans the table twice and waits for transactions that might still see the old state, so it takes longer than a plain build and can wait on a long transaction like any other statement. If it fails, the index stays behind marked INVALID: the planner ignores it but every write still maintains it. Drop it and run the build again."),
        h3("Bloat: when an index you need has grown too big"),
        p("A used index can still be much larger than its contents after months of updates and deletes. The `pgstattuple` extension measures it: `SELECT avg_leaf_density FROM pgstatindex('lesson_progress_pkey');` shows how full the leaf pages are (a freshly built B-tree is around 90%). When the density is low and the size matters, rebuild it without blocking writes with `REINDEX INDEX CONCURRENTLY` (PostgreSQL 12+). For a table whose hot updates must stay HOT, a lower `fillfactor` (for example `ALTER TABLE ... SET (fillfactor = 90)`, applied to new pages) leaves room on each page for the new row version."),

        h2("5. How to verify"),
        bullets([
            "**Before you drop:** the statistics window is long enough to include monthly jobs (`stats_reset` in `pg_stat_database`); every replica is checked too, because `idx_scan` is counted per server; the index does not back a constraint (`pg_constraint.conindid`), because enforcing uniqueness is not counted as a scan; its definition (`pg_get_indexdef`) is saved in the migration so you can recreate it.",
            "**After you drop:** `EXPLAIN (ANALYZE, BUFFERS)` of the queries that used the dropped indexes picks an acceptable plan; `pg_stat_statements` shows no new slow statement.",
            "**The write side recovers:** `hot_pct` from section 2 climbs back over a day; `wal_bytes` in `pg_stat_wal` (PostgreSQL 14+) per day drops; the p99 of the complete-lesson endpoint returns to about 3 ms.",
            "**Disk:** `pg_indexes_size('lesson_progress')` shrinks as soon as the drops commit, and no INVALID index is left over.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Indexing every column a dashboard filters on.** Each index is a cost on every write. Spot it: `pg_indexes_size` larger than `pg_table_size`, several indexes with `idx_scan` near 0.",
            "**Indexing a column the hot UPDATE sets on every request.** It turns HOT updates off for the whole table. Spot it: `n_tup_hot_upd / n_tup_upd` drops sharply right after the migration.",
            "**Dropping an index because idx_scan = 0 on the primary only.** A replica, a monthly job or a uniqueness constraint may depend on it. Spot it: check every server, the statistics window and `pg_constraint` before the drop.",
            "**Single-column duplicates of a composite index.** An index on (course_id) next to one on (course_id, user_id) is usually pure cost. Spot it: compare the leading columns in `pg_get_indexdef` for each table.",
            "**Plain CREATE INDEX or DROP INDEX in production, or forgetting an INVALID leftover.** The first blocks writes for the whole build; the second keeps costing writes. Spot it: writes stall during the migration, or `pg_index.indisvalid = false` rows exist.",
        ]),

        h2("7. Summary"),
        bullets([
            "Every index is paid for on every INSERT, on every UPDATE that changes an indexed column (which also loses HOT updates for the whole row), in vacuum, memory, disk and backups; measure both sides before you add one.",
            "Find candidates with `pg_stat_user_indexes` (idx_scan, last_idx_scan) and duplicate leading columns, but check replicas, the statistics window and constraints before dropping.",
            "Prefer smaller shapes (partial, covering with INCLUDE), and create, drop and rebuild with CONCURRENTLY, cleaning up any INVALID leftover.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Indexes (Multicolumn, Partial and Index-Only Scans and Covering Indexes) - https://www.postgresql.org/docs/current/indexes-multicolumn.html",
            "PostgreSQL documentation: Heap-Only Tuples (HOT) and CREATE INDEX (Building Indexes Concurrently)",
            "PostgreSQL documentation: The Cumulative Statistics System (pg_stat_user_indexes, pg_stat_user_tables, pg_stat_wal) and the pgstattuple module",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "In a local PostgreSQL, create a users table with a million rows, run 100,000 updates of a non-indexed column and read n_tup_hot_upd. Add an index on that column, run the same updates again, and compare n_tup_hot_upd, the WAL generated (pg_stat_wal) and the time of the updates. Write one paragraph that decides whether that index is worth keeping."),
    ],
});
