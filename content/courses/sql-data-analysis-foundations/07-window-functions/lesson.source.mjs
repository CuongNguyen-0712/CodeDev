// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sqlf-3-1",
    title: "Window functions: running totals & rankings",
    slug: { _type: "slug", current: "window-functions-running-totals-rankings" },
    description:
        "The quarterly deck named one best-selling grinder when two products sold exactly the same, and the \"March revenue to date\" chart started at 9,600 cents although the first order was 4,200. Learn how window functions keep every row while they add rankings, running totals and month-over-month changes - and what they do with ties.",
    estimatedTime: 25,

    scenario: {
        role: "Junior data analyst, Beanbox (online coffee shop)",
        problem:
            "Two slides in the Q1 review deck drew questions. Ops pointed out that the \"Best seller per category\" slide shows only the Hand grinder for equipment, while the Gooseneck kettle sold exactly as many units. Finance asked why the \"March revenue to date\" line already shows 9,600 cents at the first order of March, which was a 4,200-cent order, and then moves in flat steps. Both numbers come from window functions you wrote last week.",
    },

    content: [
        h2("1. The incident: two slides, one idea"),
        p("Both slides use a **window function**: a function that computes a value for each row from a group of related rows, without collapsing those rows into one. The first slide ranks products inside each category and keeps the top one:"),
        code("sql", `
WITH units AS (
    SELECT p.category, p.name, SUM(oi.quantity) AS units_sold
    FROM order_items AS oi
    JOIN orders   AS o ON o.order_id   = oi.order_id
    JOIN products AS p ON p.product_id = oi.product_id
    WHERE o.status = 'paid'
    GROUP BY p.product_id
),
ranked AS (
    SELECT category, name, units_sold,
           ROW_NUMBER() OVER (PARTITION BY category ORDER BY units_sold DESC) AS rn
    FROM units
)
SELECT category, name, units_sold
FROM ranked
WHERE rn = 1
ORDER BY category;`, "best_seller_per_category.sql"),
        p("The second slide plots one point per paid order of March, with a running total of revenue:"),
        code("sql", `
SELECT order_id,
       date(ordered_at) AS day,
       total_cents,
       SUM(total_cents) OVER (ORDER BY date(ordered_at)) AS revenue_to_date
FROM orders
WHERE status = 'paid' AND ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01'
ORDER BY day, order_id;`, "march_revenue_to_date.sql"),
        p("Neither query has an error, and both look like every tutorial example. The problem in both is the same: **several rows have the same value in the window's ORDER BY**, and the functions you chose treat those ties in a way the slide did not intend."),

        h2("2. Reproduce it with a tiny Beanbox database"),
        p("The sample database has 7 products and 13 orders from January to March 2026 (10 paid, 2 cancelled, 1 refunded). First, units sold per product without any window function:"),
        code("text", `
category  | name                      | units_sold
----------+---------------------------+-----------
beans     | Ethiopia Yirgacheffe 250g | 5
beans     | Colombia Huila 250g       | 3
beans     | Brazil Cerrado 1kg        | 2
equipment | Gooseneck kettle          | 3
equipment | Hand grinder              | 3
equipment | Paper filters (100)       | 2
merch     | Beanbox mug               | 2`),
        p("The Hand grinder and the Gooseneck kettle tie with 3 units each. Now the slide query:"),
        code("text", `
category  | name                      | units_sold
----------+---------------------------+-----------
beans     | Ethiopia Yirgacheffe 250g | 5
equipment | Hand grinder              | 3
merch     | Beanbox mug               | 2`),
        p("`ROW_NUMBER` gives every row a different number, even when the values tie. One of the two products got 1 and the other got 2, and the filter `rn = 1` dropped the kettle. Which one wins is not defined: SQLite picked the grinder here, another database (or the same one after an index change) may pick the kettle."),
        p("And the running total for the first three days of March:"),
        code("text", `
order_id | day        | total_cents | revenue_to_date
---------+------------+-------------+----------------
7        | 2026-03-01 | 4200        | 9600
8        | 2026-03-01 | 3800        | 9600
9        | 2026-03-01 | 1600        | 9600
10       | 2026-03-02 | 6600        | 16200
12       | 2026-03-03 | 2600        | 28400
13       | 2026-03-03 | 9600        | 28400`),
        p("Order 7 was 4,200 cents, but its \"revenue to date\" is already 9,600: the whole day. Every order on the same day shows the same value, so the chart draws flat steps instead of a rising line. To understand why, we start with what a window is."),

        h2("3. Windows vs GROUP BY: the rows stay"),
        p("`GROUP BY` collapses rows: three days of orders become three rows, and the individual orders are gone."),
        code("sql", `
SELECT date(ordered_at) AS day, SUM(total_cents) AS day_total
FROM orders
WHERE status = 'paid' AND ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01'
GROUP BY day;`, "group_by.sql"),
        code("text", `
day        | day_total
-----------+----------
2026-03-01 | 9600
2026-03-02 | 6600
2026-03-03 | 12200`),
        p("A window function keeps every row and adds a column. You turn an aggregate into a window function by writing `OVER (...)` after it. `OVER ()` with nothing inside means \"the window is every row of the result\":"),
        code("sql", `
SELECT order_id,
       total_cents,
       SUM(total_cents) OVER () AS march_total
FROM orders
WHERE status = 'paid' AND ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01'
ORDER BY order_id;`, "over_empty.sql"),
        code("text", `
order_id | total_cents | march_total
---------+-------------+------------
7        | 4200        | 28400
8        | 3800        | 28400
9        | 1600        | 28400
10       | 6600        | 28400
12       | 2600        | 28400
13       | 9600        | 28400`),
        p("Six rows in, six rows out. Inside the parentheses of `OVER` you can say three things, all optional:"),
        bullets([
            "**PARTITION BY** - split the rows into independent groups (like GROUP BY, but without collapsing them). Each row only sees the rows of its own partition.",
            "**ORDER BY** - order the rows inside each partition. Ranking functions, `LAG` and running totals need it.",
            "**A frame** - which rows around the current row the function adds up, for example `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.",
        ]),

        h3("PARTITION BY: a total per group, next to each row"),
        p("With `PARTITION BY date(ordered_at)`, each order sees only the orders of its own day. That makes \"share of the day\" a one-line calculation:"),
        code("sql", `
SELECT order_id,
       date(ordered_at) AS day,
       total_cents,
       SUM(total_cents) OVER (PARTITION BY date(ordered_at)) AS day_total,
       ROUND(100.0 * total_cents / SUM(total_cents) OVER (PARTITION BY date(ordered_at)), 1) AS pct_of_day
FROM orders
WHERE status = 'paid' AND ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01'
ORDER BY day, order_id;`, "partition_by.sql"),
        code("text", `
order_id | day        | total_cents | day_total | pct_of_day
---------+------------+-------------+-----------+-----------
7        | 2026-03-01 | 4200        | 9600      | 43.8
8        | 2026-03-01 | 3800        | 9600      | 39.6
9        | 2026-03-01 | 1600        | 9600      | 16.7
10       | 2026-03-02 | 6600        | 6600      | 100.0
12       | 2026-03-03 | 2600        | 12200     | 21.3
13       | 2026-03-03 | 9600        | 12200     | 78.7`),
        callout("info", "100.0, not 100",
            "Both sides of the division are INTEGER columns. In SQLite (and PostgreSQL) an integer divided by an integer is an integer, so 100 * 4200 / 9600 would give 43. Starting with 100.0 makes the calculation REAL. Lesson 1.2 covers this in detail."),

        h2("4. ORDER BY inside OVER, and the frame you did not write"),
        p("As soon as a window has an `ORDER BY`, an aggregate such as `SUM` becomes a running aggregate: each row adds up the rows from the start of the partition to the current row. But \"to the current row\" has two meanings, and the default is the surprising one."),
        p("When you write `ORDER BY` and no frame, SQL uses this frame:"),
        code("sql", `
SUM(total_cents) OVER (
    ORDER BY date(ordered_at)
    RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW   -- the default, written out
)`),
        bullets([
            "**RANGE** works on values. \"Up to the current row\" means up to the current **value** of the ORDER BY expression, so all rows with the same value - the current row's **peers** - are inside the frame together. All three orders of 2026-03-01 see 4,200 + 3,800 + 1,600 = 9,600. That is the incident.",
            "**ROWS** works on physical rows. \"Up to the current row\" means exactly that row and the rows before it, one at a time.",
        ]),
        code("sql", `
SELECT order_id,
       date(ordered_at) AS day,
       total_cents,
       SUM(total_cents) OVER (
           ORDER BY ordered_at, order_id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS revenue_to_date
FROM orders
WHERE status = 'paid' AND ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01'
ORDER BY ordered_at, order_id;`, "rows_frame.sql"),
        code("text", `
order_id | day        | total_cents | revenue_to_date
---------+------------+-------------+----------------
7        | 2026-03-01 | 4200        | 4200
8        | 2026-03-01 | 3800        | 8000
9        | 2026-03-01 | 1600        | 9600
10       | 2026-03-02 | 6600        | 16200
12       | 2026-03-03 | 2600        | 18800
13       | 2026-03-03 | 9600        | 28400`),
        p("Two details make this result trustworthy. The window orders by the full timestamp and then by `order_id`, so no two rows tie and the order of the running sum is fully defined. With `ROWS` and a tie in the ORDER BY, the database may add tied rows in any order, and the intermediate values can change between runs. The last row (28,400) is the same in every version: frames only change the values on the way."),
        image("window-ties-rank-and-frame", {
            alt: "Diagram in three parts. Left: seven Beanbox products ranked by units sold across all categories, with columns ROW_NUMBER, RANK and DENSE_RANK; the three products with 3 units get row numbers 2, 3, 4 but RANK 2 and DENSE_RANK 2; the three with 2 units get RANK 5 and DENSE_RANK 3, and a note shows that rank <= 2 keeps 2 rows with ROW_NUMBER but 4 with RANK or DENSE_RANK. Right: six paid March orders with a running total; the default RANGE frame shows 9600 for all three orders of March 1 and 28400 for both orders of March 3, while the ROWS frame grows one order at a time: 4200, 8000, 9600, 16200, 18800, 28400. Bottom: the pattern - aggregate to the grain you show, window with a clear ORDER BY, filter the rank in an outer query.",
            caption: "Peers are rows with the same ORDER BY value. RANK and DENSE_RANK give peers the same number; the default RANGE frame adds all peers at once.",
        }),
        callout("tip", "The cleanest running total has no ties at all",
            "A chart of revenue per day needs one point per day. Aggregate the orders per day first (GROUP BY in a CTE), then run the window over the daily rows: every day is unique, so RANGE and ROWS give the same answer and the line has one point per day. Section 8 shows it."),
        p("PostgreSQL, MySQL 8 and SQL Server use the same default frame, so this is not a SQLite quirk. A frame only matters for aggregate functions (`SUM`, `COUNT`, `AVG`, ...). Ranking functions and `LAG`/`LEAD` ignore it."),

        h2("5. ROW_NUMBER, RANK and DENSE_RANK on ties"),
        p("The three ranking functions agree until two rows tie. Here all seven products are ranked by units sold, across all categories (no PARTITION BY):"),
        code("sql", `
SELECT name,
       units_sold,
       ROW_NUMBER() OVER (ORDER BY units_sold DESC, name) AS row_number,
       RANK()       OVER (ORDER BY units_sold DESC)       AS rank,
       DENSE_RANK() OVER (ORDER BY units_sold DESC)       AS dense_rank
FROM units            -- the CTE from section 1
ORDER BY units_sold DESC, name;`, "three_rankings.sql"),
        code("text", `
name                      | units_sold | row_number | rank | dense_rank
--------------------------+------------+------------+------+-----------
Ethiopia Yirgacheffe 250g | 5          | 1          | 1    | 1
Colombia Huila 250g       | 3          | 2          | 2    | 2
Gooseneck kettle          | 3          | 3          | 2    | 2
Hand grinder              | 3          | 4          | 2    | 2
Beanbox mug               | 2          | 5          | 5    | 3
Brazil Cerrado 1kg        | 2          | 6          | 5    | 3
Paper filters (100)       | 2          | 7          | 5    | 3`),
        bullets([
            "**ROW_NUMBER** numbers rows 1, 2, 3, ... and never repeats. Ties are broken by the rest of the ORDER BY (here `name`), or arbitrarily if nothing breaks them. Use it when you need exactly N rows, for example \"one row per customer\" when removing duplicates.",
            "**RANK** gives tied rows the same number and then skips: three products share 2, so the next one is 5 (\"1 + the number of rows that come strictly before\"). This is how sports tables work.",
            "**DENSE_RANK** gives tied rows the same number and does not skip: the next one is 3. It counts distinct values, so \"top 2 by DENSE_RANK\" means \"the top 2 sales figures\", however many products share them.",
        ]),
        p("For a top-N report, the choice is a business decision, not a style choice: with `<= 2`, ROW_NUMBER returns 2 rows (and silently drops two tied products), RANK returns 4, DENSE_RANK returns 4. With `<= 3` they return 3, 4 and 7. Write down which one the report means."),
        challenge("chal_quiz_sqlf_311", "For each function, write the numbers next to the rows first: which rows tie, what comes after a tie. For the running sum, ask which rows are peers of the current row under the default frame."),

        h2("6. Top N per group: rank first, filter after"),
        p("The natural first attempt is to filter on the window function directly. SQLite refuses both versions:"),
        code("sql", `
SELECT category, name,
       RANK() OVER (PARTITION BY category ORDER BY price_cents DESC) AS price_rank
FROM products
WHERE RANK() OVER (PARTITION BY category ORDER BY price_cents DESC) = 1;
-- OperationalError: misuse of window function RANK()

SELECT category, name,
       RANK() OVER (PARTITION BY category ORDER BY price_cents DESC) AS price_rank
FROM products
WHERE price_rank = 1;
-- OperationalError: misuse of aliased window function price_rank`, "rank_in_where.sql"),
        p("Remember the logical order from lesson 1.1: **FROM -> WHERE -> GROUP BY -> HAVING -> SELECT -> ORDER BY -> LIMIT**. Window functions are computed in the SELECT step, after WHERE, GROUP BY and HAVING have finished. When WHERE runs, the rank does not exist yet. Two consequences:"),
        bullets([
            "**To filter on a rank, compute it in a CTE (or subquery) and filter in the outer query.** The outer WHERE runs after the inner SELECT is done.",
            "**WHERE decides what the window sees.** `WHERE status = 'paid'` removes cancelled orders before anything is ranked or summed; a running total of `WHERE ordered_at >= '2026-03-01'` starts at zero on March 1. Window functions can also use GROUP BY results: `RANK() OVER (ORDER BY SUM(total_cents) DESC)` is valid after a GROUP BY.",
        ]),
        p("The pattern, on a different question - the most expensive product in each category, ties included:"),
        code("sql", `
WITH ranked AS (
    SELECT category, name, price_cents,
           RANK() OVER (PARTITION BY category ORDER BY price_cents DESC) AS price_rank
    FROM products
)
SELECT category, price_rank, name, price_cents
FROM ranked
WHERE price_rank = 1
ORDER BY category;`, "priciest_per_category.sql"),
        code("text", `
category  | price_rank | name               | price_cents
----------+------------+--------------------+------------
beans     | 1          | Brazil Cerrado 1kg | 4200
equipment | 1          | Hand grinder       | 4500
merch     | 1          | Beanbox mug        | 1200`),
        p("Why not `ORDER BY ... LIMIT 1`? Because `LIMIT` runs last and applies to the whole result, not to each category: it returns one product in total. \"Top N per group\" always needs a window (or a correlated subquery, lesson 2.2)."),
        callout("info", "QUALIFY",
            "Some databases (DuckDB, Snowflake, BigQuery) have a QUALIFY clause that filters on window functions directly: QUALIFY RANK() OVER (...) = 1. SQLite and PostgreSQL do not; use the CTE pattern, which works everywhere."),

        h2("7. LAG and LEAD: month over month"),
        p("`LAG(expr)` returns the value of `expr` from the previous row of the window, `LEAD(expr)` from the next row. With one row per month, that is exactly what a month-over-month change needs:"),
        code("sql", `
WITH monthly AS (
    SELECT strftime('%Y-%m', ordered_at) AS month, SUM(total_cents) AS revenue_cents
    FROM orders
    WHERE status = 'paid'
    GROUP BY month
)
SELECT month,
       revenue_cents,
       LAG(revenue_cents) OVER (ORDER BY month) AS prev_month_cents,
       revenue_cents - LAG(revenue_cents) OVER (ORDER BY month) AS change_cents,
       ROUND(100.0 * (revenue_cents - LAG(revenue_cents) OVER (ORDER BY month))
             / LAG(revenue_cents) OVER (ORDER BY month), 1) AS change_pct,
       LEAD(revenue_cents) OVER (ORDER BY month) AS next_month_cents
FROM monthly
ORDER BY month;`, "month_over_month.sql"),
        code("text", `
month   | revenue_cents | prev_month_cents | change_cents | change_pct | next_month_cents
--------+---------------+------------------+--------------+------------+-----------------
2026-01 | 8900          | NULL             | NULL         | NULL       | 11600
2026-02 | 11600         | 8900             | 2700         | 30.3       | 28400
2026-03 | 28400         | 11600            | 16800        | 144.8      | NULL`),
        bullets([
            "**The first month has no previous row, so LAG returns NULL**, and every calculation with it is NULL too (lesson 1.3). That is the honest answer: there is no change to report. `LAG(revenue_cents, 1, 0)` would return 0 instead and show January as \"+8,900\", which is not a change.",
            "**LAG looks at the previous row, not the previous calendar month.** If a month has no paid orders, it has no row, and the next month is compared with two months ago. Build a calendar of months first when gaps are possible (lesson 2.2).",
            "**Aggregate first, then window**, as with the running total: LAG over per-order rows compares an order with the previous order.",
        ]),

        h2("8. The fix"),
        p("For the chart, the fix follows the pattern from the diagram: aggregate to one row per day, then run the window over the days. The frame is written out, so a reader does not have to remember the default:"),
        code("sql", `
WITH daily AS (
    SELECT date(ordered_at) AS day, SUM(total_cents) AS revenue_cents
    FROM orders
    WHERE status = 'paid' AND ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01'
    GROUP BY day
)
SELECT day,
       revenue_cents,
       SUM(revenue_cents) OVER (
           ORDER BY day
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS revenue_to_date
FROM daily
ORDER BY day;`, "march_revenue_to_date.sql"),
        code("text", `
day        | revenue_cents | revenue_to_date
-----------+---------------+----------------
2026-03-01 | 9600          | 9600
2026-03-02 | 6600          | 16200
2026-03-03 | 12200         | 28400`),
        p("One point per day, each point is \"everything paid up to the end of that day\", and the last point matches `SUM(total_cents)` for the month. Days with no paid orders are still missing from this result; a calendar CTE fills them (lesson 2.2)."),
        p("For the best-seller slide, only the ranking function changes: `RANK()` instead of `ROW_NUMBER()`, so both products with 3 units get rank 1 and both appear (sorted by name as a tie-breaker in the final ORDER BY):"),
        code("text", `
category  | name                      | units_sold
----------+---------------------------+-----------
beans     | Ethiopia Yirgacheffe 250g | 5
equipment | Gooseneck kettle          | 3
equipment | Hand grinder              | 3
merch     | Beanbox mug               | 2`),
        p("Marketing now wants a bigger version of this slide: the top 2 places per category by **paid revenue**, where a tie never hides a product. Write the query:"),
        challenge("chal_coding_sqlf_312", "Build it in two CTEs: first one row per product with its paid revenue (quantity times the price on the order line), then the place inside each category. Filter on the place in the outer query. Before you run the tests, work out by hand what 9000, 9000, 3800 should give, and check which ranking function produces exactly that."),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "**`SUM(...) OVER (ORDER BY x)` where x has duplicates.** The default RANGE frame adds all peers at once. Aggregate to unique x first, or write `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` with a tie-free ORDER BY.",
            "**ROW_NUMBER for a top-N report.** It drops tied rows arbitrarily. Use RANK or DENSE_RANK, and state which one the report means.",
            "**A ranking without PARTITION BY.** The rank is computed over all rows, so \"top 2 per category\" becomes \"top 2 overall\" and small categories vanish.",
            "**A window over the wrong grain.** Ranking order lines instead of products, or running a LAG over orders instead of months. Aggregate first, then window.",
            "**A window function in WHERE, HAVING or GROUP BY.** It is an error: the window is computed after those steps. Use a CTE and filter outside.",
            "**ORDER BY inside OVER is not the result order.** It only orders the rows for the window's calculation. The final ORDER BY still decides the order of the output rows.",
            "**A window ORDER BY with ties and ROWS or ROW_NUMBER.** The result can change between runs. Add a unique column (such as an id) as the last sort key.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Each window runs over rows at the grain the report shows (one row per day, per product, per month).",
            "Every running total either has a unique ORDER BY or an explicit `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` frame.",
            "The last value of a running total equals the plain `SUM` of the same rows.",
            "The ranking function matches the business rule for ties: ROW_NUMBER (exactly N rows), RANK (ties share, places skip) or DENSE_RANK (ties share, no gaps).",
            "Per-group rankings have `PARTITION BY` the group column.",
            "Filters on a rank are in an outer query, never in the same SELECT's WHERE.",
            "LAG/LEAD results are NULL for the first/last row, and the report says so instead of showing a fake 0 change.",
        ]),
    ],
});
