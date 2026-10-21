// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sqlf-1-4",
    title: "Dates & CASE: monthly reports that add up",
    slug: { _type: "slug", current: "dates-case-monthly-reports" },
    description:
        "Finance's March revenue is lower than the payment provider's statement, and the CEO's monthly dashboard adds up to more than the quarter. Learn how SQLite stores dates as text, why BETWEEN loses the last day of a month, how to group by month with strftime, and how CASE and conditional aggregation split one month into numbers that reconcile.",
    estimatedTime: 25,

    scenario: {
        role: "Junior data analyst, Beanbox (online coffee shop)",
        problem:
            "Beanbox ran a month-end sale on 31 March. In the monthly report, March revenue is lower than the payment provider's statement, and the gap is exactly the orders of 31 March - the day of the sale. The same week, the CEO adds up January, February and March on the revenue dashboard and gets more than the Q1 revenue finance sent to the accountant. Both numbers come from queries you inherited, and both queries run without a single error.",
    },

    content: [
        h2("1. The incident: one month too small, one quarter too big"),
        p("Finance builds the monthly revenue figure with this query. It looks like the textbook way to say \"all paid orders in March\":"),
        code("sql", `
-- monthly-report.sql: March revenue for finance
SELECT COUNT(*) AS orders, SUM(total_cents) AS revenue_cents
FROM orders
WHERE status = 'paid'
  AND ordered_at BETWEEN '2026-03-01' AND '2026-03-31';`, "monthly-report.sql"),
        p("The revenue dashboard uses a second query. It groups orders by month and adds them up:"),
        code("sql", `
-- dashboard.sql: revenue per month for the CEO
SELECT strftime('%Y-%m', ordered_at) AS month, SUM(total_cents) AS revenue_cents
FROM orders
WHERE ordered_at >= '2026-01-01' AND ordered_at < '2026-04-01'
GROUP BY month
ORDER BY month;`, "dashboard.sql"),
        p("The first query loses money that was really paid. The second one counts money that was never kept. The causes are different - one is about how SQLite compares dates, the other is about which rows a sum includes - but they share a lesson: **a monthly number is only right if you know exactly which rows fall into the month**."),

        h2("2. Reproduce it with twelve orders"),
        p("Here is a small `orders` table with the same shape as Beanbox's (all times are UTC; amounts are integer cents). It has a refund in January and March, a cancelled order at the end of February, two sale orders on 31 March and an April order placed at exactly midnight:"),
        code("text", `
order_id | customer_id | ordered_at          | status    | total_cents
---------+-------------+---------------------+-----------+------------
1        | 1           | 2026-01-05 10:12:00 | paid      | 4200
2        | 2           | 2026-01-19 21:40:00 | refunded  | 3600
3        | 3           | 2026-02-02 08:05:00 | paid      | 2900
4        | 1           | 2026-02-14 19:30:00 | paid      | 12500
5        | 4           | 2026-02-28 19:10:00 | cancelled | 1800
6        | 2           | 2026-03-01 00:20:00 | paid      | 5400
7        | 5           | 2026-03-12 13:00:00 | paid      | 2600
8        | 3           | 2026-03-20 09:45:00 | refunded  | 7900
9        | 6           | 2026-03-31 14:05:00 | paid      | 18900
10       | 4           | 2026-03-31 22:30:00 | paid      | 3100
11       | 5           | 2026-04-01 00:00:00 | paid      | 4400
12       | 6           | 2026-04-02 11:15:00 | pending   | 2500`, "orders"),
        p("March has four paid orders (6, 7, 9 and 10) worth 5400 + 2600 + 18900 + 3100 = 30,000 cents. The finance query finds half of them:"),
        code("text", `
orders | revenue_cents
-------+--------------
2      | 8000`, "monthly-report.sql output"),
        p("Orders 9 and 10, both placed on 31 March, are missing. The dashboard query returns this:"),
        code("text", `
month   | revenue_cents
--------+--------------
2026-01 | 7800
2026-02 | 17200
2026-03 | 37900`, "dashboard.sql output"),
        p("The three months add up to 62,900 cents. Paid orders in Q1 are worth 49,600 cents. The difference, 13,300, is the two refunds (3,600 + 7,900) plus the cancelled order (1,800): the dashboard adds every order, whatever its status. The rest of this lesson explains both bugs and how to write a monthly report that reconciles."),

        h2("3. SQLite has no DATE type: dates are text"),
        p("SQLite has no date or timestamp column type. Beanbox stores `ordered_at` as **TEXT** in ISO-8601 format, `'YYYY-MM-DD HH:MM:SS'`, in UTC. You can check what SQLite really holds with `typeof()`:"),
        code("sql", `
SELECT typeof('2026-03-31 14:05:00') AS type,
       date('31/03/2026')            AS parsed_dmy,
       date('2026-3-5')              AS parsed_no_pad;`, "types.sql"),
        code("text", `
type | parsed_dmy | parsed_no_pad
-----+------------+--------------
text | NULL       | NULL`),
        p("Because the value is text, `<`, `>`, `=` and `BETWEEN` compare it **character by character**, like words in a dictionary. That works for dates only because ISO-8601 puts the largest unit first and pads every part to a fixed width: year, then month, then day, then time. Any other format breaks the order:"),
        code("sql", `
SELECT '2026-03-31 14:05:00' > '2026-03-31' AS longer_is_greater,
       '2026-03-31 14:05:00' < '2026-04-01' AS before_april,
       '2026-3-5'   < '2026-3-31'           AS no_zero_padding,
       '31/03/2026' < '01/04/2026'          AS day_first;`, "compare.sql"),
        code("text", `
longer_is_greater | before_april | no_zero_padding | day_first
------------------+--------------+-----------------+----------
1                 | 1            | 0               | 0`),
        bullets([
            "**SQLite has no boolean type either:** a comparison returns 1 (true) or 0 (false).",
            "`'2026-3-5' < '2026-3-31'` is false because, after the common prefix `'2026-3-'`, SQLite compares `'5'` with `'3'`. Without zero padding, 5 March sorts after 31 March. `'31/03/2026'` sorts after `'01/04/2026'` for the same reason.",
            "When one string is a prefix of the other, the shorter one is smaller. `'2026-03-31'` is a prefix of `'2026-03-31 14:05:00'`, so the timestamp is **greater** than the date, even though a human reads them as \"the same day\".",
            "SQLite's date functions return NULL for formats they do not understand, such as `'31/03/2026'`. A NULL month in a report usually means a badly formatted date somewhere upstream.",
        ]),
        p("That third bullet is the finance bug. `BETWEEN a AND b` means `>= a AND <= b`. With `b = '2026-03-31'`, an order at `'2026-03-31 14:05:00'` fails the `<=` test, and so does every other timestamp that starts with `'2026-03-31'` and has a time after it. Before reading on, work out exactly which rows survive such a filter:"),
        challenge("chal_quiz_sqlf_141"),

        h2("4. Date functions: date(), strftime() and modifiers"),
        p("SQLite has a handful of functions that read ISO-8601 text and return new text. Each one accepts **modifiers** that move or truncate the date:"),
        code("sql", `
SELECT date('2026-03-31 14:05:00')                   AS day,
       strftime('%Y-%m', '2026-03-31 14:05:00')       AS month,
       date('2026-03-31 14:05:00', 'start of month')  AS month_start,
       date('2026-03-01', '+1 month')                 AS next_month_start,
       date('2026-01-31', '+1 month')                 AS jan31_plus_month,
       datetime('2026-03-31 22:30:00', '+7 hours')    AS hanoi_time;`, "date-functions.sql"),
        code("text", `
day        | month   | month_start | next_month_start | jan31_plus_month | hanoi_time
-----------+---------+-------------+------------------+------------------+--------------------
2026-03-31 | 2026-03 | 2026-03-01  | 2026-04-01       | 2026-03-03       | 2026-04-01 05:30:00`),
        bullets([
            "`date(x)` keeps `'YYYY-MM-DD'`; `datetime(x)` keeps `'YYYY-MM-DD HH:MM:SS'`.",
            "`strftime('%Y-%m', x)` gives the month as `'YYYY-MM'`. This is the key you group by for a monthly report. `substr(ordered_at, 1, 7)` gives the same text for well-formed values, but `strftime` returns NULL for garbage instead of silently grouping it.",
            "`'start of month'` truncates to the first day; `'+1 month'` moves forward one month. Use `'+1 month'` **only on the first day of a month**: `date('2026-01-31', '+1 month')` has no 31 February to land on, so SQLite overflows into March and returns `'2026-03-03'`.",
        ]),
        h3("Time zones: whose March is it?"),
        p("Beanbox stores UTC, so `strftime('%Y-%m', ordered_at)` gives the **UTC** month. That is what the payment provider uses, so the finance report should too. But a Hanoi-based team that asks for \"March sales\" means March in Hanoi, 7 hours ahead of UTC. Shift the timestamp before you take its month:"),
        code("sql", `
SELECT order_id, ordered_at,
       strftime('%Y-%m', ordered_at)             AS month_utc,
       strftime('%Y-%m', ordered_at, '+7 hours') AS month_hanoi
FROM orders
WHERE order_id IN (5, 10, 11);`, "time-zone.sql"),
        code("text", `
order_id | ordered_at          | month_utc | month_hanoi
---------+---------------------+-----------+------------
5        | 2026-02-28 19:10:00 | 2026-02   | 2026-03
10       | 2026-03-31 22:30:00 | 2026-03   | 2026-04
11       | 2026-04-01 00:00:00 | 2026-04   | 2026-04`),
        p("Order 10 is a March order in UTC and an April order in Hanoi. Neither answer is wrong; they answer different questions. Write the time zone in the report's title, and never compare a UTC report with a local-time one. A fixed `'+7 hours'` works for Vietnam because it has no daylight saving time; for a zone that changes its offset during the year, convert in the application or in a database that knows time zones (PostgreSQL's `AT TIME ZONE`)."),

        h2("5. The rule: half-open ranges"),
        p("The fix for the finance query is not a cleverer upper bound such as `'2026-03-31 23:59:59'` - that still breaks the day someone stores milliseconds. The fix is to stop using an inclusive end at all. Describe a period as **half-open**: it includes its start and excludes its end, and the end is the first moment of the next period."),
        code("sql", `
SELECT COUNT(*) AS orders, SUM(total_cents) AS revenue_cents
FROM orders
WHERE status = 'paid'
  AND ordered_at >= '2026-03-01'     -- first day, included
  AND ordered_at <  '2026-04-01';    -- next month's first day, excluded`, "monthly-report.sql (fixed)"),
        code("text", `
orders | revenue_cents
-------+--------------
4      | 30000`),
        image("between-vs-half-open-range", {
            alt: "Two timelines of March 2026. In the top, red panel, the filter BETWEEN '2026-03-01' AND '2026-03-31' covers 1 March up to just before 31 March 00:00, because the text '2026-03-31' sorts before every 31 March timestamp; the orders at 00:20 on 1 March and 13:00 on 12 March are kept, the orders at 14:05 and 22:30 on 31 March are dropped, and the result is 2 of 4 paid orders, 8,000 cents. In the bottom, green panel, the filter ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01' covers the whole month up to an open end at 1 April 00:00, keeping all four orders for 30,000 cents and excluding the April order placed at midnight. A bottom row states the rule: start on the first day, included; end on the next month's first day, excluded; months then tile with no gap and no overlap.",
            caption: "BETWEEN with a date as the upper bound stops before the last day begins. A half-open range ends at the first second of the next month.",
        }),
        p("Half-open ranges have three properties that make them the default for every time filter you write:"),
        numbered([
            "**Nothing on the last day is lost**, whatever the precision of the timestamps (seconds, milliseconds, microseconds).",
            "**Consecutive periods tile exactly.** `[Mar 1, Apr 1)` and `[Apr 1, May 1)` share no row and miss no row, so monthly totals add up to the quarter. With inclusive ends, an order at exactly `'2026-04-01 00:00:00'` could land in both months or in neither.",
            "**The end is easy to compute.** For a month, it is `date(:month_start, '+1 month')`; for a day, `date(:day, '+1 day')`. No one has to know whether February has 28 or 29 days.",
        ]),
        callout("tip", "Filter the column, not a function of it",
            "date(ordered_at) BETWEEN '2026-03-01' AND '2026-03-31' also returns the right rows, because date() cuts the time off first. But it runs date() on every row, and the database cannot use an index on ordered_at for a wrapped column. Comparing the raw column with a half-open range is correct and index-friendly."),

        h2("6. CASE: turning values into labels"),
        p("The dashboard bug is about statuses: refunded and cancelled orders were added to revenue. To report them separately, you need a way to look at each row and say which group it belongs to. That is the job of `CASE`. The **searched** form tests conditions from top to bottom and returns the result of the first one that is true:"),
        code("sql", `
SELECT order_id, total_cents,
       CASE
           WHEN total_cents < 3000  THEN 'small'
           WHEN total_cents < 10000 THEN 'medium'
           ELSE 'large'
       END AS size_band
FROM orders
WHERE ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01'
ORDER BY order_id;`, "size-bands.sql"),
        code("text", `
order_id | total_cents | size_band
---------+-------------+----------
6        | 5400        | medium
7        | 2600        | small
8        | 7900        | medium
9        | 18900       | large
10       | 3100        | medium`),
        p("Because the first true branch wins, the second test does not need `total_cents >= 3000 AND`: an order of 2600 never reaches it. The order of the branches is part of the logic. Write them from the narrowest to the widest, or the wide branch swallows everything:"),
        code("sql", `
-- BUG: the wide test comes first
CASE
    WHEN total_cents < 10000 THEN 'medium'
    WHEN total_cents < 3000  THEN 'small'     -- never reached
    ELSE 'large'
END`),
        p("The **simple** form compares one expression with a list of values. It is shorter when you map codes to labels:"),
        code("sql", `
SELECT order_id, status,
       CASE status
           WHEN 'paid'     THEN 'money in'
           WHEN 'refunded' THEN 'money back'
       END AS label
FROM orders
WHERE order_id IN (4, 5, 8, 12)
ORDER BY order_id;`, "simple-case.sql"),
        code("text", `
order_id | status    | label
---------+-----------+-----------
4        | paid      | money in
5        | cancelled | NULL
8        | refunded  | money back
12       | pending   | NULL`),
        p("This CASE has no `ELSE`, and that is the trap: **when no branch matches, CASE returns NULL**. Cancelled and pending orders get no label at all. Always write an `ELSE`, even if it is `ELSE 'other'`, so a status nobody planned for (say, `'disputed'` next year) shows up in the report instead of vanishing into NULL."),
        callout("info", "Simple CASE cannot test for NULL",
            "CASE status WHEN NULL THEN ... never matches, because the simple form compares with =, and NULL = NULL is not true (lesson 1.3). Use the searched form: CASE WHEN status IS NULL THEN ... END."),

        h2("7. Conditional aggregation: one row per month, many columns"),
        p("A CASE inside an aggregate lets one `GROUP BY` compute several filtered numbers at once. Each row contributes to a column only when its condition is true. There are two ways to write it, and SQLite (since 3.30) supports both:"),
        bullets([
            "`SUM(CASE WHEN <condition> THEN <value> ELSE 0 END)` - works in every SQL database.",
            "`COUNT(*) FILTER (WHERE <condition>)` - the SQL-standard `FILTER` clause, also in PostgreSQL. It works with any aggregate: `SUM(total_cents) FILTER (WHERE ...)`.",
        ]),
        code("sql", `
SELECT strftime('%Y-%m', ordered_at)                         AS month,
       COUNT(*)                                              AS all_orders,
       SUM(CASE WHEN total_cents >= 10000 THEN 1 ELSE 0 END) AS large_orders,
       COUNT(*) FILTER (WHERE status = 'cancelled')          AS cancelled_orders,
       COUNT(*) FILTER (WHERE status = 'pending')            AS pending_orders
FROM orders
WHERE ordered_at >= '2026-01-01' AND ordered_at < '2026-05-01'
GROUP BY month
ORDER BY month;`, "orders-per-month.sql"),
        code("text", `
month   | all_orders | large_orders | cancelled_orders | pending_orders
--------+------------+--------------+------------------+---------------
2026-01 | 2          | 0            | 0                | 0
2026-02 | 3          | 1            | 1                | 0
2026-03 | 5          | 1            | 0                | 0
2026-04 | 2          | 0            | 0                | 1`),
        p("The filter lives **inside** each aggregate, not in `WHERE`. A `WHERE status = 'cancelled'` would remove every other order before grouping, and `all_orders` would no longer count all orders. Put in `WHERE` only what is true for the whole report (here, the time period); put each column's own condition in its CASE or FILTER."),
        h3("ELSE 0, or the sum is NULL"),
        p("Inside `SUM`, a CASE without `ELSE` produces NULL for every row that does not match. `SUM` skips NULLs, which looks harmless - until a month has **no** matching row at all. Then every value is NULL, and the sum of nothing but NULLs is NULL, not 0:"),
        code("sql", `
SELECT strftime('%Y-%m', ordered_at)                                   AS month,
       SUM(CASE WHEN status = 'cancelled' THEN total_cents END)        AS cancelled_no_else,
       SUM(CASE WHEN status = 'cancelled' THEN total_cents ELSE 0 END) AS cancelled_cents
FROM orders
WHERE ordered_at >= '2026-01-01' AND ordered_at < '2026-04-01'
GROUP BY month
ORDER BY month;`, "else-zero.sql"),
        code("text", `
month   | cancelled_no_else | cancelled_cents
--------+-------------------+----------------
2026-01 | NULL              | 0
2026-02 | 1800              | 1800
2026-03 | NULL              | 0`),
        p("A NULL cell is not just ugly. Any arithmetic with it is NULL too (`6500 - NULL` is NULL), so a \"net revenue\" column computed from it goes blank, and a spreadsheet that sums the column may treat it differently from 0. `ELSE 0` makes the column a number on every row. (`COALESCE(SUM(...), 0)` also works; lesson 1.3 covers COALESCE.)"),
        h3("Months with no orders disappear"),
        p("`GROUP BY` can only make groups from rows that exist. If a month has no matching orders, it has no row in the result - it does not appear with zeros. Counting refunds per month shows the gap:"),
        code("sql", `
SELECT strftime('%Y-%m', ordered_at) AS month, COUNT(*) AS refunds
FROM orders
WHERE status = 'refunded'
GROUP BY month
ORDER BY month;`, "refunds-per-month.sql"),
        code("text", `
month   | refunds
--------+--------
2026-01 | 1
2026-03 | 1`),
        p("February is missing, not zero. A chart drawn from this result would connect January straight to March. Moving the status test from `WHERE` into a conditional aggregate keeps every month that has **any** order, with 0 refunds. A month with no orders at all still disappears; lesson 2.2 builds a calendar of months with a CTE and joins the numbers to it."),

        h2("8. The fix: a monthly report that reconciles"),
        p("The finance query is fixed with a half-open range (section 5). For a whole period, the end of each month does not even need to be written: group by `strftime('%Y-%m', ordered_at)` and filter the period once with `>= :start AND < :end`. Every order then lands in exactly one month."),
        p("The dashboard needs more than a filter. Simply adding `WHERE status = 'paid'` would make the months add up to the quarter, but finance also needs the refunds - the provider's statement lists them - and ops wants to see months where everything was cancelled. The right shape is **one row per month with one column per kind of money**, so that every number is visible and the columns add up across months. That is your exercise:"),
        challenge("chal_coding_sqlf_142", "Start from the period filter: a half-open range on the raw ordered_at column, with the :start and :end parameters. Then keep every order in that range and let each output column pick its own rows with a CASE or FILTER inside the aggregate. Check a month that has no refunds: its refunded_cents must be 0, not NULL."),
        p("Once the report has separate columns, reconciliation is arithmetic: the sum of `paid_cents` over January to March must equal the paid revenue for `[2026-01-01, 2026-04-01)`, and the provider's statement can be checked month by month. Lesson 3.3 turns that check into Python code that runs before a report is sent."),

        h2("9. PostgreSQL and other databases"),
        bullets([
            "**Real types.** PostgreSQL has `date`, `timestamp` and `timestamptz` (timestamp with time zone; store UTC instants in it). Comparisons are chronological, not textual, and a malformed date is rejected on insert instead of becoming text.",
            "**The BETWEEN bug survives the types.** `ordered_at BETWEEN '2026-03-01' AND '2026-03-31'` casts the upper bound to `'2026-03-31 00:00:00'`, so every order after midnight on 31 March is still lost. Half-open ranges are the rule in every database.",
            "**Month keys.** `date_trunc('month', ordered_at)` returns the first instant of the month (group by it, sort by it); `to_char(ordered_at, 'YYYY-MM')` formats it as text. The next month is `start + interval '1 month'`.",
            "**Time zones.** `ordered_at AT TIME ZONE 'Asia/Ho_Chi_Minh'` converts a `timestamptz` to local time with the correct rules, including daylight saving time where it applies.",
            "**FILTER** works in PostgreSQL and SQLite. MySQL does not support it; use `SUM(CASE ... ELSE 0 END)` there.",
        ]),

        h2("10. Pitfalls to recognise in code review"),
        bullets([
            "`BETWEEN '2026-03-01' AND '2026-03-31'` on a timestamp column: the last day is lost. Rewrite as `>= '2026-03-01' AND < '2026-04-01'`.",
            "**Dates stored in any format other than zero-padded ISO-8601** (`'31/03/2026'`, `'2026-3-5'`): text comparison and sorting are wrong, and date functions return NULL.",
            "`date(x, '+1 month')` on a day after the 28th overflows into the following month. Add months to the first day of a month only.",
            "**Mixing time zones**: a report grouped by UTC month compared with one grouped by local month. Name the time zone in the report.",
            "`CASE` **without** `ELSE`: unmatched rows become NULL labels, and a `SUM` with no matching row becomes NULL instead of 0.",
            "`CASE` **branches in the wrong order**: the first true branch wins, so a wide test placed first hides the narrower ones.",
            "**A status filter in** `WHERE` when the report needs several statuses side by side: it removes rows that other columns (and other months) needed.",
            "**Missing months** in a GROUP BY result are not zeros. Check that the number of rows equals the number of months you expect.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every time filter is half-open: `>= start AND < end`, where end is the first moment of the next period.",
            "Dates are zero-padded ISO-8601 text in UTC; the report states which time zone its months are in.",
            "Months are grouped with `strftime('%Y-%m', ordered_at)` (PostgreSQL: `date_trunc('month', ...)`) and sorted by that key.",
            "Every CASE has an `ELSE`; every conditional `SUM` has `ELSE 0` (or a FILTER plus COALESCE).",
            "`WHERE` holds only what applies to the whole report; each column's own condition is inside its aggregate.",
            "Paid, refunded and cancelled money are separate columns, and the monthly columns add up to the total for the whole period.",
            "You know which months are missing from the result, and whether that matters for the reader.",
        ]),
    ],
});
