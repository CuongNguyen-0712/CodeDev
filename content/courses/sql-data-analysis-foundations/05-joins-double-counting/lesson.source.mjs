// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sqlf-2-1",
    title: "Joins without double counting",
    slug: { _type: "slug", current: "joins-without-double-counting" },
    description:
        "The CEO's dashboard says April revenue was 18% higher than finance's number: the query joined orders to payments, and every order paid in two parts was counted twice. Learn what a join does row by row, INNER vs LEFT JOIN, the grain of a table and fan-out, why COUNT(DISTINCT) and SUM(DISTINCT) are not fixes, and how pre-aggregating and filtering in ON give numbers that reconcile.",
    estimatedTime: 25,

    scenario: {
        role: "Junior data analyst, Beanbox (online coffee shop)",
        problem:
            "Finance closed April at $35,000 of revenue. The CEO's dashboard shows $41,300 for the same month, 18% more, and the gap is all in some countries and none in others. Nobody touched the orders table. The only change in April: checkout now lets customers pay part of an order with their Beanbox wallet balance and the rest by card. The same week, the account managers complain that their customer report has lost every customer who has not bought anything yet - exactly the people they want to call.",
    },

    content: [
        h2("1. The incident: April revenue is 18% too high"),
        p("The \"Revenue by country\" tile on the CEO's dashboard was built in March. Someone wanted the money actually collected next to the revenue, so the query joins orders to payments:"),
        code("sql", `
SELECT c.country,
       COUNT(*)            AS orders,
       SUM(o.total_cents)  AS revenue_cents,
       SUM(p.amount_cents) AS collected_cents
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
JOIN payments  p ON p.order_id    = o.order_id
WHERE o.status = 'paid'
  AND o.ordered_at >= '2026-04-01' AND o.ordered_at < '2026-05-01'
GROUP BY c.country
ORDER BY c.country;`, "dashboard_revenue_by_country.sql"),
        p("It ran without an error in March and in April. In March every order had exactly one payment. In April, an order paid with wallet balance plus card has **two rows** in `payments`. Nothing in the query is invalid; it answers a different question than the one on the tile. To see which one, you need to know exactly what a join does to rows."),

        h2("2. Reproduce it with five orders"),
        p("You do not need the production database. Four customers, five April orders and six payments are enough. Order 102 was paid in two parts (5000 from the wallet, 4000 by card), and order 105 was refunded:"),
        code("text", `
customers                     orders
customer_id | name  | country  order_id | customer_id | ordered_at          | status   | total_cents
------------+-------+--------  ---------+-------------+---------------------+----------+------------
1           | Anh   | VN       101      | 1           | 2026-04-03 09:12:00 | paid     | 12000
2           | Ben   | US       102      | 2           | 2026-04-07 18:40:00 | paid     | 9000
3           | Chloe | DE       103      | 4           | 2026-04-15 11:05:00 | paid     | 12000
4           | Duc   | VN       104      | 2           | 2026-04-21 20:31:00 | paid     | 17000
                               105      | 1           | 2026-04-28 08:00:00 | refunded | 6000

payments
payment_id | order_id | amount_cents | method
-----------+----------+--------------+-------
1          | 101      | 12000        | card
2          | 102      | 5000         | wallet
3          | 102      | 4000         | card
4          | 103      | 12000        | bank
5          | 104      | 17000        | card
6          | 105      | 6000         | card`, "beanbox sample (SQLite)"),
        p("The dashboard query on this data:"),
        code("text", `
country | orders | revenue_cents | collected_cents
--------+--------+---------------+----------------
US      | 3      | 35000         | 26000
VN      | 2      | 24000         | 24000`, "dashboard output"),
        p("Finance never joins payments. Their query reads `orders` alone (same `WHERE`, same `GROUP BY`):"),
        code("text", `
country | orders | revenue_cents
--------+--------+--------------
US      | 2      | 26000
VN      | 2      | 24000`, "finance output"),
        p("The dashboard total is 59000 cents, finance's is 50000: the same 18% gap as in production. Look closely at the US row. Ben placed **2** orders, the dashboard says **3**. Revenue is 9000 too high, which is exactly the total of order 102, the order paid in two parts. And `collected_cents` is right, which is why nobody suspected the join."),

        h2("3. What a join does, row by row"),
        p("`JOIN` (short for `INNER JOIN`) takes each row of the left table, finds **every** row of the right table for which the `ON` condition is true, and outputs one combined row per match:"),
        bullets([
            "**No match:** the left row disappears from the result (for an inner join).",
            "**One match:** one output row.",
            "**n matches:** n output rows, each carrying a copy of the left row's columns.",
        ]),
        p("Run the join without `GROUP BY` and look at the rows the `SUM` will add up:"),
        code("sql", `
SELECT o.order_id, o.total_cents, p.payment_id, p.amount_cents, p.method
FROM orders o
JOIN payments p ON p.order_id = o.order_id
WHERE o.status = 'paid'
ORDER BY o.order_id, p.payment_id;`, "join_rows.sql"),
        code("text", `
order_id | total_cents | payment_id | amount_cents | method
---------+-------------+------------+--------------+-------
101      | 12000       | 1          | 12000        | card
102      | 9000        | 2          | 5000         | wallet
102      | 9000        | 3          | 4000         | card
103      | 12000       | 4          | 12000        | bank
104      | 17000       | 5          | 17000        | card`),
        p("Every row is correct: order 102 really is a 9000-cent order, and it really has a 5000 and a 4000 payment. The mistake happens one step later. `SUM(o.total_cents)` adds 9000 once per row, so order 102 is worth 18000, and `COUNT(*)` counts it twice. `SUM(p.amount_cents)` adds 5000 + 4000 = 9000, which is correct, because each payment appears exactly once."),
        callout("info", "The order of tables does not matter for an inner join",
            "orders JOIN payments and payments JOIN orders return the same rows (maybe in a different order). For a LEFT JOIN, which you meet in section 8, the order matters: the left table is the one whose rows are kept."),

        h2("4. Grain: what one row means"),
        p("The **grain** of a table (or of a query result) is the answer to \"one row per what?\". In the Beanbox database:"),
        bullets([
            "`customers`: one row per customer.",
            "`orders`: one row per order. `total_cents` is a fact about the order.",
            "`payments`: one row per payment. An order has 0, 1 or several (split payments, a second attempt after the first was declined).",
            "`order_items`: one row per product line of an order.",
        ]),
        p("When you join a table to a table that has **many** rows per key, the result has the grain of the many side. The columns of the one side are copied onto every matching row. This is called **fan-out**. Sums of many-side columns (`amount_cents`) stay correct; sums and counts of one-side columns (`total_cents`, `COUNT(*)` as \"orders\") are inflated."),
        image("join-fan-out", {
            alt: "Left, a red panel: order 102 with a total of 9000 is joined to its two payment rows, producing two rows that each carry the total 9000, so SUM(o.total_cents) is 18000 while SUM(p.amount_cents) is a correct 9000. Right, a green panel: the two payments 5000 and 4000 are first grouped by order_id into one row, paid 9000, then joined, so both sums are 9000. Below, three steps: name the grain, count rows around every join, aggregate the many side first.",
            caption: "Fan-out: joining one order to two payments copies its total onto both rows. Aggregate payments to one row per order before the join and every sum is exact.",
        }),
        p("Two one-to-many joins from the same table **multiply**. Order 102 has 2 payments and 3 product lines in `order_items`. Join both and it fans out to 2 x 3 rows:"),
        code("sql", `
SELECT o.order_id, COUNT(*) AS joined_rows
FROM orders o
JOIN payments    p ON p.order_id = o.order_id
JOIN order_items i ON i.order_id = o.order_id
WHERE o.order_id = 102
GROUP BY o.order_id;`, "two_many_joins.sql"),
        code("text", `
order_id | joined_rows
---------+------------
102      | 6`),
        p("Now `SUM(o.total_cents)` would count order 102 six times, and `SUM(p.amount_cents)` would count each payment three times: in this query even the many-side sums are wrong. Before reading on, predict a fan-out yourself:"),
        challenge("chal_quiz_sqlf_211", "For each order, multiply its number of payment rows by its number of item rows; an inner join keeps an order only if both counts are at least 1. A sum of an order column adds that column once per output row."),

        h2("5. Check row counts before and after every join"),
        p("You can catch fan-out before anyone sees a dashboard. First, check the grain of the table you join to: is `order_id` unique in `payments`?"),
        code("sql", `
SELECT order_id, COUNT(*) AS payment_rows
FROM payments
GROUP BY order_id
HAVING COUNT(*) > 1;`, "check_payments_grain.sql"),
        code("text", `
order_id | payment_rows
---------+-------------
102      | 2`),
        p("Any row here means `payments` has many rows per order. Second, after the join, compare the number of rows with the number of distinct keys of the grain you want to keep:"),
        code("sql", `
SELECT COUNT(*)                   AS joined_rows,
       COUNT(DISTINCT o.order_id) AS orders
FROM orders o
JOIN payments p ON p.order_id = o.order_id
WHERE o.status = 'paid';`, "check_join_rows.sql"),
        code("text", `
joined_rows | orders
------------+-------
5           | 4`),
        p("4 paid orders went in, 5 rows came out: the join changed the grain. If the two numbers are equal, the join kept one row per order. Also compare `orders` with a count from `orders` alone: if it went down, an inner join dropped orders that had no match. Make both checks a habit for every join you write, not just when the CEO asks."),
        callout("tip", "Fan-out is not always a bug",
            "\"Collected amount per payment method\" needs one row per payment, so joining orders to payments is exactly right there. The bug is summing or counting a column of the one side (an order total, a customer, an order count) at the grain of the many side."),

        h2("6. Band-aids that do not work: COUNT(DISTINCT) and SUM(DISTINCT)"),
        p("The usual first reaction is to add `DISTINCT` to the aggregates of the incident query and leave the join as it is:"),
        code("sql", `
SELECT c.country,
       COUNT(DISTINCT o.order_id)  AS orders,
       SUM(DISTINCT o.total_cents) AS revenue_cents
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
JOIN payments  p ON p.order_id    = o.order_id
WHERE o.status = 'paid'
  AND o.ordered_at >= '2026-04-01' AND o.ordered_at < '2026-05-01'
GROUP BY c.country
ORDER BY c.country;`, "distinct_band_aid.sql"),
        code("text", `
country | orders | revenue_cents
--------+--------+--------------
US      | 2      | 26000
VN      | 2      | 12000`),
        p("The US row is now correct, and the VN row, which was correct before, is now wrong: 12000 instead of 24000. `COUNT(DISTINCT o.order_id)` counts different **order ids**, so it does fix the count. `SUM(DISTINCT o.total_cents)` adds different **values**: orders 101 and 103 are two different orders that both cost 12000 cents, so the second one is thrown away. `DISTINCT` knows nothing about orders, only about the numbers in the column."),
        callout("warning", "SUM(DISTINCT) only works by luck",
            "It gives the right total exactly as long as no two orders in a group have the same total. That is true in a small test and false on a real month of data, where many orders cost the same price. Never use SUM(DISTINCT) or AVG(DISTINCT) to undo a fan-out."),

        h2("7. The fix: aggregate the many side first"),
        p("Bring `payments` to the grain of `orders` **before** the join: one row per `order_id`, with the payments already added up."),
        code("sql", `
SELECT order_id,
       COUNT(*)          AS payments,
       SUM(amount_cents) AS paid_cents
FROM payments
GROUP BY order_id
ORDER BY order_id;`, "payments_per_order.sql"),
        code("text", `
order_id | payments | paid_cents
---------+----------+-----------
101      | 1        | 12000
102      | 2        | 9000
103      | 1        | 12000
104      | 1        | 17000
105      | 1        | 6000`),
        p("Now `order_id` is unique, so joining this result to `orders` cannot fan out. Put the query in parentheses in the `FROM` clause and give it a name: a **derived table**."),
        code("sql", `
SELECT c.country,
       COUNT(*)           AS orders,
       SUM(o.total_cents) AS revenue_cents,
       SUM(p.paid_cents)  AS collected_cents
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
JOIN (
    SELECT order_id, SUM(amount_cents) AS paid_cents
    FROM payments
    GROUP BY order_id
) AS p ON p.order_id = o.order_id
WHERE o.status = 'paid'
  AND o.ordered_at >= '2026-04-01' AND o.ordered_at < '2026-05-01'
GROUP BY c.country
ORDER BY c.country;`, "dashboard_revenue_by_country_fixed.sql"),
        code("text", `
country | orders | revenue_cents | collected_cents
--------+--------+---------------+----------------
US      | 2      | 26000         | 26000
VN      | 2      | 24000         | 24000`),
        p("Revenue and order counts match finance, and the collected column is still right. The same idea works for `order_items`: add up the items per order first, then join. With both a payments subquery and an items subquery, each at one row per order, joining both can no longer multiply. Lesson 2.2 writes these steps as named CTEs (`WITH payments_per_order AS (...)`), which reads better once there are several of them."),
        callout("info", "An inner join also drops rows",
            "This fix uses JOIN, so a paid order whose payment is not recorded yet would vanish from the revenue. On this data every paid order has a payment, so the result is the same. When the many side may have no rows for a key, use LEFT JOIN, the next section."),

        h2("8. LEFT JOIN: keep every row of the left table"),
        p("The second complaint came from the account managers: they need every customer, including those without a paid order. `LEFT JOIN` keeps every row of the left table. When nothing on the right matches, the row is kept once and the right table's columns are `NULL`:"),
        code("sql", `
SELECT c.customer_id, c.name, o.order_id, o.status
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
ORDER BY c.customer_id, o.order_id;`, "left_join_rows.sql"),
        code("text", `
customer_id | name  | order_id | status
------------+-------+----------+---------
1           | Anh   | 101      | paid
1           | Anh   | 105      | refunded
2           | Ben   | 102      | paid
2           | Ben   | 104      | paid
3           | Chloe | NULL     | NULL
4           | Duc   | 103      | paid`),
        p("Chloe has no orders, and she is still there. A `LEFT JOIN` fans out exactly like an inner join when there are several matches (Anh and Ben have two rows each); it only adds the no-match rows."),

        h3("A WHERE on the right table turns the LEFT JOIN into an INNER JOIN"),
        p("The report counts paid orders only, so the obvious query adds `WHERE o.status = 'paid'`:"),
        code("sql", `
SELECT c.name, COUNT(o.order_id) AS paid_orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.status = 'paid'
GROUP BY c.customer_id, c.name
ORDER BY c.customer_id;`, "paid_orders_where.sql"),
        code("text", `
name | paid_orders
-----+------------
Anh  | 1
Ben  | 2
Duc  | 1`),
        p("Chloe is gone. Recall the logical order from lesson 1.1: `FROM` and its joins run first, `WHERE` runs after. The LEFT JOIN kept Chloe's row with `o.status` = `NULL`, then `WHERE` evaluated `NULL = 'paid'`. That is unknown, not true (lesson 1.3), so the row was removed. The result is the same as an inner join."),
        p("Put the condition in `ON` instead. Then it decides **which orders match**, and a customer with no matching order still gets her one `NULL` row:"),
        code("sql", `
SELECT c.name, COUNT(o.order_id) AS paid_orders, SUM(o.total_cents) AS revenue_cents
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
                  AND o.status = 'paid'
GROUP BY c.customer_id, c.name
ORDER BY c.customer_id;`, "paid_orders_on.sql"),
        code("text", `
name  | paid_orders | revenue_cents
------+-------------+--------------
Anh   | 1           | 12000
Ben   | 2           | 26000
Chloe | 0           | NULL
Duc   | 1           | 12000`),
        p("Chloe is back. `COUNT(o.order_id)` is 0 for her, because `COUNT(column)` skips `NULL` (lesson 1.2). But `SUM` of nothing but `NULL` is `NULL`, not 0, and a `NULL` in a report shows up as an empty cell or breaks a later calculation. Wrap the sum in `COALESCE`:"),
        code("sql", `
SELECT c.name,
       COUNT(o.order_id)               AS paid_orders,
       COALESCE(SUM(o.total_cents), 0) AS revenue_cents
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
                  AND o.status = 'paid'
GROUP BY c.customer_id, c.name
ORDER BY c.customer_id;`, "paid_orders_coalesce.sql"),
        code("text", `
name  | paid_orders | revenue_cents
------+-------------+--------------
Anh   | 1           | 12000
Ben   | 2           | 26000
Chloe | 0           | 0
Duc   | 1           | 12000`),
        callout("tip", "Where does a filter go?",
            "A condition on the table whose rows you want to keep (the left table) goes in WHERE. A condition on the right table of a LEFT JOIN goes in ON. For an inner join both places give the same result, so put it where it reads best."),

        h2("9. Your turn: fix the customer revenue report"),
        p("The account managers' real report has both bugs at once. It lists each customer's paid orders, revenue and collected payments by joining customers, orders and payments, then filters with `WHERE`. Customers who paid an order in two parts show twice the orders and twice the revenue, and every customer without a paid order is missing. Fix the query so that each paid order counts once, refunded, cancelled and pending orders are ignored, and every customer appears with 0 where there is nothing to add."),
        challenge("chal_fix_sqlf_212", "Fix one bug at a time and check row counts after each change. First make every customer appear: which clause runs after the joins and removes the NULL rows a LEFT JOIN keeps? Then bring payments to one row per order before joining them. A DISTINCT inside SUM fails as soon as two orders have the same total, and an inner join placed after a LEFT JOIN drops the customers you just kept."),

        h2("10. Pitfalls to recognise in code review"),
        bullets([
            "**`SUM(DISTINCT x)` and `AVG(DISTINCT x)` work on values, not rows.** Two orders with the same total become one. They are never a fix for fan-out.",
            "**`COUNT(DISTINCT order_id)` fixes the count only.** The sums in the same `SELECT` are still computed over the fanned-out rows.",
            "**Two one-to-many joins multiply.** Orders joined to payments and to items gives payments x items rows per order; even the payment sums are inflated.",
            "**A `WHERE` on the right table of a `LEFT JOIN`** removes the no-match rows. `WHERE o.status = 'paid' OR o.order_id IS NULL` looks like a fix, but it still drops customers whose orders are all refunded or pending: they have order rows, just no paid ones. Put the filter in `ON`.",
            "**An inner join after a `LEFT JOIN`** (`customers LEFT JOIN orders JOIN payments`) needs a payment for every row, and `NULL` never matches anything, so the customers without orders disappear again. After a LEFT JOIN, keep the following joins LEFT, or pre-aggregate.",
            "**`SUM` over no rows, or only `NULL`s, is `NULL`; `COUNT` is 0.** Use `COALESCE(SUM(...), 0)` when the report needs a number.",
            "**An inner join silently drops rows without a match**: orders without a payment yet, products without sales. Compare row counts with the source table.",
            "**SQLite note:** `RIGHT JOIN` and `FULL OUTER JOIN` exist only since SQLite 3.39. A LEFT JOIN with the tables swapped is equivalent to a RIGHT JOIN and works everywhere. PostgreSQL behaves like SQLite for everything else in this lesson.",
        ]),

        h2("11. Checklist"),
        bullets([
            "For every table in the query, you can say its grain: one row per what?",
            "Before joining a table, you checked whether its join key is unique (`GROUP BY key HAVING COUNT(*) > 1`).",
            "After every join, `COUNT(*)` and `COUNT(DISTINCT <grain key>)` match the grain you intended, and no rows were dropped by accident.",
            "Sums and counts are computed at the grain where each value appears once; many-side tables are aggregated to one row per key before the join.",
            "No `SUM(DISTINCT ...)` or `COUNT(DISTINCT ...)` hides a fan-out.",
            "In a LEFT JOIN, conditions on the right table are in `ON`, and every later join is also a LEFT JOIN or joins a pre-aggregated table.",
            "Counts and sums that can be empty are wrapped in `COALESCE(..., 0)`, and the result reconciles with a simpler query on the source table.",
        ]),
    ],
});
