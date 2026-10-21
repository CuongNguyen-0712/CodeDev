// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases and the solution live in challenges.json and challenges/ (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sqlf-2-2",
    title: "Subqueries & CTEs for readable analysis",
    slug: { _type: "slug", current: "subqueries-ctes-readable-analysis" },
    description:
        "The board deck says Germany's average first order is $32.50; the KPI dashboard says $66.67. Both come from copies of the same 60-line nested query, and nobody can tell which copy is right. Learn scalar, IN/EXISTS, derived-table and correlated subqueries, then rewrite the analysis as named WITH steps you can check one by one - including a recursive calendar of months.",
    estimatedTime: 22,

    scenario: {
        role: "Junior data analyst, Beanbox (online coffee shop)",
        problem:
            "\"Average first-order value by country\" lives in three places: the weekly KPI dashboard, the board deck and a marketing report. All three started as copies of one 60-line nested query. Two weeks before the board meeting, the CFO notices that the deck shows Germany at 3,250 cents while the dashboard shows 6,667 cents for the same customers. Someone edited one copy months ago, nobody remembers why, and nobody can review a query that has to be read from the inside out.",
    },

    content: [
        h2("1. The incident: one metric, two numbers"),
        p("This is the core of the dashboard copy, with the formatting and comments stripped. It picks each customer's first paid order, attaches the customer's country, and averages per country:"),
        code("sql", `
-- kpi_dashboard.sql (copy A)
SELECT country,
       CAST(ROUND(AVG(first_total)) AS INTEGER) AS avg_first_order_cents
FROM (
    SELECT c.country, f.first_total
    FROM customers AS c
    JOIN (
        SELECT o.customer_id, o.total_cents AS first_total
        FROM orders AS o
        JOIN (
            SELECT customer_id, MIN(ordered_at) AS first_at
            FROM orders
            WHERE status = 'paid'
            GROUP BY customer_id
        ) AS m ON m.customer_id = o.customer_id
              AND m.first_at = o.ordered_at
        WHERE o.status = 'paid'
    ) AS f ON f.customer_id = c.customer_id
) AS t
GROUP BY country
ORDER BY country;`, "kpi_dashboard.sql"),
        p("The board-deck copy looks almost the same. Someone \"simplified\" the two innermost levels into one:"),
        code("sql", `
-- board_deck.sql (copy B): the innermost part was replaced by
    JOIN (
        SELECT customer_id, MIN(total_cents) AS first_total
        FROM orders
        WHERE status = 'paid'
        GROUP BY customer_id
    ) AS f ON f.customer_id = c.customer_id`, "board_deck.sql"),
        p("Both queries run, both return one row per country, and both look plausible. The problem is not only that they disagree: it is that **nobody can check either of them**. To know what the middle level returns, you have to mentally run the level inside it first. You cannot run a level on its own, so you cannot count its rows."),

        h2("2. Reproduce it on a tiny Beanbox"),
        p("Seven customers and thirteen orders are enough. Money is integer cents and timestamps are ISO-8601 text, as everywhere in this course:"),
        code("text", `
customers
customer_id  name   country  signup_date  referral_source
-----------  -----  -------  -----------  ---------------
1            An     VN       2026-01-03   ads
2            Ben    US       2026-01-10   friend
3            Chloe  DE       2026-01-15   search
4            Duc    VN       2026-02-01   friend
5            Emma   US       2026-02-11   NULL
6            Felix  DE       2026-02-20   ads
7            Giang  VN       2026-03-02   search

orders
order_id  customer_id  ordered_at           status    total_cents
--------  -----------  -------------------  --------  -----------
101       1            2026-01-05 10:12:00  paid      4500
102       1            2026-02-07 18:40:00  paid      2000
103       2            2026-01-12 08:05:00  paid      3800
104       2            2026-03-01 12:30:00  paid      6200
105       3            2026-01-20 15:45:00  paid      9000
106       3            2026-02-14 09:00:00  paid      2500
107       4            2026-02-03 20:15:00  paid      1800
108       5            2026-02-12 11:00:00  refunded  5200
109       5            2026-02-19 16:20:00  paid      3000
110       6            2026-03-05 09:15:00  paid      7000
111       6            2026-03-05 09:15:00  paid      4000
112       4            2026-03-20 19:05:00  pending   2200
113       2            2026-05-09 10:00:00  paid      5100`, "beanbox sample (coupon_code omitted)"),
        p("Copy A (dashboard) and copy B (board deck) on this data:"),
        code("text", `
copy A (dashboard)                      copy B (board deck)
country  avg_first_order_cents          country  avg_first_order_cents
-------  ---------------------          -------  ---------------------
DE       6667                           DE       3250
US       3400                           US       3400
VN       3150                           VN       1900`),
        p("The US agrees, Germany and Vietnam do not. By the end of this lesson you will see that **neither** German number is right, and you will see it by running each step on its own. First, the tools: subqueries, then CTEs."),

        h2("3. Subqueries: a query inside a query"),
        p("A subquery is a complete `SELECT` in parentheses, used where SQL expects a value, a list or a table. Which one it can stand for depends on the shape of its result:"),
        bullets([
            "**Scalar subquery**: one row, one column. Use it anywhere a single value fits: in `WHERE`, in `SELECT`.",
            "**List subquery**: one column, many rows. Use it with `IN`, or turn it into a yes/no question with `EXISTS`.",
            "**Table subquery (derived table)**: many rows and columns, in `FROM` or `JOIN`, with an alias.",
        ]),

        h3("Scalar subqueries: compare each row to one number"),
        p("Which paid orders are above the average paid order? The average is one number, so it can be a scalar subquery:"),
        code("sql", `
SELECT order_id, customer_id, total_cents
FROM orders
WHERE status = 'paid'
  AND total_cents > (SELECT AVG(total_cents) FROM orders WHERE status = 'paid')
ORDER BY order_id;`, "above_average.sql"),
        code("text", `
order_id  customer_id  total_cents
--------  -----------  -----------
101       1            4500
104       2            6200
105       3            9000
110       6            7000
113       2            5100`),
        p("The subquery returns 4445.454545454545 (eleven paid orders, 48,900 cents). You could not write `WHERE total_cents > AVG(total_cents)`: an aggregate is not allowed in `WHERE`, because `WHERE` runs before any grouping (lesson 1.1). The subquery computes the number first, as its own query."),

        h3("IN and EXISTS: \"is there a matching row?\""),
        p("Which customers have ever had a refund? Two ways to ask, same answer:"),
        code("sql", `
-- IN: build the list of customer_ids, then test membership
SELECT name
FROM customers
WHERE customer_id IN (SELECT customer_id FROM orders WHERE status = 'refunded')
ORDER BY name;

-- EXISTS: for each customer, is there at least one matching order?
SELECT c.name
FROM customers AS c
WHERE EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.customer_id = c.customer_id
      AND o.status = 'refunded'
)
ORDER BY c.name;`, "refunded_customers.sql"),
        code("text", `
name
----
Emma`),
        bullets([
            "`EXISTS (...)` is true as soon as the subquery returns one row. What it selects does not matter, which is why people write `SELECT 1`.",
            "Unlike a `JOIN`, neither form can duplicate a customer: a customer with three refunds is still listed once. That makes them the right tool for \"customers who did X\" (lesson 2.1 showed what a join does to row counts).",
            "Modern databases (SQLite, PostgreSQL) usually plan `IN` and `EXISTS` equally well. Pick the one that reads better.",
        ]),
        p("The negative question is where the two differ. Which customers have **never** paid for an order? Use `NOT EXISTS`:"),
        code("sql", `
SELECT c.name, c.signup_date
FROM customers AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.customer_id = c.customer_id
      AND o.status = 'paid'
)
ORDER BY c.name;`, "never_paid.sql"),
        code("text", `
name   signup_date
-----  -----------
Giang  2026-03-02`),
        callout("warning", "Prefer NOT EXISTS over NOT IN",
            "Lesson 1.3 showed the trap: if the subquery of NOT IN returns a single NULL, x NOT IN (...) is never true and the query silently returns no rows. NOT EXISTS only asks whether a matching row exists, so NULLs in the subquery cannot empty your result."),

        h3("Derived tables: pre-aggregate, then join"),
        p("In lesson 2.1, joining customers to orders and then summing multiplied rows. The safe pattern was to aggregate the many side first, down to one row per customer, and join that. A subquery in `FROM` (a **derived table**) does exactly this:"),
        code("sql", `
SELECT c.country,
       COUNT(*)                AS paying_customers,
       SUM(per_customer.paid_orders) AS paid_orders
FROM customers AS c
JOIN (
    SELECT customer_id, COUNT(*) AS paid_orders
    FROM orders
    WHERE status = 'paid'
    GROUP BY customer_id
) AS per_customer ON per_customer.customer_id = c.customer_id
GROUP BY c.country
ORDER BY c.country;`, "paid_orders_by_country.sql"),
        code("text", `
country  paying_customers  paid_orders
-------  ----------------  -----------
DE       2                 4
US       2                 4
VN       2                 3`),
        p("Because `per_customer` has one row per customer, the join cannot fan out, and `COUNT(*)` counts customers. Give every derived table an alias (`AS per_customer`): SQLite tolerates a missing alias, PostgreSQL before version 16 does not."),

        h3("Correlated subqueries: run once per outer row"),
        p("All the subqueries so far could run on their own. A **correlated** subquery refers to a column of the outer query (`c.customer_id` below), so it is evaluated again for every outer row. It is the simplest way to ask \"for each customer, which single row?\":"),
        code("sql", `
SELECT c.name,
       (SELECT o.order_id
        FROM orders AS o
        WHERE o.customer_id = c.customer_id
          AND o.status = 'paid'
        ORDER BY o.ordered_at DESC, o.order_id DESC
        LIMIT 1) AS latest_paid_order
FROM customers AS c
ORDER BY c.customer_id;`, "latest_paid_order.sql"),
        code("text", `
name   latest_paid_order
-----  -----------------
An     102
Ben    113
Chloe  106
Duc    107
Emma   109
Felix  111
Giang  NULL`),
        bullets([
            "Felix has two paid orders at exactly 2026-03-05 09:15:00. Without the second sort key, `ORDER BY o.ordered_at DESC LIMIT 1` could return either one, and a re-run could return the other. `o.order_id DESC` makes the choice deterministic.",
            "Giang has no paid order, so the scalar subquery returns no row, and the value is NULL.",
            "\"Once per outer row\" is fine for thousands of customers with an index on `orders(customer_id)`. On millions of rows, measure it; lesson 3.1 shows window functions that do the same job in one pass.",
        ]),

        h2("4. CTEs: name each step with WITH"),
        p("Subqueries nest, and nested code is read from the inside out. A **common table expression** (CTE) lets you pull each subquery out, give it a name, and write the steps in the order they happen. Here is the derived-table query from above, rewritten:"),
        code("sql", `
WITH per_customer AS (
    SELECT customer_id, COUNT(*) AS paid_orders
    FROM orders
    WHERE status = 'paid'
    GROUP BY customer_id
)
SELECT c.country,
       COUNT(*)              AS paying_customers,
       SUM(p.paid_orders)    AS paid_orders
FROM customers AS c
JOIN per_customer AS p ON p.customer_id = c.customer_id
GROUP BY c.country
ORDER BY c.country;`, "paid_orders_by_country.sql"),
        p("Same result (DE 2/4, US 2/4, VN 2/3), different reading order. The rules are short:"),
        numbered([
            "`WITH name AS (SELECT ...)` defines a named result that exists only for this one statement. It is not a table and it is not saved.",
            "Several CTEs are separated by commas, with a single `WITH` at the start: `WITH a AS (...), b AS (...), c AS (...) SELECT ...`.",
            "Each CTE can read the tables and every CTE defined **above** it. The final `SELECT` can read all of them.",
            "Write a comment with the **grain** of each step: what one row means (\"one row per paid order\", \"one row per customer\"). The grain is what you check.",
        ]),
        image("nested-query-vs-cte-pipeline", {
            alt: "Diagram comparing two layouts of the same analysis. On the left, a red panel shows the nested incident query with three subqueries drawn as boxes inside each other; the step that runs first is written deepest inside, and a note asks which level picks the first order. On the right, a green panel shows the same logic as four named CTE boxes from top to bottom: paid (one row per paid order, 11 rows), first_orders (one row per customer, but the check shows 7 rows for 6 customers), with_country (one row per customer) and summary (one row per country, 3 rows). A bottom strip shows how to check one step: keep the WITH and replace the final SELECT with COUNT(*) and COUNT(DISTINCT customer_id) from first_orders.",
            caption: "A CTE pipeline is read top to bottom, and every box can be run and counted on its own.",
        }),
        callout("info", "Is a CTE slower than a subquery?",
            "Usually not. SQLite and PostgreSQL (since version 12) treat a CTE that is used once like the equivalent subquery and optimize through it. PostgreSQL lets you force the old behavior with AS MATERIALIZED, and computes a CTE once when it is used more than once. Write for the reader first, then measure."),

        h2("5. The fix: rewrite the incident as named steps, then check each one"),
        p("Here is copy A, the dashboard query, as a pipeline. The logic is unchanged; only the layout is new:"),
        code("sql", `
WITH paid AS (                       -- grain: one row per paid order
    SELECT order_id, customer_id, ordered_at, total_cents
    FROM orders
    WHERE status = 'paid'
),
first_orders AS (                    -- grain: one row per customer (we hope)
    SELECT p.customer_id, p.order_id, p.ordered_at, p.total_cents
    FROM paid AS p
    JOIN (
        SELECT customer_id, MIN(ordered_at) AS first_at
        FROM paid
        GROUP BY customer_id
    ) AS m ON m.customer_id = p.customer_id
          AND m.first_at = p.ordered_at
),
with_country AS (                    -- grain: one row per customer
    SELECT c.country, f.customer_id, f.total_cents
    FROM first_orders AS f
    JOIN customers AS c ON c.customer_id = f.customer_id
),
summary AS (                         -- grain: one row per country
    SELECT country,
           COUNT(*) AS customers,
           CAST(ROUND(AVG(total_cents)) AS INTEGER) AS avg_first_order_cents
    FROM with_country
    GROUP BY country
)
SELECT * FROM summary ORDER BY country;`, "first_order_value.sql"),
        code("text", `
country  customers  avg_first_order_cents
-------  ---------  ---------------------
DE       3          6667
US       2          3400
VN       2          3150`),
        p("The new `customers` column already looks wrong: Germany has two customers, Chloe and Felix. To find the step that breaks, keep the whole `WITH` block and replace only the final `SELECT`. Start at the top and count:"),
        code("sql", `
-- same WITH ... as above, then:
SELECT COUNT(*) AS rows FROM paid;                  -- 11: one row per paid order, as promised

SELECT COUNT(*)                    AS rows,
       COUNT(DISTINCT customer_id)  AS customers
FROM first_orders;`, "check_steps.sql"),
        code("text", `
rows  customers
----  ---------
7     6`),
        p("The grain comment says \"one row per customer\", and the data says 7 rows for 6 customers. Show the customers that appear more than once:"),
        code("sql", `
-- same WITH ... as above, then:
SELECT *
FROM first_orders
WHERE customer_id IN (
    SELECT customer_id FROM first_orders GROUP BY customer_id HAVING COUNT(*) > 1
);`, "check_steps.sql"),
        code("text", `
customer_id  order_id  ordered_at           total_cents
-----------  --------  -------------------  -----------
6            110       2026-03-05 09:15:00  7000
6            111       2026-03-05 09:15:00  4000`),
        p("Felix placed two orders in the same second. Joining back on `MIN(ordered_at)` matches both, so copy A counts Felix twice and averages 9000, 7000 and 4000 into 6667. Now look at the same step in copy B, which takes `MIN(total_cents)`:"),
        code("sql", `
SELECT customer_id, MIN(total_cents) AS first_total
FROM orders
WHERE status = 'paid'
GROUP BY customer_id
ORDER BY customer_id
LIMIT 5;`, "check_copy_b.sql"),
        code("text", `
customer_id  first_total
-----------  -----------
1            2000
2            3800
3            2500
4            1800
5            3000`),
        p("Compare it with the first five rows of `first_orders` from the pipeline (`SELECT * FROM first_orders ORDER BY customer_id LIMIT 5`):"),
        code("text", `
customer_id  order_id  ordered_at           total_cents
-----------  --------  -------------------  -----------
1            101       2026-01-05 10:12:00  4500
2            103       2026-01-12 08:05:00  3800
3            105       2026-01-20 15:45:00  9000
4            107       2026-02-03 20:15:00  1800
5            109       2026-02-19 16:20:00  3000`),
        p("Chloe's first order was 9000 cents on January 20. Copy B reports 2500, her **cheapest** order, from February. `MIN(total_cents)` answers \"smallest order\", not \"first order\". So the board deck understates first orders, and the dashboard double counts a tie. With one row per customer (Felix's order 110, the smaller `order_id`, as his first), Germany is (9000 + 7000) / 2 = 8000 cents: a third number."),
        bullets([
            "The bug in copy A was invisible in the nested form. In the pipeline, one `COUNT(*)` next to a grain comment exposed it.",
            "The disagreement between the copies became a one-step diff: \"first_orders picks by time\" against \"first_orders picks by size\". A reviewer can decide that in a minute.",
            "Fixing `first_orders` so it returns exactly one paid order per customer - earliest first, smallest `order_id` on a tie - is the exercise in section 7.",
        ]),

        h2("6. A calendar of months with WITH RECURSIVE"),
        p("Lesson 1.4 left one problem open: `GROUP BY` can only report months that have rows. Beanbox had no paid order in April 2026, so a monthly revenue query skips it, and a chart quietly connects March to May:"),
        code("sql", `
SELECT strftime('%Y-%m', ordered_at) AS month,
       SUM(total_cents)              AS revenue_cents
FROM orders
WHERE status = 'paid'
GROUP BY month
ORDER BY month;`, "monthly_revenue.sql"),
        code("text", `
month    revenue_cents
-------  -------------
2026-01  17300
2026-02  9300
2026-03  17200
2026-05  5100`),
        p("The fix is a list of every month to report, then a `LEFT JOIN` to the revenue. A **recursive CTE** builds that list: a start row, plus a rule that makes the next row from the previous one, repeated until a stop condition is false:"),
        code("sql", `
WITH RECURSIVE months(month_start) AS (
    SELECT '2026-01-01'                          -- start row
    UNION ALL
    SELECT date(month_start, '+1 month')         -- next row, built from the previous one
    FROM months
    WHERE month_start < '2026-05-01'             -- stop condition
),
revenue AS (
    SELECT strftime('%Y-%m', ordered_at) AS month,
           SUM(total_cents)              AS revenue_cents
    FROM orders
    WHERE status = 'paid'
    GROUP BY month
)
SELECT strftime('%Y-%m', m.month_start)  AS month,
       COALESCE(r.revenue_cents, 0)      AS revenue_cents
FROM months AS m
LEFT JOIN revenue AS r ON r.month = strftime('%Y-%m', m.month_start)
ORDER BY month;`, "monthly_revenue_calendar.sql"),
        code("text", `
month    revenue_cents
-------  -------------
2026-01  17300
2026-02  9300
2026-03  17200
2026-04  0
2026-05  5100`),
        bullets([
            "`RECURSIVE` goes once, right after `WITH`, even when only one of the CTEs is recursive.",
            "The calendar is the **left** side of the `LEFT JOIN`, so every month survives; `COALESCE` turns the missing revenue into 0.",
            "Always write the stop condition first. Without it, the CTE generates rows forever (or until the database stops it).",
            "PostgreSQL accepts the same pattern with `month_start + INTERVAL '1 month'`, and most people use its `generate_series` function for calendars instead.",
        ]),

        h2("7. Your turn: first paid order by referral source"),
        p("Marketing saw the fix and now wants the same metric cut by **referral source**, with every rule pinned down: only paid orders count, a customer's first paid order is the earliest one (smallest `order_id` on a tie), a missing source is reported as `'unknown'`, and the report shows how many paying customers each source brought. Build it as named steps and check the grain of each one before you trust the last `SELECT`."),
        challenge("chal_coding_sqlf_221", "Write the steps as comments first, with the grain of each: paid orders (one row per order), first paid orders (one row per customer), the same rows with their source, then the summary (one row per source). A correlated subquery with ORDER BY ordered_at, order_id LIMIT 1 can pick one order per customer; filter on status before you pick, not after. Check that the first-order step has as many rows as distinct customers."),

        h2("8. Pitfalls"),
        bullets([
            "**A scalar subquery that returns several rows.** SQLite silently uses the first row it finds; PostgreSQL stops with \"more than one row returned by a subquery used as an expression\". If the subquery can match many rows, add the `ORDER BY ... LIMIT 1` that says which one you mean, or aggregate it.",
            "**Joining back to MIN/MAX without a tie-breaker.** `JOIN ... ON t = MIN(t)` returns every row that shares the minimum. Ties are rare, which is exactly why they survive testing and reach the board deck.",
            "**`MIN(total_cents)` is not \"the first order\".** An aggregate returns a value, not the row it came from. To get a column of a specific row, pick the row (correlated subquery, or a window function in lesson 3.1), then read its columns.",
            "**Filtering after picking.** \"The first order, if it is paid\" and \"the first paid order\" are different questions. Put the `WHERE status = 'paid'` in the step before the pick.",
            "**`NOT IN` with a nullable subquery column.** Use `NOT EXISTS` (section 3, lesson 1.3).",
            "**A CTE name lives for one statement.** You cannot `SELECT` from `first_orders` in a second query; to reuse a step across reports, save it as a view, not as a copied query.",
            "**A recursive CTE without a reachable stop condition** runs until the database aborts it. Test the calendar on its own first: `SELECT * FROM months`.",
        ]),

        h2("9. Checklist"),
        bullets([
            "A query with more than one level of nesting is rewritten as `WITH` steps, in the order they happen.",
            "Every CTE has a comment with its grain, and a reviewer can run any step alone by replacing the final `SELECT`.",
            "Each step that should have one row per key passes `COUNT(*) = COUNT(DISTINCT key)`.",
            "\"First\" and \"latest\" rows are picked with an explicit sort and a unique tie-breaker (`ORDER BY ordered_at, order_id`), never with `MIN` of another column.",
            "\"Customers who did X\" uses `EXISTS` / `IN`; \"customers who never did X\" uses `NOT EXISTS`.",
            "The many side is aggregated to the join key before it is joined (derived table or CTE).",
            "Monthly reports join a calendar of months, so a month with zero rows shows 0 instead of disappearing.",
            "A metric used in several reports is defined once (a view or one shared query), not copied.",
        ]),
    ],
});
