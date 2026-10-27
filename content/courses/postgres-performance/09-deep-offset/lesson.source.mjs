// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-3-3",
    title: "Fix it: deep OFFSET pages that time out",
    slug: { _type: "slug", current: "fix-deep-offset-pages-that-time-out" },
    description:
        "The quarterly audit export of the CodeDev activity log dies at page 400 with a statement timeout, although every page returns only 100 rows. Learn to read the evidence in EXPLAIN (ANALYZE, BUFFERS) (rows produced and thrown away by Limit), why OFFSET costs grow with the page number and why OFFSET pages shift when rows are inserted, how to turn a page-number loop into a keyset loop that produces exactly the same export, and how to prove that the output did not change and every page costs the same.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Every quarter the compliance team exports the whole activity log (2.7 million rows) through the admin API. This quarter the export job fails after about 35 minutes: the API log shows GET /admin/activity/export?page=400 failing with \"canceling statement due to statement timeout\" after 5 seconds. Pages 1 to 50 took a few milliseconds each, and every page since then has been slower than the one before. Nothing in the query changed; the table doubled in size after the import of the old platform's history.",
    },

    content: [
        h2("1. The incident: page 400 never comes back"),
        p("The export endpoint is a thin wrapper around one query. The job calls it with page = 1, 2, 3, ... until a page comes back short:"),
        code("typescript", `
// GET /admin/activity/export?page=N
const PAGE_SIZE = 100;
const { rows } = await db.query(
    \`SELECT id, user_id, kind, created_at
       FROM activity_log
      ORDER BY created_at, id
      LIMIT $1 OFFSET $2\`,
    [PAGE_SIZE, (page - 1) * PAGE_SIZE]);`, "export.ts"),
        p("The order is correct and stable: `created_at, id` is unique, so every row has one position and the export is deterministic. The index `activity_log_created_id (created_at, id)` matches the ORDER BY. And yet the log shows the time per page climbing steadily:"),
        code("text", `
2026-10-20 02:00:03.114 UTC [41822] LOG:  duration: 3.912 ms  execute <unnamed>: SELECT ... LIMIT $1 OFFSET $2
2026-10-20 02:00:03.114 UTC [41822] DETAIL:  parameters: $1 = '100', $2 = '0'
2026-10-20 02:09:41.502 UTC [41822] LOG:  duration: 1204.377 ms  execute <unnamed>: SELECT ... LIMIT $1 OFFSET $2
2026-10-20 02:09:41.502 UTC [41822] DETAIL:  parameters: $1 = '100', $2 = '10000'
2026-10-20 02:35:12.880 UTC [41822] ERROR:  canceling statement due to statement timeout
2026-10-20 02:35:12.880 UTC [41822] STATEMENT:  SELECT ... LIMIT $1 OFFSET $2`, "postgresql.log"),

        h2("2. Read the evidence: rows produced, rows thrown away"),
        p("Run page 400 by hand with `EXPLAIN (ANALYZE, BUFFERS)`, outside the API so the timeout does not cut it short (`SET statement_timeout = 0` in your session, on a replica if you have one):"),
        code("text", `
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, user_id, kind, created_at FROM activity_log
ORDER BY created_at, id
LIMIT 100 OFFSET 39900;

Limit  (cost=3418.27..3426.84 rows=100 width=52) (actual time=4805.931..4813.117 rows=100 loops=1)
  Buffers: shared hit=1204 read=38811
  ->  Index Scan using activity_log_created_id on activity_log  (cost=0.43..233512.88 rows=2725410 width=52) (actual time=0.031..4805.926 rows=40000 loops=1)
        Buffers: shared hit=1204 read=38811
Planning Time: 0.102 ms
Execution Time: 4813.215 ms`, "EXPLAIN (ANALYZE, BUFFERS)"),
        bullets([
            "**The scan produced 40,000 rows** (`actual rows=40000`) for a page of 100. `Limit` applies OFFSET by receiving rows and discarding the first 39,900; there is no way to start at position 39,901 of an order without producing the 39,900 rows before it.",
            "**The work is in the scan, not the Limit:** the Index Scan's actual time ends at 4805.9 ms, and the Limit node only adds the last 7 ms for the 100 rows it keeps.",
            "**38,811 buffer reads** are the heap pages of those rows. The imported history is not stored in created_at order, so consecutive index entries point to pages all over the 9 GB table, and most of them are not in cache.",
            "**The cost grows linearly with the page number.** Page 1 reads about 100 rows, page 400 reads 40,000, and the whole export reads 1 + 2 + ... + N pages' worth: quadratic in the size of the table. Doubling the table quadrupled the export time.",
        ]),
        p("The planner knew this: the Limit's startup cost (3418.27) is the scan cost of skipping 39,900 rows. It simply has no cheaper plan for \"row number 39,901 in this order\"."),

        h2("3. Core idea: remember where you stopped, not how far you went"),
        p("The export job already has what the database needs: the last row of page 399. If page 400 asks for \"the rows after `(created_at, id)` of that row\", the index can seek straight to it (lesson 8):"),
        code("sql", `
-- first page
SELECT id, user_id, kind, created_at FROM activity_log
ORDER BY created_at, id
LIMIT 100;

-- every next page: $1, $2 = created_at and id of the last row received
SELECT id, user_id, kind, created_at FROM activity_log
WHERE (created_at, id) > ($1, $2)
ORDER BY created_at, id
LIMIT 100;`, "export_page.sql"),
        p("This is an ascending order, so \"after\" is `>`. The plan for the same position as page 400:"),
        code("text", `
Limit  (cost=0.43..9.01 rows=100 width=52) (actual time=0.402..2.981 rows=100 loops=1)
  Buffers: shared hit=4 read=97
  ->  Index Scan using activity_log_created_id on activity_log  (cost=0.43..231804.17 rows=2702388 width=52) (actual time=0.401..2.966 rows=100 loops=1)
        Index Cond: (ROW(created_at, id) > ROW('2025-02-11 09:14:52.31+00'::timestamp with time zone, 1048233))
        Buffers: shared hit=4 read=97
Planning Time: 0.118 ms
Execution Time: 3.010 ms`, "EXPLAIN (ANALYZE, BUFFERS)"),
        p("100 rows produced for 100 rows returned, about 100 buffers, 3 ms, and the same for page 4 and page 27,000. The export went from failing after 35 minutes to finishing in under 2 minutes."),
        h3("OFFSET is also wrong under concurrent writes"),
        p("The export runs over half an hour while learners keep completing lessons. With OFFSET, each request counts positions again on the data as it is at that moment. For an oldest-first export, new rows land at the end and do no harm, but the newest-first admin list shows the problem clearly: two events inserted between page 3 and page 4 push everything down by two, and the last two rows of page 3 appear again at the top of page 4. A delete does the opposite and a row is never shown. A keyset cursor is a value, not a count, so rows inserted or deleted before it do not move it."),
        h3("When OFFSET is still fine"),
        bullets([
            "**Shallow pages over a filtered result:** search results where nobody goes past page 5, or an admin table with a few hundred rows. The cost is proportional to the offset, and a small offset is cheap.",
            "**Numbered pages the user really needs:** keyset cannot jump to page 37. For deep navigation, offer filters instead (a date range, a user) so the result is small again.",
            "**A one-off export you can run in one statement:** `COPY (SELECT ... ORDER BY created_at, id) TO STDOUT` streams the whole table in one pass, with no pages at all. Paging exists for the API and its timeout; a direct job with a cursor (`DECLARE ... CURSOR` / `FETCH 1000`) also avoids OFFSET.",
        ]),

        challenge("chal_quiz_pgp_331"),

        h2("4. Worked example: the export loop"),
        p("The API changes from a page number to an opaque cursor, and the job keeps the last row of each page instead of a counter:"),
        code("typescript", `
async function* exportActivity(db: Db, pageSize = 100) {
    let last: { createdAt: string; id: string } | null = null;
    while (true) {
        const { rows } = last === null
            ? await db.query(
                \`SELECT id, user_id, kind, created_at::text AS created_at FROM activity_log
                  ORDER BY created_at, id LIMIT $1\`, [pageSize])
            : await db.query(
                \`SELECT id, user_id, kind, created_at::text AS created_at FROM activity_log
                  WHERE (created_at, id) > ($2::timestamptz, $3::bigint)
                  ORDER BY created_at, id LIMIT $1\`, [pageSize, last.createdAt, last.id]);
        if (rows.length > 0) yield rows;
        if (rows.length < pageSize) return;
        const tail = rows[rows.length - 1];
        last = { createdAt: tail.created_at, id: tail.id };
    }
}`, "exportActivity.ts"),
        bullets([
            "**Same ORDER BY, same page size:** the pages are exactly the pages the old job produced on unchanged data. That is the contract with the compliance team, and it is what you test.",
            "**The cursor uses every ORDER BY column.** `created_at > $2` alone would skip the rows that share the last timestamp; `id > $3` alone assumes ids follow time, which the imported history breaks.",
            "**`created_at::text`** keeps microseconds; a JavaScript `Date` would round the cursor down to milliseconds and repeat or skip rows (lesson 8).",
            "**No total count.** `SELECT count(*)` over 2.7 million rows for a \"page 400 of 27,254\" label costs as much as the problem you just removed; report progress by the created_at of the last row instead.",
        ]),
        callout("info", "In this course's challenges",
            "The code runner has SQLite, which also supports (a, b) > (?, ?) since 3.15. The challenge below stands in for statement_timeout with a budget of SQLite VM steps per statement (set_progress_handler): a deep OFFSET page needs more steps than the budget and is stopped, a keyset page needs about the same small number at any depth. Measuring steps instead of milliseconds keeps the check deterministic."),

        h2("5. How to verify"),
        numbered([
            "**Prove the output did not change.** On a copy of production or a large fixture with no concurrent writes, run the old export and the new one and compare: same number of pages, same rows per page, same hash (`sha256sum old.csv new.csv`). Include tie groups that straddle a page boundary and imported rows whose ids are out of time order.",
            "**Prove every page costs the same.** `EXPLAIN (ANALYZE, BUFFERS)` of the first page and of a cursor from deep in the table: actual rows of the scan equal the page size, buffers about equal, the row comparison in Index Cond.",
            "**Watch the job's own numbers.** Log the duration per page: it should be flat. In pg_stat_statements the export statement's max_exec_time should be close to its mean_exec_time.",
            "**Test the timeout path.** Run a page with `SET LOCAL statement_timeout = '50ms'`: the keyset page passes at any depth, the OFFSET page fails beyond a few thousand rows. This is the same idea as the VM-step budget in the challenge.",
        ]),

        challenge("chal_coding_pgp_332"),

        h2("6. Common mistakes"),
        bullets([
            "**A bigger page size instead of a cursor.** Pages of 1,000 make 10 times fewer requests, but the last page still produces the whole table before it. Spot it: the scan's actual rows in EXPLAIN still grow with the page number.",
            "**Reading everything in one query and paging in memory.** One statement that reads 2.7 million rows hits the same timeout, and holds them in the application's memory. Spot it: one long statement in the log, memory of the job growing with the table.",
            "**A cursor on one column of a two-column order.** `created_at > $2` loses rows of a tie group at page boundaries; `id > $3` reorders imported rows. Spot it: row count or hash of the new export differs from the old one.",
            "**Keeping the page number in the API and translating it to OFFSET internally.** The client still sends page=400 and the database still counts. Spot it: the query in pg_stat_statements still contains OFFSET.",
            "**Wrapping the column in a function.** `date_trunc('second', created_at)` or a cast in the cursor condition stops the index from seeking; the condition becomes a Filter and the page reads from the start of the index again. Spot it: Filter instead of Index Cond in the plan.",
        ]),

        h2("7. Summary"),
        bullets([
            "OFFSET n makes the database produce n rows and throw them away: EXPLAIN shows the scan's actual rows growing with the page number, and a full paged export costs time quadratic in the size of the table.",
            "Replace the page number with the last row: WHERE (created_at, id) > (last_created_at, last_id) with the same ORDER BY and an index on (created_at, id) gives the same pages at a constant cost, and does not shift when rows are inserted or deleted.",
            "Prove both halves: the export is identical (rows, order, page split, hash) and every page costs the same (EXPLAIN of a deep page, flat duration per page, a tight statement_timeout that still passes).",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: LIMIT and OFFSET - postgresql.org/docs/current/queries-limit.html",
            "PostgreSQL documentation: Using EXPLAIN - postgresql.org/docs/current/using-explain.html",
            "PostgreSQL documentation: statement_timeout (Client Connection Defaults)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Load 1 million rows into a local PostgreSQL table with generate_series, then time page 1, page 1,000 and page 9,000 with OFFSET and with a keyset cursor, using EXPLAIN (ANALYZE, BUFFERS). Plot the time per page for both and write down the page at which OFFSET passes 100 ms on your machine."),
    ],
});
