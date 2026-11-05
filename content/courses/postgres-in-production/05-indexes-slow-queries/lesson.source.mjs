// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pgp-3-1",
    title: "Indexes chosen from the slow query log",
    slug: { _type: "slug", current: "postgres-indexes-from-slow-queries" },
    description:
        "Rice Rocket's orders table had an index on every column: inserts got slower and the slow queries stayed slow. Learn to rank queries with pg_stat_statements, read EXPLAIN (ANALYZE, BUFFERS), order the columns of a composite index, use partial and covering indexes, and replace seven indexes with the four the queries need.",
    estimatedTime: 17,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Lunch peaks push the managed PostgreSQL 17 database to 90% CPU. A teammate's fix was an index on each of the seven columns of orders. CPU did not drop, every insert now updates seven indexes, and the restaurant tablets still wait for their order list.",
    },

    content: [
        h2("Situation"),
        p("`pg_stat_statements` records every normalized query with its call count and timings. Sorted by total time, the top three during a lunch peak:"),
        code("sql", `
SELECT left(query, 60) AS query, calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       round(total_exec_time::numeric) AS total_ms
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 3;`, "psql"),
        code("text", `
 query                                                        | calls   | mean_ms | total_ms
--------------------------------------------------------------+---------+---------+----------
 SELECT id, status, created_at FROM orders WHERE restaurant_i | 2104311 |    0.41 |   862768
 SELECT id, total_vnd, created_at FROM orders WHERE customer_ |  611204 |    0.96 |   586756
 SELECT id, status FROM orders WHERE public_code = $1         |  402118 |    0.37 |   148784`, "output"),
        bullets([
            "The restaurant query (active orders, newest first, `LIMIT 20`) runs two million times a lunch.",
            "The customer history query filters on a customer and a date range.",
            "`orders` has `orders_restaurant_id_idx`, `orders_customer_id_idx`, `orders_courier_id_idx`, `orders_status_idx`, `orders_created_at_idx`, `orders_total_vnd_idx` and `orders_public_code_idx`.",
        ]),

        h2("The core you need"),
        bullets([
            "**Rank by total time.** `total_exec_time` = `calls` x `mean_exec_time` is where the server spends its time. A fast query that runs constantly can cost more than a slow report.",
            "**Read the plan, not the query.** `EXPLAIN (ANALYZE, BUFFERS)` runs the query and shows each step: `Seq Scan` reads the whole table, `Index Scan` walks an index and fetches rows, `Bitmap Heap Scan` collects matches first and then reads pages. `Index Cond` is what the index narrowed; `Filter` with `Rows Removed by Filter` is what was read and thrown away; `Buffers` counts the 8 kB pages touched.",
            "**Composite index column order: equality first, then the range or ORDER BY column.** `(customer_id, created_at)` jumps to one customer and walks a date range in order. `(created_at, customer_id)` walks the whole range and filters customers. An index also serves `ORDER BY ... LIMIT` when its columns after the equality columns match the ORDER BY, so no sort is needed and the scan stops after 20 rows.",
            "**Partial index for a hot subset.** `CREATE INDEX ... WHERE status IN ('pending', 'cooking')` holds only active orders, a few percent of the table. The planner uses it only when the query's WHERE implies that same condition.",
            "**Covering index.** `INCLUDE (status)` stores extra columns in the index so an `Index Only Scan` can skip the table (when the visibility map allows it). Use it for the hottest query, not everywhere.",
            "**Every index costs writes.** Each INSERT, and each UPDATE of an indexed column, writes into every index of the table; indexes also cost WAL, vacuum time and cache memory. `pg_stat_user_indexes.idx_scan` shows which ones are never used.",
            "**In production: `CREATE INDEX CONCURRENTLY`.** A plain `CREATE INDEX` blocks writes to the table until it finishes; `CONCURRENTLY` does not, takes longer, cannot run inside a transaction and leaves an INVALID index behind if it fails.",
        ]),

        h2("Apply it in the project"),
        p("Check which indexes the queries really use before dropping anything:"),
        code("sql", `
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes WHERE relname = 'orders' ORDER BY idx_scan;
--  orders_total_vnd_idx      0
--  orders_status_idx         0
--  orders_created_at_idx    12
--  orders_restaurant_id_idx  3191022
--  orders_customer_id_idx    611290
--  orders_public_code_idx    402130
--  orders_courier_id_idx     981233`, "psql"),
        p("The migration builds the new indexes first, then drops the old ones; each statement runs on its own because `CONCURRENTLY` refuses a transaction block:"),
        code("sql", `
-- active orders of one restaurant, newest first (the tablet query)
CREATE INDEX CONCURRENTLY orders_active_by_restaurant
    ON orders (restaurant_id, created_at)
    WHERE status IN ('pending', 'cooking');

-- one customer's orders in a date range, newest first
CREATE INDEX CONCURRENTLY orders_by_customer_created ON orders (customer_id, created_at);

-- support's lookup; also enforces that a code is never reused
CREATE UNIQUE INDEX CONCURRENTLY orders_public_code_key ON orders (public_code);

DROP INDEX CONCURRENTLY orders_restaurant_id_idx;
DROP INDEX CONCURRENTLY orders_customer_id_idx;
DROP INDEX CONCURRENTLY orders_status_idx;
DROP INDEX CONCURRENTLY orders_created_at_idx;
DROP INDEX CONCURRENTLY orders_total_vnd_idx;
DROP INDEX CONCURRENTLY orders_public_code_idx;
-- orders_courier_id_idx stays: the courier app's query uses it`, "migrations/0042_orders_indexes.sql"),
        callout("info", "In the challenge: SQLite's EXPLAIN QUERY PLAN",
            "The challenge runs the same indexes on SQLite. Its plan reads differently but answers the same questions: `SEARCH orders USING INDEX orders_by_customer_created (customer_id=? AND created_at>? AND created_at<?)` is PostgreSQL's `Index Cond` on both columns, `SCAN orders` is a `Seq Scan`, and `USE TEMP B-TREE FOR ORDER BY` is a separate `Sort` node."),

        h2("Verify"),
        code("sql", `
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, total_vnd, created_at FROM orders
WHERE customer_id = 42 AND created_at >= '2026-10-01' AND created_at < '2026-11-01'
ORDER BY created_at DESC;
--  Index Scan Backward using orders_by_customer_created on orders (actual time=0.02..0.09 rows=31 loops=1)
--    Index Cond: ((customer_id = 42) AND (created_at >= ...) AND (created_at < ...))
--    Buffers: shared hit=35
--  Execution Time: 0.12 ms

SELECT pg_stat_statements_reset();   -- then compare total_exec_time after the next lunch peak
SELECT indexrelname, idx_scan FROM pg_stat_user_indexes WHERE relname = 'orders';`, "psql"),
        p("No `Filter` line, no `Sort` node, a few dozen buffers instead of thousands. The exact timings differ on every machine; the shape of the plan is what to compare."),

        h2("Pitfalls"),
        bullets([
            "**A partial index the query cannot prove.** `WHERE status <> 'delivered'` does not cover a query that asks for `status IN ('pending', 'cooking')` in the planner's eyes, so the index is ignored. Detect it in EXPLAIN (the index is never named); write the index condition the way the query writes it.",
            "**An interrupted CONCURRENTLY build.** A cancelled or failed `CREATE INDEX CONCURRENTLY` leaves an INVALID index that still slows writes. Find it with `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;`, drop it and build again.",
            "**Dropping an index a rare job needs.** `idx_scan = 0` over one week misses the month-end report. Check the statistics period (`pg_stat_database.stats_reset`) and the scheduled jobs before dropping.",
        ]),

        challenge("chal_quiz_pgp_151"),
        p("Now write the migration. The editor holds `migrations/0042_orders_indexes.py` with its SQL pieces missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose: wrong column order, one index per column, a partial index the query cannot use. Run builds the orders table on SQLite with its seven indexes, applies your pieces and prints each query's plan."),
        challenge("chal_coding_pgp_152"),
    ],
});
