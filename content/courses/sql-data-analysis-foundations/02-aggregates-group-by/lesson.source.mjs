// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sqlf-1-2",
    title: "Aggregates & GROUP BY: counting the right thing",
    slug: { _type: "slug", current: "aggregates-group-by-counting-the-right-thing" },
    description:
        "The Monday dashboard says 12 customers ordered last week (finance counts 5), the average order is $39.99 (it is $26.44), and the \"markets with 3+ new customers\" tile fails with \"misuse of aggregate\". Learn COUNT(*) vs COUNT(col) vs COUNT(DISTINCT col), SUM/AVG/MIN/MAX, the grain of a GROUP BY, WHERE vs HAVING, and SQLite's integer division.",
    estimatedTime: 20,

    scenario: {
        role: "Junior data analyst, Beanbox (online coffee shop)",
        problem:
            "On Monday morning the CEO opens the weekly dashboard: \"Customers who ordered: 12\" and \"Average order value: $39.99\". Finance replies within minutes: only 5 customers paid last week, and their average order was $26.44. Marketing adds that their new tile, \"Markets with 3+ new customers in October\", shows nothing but an error. All three tiles were written by the analyst who had your job before you, and you have to fix them before the weekly meeting.",
    },

    content: [
        h2("1. The incident: three tiles, three wrong answers"),
        p("The dashboard database is refreshed every Monday and holds last week's orders (12 to 18 October), so these queries need no date filter. Here is what the three tiles run:"),
        code("sql", `
-- Tile 1: "Customers who ordered"
SELECT COUNT(*) AS customers_who_ordered
FROM orders;

-- Tile 2: "Average order value" (cents, shown as dollars)
SELECT SUM(total_cents) / COUNT(*) AS avg_order_cents
FROM orders;

-- Tile 3: "Markets with 3+ new customers in October"
SELECT country, COUNT(*) AS new_customers
FROM customers
WHERE signup_date >= '2026-10-01' AND COUNT(*) >= 3
GROUP BY country;`, "weekly_dashboard.sql"),
        p("Each query is short and looks reasonable. Each one has a different problem: tile 1 counts the wrong thing, tile 2 divides the wrong way over the wrong rows, and tile 3 filters at the wrong moment. All three are about **aggregates**: functions that turn many rows into one value."),

        h2("2. Reproduce it on last week's data"),
        p("Last week had only 12 orders, small enough to read in full:"),
        code("text", `
order_id | customer_id | status    | total_cents | coupon_code
---------+-------------+-----------+-------------+------------
     101 |           1 | paid      |        2400 | NULL
     102 |           2 | paid      |        3150 | WELCOME10
     103 |           1 | paid      |        1800 | NULL
     104 |           3 | cancelled |       12900 | NULL
     105 |           4 | paid      |        2650 | WELCOME10
     106 |           2 | refunded  |        3150 | NULL
     107 |           5 | paid      |        4100 | NULL
     108 |           3 | paid      |        2900 | FALL15
     109 |           6 | pending   |        1999 | NULL
     110 |           1 | paid      |        2400 | FALL15
     111 |           7 | cancelled |        8800 | NULL
     112 |           4 | paid      |        1750 | NULL`),
        p("Run the three tiles against it (SQLite, the `sqlite3` module that ships with Python):"),
        code("text", `
-- Tile 1
customers_who_ordered
---------------------
                   12

-- Tile 2
avg_order_cents
---------------
           3999

-- Tile 3
Error: misuse of aggregate: COUNT()`),
        p("Read the table and you can see the truth by hand. There are 12 **orders**, but they come from 7 different customers, and only 5 of those customers have a paid order. The 3999 cents ($39.99) average includes two cancelled orders worth 12900 and 8800 cents, a refund and a pending order. And tile 3 never ran at all."),

        h2("3. COUNT three ways"),
        p("`COUNT` has three forms, and they answer three different questions:"),
        bullets([
            "`COUNT(*)` counts **rows**. It does not look at any column.",
            "`COUNT(col)` counts rows where `col` **is not NULL**.",
            "`COUNT(DISTINCT col)` counts the **different non-NULL values** of `col`.",
        ]),
        code("sql", `
SELECT COUNT(*)                    AS order_rows,
       COUNT(coupon_code)          AS with_coupon,
       COUNT(DISTINCT coupon_code) AS distinct_coupons,
       COUNT(DISTINCT customer_id) AS customers
FROM orders;`, "count_three_ways.sql"),
        code("text", `
order_rows | with_coupon | distinct_coupons | customers
-----------+-------------+------------------+----------
        12 |           4 |                2 |         7`),
        p("Four orders used a coupon, but only two different codes (`WELCOME10` and `FALL15`) were used. Twelve rows, but seven customers. Tile 1 asked \"how many customers?\" and answered \"how many rows?\". Before you write `COUNT`, finish the sentence **\"the number of different ...\"** or **\"the number of rows where ...\"** - the words tell you which form you need."),
        callout("info", "COUNT(col) and NULL",
            "COUNT(coupon_code) skipped the 8 orders whose coupon_code is NULL. Every aggregate except COUNT(*) ignores NULLs - SUM, AVG, MIN and MAX included. That is often what you want and sometimes a trap; lesson 1.3 is all about NULLs."),

        h2("4. SUM, AVG, MIN, MAX - and integer division"),
        p("The other everyday aggregates work the same way: they read one column across all the rows that reach them and return one value. Here they are on the paid orders only:"),
        code("sql", `
SELECT COUNT(*)         AS paid_orders,
       SUM(total_cents) AS revenue_cents,
       MIN(total_cents) AS smallest,
       MAX(total_cents) AS largest,
       AVG(total_cents) AS avg_real
FROM orders
WHERE status = 'paid';`, "paid_orders_summary.sql"),
        code("text", `
paid_orders | revenue_cents | smallest | largest | avg_real
------------+---------------+----------+---------+---------
          8 |         21150 |     1750 |    4100 |  2643.75`),
        p("`MIN` and `MAX` also work on text: they compare text, so on ISO-8601 dates they return the earliest and latest timestamp (`MIN(ordered_at)` is `2026-10-12 08:15:00` here)."),
        h3("Why SUM / COUNT is not an average in SQLite"),
        p("`AVG` returns a REAL (floating-point) number: 2643.75. Tile 2 did not use `AVG`; it divided `SUM(total_cents)` by `COUNT(*)`. Both are INTEGERs, and **in SQLite (and in PostgreSQL) an integer divided by an integer is integer division: the fraction is thrown away**. The same mistake on a ratio is much worse than a lost cent:"),
        code("sql", `
SELECT 21150 / 8                  AS int_div,
       21150 * 1.0 / 8            AS real_div,
       ROUND(21150 * 1.0 / 8)     AS rounded,
       ROUND(21150 * 1.0 / 8, 1)  AS one_decimal;

-- share of last week's orders that were paid: 8 of 12
SELECT 8 / 12                     AS paid_share,
       100 * 8 / 12               AS pct_int,
       ROUND(100.0 * 8 / 12, 1)   AS pct;`, "integer_division.sql"),
        code("text", `
int_div | real_div | rounded | one_decimal
--------+----------+---------+------------
   2643 |  2643.75 |  2644.0 |      2643.8

paid_share | pct_int | pct
-----------+---------+-----
         0 |      66 | 66.7`),
        bullets([
            "**Make one side REAL before you divide**: `1.0 * a / b` or `100.0 * a / b`. Multiplying after the division is too late: `8 / 12 * 100.0` is still 0.0.",
            "**Round on purpose, at the end**: `ROUND(x)` rounds to a whole number, `ROUND(x, 1)` to one decimal. In SQLite, halves round away from zero (`ROUND(2.5)` is 3.0).",
            "**SQLite's ROUND returns a REAL** (`2644.0`, not `2644`). When a report needs an integer, wrap it: `CAST(ROUND(x) AS INTEGER)`.",
            "For averages, prefer `AVG(col)` over `SUM(col) / COUNT(*)`: it already divides as REAL, and it uses the right denominator when the column has NULLs (lesson 1.3).",
        ]),
        callout("warning", "Integer division hides in plain sight",
            "SQLite has dynamic typing: the result type depends on the values, not on a declared column type. total_cents holds integers, COUNT(*) is an integer, so their quotient is an integer and no error or warning tells you that 0.67 became 0. Any division in a report deserves a second look."),

        h2("5. GROUP BY and the grain of the result"),
        p("Without `GROUP BY`, an aggregate query returns **one row for the whole table**. With `GROUP BY`, SQL first sorts the rows into groups - one group per distinct value of the grouping columns - and then computes every aggregate **once per group**. The result has one row per group:"),
        code("sql", `
SELECT status,
       COUNT(*)                    AS orders,
       COUNT(DISTINCT customer_id) AS customers,
       SUM(total_cents)            AS total_cents
FROM orders
GROUP BY status
ORDER BY status;`, "orders_by_status.sql"),
        code("text", `
status    | orders | customers | total_cents
----------+--------+-----------+------------
cancelled |      2 |         2 |       21700
paid      |      8 |         5 |       21150
pending   |      1 |         1 |        1999
refunded  |      1 |         1 |        3150`),
        p("The **grain** of a result is what one row represents. Say it out loud before you write the query: \"one row per status\", \"one row per customer\", \"one row per country and month\". The grouping columns *are* the grain: `GROUP BY status` gives one row per status, `GROUP BY country, plan` one row per country-and-plan combination. If you cannot finish the sentence \"one row per ...\", you are not ready to write the `GROUP BY`."),
        h3("Every other column must be aggregated"),
        p("After grouping, a row in the result stands for a whole group. A column in `SELECT` therefore has to be either **a grouping column** (one value per group by definition) or **inside an aggregate** (many values reduced to one). Anything else asks for \"the\" value of a column that has several values in the group. Look at what SQLite does with that question:"),
        code("sql", `
-- status is neither grouped nor aggregated
SELECT customer_id, status, COUNT(*) AS orders
FROM orders
GROUP BY customer_id
ORDER BY customer_id;`, "bare_column.sql"),
        code("text", `
customer_id | status    | orders
------------+-----------+-------
          1 | paid      |      3
          2 | paid      |      2
          3 | cancelled |      2
          4 | paid      |      2
          5 | paid      |      1
          6 | pending   |      1
          7 | cancelled |      1`),
        p("SQLite runs it and picks the `status` of **one row of each group**. Customer 3 has a cancelled order and a paid one; the result says \"cancelled\". Customer 2 has a paid order and a refund; the result says \"paid\". Nothing tells you which row was used, and a different version, an index or a different insert order can change the answer. A report built on this column reports noise."),
        bullets([
            "**PostgreSQL rejects the query**: `column \"orders.status\" must appear in the GROUP BY clause or be used in an aggregate function`. So do SQL Server, Oracle and MySQL in its default mode.",
            "**SQLite has one documented special case**: with exactly one `MIN()` or `MAX()`, bare columns come from the row that holds the minimum or maximum. Even then, ties pick an arbitrary row. Do not rely on it in analysis you share; lesson 3.1 shows the portable way (window functions).",
            "**Fix it by deciding what you meant**: add the column to `GROUP BY` (this changes the grain: one row per customer *and status*), or aggregate it (`MAX(ordered_at)`, `COUNT(DISTINCT status)`), or filter the rows first with `WHERE`.",
        ]),

        h2("6. WHERE filters rows, HAVING filters groups"),
        p("Tile 3 failed because of when each clause runs. Lesson 1.1 introduced the logical order; here are the steps that matter for aggregates:"),
        numbered([
            "`FROM` reads the rows.",
            "`WHERE` keeps or drops **one row at a time**. No group exists yet, so there is nothing to count.",
            "`GROUP BY` puts the surviving rows into groups.",
            "The aggregates (`COUNT`, `SUM`, ...) are computed once per group.",
            "`HAVING` keeps or drops **whole groups**, and can use those aggregates.",
            "`SELECT` and `ORDER BY` shape the remaining rows.",
        ]),
        image("where-group-having-pipeline", {
            alt: "Diagram of the markets tile in four steps. Step 1: twelve customer rows with signup dates; WHERE signup_date >= '2026-10-01' drops three September and August rows, leaving nine. Step 2: GROUP BY country forms four groups: VN with three rows, DE with three, US with two and JP with one. Step 3: each group is reduced to one row with COUNT(*): VN 3, DE 3, US 2, JP 1. Step 4: HAVING COUNT(*) >= 3 keeps VN and DE and drops US and JP. Below, a red panel shows that putting COUNT(*) >= 3 in WHERE fails with 'misuse of aggregate: COUNT()' because WHERE sees one row at a time, and a green panel shows the correct query with the row filter in WHERE and the group filter in HAVING.",
            caption: "WHERE runs before the groups exist, HAVING after the aggregates are computed. A condition on a COUNT or SUM can only go in HAVING.",
        }),
        p("So a condition goes where its information exists. `signup_date >= '2026-10-01'` is about one customer row: `WHERE`. `COUNT(*) >= 3` is about a group: `HAVING`."),
        code("sql", `
SELECT country, COUNT(*) AS new_customers
FROM customers
WHERE signup_date >= '2026-10-01'
GROUP BY country
HAVING COUNT(*) >= 3
ORDER BY country;`, "markets_tile.sql"),
        code("text", `
country | new_customers
--------+--------------
DE      |             3
VN      |             3`),
        p("Do not \"fix\" the error by moving everything into `HAVING` or by deleting the date filter. Without the `WHERE`, the counts include every customer ever, and the tile shows the wrong markets:"),
        code("text", `
-- same query without WHERE signup_date >= '2026-10-01'
country | customers
--------+----------
DE      |         3
US      |         4
VN      |         4`),
        p("US appears with 4 customers, but only 2 of them signed up in October. A row condition belongs in `WHERE` even when the query also has a `HAVING`: it runs earlier, on fewer rows, and every aggregate after it only sees the rows you meant."),
        callout("tip", "Can I use the alias in HAVING?",
            "SQLite and MySQL accept HAVING new_customers >= 3; PostgreSQL does not, because SELECT runs after HAVING. Repeating the aggregate - HAVING COUNT(*) >= 3 - works everywhere."),

        h2("7. Your turn: the repeat-buyers list"),
        p("Marketing liked the fixed dashboard and has a follow-up: they want to send a free bag of beans to every customer with at least 2 paid orders, and they want a few numbers per customer to choose the gift size. Before writing the query, name the grain (one row per what?), decide which condition is about rows and which is about groups, and pick the right `COUNT` for each column."),
        challenge("chal_coding_sqlf_121", "Start from the grain: one row per customer, so GROUP BY customer_id. \"Only paid orders count\" is a fact about each row, so it belongs before the grouping; \"at least 2 paid orders\" is a fact about a group. \"Different coupon codes\" is not the same question as \"orders with a coupon\". For the average, AVG already returns a REAL - round it, and use CAST(... AS INTEGER) if you want a whole number."),

        h2("8. The fix"),
        p("Tiles 1 and 2 need the same two changes: say which rows count (paid orders only) and use the aggregate that answers the question. One query now feeds both tiles:"),
        code("sql", `
SELECT COUNT(DISTINCT customer_id)  AS paying_customers,
       COUNT(*)                     AS paid_orders,
       ROUND(AVG(total_cents))      AS avg_order_cents
FROM orders
WHERE status = 'paid';`, "weekly_dashboard.sql"),
        code("text", `
paying_customers | paid_orders | avg_order_cents
-----------------+-------------+----------------
               5 |           8 |          2644.0`),
        p("5 paying customers and an average order of $26.44: the numbers finance had. Tile 3 is the `WHERE` + `HAVING` query from section 6. The tile titles changed too: \"Customers who ordered\" became \"Paying customers\", because a title that does not say which rows count invites the next person to count the wrong ones."),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "**`COUNT(*)` labelled as people.** If the label says customers, users or products, the query almost always needs `COUNT(DISTINCT ...)`.",
            "**`SUM(a) / COUNT(*)` or `a / b` on integer columns.** Integer division in SQLite and PostgreSQL. Use `AVG`, or `1.0 * a / b`, then `ROUND`.",
            "**No status filter.** Revenue, averages and customer counts that include cancelled, refunded or pending orders. Every business number needs a sentence like \"only paid orders count\".",
            "**A column in SELECT that is neither grouped nor aggregated.** SQLite returns a value from some row; PostgreSQL refuses. Either way, it is a question you have not answered.",
            "**A condition on an aggregate in WHERE** (an error), or **a row condition moved into HAVING** to make the error go away.",
            "**Aggregates over zero rows.** `COUNT(*)` returns 0, but `SUM`, `AVG`, `MIN` and `MAX` return NULL when no row matches. A tile that shows an empty value for \"revenue\" usually means \"no rows\", not \"zero\" (lesson 1.3).",
        ]),

        h2("10. Checklist"),
        bullets([
            "I can finish the sentence \"one row per ...\" for every aggregate query, and the GROUP BY columns match it.",
            "Every SELECT column is either in GROUP BY or inside an aggregate.",
            "Each COUNT is the right one: rows (`COUNT(*)`), non-NULL values (`COUNT(col)`) or different values (`COUNT(DISTINCT col)`).",
            "The rows that count are stated and filtered in WHERE (for example, status = 'paid').",
            "Conditions on aggregates are in HAVING, and only there.",
            "No division of two integers; ratios use `1.0 *` or `100.0 *`, averages use AVG, and rounding is explicit with ROUND.",
            "The result is sorted with ORDER BY, with a tie-breaker when two rows can have the same value.",
        ]),
    ],
});
