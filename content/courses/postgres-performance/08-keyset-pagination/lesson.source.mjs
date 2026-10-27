// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-3-2",
    title: "Keyset pagination with (created_at, id)",
    slug: { _type: "slug", current: "keyset-pagination-created-at-id" },
    description:
        "The activity feed of CodeDev loses events: a lesson completion writes three events with the same timestamp, and the cursor created_at < last skips the ones that did not fit on the page. Learn how keyset pagination works, why the cursor must contain every ORDER BY column, how the row comparison (created_at, id) < ($1, $2) lets the index seek to the next page in PostgreSQL and SQLite, which index serves it, how to pass the cursor through an API without losing precision, and when OFFSET is still the simpler choice.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The profile page shows an activity feed, newest first, with infinite scroll: \"Completed lesson 4\", \"Earned the 7-day streak badge\". A learner reports that the badge she earned last Thursday is in her notifications but not in her feed. Support finds 41 similar reports since the feed switched from OFFSET to a cursor two weeks ago. Every missing event was written in the same transaction as another event, and every one of them would have been the first row of a page.",
    },

    content: [
        h2("1. The incident: a cursor that skips rows"),
        p("Two weeks ago the feed moved away from `LIMIT 20 OFFSET $2`, because deep pages were slow and rows shifted while learners scrolled (lesson 9 covers that failure). The new endpoint returns the `created_at` of the last row, and the client sends it back to get the next page:"),
        code("sql", `
-- GET /api/users/42/activity?before=2026-10-24T14:03:17.250Z
SELECT id, kind, created_at
FROM activity_log
WHERE user_id = $1
  AND created_at < $2            -- $2 = created_at of the last row shown
ORDER BY created_at DESC, id DESC
LIMIT 20;`, "feed_page.sql"),
        p("It looks right, and on most pages it is. The problem is a fact about the data: when a learner completes a lesson, the API writes `lesson_completed`, `badge_earned` and `streak_extended` in one transaction, and the column default `now()` returns the **start time of the transaction**. All three rows get exactly the same `created_at`."),

        h2("2. Reproduce it and read the evidence"),
        p("Find the missing badge and its neighbours:"),
        code("sql", `
SELECT id, kind, created_at
FROM activity_log
WHERE user_id = 42 AND created_at = '2026-10-24 14:03:17.25+00'
ORDER BY id DESC;

   id    |       kind       |        created_at
---------+------------------+---------------------------
 8812043 | streak_extended  | 2026-10-24 14:03:17.25+00
 8812042 | lesson_completed | 2026-10-24 14:03:17.25+00
 8812041 | badge_earned     | 2026-10-24 14:03:17.25+00`, "psql"),
        p("Page 1 ended with 8812042. The cursor sent for page 2 was its `created_at`, and `created_at < '...17.25'` excludes **every** row with that timestamp, including 8812041, which was never shown. The `id DESC` in ORDER BY did not help: ORDER BY only sorts the rows that WHERE lets through. Run the page query with the cursor from the log and the badge is not there; run it with `<=` and the two rows already shown come back as duplicates. Neither condition on `created_at` alone can be right while `created_at` is not unique."),

        h2("3. Core idea: the cursor is the whole sort key"),
        p("Keyset pagination (also called seek pagination) describes a page by **where it starts in the sort order**, not by how many rows come before it. It works when two things are true:"),
        numbered([
            "**The sort key is unique.** `created_at DESC` is not; `created_at DESC, id DESC` is, because `id` is the primary key. Every row has exactly one position.",
            "**The cursor contains the whole sort key, and the next page asks for the rows after it in the same order.** For a descending order, \"after\" means smaller: `(created_at, id) < (last_created_at, last_id)`.",
        ]),
        p("The row comparison `(a, b) < (x, y)` compares like a tuple: true when `a < x`, or when `a = x` and `b < y`. That is exactly \"comes after this row in `a DESC, b DESC` order\". PostgreSQL has supported it for a long time, and SQLite since 3.15 (2016)."),
        code("sql", `
SELECT id, kind, created_at
FROM activity_log
WHERE user_id = $1
  AND (created_at, id) < ($2, $3)      -- the last row shown: its created_at and its id
ORDER BY created_at DESC, id DESC
LIMIT 20;`, "feed_page.sql"),
        h3("Why it is fast at any depth"),
        p("With the index `activity_log (user_id, created_at, id)`, the rows of one user are stored in the B-tree in sort order. The row comparison becomes part of the **Index Cond**, so PostgreSQL descends the tree straight to the cursor and reads backward 20 entries. Page 1 and page 1,250 cost the same:"),
        code("text", `
Limit  (cost=0.43..22.01 rows=20 width=52) (actual time=0.025..0.049 rows=20 loops=1)
  Buffers: shared hit=6
  ->  Index Scan Backward using activity_log_user_created_id on activity_log
        (cost=0.43..1210.42 rows=1121 width=52) (actual time=0.024..0.045 rows=20 loops=1)
        Index Cond: ((user_id = 42) AND (ROW(created_at, id) < ROW('2025-11-03 18:22:41.512+00'::timestamp with time zone, 77012345)))
        Buffers: shared hit=6
Execution Time: 0.068 ms`, "EXPLAIN (ANALYZE, BUFFERS)"),
        bullets([
            "**Index Scan Backward:** the index is ascending, the query descending; a B-tree reads both ways, so no separate DESC index is needed when every column goes the same direction.",
            "**No Sort node:** the index already delivers the rows in ORDER BY order, and Limit stops the scan after 20 rows. A plan with `Sort` above the scan has to read every matching row first.",
            "**Mixed directions need a matching index.** `ORDER BY created_at DESC, id ASC` cannot be read from `(created_at, id)` in one direction, and the tuple comparison no longer describes the order. Keep all sort columns in the same direction, or create the index with the same mix.",
        ]),
        h3("When not to use keyset pagination"),
        bullets([
            "**The user needs to jump to page 37.** A cursor only knows the next page (and, with the reverse comparison, the previous one). Numbered pages over a small, filtered result are fine with OFFSET.",
            "**The result is small and bounded.** 200 rows of admin settings sorted by name do not need a cursor. Deep pages are where OFFSET hurts; lesson 9 measures it.",
            "**The sort is a free choice of the user over many columns.** Every sort option needs its own unique key, cursor format and index. Offer keyset for the main feed order and keep rare sorts limited.",
        ]),

        challenge("chal_quiz_pgp_321"),

        h2("4. Worked example: the API around the query"),
        p("The client should not build SQL values. The API returns an opaque cursor made from the last row, and accepts it back:"),
        code("typescript", `
type Cursor = { createdAt: string; id: string };   // createdAt as PostgreSQL text: keeps microseconds

const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
const decode = (s: string): Cursor => JSON.parse(Buffer.from(s, "base64url").toString());

async function feedPage(userId: number, after: string | null, limit = 20) {
    const { rows } = after === null
        ? await db.query(
            \`SELECT id, kind, created_at::text AS created_at FROM activity_log
              WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2\`, [userId, limit])
        : await db.query(
            \`SELECT id, kind, created_at::text AS created_at FROM activity_log
              WHERE user_id = $1 AND (created_at, id) < ($2::timestamptz, $3::bigint)
              ORDER BY created_at DESC, id DESC LIMIT $4\`,
            [userId, decode(after).createdAt, decode(after).id, limit]);
    const last = rows.at(-1);
    return { items: rows, next: rows.length === limit ? encode({ createdAt: last.created_at, id: last.id }) : null };
}`, "feed.ts"),
        bullets([
            "**Keep the full precision of the timestamp.** `timestamptz` stores microseconds; a JavaScript `Date` keeps milliseconds. A cursor `2026-10-24T14:03:17.250Z` made from `...17.250418` is earlier than the real row, so the next page skips the rest of that millisecond. Selecting `created_at::text` (or the epoch in microseconds) avoids the round trip through `Date`.",
            "**Validate the decoded cursor** like any input: a malformed cursor should be a 400, not a 500, and its values go to the query as parameters only.",
            "**`next: null` when the page is short.** If the last page is exactly full, the client asks once more and gets an empty page; that is cheaper than counting.",
        ]),
        callout("info", "In this course's challenges",
            "The code runner has SQLite, not PostgreSQL. In the challenge below created_at is ISO text ('YYYY-MM-DD HH:MM:SS'), which sorts correctly as a string; the runner checks the plan with EXPLAIN QUERY PLAN, where a seek looks like SEARCH activity_log USING INDEX activity_log_user_created_id (user_id=? AND ...), and it caps the work per page with a budget of SQLite VM steps instead of measuring time."),

        h2("5. How to verify"),
        bullets([
            "**Page through everything in a test and compare with one query.** Concatenate all pages and compare with `SELECT id ... ORDER BY created_at DESC, id DESC` without LIMIT: same ids, same order, no duplicates. Use fixtures with tie groups larger than a page and ids that are not in time order.",
            "**Put a page boundary inside a tie group on purpose** (limit 2 and three rows with the same timestamp). This is the case that broke production, and random data rarely produces it.",
            "**EXPLAIN (ANALYZE, BUFFERS) of page 1 and of a deep page:** both should show the row comparison in Index Cond (not in Filter), no Sort node, and about the same rows and buffers.",
            "**Watch for Filter instead of Index Cond.** `Filter: ((created_at < $2) OR ((created_at = $2) AND (id < $3)))` means the expanded OR form was not used as an index bound: the scan starts at the newest row and discards rows until it reaches the cursor, which gets slower with depth. Prefer the row comparison.",
        ]),

        challenge("chal_coding_pgp_322"),

        h2("6. Common mistakes"),
        bullets([
            "**A cursor on a non-unique column.** `created_at < $2` skips the rest of a tie group; `created_at <= $2` repeats it, and loops forever when a whole page shares one timestamp. Spot it: a fixture with three rows in one transaction and a page size of 2.",
            "**A cursor on id alone because \"ids grow with time\".** Imports, backfills and sequences with cache per session break that assumption. Spot it: `SELECT count(*) FROM activity_log a JOIN activity_log b ON a.id < b.id AND a.created_at > b.created_at` is not 0.",
            "**A function on the column.** `date_trunc('second', created_at) < $2` or SQLite's `datetime(created_at) < ...` cannot use the index range: every page scans from the newest row. Spot it: in the plan, the condition appears as Filter, and a deep page reads far more rows than it returns.",
            "**Losing precision in the cursor.** A `Date` round trip truncates microseconds. Spot it: rows inserted in the same millisecond disappear; compare the cursor string with `created_at::text` of the last row.",
            "**ORDER BY and cursor disagree.** Cursor on `(created_at, id)` with `ORDER BY created_at DESC` only, or with mixed directions. Spot it: the concatenated pages differ from the full ordered query.",
        ]),

        h2("7. Summary"),
        bullets([
            "Keyset pagination asks for the rows after the last row shown. It is correct only when the sort key is unique and the cursor carries all of it: ORDER BY created_at DESC, id DESC with WHERE (created_at, id) < (last_created_at, last_id).",
            "With an index on (user_id, created_at, id), the row comparison is an Index Cond: the scan seeks to the cursor, reads one page and stops, so every page costs the same. Check it in EXPLAIN: no Sort, no Filter on the cursor.",
            "Treat the cursor as an opaque, validated token with full timestamp precision, and keep OFFSET for small results or numbered pages a user really needs.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Row Constructor Comparison (Functions and Operators, Row and Array Comparisons)",
            "PostgreSQL documentation: Indexes and ORDER BY - postgresql.org/docs/current/indexes-ordering.html",
            "SQLite documentation: Row Values - sqlite.org/rowvalue.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add a \"newer\" link to the feed: the previous page is WHERE (created_at, id) > ($2, $3) ORDER BY created_at ASC, id ASC LIMIT 20, reversed in the application. Write the test that pages forward to the end and back to the start and checks that both walks return the same rows."),
    ],
});
