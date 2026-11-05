// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pgp-3-2",
    title: "Keyset pagination for large tables",
    slug: { _type: "slug", current: "postgres-keyset-pagination" },
    description:
        "Rice Rocket's admin order list used OFFSET: deep pages took seconds, and new orders made staff see some orders twice and miss others. Learn why OFFSET reads and throws rows away, how keyset pagination seeks with a unique order and a row-value comparison, and build the cursor and queries for the admin list.",
    estimatedTime: 14,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Restaurant managers page through their orders in the admin panel, newest first, 50 per page. A large restaurant has 400,000 orders. Page 2,000 takes seconds, and during lunch the manager sees an order on two pages in a row while another never appears.",
    },

    content: [
        h2("Situation"),
        code("sql", `
SELECT id, created_at, total_vnd FROM orders
WHERE restaurant_id = $1
ORDER BY created_at DESC
LIMIT 50 OFFSET $2;          -- $2 = (page - 1) * 50`, "api: GET /admin/orders?page=2000"),
        code("text", `
 Limit  (actual time=2210.4..2210.5 rows=50 loops=1)
   ->  Index Scan Backward using orders_restaurant_created on orders (actual rows=100000 loops=1)
         Index Cond: (restaurant_id = 17)
         Buffers: shared hit=41022 read=58321`, "EXPLAIN (ANALYZE, BUFFERS)"),
        bullets([
            "To return rows 99,951 to 100,000, the database reads the first 100,000 and throws 99,950 away.",
            "Two new orders arrive while the manager reads page 1: every row moves down two places, so the last two orders of page 1 appear again at the top of page 2.",
            "Orders created in the same second have no defined order between them, so one query run can put an order on page 3 and the next run on page 4.",
        ]),

        h2("The core you need"),
        bullets([
            "**OFFSET is work, not a jump.** `OFFSET n` still produces the first n rows and discards them; the cost grows with the page number.",
            "**A unique, stable order.** `created_at` alone is not unique. Add the primary key as the last column: `ORDER BY created_at DESC, id DESC`. Now every row has exactly one position.",
            "**Seek instead of skip.** Remember the last row of the page and ask for the rows strictly after it: `WHERE (created_at, id) < ($last_created_at, $last_id)`. A row-value comparison compares column by column, so ties on `created_at` are broken by `id`. New rows inserted above the cursor never shift the next page.",
            "**An index in the same order.** `(restaurant_id, created_at, id)` lets the database jump to the restaurant, seek to the cursor and read the next 50 entries; PostgreSQL scans it backward for the DESC order. Every page costs the same.",
            "**An opaque cursor.** Send the browser `next=<base64 of {\"created_at\", \"id\"}>`, not raw column values or a page number. The client cannot build page 2,000 by hand, and the server can change the cursor's contents later. Validate it: a cursor is user input.",
            "**What you give up.** No \"jump to page 2,000\" and no cheap total count. Admin lists need next and previous; for counts, show an estimate or a capped number.",
        ]),

        h2("Apply it in the project"),
        code("sql", `
CREATE INDEX CONCURRENTLY orders_restaurant_created_id ON orders (restaurant_id, created_at, id);

-- first page
SELECT id, created_at, total_vnd FROM orders
WHERE restaurant_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 50;

-- every next page: $2, $3 = created_at and id of the last row the client saw
SELECT id, created_at, total_vnd FROM orders
WHERE restaurant_id = $1
  AND (created_at, id) < ($2, $3)
ORDER BY created_at DESC, id DESC
LIMIT 50;`, "admin/orders.sql"),
        p("The api turns the last row into the `next` cursor and back:"),
        code("python", `
def encode_cursor(row):
    data = json.dumps({"created_at": row["created_at"], "id": row["id"]}, separators=(",", ":"))
    return base64.urlsafe_b64encode(data.encode()).decode()


def decode_cursor(cursor):
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
    except (binascii.Error, UnicodeDecodeError, ValueError):
        raise InvalidCursor("invalid cursor")          # -> HTTP 400
    if not isinstance(data, dict) or set(data) != {"created_at", "id"} \\
            or not isinstance(data["created_at"], str) or type(data["id"]) is not int:
        raise InvalidCursor("invalid cursor")
    return data`, "admin/order_pages.py"),
        callout("info", "Filters belong before the seek",
            "Filters such as `status = 'cancelled'` or a date range go into the WHERE next to `restaurant_id`, and the cursor keeps only the sort key. If a filter is selective and used often, give it its own index in the same shape: `(restaurant_id, status, created_at, id)`."),

        h2("Verify"),
        code("sql", `
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, total_vnd FROM orders
WHERE restaurant_id = 17 AND (created_at, id) < ('2025-01-14 12:03:11+07', 812733)
ORDER BY created_at DESC, id DESC LIMIT 50;
--  Limit  (actual time=0.03..0.11 rows=50 loops=1)
--    ->  Index Scan Backward using orders_restaurant_created_id on orders (actual rows=50 loops=1)
--          Index Cond: ((restaurant_id = 17) AND (ROW(created_at, id) < ROW(...)))
--          Buffers: shared hit=54`, "psql"),
        p("The deep page reads 50 index entries, like page 1. In the challenge the same query runs on SQLite, whose plan reads `SEARCH orders USING INDEX orders_restaurant_created_id (restaurant_id=? AND (created_at,id)<(?,?))`."),

        h2("Pitfalls"),
        bullets([
            "**Seeking on `created_at` alone.** `WHERE created_at < $2` skips every order that shares the last row's second but was not on the page. Detect it with a test that puts a page boundary inside a group of equal timestamps.",
            "**An ORDER BY the index cannot serve.** Mixing directions (`created_at DESC, id ASC`) with an index in one direction forces a sort of all the restaurant's rows on every page. Keep the directions the same, or build the index with the mixed directions.",
            "**Trusting the cursor.** A cursor decoded without checks turns a tampered value into a 500 or a strange query. Validate its shape and types and answer 400.",
        ]),

        p("Now build the pagination. The editor holds `admin/order_pages.py` with its key pieces missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run pages through a restaurant on SQLite while new orders arrive between pages, and reports ids seen twice, ids never shown and the plans of both queries."),
        challenge("chal_coding_pgp_162"),
    ],
});
