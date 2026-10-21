// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sqlf-1-3",
    title: "NULLs: the three-valued logic trap",
    slug: { _type: "slug", current: "nulls-three-valued-logic-trap" },
    description:
        "Marketing's dashboard says 412 customers came from ads and 655 did not, but Beanbox has 1,240 customers; a filter that excludes \"ads and unknown\" returns nobody, and the coupon usage tile shows 100%. Learn what NULL means, how three-valued logic decides which rows WHERE keeps, why NOT IN breaks on a NULL, how aggregates skip NULLs, and how IS NULL, IS NOT, COALESCE, NULLIF and NOT EXISTS make the numbers add up again.",
    estimatedTime: 22,

    scenario: {
        role: "Junior data analyst, Beanbox (online coffee shop)",
        problem:
            "Before the Monday marketing meeting, Linh, the marketing lead, checks the acquisition dashboard. \"From ads\" says 412 customers and \"Not from ads\" says 655, but the company has 1,240 customers: 173 people belong to neither tile. When she sets the channel filter to \"exclude ads and (unknown)\", the customer list is empty. The \"coupon usage rate\" tile shows 100%, although finance says only about a third of the orders used a coupon. And the \"safe coupons\" report, which marketing uses to pick the coupons to renew, came back with no rows at all. Every query runs without an error.",
    },

    content: [
        h2("1. The incident: numbers that do not add up"),
        p("Linh sends you the queries behind the three tiles and the filter. Each one looks correct when you read it aloud:"),
        code("sql", `
-- Tile "From ads"
SELECT COUNT(*) AS from_ads FROM customers WHERE referral_source = 'ads';

-- Tile "Not from ads"
SELECT COUNT(*) AS not_from_ads FROM customers WHERE referral_source <> 'ads';

-- Filter "exclude channels: ads, (unknown)" - the BI tool puts NULL in the list for (unknown)
SELECT customer_id, name FROM customers WHERE referral_source NOT IN ('ads', NULL);

-- Tile "Coupon usage rate" (1.0 is shown as 100%)
SELECT AVG(CASE WHEN coupon_code IS NOT NULL THEN 1.0 END) AS coupon_rate FROM orders;`, "acquisition_dashboard.sql"),
        p("There is no typo here and no error message. Every wrong number comes from one thing: some customers have no `referral_source` and most orders have no `coupon_code`. Those cells hold **NULL**, and NULL does not behave like a value. It changes how comparisons, filters and aggregates work."),

        h2("2. Reproduce it with ten customers"),
        p("You do not need the production database. Ten customers and eight orders are enough to see every symptom. Three customers signed up before the sign-up form asked \"How did you hear about us?\", so their `referral_source` is NULL:"),
        code("text", `
customer_id  name  referral_source
-----------  ----  ---------------
1            An    ads
2            Ben   friend
3            Chi   NULL
4            Dana  search
5            Eli   ads
6            Fay   NULL
7            Gus   friend
8            Hoa   ads
9            Ivy   NULL
10           Jon   search`),
        p("Run the dashboard queries on this table (SQLite, as everywhere in this course):"),
        code("text", `
from_ads        -> 3
not_from_ads    -> 4
total customers -> 10

NOT IN ('ads', NULL) -> (0 rows)

coupon_rate -> 1.0      (but only 3 of the 8 orders used a coupon)`),
        p("Three plus four is seven, not ten. The three missing customers are exactly the three with a NULL source. A `GROUP BY` shows them, because grouping puts all NULLs into one group:"),
        code("sql", `
SELECT referral_source, COUNT(*) AS customers
FROM customers
GROUP BY referral_source
ORDER BY customers DESC, referral_source;`, "by_source.sql"),
        code("text", `
referral_source  customers
---------------  ---------
NULL             3
ads              3
friend           2
search           2`),

        h2("3. What NULL means"),
        p("NULL is a marker for **\"no value here\"**: the value is unknown, missing or does not apply. It is not the text `'NULL'`, not an empty string `''` and not the number 0. In the Beanbox schema, NULL has a meaning in every nullable column:"),
        bullets([
            "`customers.referral_source` is NULL when we do not know how the customer found us.",
            "`orders.coupon_code` is NULL when the order used no coupon.",
            "`subscriptions.cancelled_on` is NULL while the subscription is still active.",
        ]),
        p("Because NULL means \"unknown\", almost every operation that touches it returns NULL as well. If you do not know a value, you do not know the value plus 100, and you do not know whether it equals anything:"),
        code("sql", `
SELECT NULL = NULL       AS null_eq_null,
       NULL <> 'ads'     AS null_ne_ads,
       'friend' <> 'ads' AS friend_ne_ads,
       NULL + 100        AS null_plus_100,
       'VN-' || NULL     AS concat_null;`, "null_basics.sql"),
        code("text", `
null_eq_null  null_ne_ads  friend_ne_ads  null_plus_100  concat_null
------------  -----------  -------------  -------------  -----------
NULL          NULL         1              NULL           NULL`),
        p("SQLite has no separate boolean type: a true comparison returns 1, a false one returns 0, and an unknown one returns NULL. PostgreSQL prints `t`, `f` and an empty cell, but the logic is the same."),

        h2("4. Three-valued logic: TRUE, FALSE and UNKNOWN"),
        p("In most programming languages a condition is true or false. In SQL a condition can also be **UNKNOWN**, which is what a comparison with NULL produces. `AND`, `OR` and `NOT` have rules for UNKNOWN, and they follow one idea: if the unknown value could change the answer, the answer is UNKNOWN; if it could not, the answer is known."),
        bullets([
            "`FALSE AND UNKNOWN` is FALSE: whatever the unknown value is, AND cannot be true.",
            "`TRUE OR UNKNOWN` is TRUE: one true side is enough for OR.",
            "`TRUE AND UNKNOWN` and `FALSE OR UNKNOWN` are UNKNOWN: the answer depends on the missing value.",
            "`NOT UNKNOWN` is UNKNOWN. Negating a condition does not bring the NULL rows back.",
        ]),
        p("Then comes the rule that explains the dashboard: **WHERE keeps a row only when the condition is TRUE.** FALSE and UNKNOWN are both thrown away, without a warning. The same is true for `HAVING` and for the `ON` condition of a join."),
        image("three-valued-logic", {
            alt: "Diagram with three truth tables on top: a AND b, a OR b and NOT a, each for the values TRUE, FALSE and UNKNOWN, with TRUE cells in green, FALSE in red and UNKNOWN in amber. FALSE AND UNKNOWN is FALSE, TRUE OR UNKNOWN is TRUE, NOT UNKNOWN is UNKNOWN. Below, a red panel evaluates WHERE referral_source <> 'ads' for three rows: 'friend' gives TRUE and is kept, 'ads' gives FALSE and is dropped, NULL gives UNKNOWN and is dropped silently; a last line shows that x NOT IN ('ads', NULL) equals x <> 'ads' AND x <> NULL and is never TRUE. A green panel lists tests that are never UNKNOWN: IS NULL, SQLite's IS NOT, IS DISTINCT FROM, and NOT EXISTS instead of NOT IN.",
            caption: "A filter has three possible outcomes per row, and only TRUE survives. Rows whose test is UNKNOWN disappear from the result without any error.",
        }),
        p("You can watch it happen row by row. For Chi, whose source is NULL, the test is neither true nor false:"),
        code("sql", `
SELECT name, referral_source,
       referral_source <> 'ads' AS "<> 'ads'"
FROM customers
WHERE customer_id IN (1, 2, 3);`, "row_by_row.sql"),
        code("text", `
name  referral_source  <> 'ads'
----  ---------------  --------
An    ads              0
Ben   friend           1
Chi   NULL             NULL`),
        p("So \"not from ads\" (`<> 'ads'`) and \"from ads\" (`= 'ads'`) are not complements. Together they cover only the rows with a known source. Before you trust a count that has a NOT in it, work out what each filter does to the NULL rows."),
        challenge("chal_quiz_sqlf_131", "For every row, write down TRUE, FALSE or UNKNOWN before you count anything. WHERE keeps only TRUE, and NOT does not turn UNKNOWN into TRUE. For NOT IN, expand the list into a chain of <> comparisons joined by AND."),

        h2("5. Testing for NULL: IS NULL, IS NOT and IS DISTINCT FROM"),
        p("Since `x = NULL` is UNKNOWN for every row, it can never find the NULLs. This query counts nothing, although three customers have no source:"),
        code("sql", `
SELECT COUNT(*) AS unknown_source FROM customers WHERE referral_source = NULL;   -- 0, always
SELECT COUNT(*) AS unknown_source FROM customers WHERE referral_source IS NULL;  -- 3`, "is_null.sql"),
        p("`IS NULL` and `IS NOT NULL` are the only correct way to ask \"is the value missing?\". They always return TRUE or FALSE, never UNKNOWN."),
        h3("Null-safe comparison"),
        p("Often you want \"is different from 'ads', and a missing value counts as different\". There are three ways to write it, and on the ten customers all three return 7:"),
        code("sql", `
-- 1. Say it explicitly (works in every database)
WHERE referral_source <> 'ads' OR referral_source IS NULL

-- 2. SQLite: IS and IS NOT compare like = and <>, but treat NULL as a normal value
WHERE referral_source IS NOT 'ads'

-- 3. Standard SQL, PostgreSQL and SQLite 3.39+
WHERE referral_source IS DISTINCT FROM 'ads'`, "null_safe.sql"),
        bullets([
            "`a IS DISTINCT FROM b` is TRUE when exactly one side is NULL, FALSE when both are NULL, and the same as `a <> b` otherwise. `IS NOT DISTINCT FROM` is the null-safe `=`.",
            "In SQLite, `IS` and `IS NOT` accept any value on the right, not only NULL. PostgreSQL does not allow `x IS 'ads'`; use `IS DISTINCT FROM` there.",
            "Pick the form your team reads most easily, but decide on purpose: sometimes \"unknown\" really should be excluded, and then plain `<>` plus a comment is the honest query.",
        ]),

        h2("6. NOT IN and the NULL in the list"),
        p("`x IN (a, b)` is shorthand for `x = a OR x = b`, and `x NOT IN (a, b)` is shorthand for `x <> a AND x <> b`. Now put a NULL in the list, as the BI tool did when Linh picked \"(unknown)\":"),
        code("sql", `
SELECT 'friend' NOT IN ('ads', NULL)          AS not_in,
       'friend' <> 'ads' AND 'friend' <> NULL AS expanded,
       'ads'    NOT IN ('ads', NULL)          AS ads_not_in;`, "not_in_null.sql"),
        code("text", `
not_in  expanded  ads_not_in
------  --------  ----------
NULL    NULL      0`),
        p("For `'friend'`, the first comparison is TRUE but the second is UNKNOWN, and `TRUE AND UNKNOWN` is UNKNOWN. For `'ads'`, the first comparison is FALSE, so the result is FALSE. No value can make the whole condition TRUE, so **a NOT IN list that contains a NULL returns no rows at all**. `IN` is safer here: when one comparison in the list matches, the OR is TRUE and the NULL in the list does not matter."),
        p("The list does not have to be typed by hand. The same thing happens with a subquery: `WHERE x NOT IN (SELECT some_column FROM ...)` returns nothing as soon as one row of the subquery has a NULL in `some_column`. That is the usual way this bug reaches production: the query works for months, then one row with a NULL arrives and a report goes empty."),
        h3("NOT EXISTS: ask about rows, not about a list of values"),
        p("`NOT EXISTS (subquery)` is TRUE when the subquery returns no row. It never compares the outer value with a list, so a NULL somewhere in the other table cannot make it UNKNOWN. This query lists customers who have never used a coupon:"),
        code("sql", `
SELECT c.customer_id, c.name
FROM customers AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.customer_id = c.customer_id   -- an order of this customer...
      AND o.coupon_code IS NOT NULL        -- ...that used a coupon
)
ORDER BY c.customer_id;`, "never_used_coupon.sql"),
        code("text", `
customer_id  name
-----------  ----
2            Ben
3            Chi
4            Dana
6            Fay
7            Gus
9            Ivy
10           Jon`),
        p("Read the subquery as a question about one outer row at a time: \"is there an order of this customer that used a coupon?\". Customers with no orders at all (Dana, Gus, Jon) are correctly included. Lesson 2.2 covers subqueries like this one in depth."),
        callout("warning", "NOT EXISTS keeps the outer NULLs",
            "Inside a NOT EXISTS, a condition such as o.coupon_code = x.coupon_code is never TRUE when x.coupon_code is NULL, so the subquery finds nothing and NOT EXISTS is TRUE: rows whose own value is NULL pass the filter. If those rows must not be in the result, exclude them with IS NOT NULL in the outer WHERE."),
        p("For the filter in the incident, the fix is to say what the two choices mean: \"(unknown)\" is not a value to compare with, it is the `IS NULL` test."),
        code("sql", `
SELECT customer_id, name
FROM customers
WHERE referral_source <> 'ads'      -- 'ads' is excluded
  AND referral_source IS NOT NULL;  -- (unknown) is excluded`, "exclude_ads_and_unknown.sql"),
        code("text", `
customer_id  name
-----------  ----
2            Ben
4            Dana
7            Gus
10           Jon`),

        h2("7. Aggregates skip NULLs"),
        p("Lesson 1.2 showed that `COUNT(*)` counts rows while `COUNT(col)` counts non-NULL values. The same rule holds for every aggregate: `SUM`, `AVG`, `MIN`, `MAX` and `COUNT(col)` ignore NULL inputs."),
        code("sql", `
SELECT COUNT(*)                        AS all_rows,
       COUNT(referral_source)          AS with_source,
       COUNT(DISTINCT referral_source) AS sources
FROM customers;`, "counts.sql"),
        code("text", `
all_rows  with_source  sources
--------  -----------  -------
10        7            3`),
        h3("The AVG denominator"),
        p("`AVG(x)` is `SUM(x) / COUNT(x)`: the NULLs are left out of the sum **and** out of the count. That is why the coupon tile showed 100%. A `CASE` without `ELSE` returns NULL when no branch matches, so the orders without a coupon became NULL, and AVG averaged only the 1.0 values:"),
        code("sql", `
SELECT AVG(CASE WHEN coupon_code IS NOT NULL THEN 1.0 END)        AS wrong_rate,
       AVG(CASE WHEN coupon_code IS NOT NULL THEN 1.0 ELSE 0 END) AS coupon_rate,
       ROUND(100.0 * COUNT(coupon_code) / COUNT(*), 1)            AS coupon_pct
FROM orders;`, "coupon_rate.sql"),
        code("text", `
wrong_rate  coupon_rate  coupon_pct
----------  -----------  ----------
1.0         0.375        37.5`),
        p("Skipping NULLs is not always a bug. It is exactly what you want when NULL means \"not part of this average\". Here the second column is the average value of the paid orders that used a coupon, and the NULLs are the orders that did not:"),
        code("sql", `
SELECT ROUND(AVG(total_cents))                                            AS avg_order_cents,
       ROUND(AVG(CASE WHEN coupon_code IS NOT NULL THEN total_cents END)) AS avg_coupon_order_cents
FROM orders
WHERE status = 'paid';`, "avg_coupon_order.sql"),
        code("text", `
avg_order_cents  avg_coupon_order_cents
---------------  ----------------------
2833.0           3583.0`),
        p("The question to ask every time: **what is the denominator supposed to be?** All orders (use `ELSE 0`, or `COUNT(*)`), or only the orders the NULLs leave out (let AVG skip them)?"),
        h3("SUM of nothing is NULL"),
        p("When no row matches, or every input is NULL, `SUM`, `AVG`, `MIN` and `MAX` return NULL, while `COUNT` returns 0. A dashboard then shows an empty tile, and arithmetic with that tile gives NULL again. Beanbox has no cancelled orders in the sample:"),
        code("sql", `
SELECT SUM(total_cents)              AS sum_cents,
       COALESCE(SUM(total_cents), 0) AS sum_or_zero,
       TOTAL(total_cents)            AS total_real,
       COUNT(*)                      AS orders
FROM orders
WHERE status = 'cancelled';`, "sum_of_nothing.sql"),
        code("text", `
sum_cents  sum_or_zero  total_real  orders
---------  -----------  ----------  ------
NULL       0            0.0         0`),
        p("`TOTAL()` is a SQLite-only aggregate that returns 0.0 instead of NULL, but it always returns a REAL (floating-point) number, which you do not want for cents. `COALESCE(SUM(...), 0)` works in every database and keeps the integer."),

        h2("8. COALESCE and NULLIF"),
        p("Two small functions turn NULL into a value and a value into NULL."),
        bullets([
            "`COALESCE(a, b, c)` returns the first argument that is not NULL. Use it to give NULL a label or a default in the output.",
            "`NULLIF(a, b)` returns NULL when `a = b`, and `a` otherwise. Use it to turn a special value (0, `''`) into NULL on purpose.",
        ]),
        p("A channel report where the unknown customers have a name, so the rows add up to the total:"),
        code("sql", `
SELECT COALESCE(referral_source, 'unknown') AS channel,
       COUNT(*)                             AS customers
FROM customers
GROUP BY channel
ORDER BY customers DESC, channel;`, "channels.sql"),
        code("text", `
channel  customers
-------  ---------
ads      3
unknown  3
friend   2
search   2`),
        callout("info", "Label NULLs in the output, not in the filter",
            "COALESCE(referral_source, 'unknown') is good for display and grouping. Inside a WHERE it hides intent and stops the database from using an index on the column. Prefer IS NULL or IS NOT / IS DISTINCT FROM there."),
        h3("NULLIF against division by zero"),
        p("A ratio needs a denominator that can be 0: the coupon share on a day without orders, the conversion rate of a channel with no visitors. SQLite returns NULL for a division by zero; PostgreSQL stops the whole query with `ERROR: division by zero`. `NULLIF(denominator, 0)` gives the same, portable answer in both: NULL, which means \"no data\"."),
        code("sql", `
SELECT COUNT(*)                                                   AS orders,
       100.0 * COUNT(coupon_code) / COUNT(*)                      AS pct_raw,     -- NULL in SQLite, an error in PostgreSQL
       ROUND(100.0 * COUNT(coupon_code) / NULLIF(COUNT(*), 0), 1) AS coupon_pct
FROM orders
WHERE ordered_at >= '2026-03-31' AND ordered_at < '2026-04-01';`, "coupon_share_one_day.sql"),
        code("text", `
orders  pct_raw  coupon_pct
------  -------  ----------
0       NULL     NULL`),
        p("Do not wrap that result in `COALESCE(..., 0)` just to fill the tile: 0% says \"nobody used a coupon\", while NULL says \"there was nothing to measure\". Those are different statements to a reader."),
        p("NULLIF also cleans data where a missing value was stored as an empty string. `COALESCE(NULLIF(TRIM(referral_source), ''), 'unknown')` treats `NULL`, `''` and `'  '` the same way."),

        h2("9. NULLs in ORDER BY"),
        p("A sort needs a place for NULLs, and databases disagree. **SQLite and MySQL put NULLs first in ascending order** (and last in descending order); **PostgreSQL and Oracle put them last** in ascending order. The same query can therefore show a different top row on another database:"),
        code("sql", `
SELECT name, referral_source FROM customers ORDER BY referral_source, name;`, "sort.sql"),
        code("text", `
name  referral_source
----  ---------------
Chi   NULL
Fay   NULL
Ivy   NULL
An    ads
Eli   ads
...`),
        p("Write `NULLS FIRST` or `NULLS LAST` when the position matters. SQLite supports both since version 3.30, and PostgreSQL always has: `ORDER BY referral_source NULLS LAST, name` puts Chi, Fay and Ivy at the bottom in both databases. Note also that the `GROUP BY` output in section 2 listed the NULL group before `ads`, for the same reason: the tie on `customers` was broken by `referral_source` ascending."),

        h2("10. The fix"),
        p("The repaired dashboard says what each tile means for the customers with an unknown source, and it checks itself: the tiles must add up to the total."),
        code("sql", `
SELECT SUM(CASE WHEN referral_source = 'ads'      THEN 1 ELSE 0 END) AS from_ads,
       SUM(CASE WHEN referral_source IS NOT 'ads' THEN 1 ELSE 0 END) AS not_from_ads,
       COUNT(*)                                                     AS total
FROM customers;`, "acquisition_tiles.sql"),
        code("text", `
from_ads  not_from_ads  total
--------  ------------  -----
3         7             10`),
        bullets([
            "\"Not from ads\" uses the null-safe `IS NOT 'ads'` (in PostgreSQL: `IS DISTINCT FROM 'ads'`), so 3 + 7 = 10. The dashboard also gets an \"unknown\" tile built with `COALESCE`, because marketing wants to see how big that group is.",
            "The channel filter translates \"(unknown)\" into `referral_source IS NULL` / `IS NOT NULL` instead of putting NULL into an IN list.",
            "The coupon usage tile divides by all orders: `ELSE 0` in the CASE, or `COUNT(coupon_code)` over `NULLIF(COUNT(*), 0)`. It now shows 37.5% on the sample.",
        ]),
        p("One query is left: the \"safe coupons\" report, which lists the coupons used on paid orders and never on a refunded order. It is built on `NOT IN (subquery)`, and this month one refunded order had no coupon. Fix it, and make sure orders without a coupon can never appear as a coupon, whatever the refunded orders look like:"),
        challenge("chal_fix_sqlf_132", "First work out what the subquery returns when one refunded order has no coupon, and what NOT IN does with that list. Then think about the rows whose own coupon_code is NULL: what happens to them when there are no refunds at all, or when you switch to NOT EXISTS? The requirements say they must never be listed, so say that explicitly in the WHERE."),

        h2("11. Pitfalls to recognise in code review"),
        bullets([
            "**`= NULL` and `<> NULL` are always UNKNOWN.** A filter that uses them silently matches no rows. Only `IS NULL` / `IS NOT NULL` test for a missing value.",
            "**`NOT (condition)` does not bring NULL rows back.** `NOT (referral_source = 'ads')` returns the same rows as `referral_source <> 'ads'`.",
            "**NOT IN with a subquery is a time bomb** on any nullable column: one NULL row and the result is empty. Use NOT EXISTS, or add `WHERE col IS NOT NULL` inside the subquery.",
            "**An empty NOT IN list matches everything, NULLs included.** `x NOT IN (subquery that returns no rows)` is TRUE even when `x` is NULL, because there is nothing to compare with.",
            "**CASE treats UNKNOWN like FALSE.** In `CASE WHEN referral_source = 'ads' THEN 'paid' ELSE 'organic' END`, the customers with an unknown source land in `'organic'`. Add a `WHEN referral_source IS NULL THEN 'unknown'` branch first if they deserve their own bucket.",
            "**A CASE without ELSE returns NULL**, which `AVG` then skips: the denominator shrinks to the matching rows only.",
            "**`COUNT(col)` is not the number of rows.** Use `COUNT(*)` for rows and `COUNT(col)` only when you mean \"rows where col is known\".",
            "**Joins drop NULL keys.** `ON a.code = b.code` is UNKNOWN when either side is NULL, so those rows never match. Lesson 2.1 looks at joins in detail.",
        ]),

        h2("12. Checklist"),
        bullets([
            "For every nullable column in the query, you know what NULL means there (unknown, not used, not yet).",
            "Every filter with `<>`, `NOT`, `NOT IN` or `NOT LIKE` has been checked for what it does to NULL rows, and the choice is visible in the SQL (`IS NULL`, `IS NOT`, `IS DISTINCT FROM`).",
            "No `= NULL` or `<> NULL` anywhere.",
            "Anti-joins use `NOT EXISTS`, or the NOT IN subquery filters out NULLs explicitly.",
            "Every `AVG` and every ratio has the denominator you intended; CASE expressions inside aggregates have an `ELSE`.",
            "Ratios use `NULLIF(denominator, 0)`; NULL results are shown as \"no data\", not silently turned into 0.",
            "Report rows that split a total into buckets add up to that total (an \"unknown\" bucket via `COALESCE` is part of the report).",
            "Any `ORDER BY` on a nullable column says `NULLS FIRST` or `NULLS LAST` when the order matters.",
        ]),
    ],
});
