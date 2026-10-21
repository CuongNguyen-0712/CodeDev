// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sqlf-3-2",
    title: "Cohorts & retention tables",
    slug: { _type: "slug", current: "cohorts-retention-tables" },
    description:
        "The growth dashboard says month-2 retention jumped from 31% to 48%, but the query divided by last month's survivors, counted orders instead of customers and grouped people by signup date. Learn what a cohort is, how to count calendar months between two dates in SQLite, and how to build a retention table whose denominator never moves.",
    estimatedTime: 25,

    scenario: {
        role: "Junior data analyst, Beanbox (online coffee shop)",
        problem:
            "The growth team rebuilt the retention dashboard. Last quarter's report said 31% of new customers paid again two months after their first order; the new dashboard says 48% for the March 2026 cohort, and the CEO wants to double the ad budget on the strength of it. Finance asks you to check the number before Friday's meeting.",
    },

    content: [
        h2("1. The incident: retention that grew overnight"),
        p("Retention answers one question: **of the customers who started in a given month, how many came back later?** Beanbox's old monthly report put month-2 retention at 31%. The new growth dashboard shows 48% for the customers who started in March 2026, and nothing in the business changed that much. This is the query behind the new tile:"),
        code("sql", `
-- growth_dashboard.sql: "month-2 retention" for the March 2026 cohort
SELECT ROUND(100.0 *
    (SELECT COUNT(*)
       FROM orders o JOIN customers c ON c.customer_id = o.customer_id
      WHERE strftime('%Y-%m', c.signup_date) = '2026-03'
        AND strftime('%Y-%m', o.ordered_at)  = '2026-05'
        AND o.status = 'paid')
  / (SELECT COUNT(DISTINCT o.customer_id)
       FROM orders o JOIN customers c ON c.customer_id = o.customer_id
      WHERE strftime('%Y-%m', c.signup_date) = '2026-03'
        AND strftime('%Y-%m', o.ordered_at)  = '2026-04'
        AND o.status = 'paid'), 1) AS month2_retention_pct;`, "growth_dashboard.sql"),
        p("It runs, it returns a plausible percentage, and every line looks like something you have written before. It still answers a different question from the one on the slide, in three ways:"),
        bullets([
            "**The denominator shrinks.** It divides by the customers who were active in April, the month before. Those are last month's survivors, a smaller and more loyal group than everyone who started in March.",
            "**It counts orders, not customers.** `COUNT(*)` in the numerator counts paid orders, so a customer who paid twice in May is \"retained\" twice.",
            "**It mixes two definitions of \"started\".** The cohort is chosen by `signup_date`, but customers can sign up in one month and pay for the first time in another. A retention table is about buyers, so it starts at the first **paid order**.",
        ]),

        h2("2. Reproduce it on a small extract"),
        p("You export a small extract: 14 customers and their 29 orders until 31 May 2026. Every order was placed at 10:00:00 UTC and cost 2500 cents; only the dates and statuses matter here:"),
        code("text", `
id  name   signup_date  orders in 2026 (MM-DD status)
--  -----  -----------  ---------------------------------------------------
 1  Kai    2026-01-20   01-21 paid, 02-11 paid, 04-05 paid, 05-09 paid
 2  Lan    2026-02-03   02-04 paid, 03-09 paid
 3  Mai    2026-02-09   02-10 paid, 05-12 paid
 4  Emil   2026-02-14   02-20 cancelled, 03-01 paid, 05-07 paid
 5  Ana    2026-03-02   03-03 paid, 04-10 paid, 05-02 paid, 05-19 paid
 6  Binh   2026-03-05   03-06 paid, 04-08 paid
 7  Gia    2026-03-08   03-09 paid
 8  Chloe  2026-03-11   03-12 paid
 9  Hugo   2026-03-14   03-15 paid, 04-03 paid
10  Ines   2026-03-17   03-18 paid
11  Dev    2026-03-20   03-21 cancelled, 03-22 paid, 04-25 paid
12  Jon    2026-03-25   03-26 paid
13  Farah  2026-03-28   04-02 paid, 05-15 paid
14  Noor   2026-05-19   05-20 paid`),
        p("Running the dashboard query on this extract gives an even rosier number than production:"),
        code("text", `
month2_retention_pct
--------------------
60.0`),
        p("Trace it by hand. The numerator is 3: Ana's two May orders plus Farah's one. The denominator is 5: Ana, Binh, Dev, Farah and Hugo paid in April. Farah signed up in March but paid for the first time in April, so she is not a March buyer at all. Emil paid for the first time in March but signed up in February, so he is missing. By the end of this lesson you will get the honest number for the same cohort: **22.2%**."),

        h2("3. What a cohort is"),
        p("A **cohort** is a group of customers who share a starting point. In a purchase retention table the starting point is the month of each customer's **first paid order**, and it never changes: Ana belongs to the March 2026 cohort forever, however often she buys later."),
        bullets([
            "**First paid order, not signup.** Signing up costs nothing; paying is the event you want to repeat. Pick one definition, write it in the report, and use it for every cohort.",
            "**Paid orders only, for both ends.** A cancelled or refunded order neither starts a cohort nor counts as coming back. Filter `status = 'paid'` before you take the minimum, not after.",
            "**One row per customer.** `MIN(ordered_at)` per customer gives the first paid order; `strftime('%Y-%m', ...)` turns it into the cohort month (lesson 1.4).",
        ]),
        p("This query shows the customers for whom the three possible \"start\" definitions disagree:"),
        code("sql", `
WITH firsts AS (
    SELECT customer_id,
           MIN(ordered_at)                                    AS first_order_at,
           MIN(CASE WHEN status = 'paid' THEN ordered_at END) AS first_paid_at
    FROM orders
    GROUP BY customer_id
)
SELECT c.name,
       strftime('%Y-%m', c.signup_date)    AS signup_month,
       strftime('%Y-%m', f.first_order_at) AS first_order_month,
       strftime('%Y-%m', f.first_paid_at)  AS cohort_month
FROM customers c
JOIN firsts f ON f.customer_id = c.customer_id
WHERE strftime('%Y-%m', c.signup_date) <> strftime('%Y-%m', f.first_paid_at)
   OR f.first_order_at <> f.first_paid_at
ORDER BY c.customer_id;`, "cohort_definitions.sql"),
        code("text", `
name   signup_month  first_order_month  cohort_month
-----  ------------  -----------------  ------------
Emil   2026-02       2026-02            2026-03
Dev    2026-03       2026-03            2026-03
Farah  2026-03       2026-04            2026-04`),
        p("Emil's first order was cancelled in February, so his first **paid** order puts him in March. Dev's cancelled order is in the same month as his first paid one, so his cohort does not change, but a day-level \"first order\" would already be wrong. `MIN` ignores the NULLs that the `CASE` produces for unpaid orders (lesson 1.3). With the filter in a `WHERE` clause instead, the cohort sizes of the extract are:"),
        code("sql", `
WITH first_paid AS (
    SELECT customer_id,
           strftime('%Y-%m', MIN(ordered_at)) AS cohort_month
    FROM orders
    WHERE status = 'paid'
    GROUP BY customer_id
)
SELECT cohort_month, COUNT(*) AS cohort_size
FROM first_paid
GROUP BY cohort_month
ORDER BY cohort_month;`, "cohort_sizes.sql"),
        code("text", `
cohort_month  cohort_size
------------  -----------
2026-01       1
2026-02       2
2026-03       9
2026-04       1
2026-05       1`),
        callout("info", "'YYYY-MM' text sorts like a date",
            "SQLite has no date type: dates are TEXT, and MIN, MAX and ORDER BY compare them character by character. That works because the format is zero-padded, largest unit first: '2026-03' < '2026-10' is true. A value like '2026-3' would sort after '2026-10' and break every cohort query, so always build months with strftime('%Y-%m', ...)."),

        h2("4. Counting calendar months between two dates"),
        p("The columns of a retention table are **months since the first order**: month 0 is the cohort month itself, month 1 the next calendar month, and so on. SQLite has no function for \"months between\", so you need to build one. Three ideas look reasonable; only one is right:"),
        code("sql", `
SELECT column1 AS first_paid, column2 AS later_order,
       CAST(strftime('%m', column2) AS INTEGER)
         - CAST(strftime('%m', column1) AS INTEGER)                     AS month_minus_month,
       CAST((julianday(column2) - julianday(column1)) / 30 AS INTEGER) AS days_div_30,
       (CAST(strftime('%Y', column2) AS INTEGER) * 12 + CAST(strftime('%m', column2) AS INTEGER))
     - (CAST(strftime('%Y', column1) AS INTEGER) * 12 + CAST(strftime('%m', column1) AS INTEGER))
                                                                         AS month_index_diff
FROM (VALUES ('2026-03-03', '2026-05-02'),
             ('2026-01-31', '2026-02-01'),
             ('2025-12-28', '2026-01-03'),
             ('2026-03-01', '2026-05-31'));`, "month_offsets.sql"),
        code("text", `
first_paid  later_order  month_minus_month  days_div_30  month_index_diff
----------  -----------  -----------------  -----------  ----------------
2026-03-03  2026-05-02   2                  2            2
2026-01-31  2026-02-01   1                  0            1
2025-12-28  2026-01-03   -11                0            1
2026-03-01  2026-05-31   2                  3            2`),
        bullets([
            "**Month minus month** forgets the year: December to January gives -11.",
            "**Days divided by 30** measures elapsed time, not calendar months. 31 January to 1 February is 1 day, so it says month 0; 1 March to 31 May is 91 days, so it says month 3.",
            "**A month index** turns every date into one integer, `year * 12 + month`: March 2026 is 2026 * 12 + 3 = 24315. Consecutive months are consecutive integers, also across a new year, so the difference of two indexes is exactly the number of calendar months between them.",
        ]),
        p("`strftime` returns TEXT ('03'), so the expression casts each part with `CAST(... AS INTEGER)`. SQLite would also convert the text silently inside arithmetic, but the cast makes the intent visible and behaves the same in every database. In PostgreSQL you would write `EXTRACT(YEAR FROM ordered_at) * 12 + EXTRACT(MONTH FROM ordered_at)` for the same index."),
        callout("tip", "Compute the index once, in the first CTE",
            "Add month_index next to each paid order in your first step. Then the cohort's first index is MIN(month_index) and the offset of any order is month_index - first_index: two integers, no date functions in the later steps."),

        h2("5. Active customers and a denominator that does not move"),
        p("A customer is **active** in month N of their cohort if they have at least one paid order in that calendar month. The question is about people, so you count each customer once per month with `COUNT(DISTINCT customer_id)` (lesson 1.2). Here is the March cohort of the extract, one row per month offset:"),
        code("sql", `
WITH paid AS (
    SELECT customer_id, ordered_at,
           CAST(strftime('%Y', ordered_at) AS INTEGER) * 12
         + CAST(strftime('%m', ordered_at) AS INTEGER) AS month_index
    FROM orders
    WHERE status = 'paid'
),
first_paid AS (
    SELECT customer_id,
           strftime('%Y-%m', MIN(ordered_at)) AS cohort_month,
           MIN(month_index)                   AS first_index
    FROM paid
    GROUP BY customer_id
)
SELECT p.month_index - f.first_index AS months_since_first,
       COUNT(*)                      AS paid_orders,
       COUNT(DISTINCT p.customer_id) AS active_customers
FROM paid p
JOIN first_paid f ON f.customer_id = p.customer_id
WHERE f.cohort_month = '2026-03'
GROUP BY months_since_first
ORDER BY months_since_first;`, "march_cohort.sql"),
        code("text", `
months_since_first  paid_orders  active_customers
------------------  -----------  ----------------
0                   9            9
1                   4            4
2                   3            2`),
        p("In month 2 there are 3 paid orders but only 2 active customers, Ana (twice) and Emil. Now the denominator. Retention for a cell is `active customers / cohort size`, and the cohort size, 9, is **the same for every column of the row**:"),
        bullets([
            "Month 1: 4 / 9 = 44.4%. Month 2: 2 / 9 = 22.2%. Month 0 is always 9 / 9 = 100%, because every customer is active in the month of their first paid order. If month 0 is not 100%, the cohort and activity steps disagree.",
            "Dividing month 2 by the actives of month 1 gives 2 / 4 = 50.0%. That is a real metric (\"month-over-month repeat rate\"), but it is not retention: its denominator shrinks every month, so it stays high while the cohort quietly empties. Lesson 3.1's `LAG` makes it easy to compute by accident.",
            "Because the denominator is fixed, a row can never go above 100%, and you can read a row from left to right as the cohort's life story.",
        ]),
        image("cohort-retention-table", {
            alt: "Diagram of the retention table for the 14-customer extract. On the left, a triangular heat table: rows are cohorts 2026-01 to 2026-05 with sizes 1, 2, 9, 1 and 1, columns are months since the first paid order m0 to m4. Every m0 cell is 100.0; the March 2026 row reads 100.0, 44.4, 22.2 and its 22.2 cell is outlined; January and February have a grey 0.0 in m2; cells after May 2026 are dashed and labelled not yet. On the right, a red panel shows the dashboard's 60.0%: 3 paid orders in May divided by 5 customers active in April, grouped by signup month. A green panel shows 22.2%: 2 distinct customers active in month 2 divided by the 9 customers whose first paid order was in March. A bottom row shows three CTE steps: cohort per customer, activity per month offset, divide by the cohort size.",
            caption: "The same cohort, two denominators. A retention row always divides by the cohort size, so it reads as the cohort's life story and never exceeds 100%.",
        }),
        callout("warning", "Integer division hides the answer",
            "In SQLite an integer divided by an integer is an integer: 100 * 2 / 9 is 22 and 2 / 9 * 100 is 0. Write ROUND(100.0 * active / cohort_size, 1): the 100.0 makes the division real, and multiplying first keeps the precision (22.2)."),

        h2("6. The fix: build the whole table in CTE steps"),
        p("For the single number on the slide, the three changes are: cohort = first paid month, numerator = distinct customers, denominator = cohort size. The corrected tile query for the March 2026 cohort, month 2:"),
        code("sql", `
WITH paid AS (
    SELECT customer_id,
           CAST(strftime('%Y', ordered_at) AS INTEGER) * 12
         + CAST(strftime('%m', ordered_at) AS INTEGER) AS month_index
    FROM orders
    WHERE status = 'paid'
),
first_paid AS (
    SELECT customer_id, MIN(month_index) AS first_index
    FROM paid
    GROUP BY customer_id
),
march AS (                                   -- the March 2026 cohort: 2026 * 12 + 3
    SELECT customer_id, first_index FROM first_paid WHERE first_index = 2026 * 12 + 3
)
SELECT (SELECT COUNT(*) FROM march)                   AS cohort_size,
       COUNT(DISTINCT p.customer_id)                  AS active_in_month_2,
       ROUND(100.0 * COUNT(DISTINCT p.customer_id)
                   / (SELECT COUNT(*) FROM march), 1) AS month2_retention_pct
FROM paid p
JOIN march m ON m.customer_id = p.customer_id
WHERE p.month_index - m.first_index = 2;`, "month2_retention_fixed.sql"),
        code("text", `
cohort_size  active_in_month_2  month2_retention_pct
-----------  -----------------  --------------------
9            2                  22.2`),
        p("A single cell invites the next question: \"and the other cohorts, and month 3?\" A dashboard should show the whole table, built in named steps that a reviewer can check one at a time (lesson 2.2). Each step has a clear grain, one row per something:"),
        code("sql", `
WITH paid AS (...),          -- one row per paid order: customer_id, order_month, month_index
cohorts AS (...),            -- one row per customer: cohort_month, first_index
cohort_sizes AS (...),       -- one row per cohort: cohort_month, cohort_size
activity AS (...)            -- one row per (cohort_month, months_since_first): active_customers
SELECT ...                   -- activity joined to cohort_sizes, plus retention_pct
ORDER BY cohort_month, months_since_first;`),
        p("Write it. Your query returns the table in **long format**: one row per cohort and month offset that has at least one active customer. Pay attention to the edge cases the dashboard got wrong: a customer who pays twice in a month, a first order that was cancelled, an offset that crosses a new year, and a month in which nobody from the cohort came back."),
        challenge("chal_coding_sqlf_321", "Build it as four CTEs, and check each one on the docstring example before adding the next: paid orders with a month index, one cohort row per customer (two MINs), one size per cohort, then active customers grouped by cohort and offset. The final SELECT is just a join of the last two. If month 0 is ever below 100%, your cohort step and your activity step disagree about which orders count."),

        h2("7. Reading the triangle"),
        p("People read retention as a grid, so the last step is a pivot: one row per cohort, one column per month offset. Conditional aggregation (lesson 1.4) does it in SQL. Suppose you saved the rows of your challenge query as a view named `retention`; on the extract it has 13 rows. A first pivot:"),
        code("sql", `
SELECT cohort_month,
       MAX(cohort_size) AS size,
       MAX(CASE WHEN months_since_first = 0 THEN retention_pct END) AS m0,
       MAX(CASE WHEN months_since_first = 1 THEN retention_pct END) AS m1,
       MAX(CASE WHEN months_since_first = 2 THEN retention_pct END) AS m2,
       MAX(CASE WHEN months_since_first = 3 THEN retention_pct END) AS m3,
       MAX(CASE WHEN months_since_first = 4 THEN retention_pct END) AS m4
FROM retention
GROUP BY cohort_month
ORDER BY cohort_month;`, "pivot_naive.sql"),
        code("text", `
cohort_month  size  m0     m1     m2    m3     m4
------------  ----  -----  -----  ----  -----  -----
2026-01       1     100.0  100.0  NULL  100.0  100.0
2026-02       2     100.0  50.0   NULL  50.0   NULL
2026-03       9     100.0  44.4   22.2  NULL   NULL
2026-04       1     100.0  100.0  NULL  NULL   NULL
2026-05       1     100.0  NULL   NULL  NULL   NULL`),
        p("The NULLs mean two different things, and a reader cannot tell them apart:"),
        bullets([
            "**Observed, nobody came back.** January's month 2 is March 2026. The data covers March, Kai simply did not order, so the true value is 0.0%. The long result has no row for it because no customer was active, which is correct: a missing row is not a missing measurement.",
            "**Not observable yet.** March's month 3 is June 2026, after the end of the data. Nobody knows that number yet. Showing it as 0% would make young cohorts look terrible; leaving it blank is the honest answer.",
        ]),
        p("The data ends in May 2026, so a cohort can be observed up to `last_offset = (2026 * 12 + 5) - cohort index` months. Fill a missing cell with 0.0 only when its offset is within that range:"),
        code("sql", `
WITH cells AS (
    SELECT cohort_month,
           MAX(cohort_size) AS size,
           -- the extract ends in May 2026: 2026 * 12 + 5
           (2026 * 12 + 5)
             - (CAST(substr(cohort_month, 1, 4) AS INTEGER) * 12
              + CAST(substr(cohort_month, 6, 2) AS INTEGER)) AS last_offset,
           MAX(CASE WHEN months_since_first = 1 THEN retention_pct END) AS m1,
           MAX(CASE WHEN months_since_first = 2 THEN retention_pct END) AS m2,
           MAX(CASE WHEN months_since_first = 3 THEN retention_pct END) AS m3,
           MAX(CASE WHEN months_since_first = 4 THEN retention_pct END) AS m4
    FROM retention
    GROUP BY cohort_month
)
SELECT cohort_month, size,
       CASE WHEN last_offset >= 1 THEN COALESCE(m1, 0.0) END AS m1,
       CASE WHEN last_offset >= 2 THEN COALESCE(m2, 0.0) END AS m2,
       CASE WHEN last_offset >= 3 THEN COALESCE(m3, 0.0) END AS m3,
       CASE WHEN last_offset >= 4 THEN COALESCE(m4, 0.0) END AS m4
FROM cells
ORDER BY cohort_month;`, "pivot_observable.sql"),
        code("text", `
cohort_month  size  m1     m2    m3     m4
------------  ----  -----  ----  -----  -----
2026-01       1     100.0  0.0   100.0  100.0
2026-02       2     50.0   0.0   50.0   NULL
2026-03       9     44.4   22.2  NULL   NULL
2026-04       1     100.0  NULL  NULL   NULL
2026-05       1     NULL   NULL  NULL   NULL`),
        p("Month 0 is dropped because it is always 100.0. The filled cells form a **triangle**: each newer cohort has one fewer observable month. Two more things to notice before anyone draws a conclusion:"),
        bullets([
            "**Small cohorts are noisy.** January's 100.0% in months 3 and 4 is one customer, Kai. One active customer more or less moves a 1-customer cohort by 100 points and a 9-customer cohort by about 11. Always show the cohort size next to the percentages, and do not compare cohorts of very different sizes cell by cell.",
            "**A summary across cohorts must be weighted.** To report one \"month-2 retention\" for a quarter, add up the active customers and the cohort sizes of the cohorts that have reached month 2, then divide. `AVG(retention_pct)` gives a 1-customer cohort the same weight as a 900-customer one.",
        ]),
        callout("info", "Pivot in SQL or in Python",
            "The CASE pivot needs one column per offset written out by hand. When the number of months grows, it is often simpler to fetch the long rows into Python (lesson 3.3) and fill a dict keyed by (cohort_month, months_since_first). Keep the long format as the source of truth either way: it is easy to test, sort and join."),

        h2("8. Pitfalls"),
        bullets([
            "**Cohort from signup date, or from the first order of any status.** Both move customers into the wrong row. A cancelled first order must not start a cohort.",
            "**`COUNT(*)` instead of `COUNT(DISTINCT customer_id)`.** Repeat buyers are counted once per order, and retention can exceed 100%.",
            "**A moving denominator.** Dividing by last month's actives (or by \"customers seen so far\") is a different metric. If you need it, give it a different name.",
            "**Offsets from day counts or from the month number alone.** Days / 30 drifts at month ends; month minus month breaks every December. Use `year * 12 + month`.",
            "**Treating \"no row\" as \"no data\".** Inside the observed range a missing cell is 0%; after the end of the data it is unknown. Decide explicitly, as in the second pivot.",
            "**A partial last month.** If the data ends on the 15th, the newest diagonal of the triangle looks low because half the month is missing. End the data on a month boundary or mark that diagonal as partial.",
            "**Month boundaries in UTC.** `ordered_at` is stored in UTC, so an order at 23:30 on 31 March in a UTC+7 country is already 1 April locally. Choose one time zone for the report and say which.",
        ]),

        h2("9. Checklist"),
        bullets([
            "The cohort is the month of each customer's first paid order, computed with `MIN` over paid orders only.",
            "Every month offset is a difference of `year * 12 + month` indexes, so December to January is 1.",
            "Activity counts distinct customers with at least one paid order in the month.",
            "Every cell divides by the cohort size, with `ROUND(100.0 * active / cohort_size, 1)`; month 0 is 100.0 for every cohort.",
            "The query is a chain of CTEs with one clear grain each, and the final ORDER BY is cohort_month, months_since_first.",
            "Cells after the end of the data are blank, observed cells with no active customers are 0, and the report says which is which.",
            "Cohort sizes are shown next to the percentages, and any cross-cohort summary is weighted by cohort size.",
        ]),
    ],
});
