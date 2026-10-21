// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sqlf-1-1",
    title: "SELECT, WHERE & the order clauses run in",
    slug: { _type: "slug", current: "select-where-clause-order" },
    description:
        "Marketing reports 312 paid orders with a spring coupon in March; finance counts 208. Learn to read Beanbox's tables and write SELECT queries that say exactly what you mean: WHERE with AND/OR precedence and parentheses, IN, BETWEEN, LIKE, DISTINCT, aliases, ORDER BY with a tie-breaker, LIMIT, and the logical order SQL runs the clauses in.",
    estimatedTime: 20,

    scenario: {
        role: "Junior data analyst, Beanbox (online coffee shop)",
        problem:
            "The spring campaign slide says \"312 paid orders used a spring coupon (SPRING10 or SPRING20) in March\". Finance reconciles coupons against the payment provider and finds only 208 paid orders. Both teams ran SQL against the same orders table. Your second attempt, which also filtered on the order value in dollars, worked on your laptop and failed on the finance warehouse with an error. You have to explain both before the campaign review on Friday.",
    },

    content: [
        h2("1. The incident: one query, two numbers"),
        p("Beanbox is a small online coffee shop: it sells beans, brewing equipment and a monthly coffee subscription. The spring campaign gave customers two coupons, SPRING10 and SPRING20, valid only in March. Marketing wanted the number of **paid** orders that used either coupon, and built it from this query (the dashboard shows how many rows it returns):"),
        code("sql", `
-- spring_campaign.sql
SELECT order_id, status, coupon_code, total_cents
FROM orders
WHERE status = 'paid' AND coupon_code = 'SPRING10' OR coupon_code = 'SPRING20';`, "spring_campaign.sql"),
        p("The slide said 312. Finance said 208. When the CEO asked how many of those orders were worth $30 or more, you wrote a second query that worked on your laptop and failed on the finance team's PostgreSQL copy of the data:"),
        code("sql", `
SELECT order_id, total_cents / 100.0 AS total_usd
FROM orders
WHERE status = 'paid' AND total_usd >= 30;

-- PostgreSQL: ERROR:  column "total_usd" does not exist`, "big_orders.sql"),
        p("Both queries look like plain English. Both break a precise rule: the first one about **how AND and OR group**, the second one about **the order in which SQL runs the clauses of a query**. This lesson teaches the basic query clauses with those two rules in mind."),

        h2("2. Meet Beanbox's data"),
        p("A database stores data in **tables**. A table has named **columns**, each with a type, and any number of **rows**. Read a table by asking one question first: **what does one row mean?** In `orders`, one row is one order. In `customers`, one row is one customer. That is the table's *grain*, and every number you report counts rows of some grain."),
        p("These are the two tables this lesson uses, with the ten March orders and seven customers we will query:"),
        code("sql", `
CREATE TABLE customers (
    customer_id     INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL,
    country         TEXT    NOT NULL,      -- 'VN', 'US', 'DE', ...
    signup_date     TEXT    NOT NULL,      -- 'YYYY-MM-DD'
    referral_source TEXT                   -- 'ads', 'friend', 'search', ... NULL when unknown
);

CREATE TABLE orders (
    order_id     INTEGER PRIMARY KEY,
    customer_id  INTEGER NOT NULL,         -- which customer placed it
    ordered_at   TEXT    NOT NULL,         -- 'YYYY-MM-DD HH:MM:SS', UTC
    status       TEXT    NOT NULL,         -- 'paid', 'refunded', 'cancelled', 'pending'
    total_cents  INTEGER NOT NULL,         -- money is always whole cents: 2650 = $26.50
    coupon_code  TEXT                      -- NULL when no coupon was used
);`, "beanbox_schema.sql"),
        code("sql", `
SELECT * FROM orders;`, "all_orders.sql"),
        code("text", `
order_id | customer_id | ordered_at          | status    | total_cents | coupon_code
---------+-------------+---------------------+-----------+-------------+------------
1        | 1           | 2026-03-02 09:14:00 | paid      | 4200        | SPRING10
2        | 2           | 2026-03-03 11:02:00 | paid      | 2650        | SPRING20
3        | 3           | 2026-03-05 16:40:00 | refunded  | 3900        | SPRING20
4        | 1           | 2026-03-08 08:05:00 | paid      | 1800        | NULL
5        | 4           | 2026-03-09 19:21:00 | cancelled | 5200        | SPRING20
6        | 5           | 2026-03-12 13:30:00 | paid      | 3150        | SPRING20
7        | 2           | 2026-03-15 10:10:00 | pending   | 2400        | SPRING10
8        | 6           | 2026-03-18 21:45:00 | paid      | 2650        | WELCOME5
9        | 3           | 2026-03-22 07:55:00 | refunded  | 4500        | SPRING10
10       | 7           | 2026-03-27 15:12:00 | paid      | 2650        | SPRING10
(10 rows)`),
        code("text", `
customer_id | name         | country | signup_date | referral_source
------------+--------------+---------+-------------+----------------
1           | Linh Nguyen  | VN      | 2025-11-04  | friend
2           | Sam Carter   | US      | 2026-01-17  | ads
3           | Mai Tran     | VN      | 2026-02-02  | NULL
4           | Jonas Weber  | DE      | 2026-02-20  | search
5           | Ana Souza    | BR      | 2026-03-01  | ads
6           | Minh Nguyen  | VN      | 2026-03-05  | search
7           | Emma Schmidt | DE      | 2026-03-11  | friend
(7 rows)`),
        bullets([
            "**orders.customer_id points to customers.customer_id.** Customer 1 (Linh) placed orders 1 and 4. Combining the two tables is lesson 2.1; this lesson queries one table at a time.",
            "**Money is an integer number of cents.** `total_cents = 2650` means $26.50. Integers add up exactly; you convert to dollars only for display.",
            "**NULL means \"no value\"**, not the text 'NULL' and not an empty string. Order 4 used no coupon. NULL has its own rules (lesson 1.3).",
            "**Dates and timestamps are text** in ISO-8601 format, so they sort correctly as strings. Date ranges are lesson 1.4; here every order is from March.",
        ]),
        callout("info", "Every query in this course runs on SQLite",
            "SQLite is the database engine built into Python's sqlite3 module (the challenges use SQLite 3.46). The SQL in this lesson is standard and runs the same way on PostgreSQL, MySQL and others. Where SQLite behaves differently, the lesson says so. In the coding challenges, a small runner at the bottom of the Python file loads the test rows into an in-memory SQLite database and runs your query: you only edit the QUERY string."),

        h2("3. Reproduce the wrong number"),
        p("Run the marketing query on the ten March orders. The intended answer is easy to count by hand: the paid orders with SPRING10 or SPRING20 are 1, 2, 6 and 10. Four rows."),
        code("sql", `
SELECT order_id, status, coupon_code, total_cents
FROM orders
WHERE status = 'paid' AND coupon_code = 'SPRING10' OR coupon_code = 'SPRING20';`, "spring_campaign.sql"),
        code("text", `
order_id | status    | coupon_code | total_cents
---------+-----------+-------------+------------
1        | paid      | SPRING10    | 4200
2        | paid      | SPRING20    | 2650
3        | refunded  | SPRING20    | 3900
5        | cancelled | SPRING20    | 5200
6        | paid      | SPRING20    | 3150
10       | paid      | SPRING10    | 2650
(6 rows)`),
        p("Six rows instead of four: the refunded order 3 and the cancelled order 5 are in the list. Both used SPRING20. Across the full month the same mistake turned 208 paid orders into 312: every refunded or cancelled SPRING20 order was counted as a sale. The paid SPRING10 orders were correct, which is why nobody noticed in a quick spot check."),

        h2("4. SELECT and FROM: choosing columns"),
        p("`FROM` names the table. `SELECT` lists the columns you want, separated by commas, in the order you want them. `*` means \"every column\", which is handy for exploring a table but not for a report: a report should list its columns so it does not change when someone adds a column to the table."),
        p("A column in SELECT can be an **expression**, and `AS` gives it a name, called an **alias**. The alias is the column's name in the result:"),
        code("sql", `
SELECT order_id,
       total_cents,
       total_cents / 100   AS dollars_int,
       total_cents / 100.0 AS total_usd
FROM orders
LIMIT 3;`, "aliases.sql"),
        code("text", `
order_id | total_cents | dollars_int | total_usd
---------+-------------+-------------+----------
1        | 4200        | 42          | 42.0
2        | 2650        | 26          | 26.5
3        | 3900        | 39          | 39.0
(3 rows)`),
        callout("warning", "Integer division",
            "In SQLite (and PostgreSQL), an integer divided by an integer is an integer: 2650 / 100 is 26, not 26.5. Write 100.0 to get a decimal result. Lesson 1.2 shows where this bites in averages and percentages."),
        h3("DISTINCT: one row per different value"),
        p("`SELECT DISTINCT` removes duplicate result rows. It is the quickest way to see which values a column contains, and the first thing to run on a column you do not know yet:"),
        code("sql", `
SELECT DISTINCT status FROM orders;
SELECT DISTINCT coupon_code FROM orders;`, "distinct.sql"),
        code("text", `
status              coupon_code
---------           -----------
paid                SPRING10
refunded            SPRING20
cancelled           NULL
pending             WELCOME5
(4 rows)            (4 rows)`),
        p("DISTINCT applies to the **whole row**, not to the first column. `SELECT DISTINCT customer_id, status` keeps one row per different (customer, status) pair, so a customer with a paid and a pending order appears twice:"),
        code("sql", `
SELECT DISTINCT customer_id, status
FROM orders
WHERE customer_id IN (1, 2, 3);`, "distinct_pairs.sql"),
        code("text", `
customer_id | status
------------+---------
1           | paid
2           | paid
3           | refunded
2           | pending
(4 rows)`),
        p("Notice that the rows are not sorted. Without ORDER BY, SQL promises nothing about row order (section 7)."),

        h2("5. WHERE: keeping the right rows"),
        p("`WHERE` takes a condition and keeps only the rows for which it is true. Text values go in single quotes; numbers do not. The comparison operators are `=`, `<>` (or `!=`), `<`, `<=`, `>` and `>=`. Conditions combine with `AND`, `OR` and `NOT`."),
        h3("AND binds tighter than OR"),
        p("Just as `2 + 3 * 4` means `2 + (3 * 4)`, SQL applies `NOT` first, then `AND`, then `OR`. The marketing condition was therefore read as:"),
        code("sql", `
WHERE (status = 'paid' AND coupon_code = 'SPRING10')
   OR coupon_code = 'SPRING20'`, "how_sqlite_reads_it.sql"),
        p("Run with these explicit parentheses, the query returns exactly the same six rows. The second branch has no status check at all, so every SPRING20 order passes, whatever its status. What marketing meant needs parentheses around the OR:"),
        code("sql", `
SELECT order_id, status, coupon_code
FROM orders
WHERE status = 'paid'
  AND (coupon_code = 'SPRING10' OR coupon_code = 'SPRING20');`, "spring_campaign_fixed.sql"),
        code("text", `
order_id | status | coupon_code
---------+--------+------------
1        | paid   | SPRING10
2        | paid   | SPRING20
6        | paid   | SPRING20
10       | paid   | SPRING10
(4 rows)`),
        p("`NOT` binds tightest of all, so `NOT status = 'paid' AND coupon_code = 'SPRING10'` means `(NOT status = 'paid') AND coupon_code = 'SPRING10'`: the SPRING10 orders that are not paid (here orders 7 and 9). The rule that saves you from learning precedence tables: **whenever a condition mixes AND and OR, write the parentheses**, even where they change nothing."),
        challenge("chal_quiz_sqlf_111", "For the first question, add the parentheses SQLite adds (around the AND) and test each of the seven rows against both branches. For the second, place each clause on the logical order: which steps have already run when it runs?"),

        h3("IN: one column, a list of values"),
        p("`col IN (a, b, c)` means `col = a OR col = b OR col = c`, with the parentheses built in. It is shorter, and it cannot be mis-grouped:"),
        code("sql", `
SELECT order_id, status, coupon_code
FROM orders
WHERE status = 'paid'
  AND coupon_code IN ('SPRING10', 'SPRING20');`, "spring_campaign_in.sql"),
        p("It returns the same four rows (1, 2, 6, 10). `NOT IN` keeps the rows whose value is not in the list: `WHERE status NOT IN ('paid', 'pending')` returns the refunded and cancelled orders 3, 5 and 9. Be careful with `NOT IN` when NULLs are involved, in the column or in the list; lesson 1.3 shows why."),
        h3("BETWEEN: an inclusive range"),
        p("`x BETWEEN low AND high` means `x >= low AND x <= high`. **Both ends are included**, and the smaller value must come first:"),
        code("sql", `
SELECT order_id, total_cents
FROM orders
WHERE total_cents BETWEEN 2650 AND 3900;`, "between.sql"),
        code("text", `
order_id | total_cents
---------+------------
2        | 2650
3        | 3900
6        | 3150
8        | 2650
10       | 2650
(5 rows)`),
        p("Orders of exactly 2650 and 3900 cents are in. With the bounds swapped, `BETWEEN 3900 AND 2650`, the query returns no rows and no error. BETWEEN works well on integers like cents; on timestamps it has a trap with the last day of a range, covered in lesson 1.4."),
        h3("LIKE: simple text patterns"),
        p("`LIKE` matches text against a pattern where `%` means \"any number of characters, even none\" and `_` means \"exactly one character\":"),
        code("sql", `
SELECT customer_id, name, country
FROM customers
WHERE name LIKE '%Nguyen';`, "like.sql"),
        code("text", `
customer_id | name        | country
------------+-------------+--------
1           | Linh Nguyen | VN
6           | Minh Nguyen | VN
(2 rows)`),
        bullets([
            "`coupon_code LIKE 'SPRING_0'` matches SPRING10 and SPRING20, but also SPRING30 or SPRINGX0 if they ever exist. When you know the exact values, use `=` or `IN`.",
            "In SQLite, LIKE ignores case for ASCII letters: `coupon_code LIKE 'spring%'` returns SPRING10 and SPRING20. In PostgreSQL, LIKE is case-sensitive (ILIKE ignores case). `=` is case-sensitive in both.",
        ]),

        h2("6. ORDER BY and LIMIT"),
        p("`ORDER BY` sorts the result by one or more columns or expressions, ascending (`ASC`, the default) or descending (`DESC`). `LIMIT n` keeps the first n rows of the sorted result. Together they answer \"top N\" questions, such as the three biggest paid orders:"),
        code("sql", `
SELECT order_id, total_cents
FROM orders
WHERE status = 'paid'
ORDER BY total_cents DESC
LIMIT 3;`, "top3.sql"),
        code("text", `
order_id | total_cents
---------+------------
1        | 4200
6        | 3150
2        | 2650
(3 rows)`),
        p("Is order 2 really \"third\"? Orders 2, 8 and 10 all have 2650 cents. ORDER BY total_cents says nothing about how to order them, so the database may return any of the three. SQLite happened to return order 2 because it read the table in order_id order; a different engine, a new index or a bigger table can change that, and the report changes with it while the data stays the same."),
        p("The fix is a **tie-breaker**: add columns to ORDER BY until no two rows can compare equal. A unique column such as `order_id` always ends the tie:"),
        code("sql", `
SELECT order_id, total_cents
FROM orders
WHERE status = 'paid'
ORDER BY total_cents DESC, order_id ASC;`, "sorted.sql"),
        code("text", `
order_id | total_cents
---------+------------
1        | 4200
6        | 3150
2        | 2650
8        | 2650
10       | 2650
4        | 1800
(6 rows)`),
        p("Each ORDER BY column has its own direction: `total_cents DESC, order_id ASC` sorts by total descending, then breaks ties by order_id ascending. The tie-breaker is part of the requirement: \"smallest order_id first\" and \"newest order first\" are different reports. `LIMIT 3 OFFSET 3` skips three rows and returns the next three; paging like this is only stable with a complete ORDER BY."),

        h2("7. The order SQL runs the clauses in"),
        p("You write a query in this order: SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT. The database evaluates it in a different, **logical** order. Every clause works on the result of the clauses before it:"),
        image("logical-clause-order", {
            alt: "Diagram with two rows of boxes. The top row shows the written order of clauses: SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, with SELECT highlighted. The bottom row shows the logical order as seven numbered steps joined by arrows: 1 FROM picks the table, 2 WHERE keeps rows, 3 GROUP BY makes groups, 4 HAVING keeps groups, 5 SELECT computes columns, aliases and DISTINCT, 6 ORDER BY sorts and can see aliases, 7 LIMIT keeps the first N sorted rows. Below, a red panel shows a query using the alias total_usd in WHERE, which PostgreSQL rejects with 'column total_usd does not exist' because WHERE runs at step 2. A green panel shows the same alias used in ORDER BY with order_id as a tie-breaker, which works because ORDER BY runs at step 6.",
            caption: "Real databases may execute a query in a smarter physical order, but the result is always as if these steps ran in this order.",
        }),
        numbered([
            "**FROM**: take the rows of the table.",
            "**WHERE**: keep the rows for which the condition is true. Only the table's columns exist here.",
            "**GROUP BY** and **HAVING**: combine rows into groups and filter the groups (lesson 1.2).",
            "**SELECT**: compute the result columns and give them their aliases; DISTINCT removes duplicate rows here.",
            "**ORDER BY**: sort. The aliases exist now, so `ORDER BY total_usd` works.",
            "**LIMIT**: keep the first n rows of the sorted result. It is last, so it never \"picks rows before sorting\".",
        ]),
        p("This explains the second incident query. `total_usd` is created at step 5, but WHERE runs at step 2: in standard SQL the alias does not exist yet, and PostgreSQL stops with `column \"total_usd\" does not exist`. In ORDER BY the same alias is fine:"),
        code("sql", `
SELECT order_id, total_cents / 100.0 AS total_usd
FROM orders
WHERE status = 'paid'
ORDER BY total_usd DESC, order_id
LIMIT 2;`, "order_by_alias.sql"),
        code("text", `
order_id | total_usd
---------+----------
1        | 42.0
6        | 31.5
(2 rows)`),
        p("Why did the query work on your laptop? **SQLite accepts aliases in WHERE as an extension.** It returns the same two rows for `WHERE status = 'paid' AND total_usd >= 30`, which makes the mistake invisible until the query runs somewhere else. The portable query filters on the real column, in the column's own unit:"),
        code("sql", `
SELECT order_id, total_cents / 100.0 AS total_usd
FROM orders
WHERE status = 'paid' AND total_cents >= 3000;   -- $30.00, written in cents`, "big_orders_fixed.sql"),
        p("It returns orders 1 and 6 on SQLite and on PostgreSQL. Comparing integers in cents is also exact, while comparing a computed decimal is not always (try 0.1 + 0.2 = 0.3 in any language)."),

        h2("8. The fix, and your turn"),
        p("The campaign query needs three changes: parentheses (or IN) so that `status = 'paid'` applies to both coupons, explicit columns, and a complete ORDER BY. Before the review, marketing also asks for a list rather than a count: the paid spring coupon orders worth at least $25.00, biggest first, so finance can check them row by row. The starter file contains the incident's WHERE clause and an ORDER BY with no tie-breaker."),
        challenge("chal_coding_sqlf_112", "Write the condition on paper first: status AND (coupon one OR coupon two) AND total. IN makes the coupon part impossible to mis-group. \"At least 2500\" includes 2500 itself. For equal totals the requirement wants the newer order first: which direction is that for order_id?"),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "**AND and OR mixed without parentheses.** Even when it happens to be right, the next person who adds a condition will break it. Parenthesise every OR that sits next to an AND, or use IN.",
            "**An alias that shadows a column.** In SQLite, `SELECT total_cents / 100 AS total_cents ... WHERE total_cents >= 30` filters on the real column in cents, not on the alias in dollars: on the March data it keeps all six paid orders, including order 4 at $18. Give computed columns new names.",
            "**LIMIT without ORDER BY.** `SELECT ... LIMIT 3` returns some three rows, not \"the first three\" or \"the latest three\". Today it is orders 1, 2 and 3; tomorrow it may not be.",
            "**ORDER BY without a tie-breaker.** Two runs of the same query can return equal rows in a different order, and LIMIT can return different rows. End ORDER BY with a unique column.",
            "**BETWEEN with swapped bounds.** `BETWEEN 3900 AND 2650` is always false: no rows, no error.",
            "**Double quotes for text.** In standard SQL, `\"paid\"` is a column name and `'paid'` is a text value. SQLite falls back to treating an unknown \"identifier\" as text, so `status = \"paid\"` happens to work there; PostgreSQL reports a missing column. Always use single quotes for text.",
            "**LIKE when you know the values.** `LIKE 'SPRING%'` will silently include next year's SPRING30. Use `IN` with the exact codes.",
        ]),

        h2("10. Checklist"),
        bullets([
            "You know the grain of the table you query: what one row means.",
            "The SELECT list names its columns; `*` is only for exploring.",
            "Every condition that mixes AND and OR has parentheses, or uses IN instead of a chain of ORs.",
            "Ranges say whether the ends are included: BETWEEN and >= include them, > does not.",
            "Text values use single quotes and exact matches (`=`, `IN`); LIKE is for real patterns.",
            "WHERE uses table columns, never SELECT aliases; aliases are for ORDER BY and for the result.",
            "Every ORDER BY ends with a unique tie-breaker, and every LIMIT has an ORDER BY.",
            "Before you send a number, run the query on a few rows you can check by hand.",
        ]),
    ],
});
