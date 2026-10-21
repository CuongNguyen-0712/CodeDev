// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sqlf-3-3",
    title: "From query to answer: sanity checks in Python",
    slug: { _type: "slug", current: "sql-sanity-checks-in-python" },
    description:
        "The \"Q1 revenue by country\" email reached the CEO with countries that added up to more than total revenue, Vietnam listed twice and percentages summing to 112%. Learn to run SQL from Python with sqlite3 and parameters, and to put every result through reconcile, grain, completeness and range checks before a number leaves your laptop.",
    estimatedTime: 25,

    scenario: {
        role: "Junior data analyst, Beanbox (online coffee shop)",
        problem:
            "On Monday morning you emailed the CEO a table of Q1 2026 revenue by country. Ten minutes later she replied: \"The countries add up to $1,400, finance says Q1 was $1,250. Why is Vietnam in there twice? And your percentages add up to 112%.\" Every number came straight from a query that ran without errors. Nothing checked the result before you pressed send.",
    },

    content: [
        h2("1. The incident: a clean query, a wrong email"),
        p("This is the table that went out. It looks like a normal report, and each number is exactly what the query returned:"),
        code("text", `
country   revenue_cents   pct
VN                67000   53.6
DE                30000   24.0
US                25000   20.0
vn                18000   14.4`, "Q1 revenue by country (sent)"),
        p("And this is the query behind it. The analyst joined `payments` to keep \"only orders that were really paid\", grouped by the country column, and divided each country by the total of paid Q1 orders:"),
        code("sql", `
SELECT c.country,
       SUM(o.total_cents) AS revenue_cents,
       ROUND(100.0 * SUM(o.total_cents) / (SELECT SUM(total_cents) FROM orders
                                           WHERE status = 'paid'
                                             AND ordered_at >= :start AND ordered_at < :end), 1) AS pct
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
JOIN payments  p ON p.order_id = o.order_id          -- "only orders that were really paid"
WHERE o.status = 'paid'
  AND o.ordered_at >= :start AND o.ordered_at < :end
GROUP BY c.country
ORDER BY revenue_cents DESC`, "q1_by_country.sql"),
        p("You already know every bug in it. The `payments` join fans out: an order paid in two payments appears twice and its `total_cents` is summed twice (lesson 2.1). One customer typed their country as `'vn '`, and `GROUP BY` treats that text as a different country. The percentages are divided by the correct total, but the numerator is inflated, so they add up to 112. What failed was not your SQL knowledge. It was the last step: **nobody compared the result with anything before it was sent.** This lesson adds that step."),

        h2("2. Reproduce it from Python"),
        p("The Beanbox database for this lesson is tiny: five customers, seven orders, seven payments. Order 101 was paid in two card payments of 7500 cents, order 105 was cancelled, and order 107 was placed on 1 April, after the quarter:"),
        code("text", `
customers                         orders
id  name   country                id   customer  ordered_at           status     total_cents
1   Linh   'VN'                   101  1         2026-01-05 09:12:00  paid       15000
2   Minh   'vn '                  102  2         2026-01-20 14:30:00  paid       18000
3   Anna   'DE'                   103  3         2026-02-11 08:00:00  paid       30000
4   Bob    'US'                   104  4         2026-02-14 19:45:00  paid       25000
5   Carla  'US'                   105  5         2026-03-02 11:05:00  cancelled  12000
                                  106  1         2026-03-31 23:40:00  paid       37000
payments: one per order, except   107  4         2026-04-01 00:10:00  paid        9000
order 101 (2 x 7500 cents)`, "beanbox.db"),
        p("Python's standard library ships with `sqlite3`, so running the incident query takes four lines. `QUERY` is the SQL above, as a string:"),
        code("python", `
import sqlite3

db = sqlite3.connect("beanbox.db")
period = {"start": "2026-01-01", "end": "2026-04-01"}
for row in db.execute(QUERY, period):
    print(row)`, "report.py"),
        code("text", `
('VN', 67000, 53.6)
('DE', 30000, 24.0)
('US', 25000, 20.0)
('vn ', 18000, 14.4)`, "output"),
        p("The paid Q1 orders are 101, 102, 103, 104 and 106: 125000 cents. The rows add up to 140000. The 15000-cent difference is exactly order 101, counted once per payment."),

        h2("3. Running SQL from Python"),
        h3("connect, execute, fetch"),
        bullets([
            "`sqlite3.connect(path)` opens (or creates) a database file and returns a **connection**. `\":memory:\"` gives a throwaway database in RAM, which is what the challenge runner uses.",
            "`db.execute(sql, params)` runs one statement and returns a **cursor**. You can loop over a cursor directly, as above.",
            "`cursor.fetchall()` returns every remaining row as a list of tuples. `cursor.fetchone()` returns the next row, or `None` when there is none - handy for queries that return a single number.",
        ]),
        code("python", `
cur = db.execute("SELECT order_id, status, total_cents FROM orders WHERE status = ? AND total_cents >= ?",
                 ("paid", 25000))
print(cur.fetchall())

print(db.execute("""SELECT COUNT(*), SUM(total_cents) FROM orders
    WHERE status = 'paid' AND ordered_at >= :start AND ordered_at < :end""", period).fetchone())

print(db.execute("SELECT name FROM customers WHERE customer_id = ?", (999,)).fetchone())`, "fetch.py"),
        code("text", `
[(103, 'paid', 30000), (104, 'paid', 25000), (106, 'paid', 37000)]
(5, 125000)
None`, "output"),
        p("Values never go into the SQL text. They go into **placeholders**: `?` takes values by position from a tuple or list, `:name` takes them by name from a dict. Named parameters are easier to read when the same value appears twice, like `:start` and `:end` in a report that filters two tables."),
        callout("warning", "A one-value tuple needs a comma",
            "(1) is just the number 1 in parentheses; (1,) is a tuple. db.execute(\"... WHERE customer_id = ?\", (1)) fails with \"ProgrammingError: parameters are of unsupported type\"."),

        h3("Rows as dicts: row_factory"),
        p("Tuples make you count positions: is `row[2]` the revenue or the percentage? Set `row_factory` to `sqlite3.Row` and every row can also be read by column name. `dict(row)` turns it into a plain dict you can print, compare or serialise as JSON:"),
        code("python", `
db.row_factory = sqlite3.Row
row = db.execute("SELECT order_id, status, total_cents FROM orders WHERE order_id = ?", (101,)).fetchone()
print(row["total_cents"], row[2], row.keys())
print(dict(row))

rows = [dict(r) for r in db.execute(QUERY, period)]
print(rows)`, "rows.py"),
        code("text", `
15000 15000 ['order_id', 'status', 'total_cents']
{'order_id': 101, 'status': 'paid', 'total_cents': 15000}
[{'country': 'VN', 'revenue_cents': 67000, 'pct': 53.6}, {'country': 'DE', 'revenue_cents': 30000, 'pct': 24.0}, {'country': 'US', 'revenue_cents': 25000, 'pct': 20.0}, {'country': 'vn ', 'revenue_cents': 18000, 'pct': 14.4}]`, "output"),
        p("SQLite gives you back Python types: INTEGER becomes `int`, REAL becomes `float`, TEXT becomes `str` and NULL becomes `None`. Dates stay strings, because SQLite stores them as ISO-8601 text (lesson 1.4)."),

        h3("Never build SQL with f-strings"),
        p("It is tempting to paste a value into the SQL with an f-string. Do not. **SQL injection** is when input text changes the meaning of your query, because the database cannot tell your SQL from the text you pasted into it:"),
        code("python", `
country = "VN' OR '1'='1"      # typed into a "filter by country" box
print(db.execute(f"SELECT name FROM customers WHERE country = '{country}'").fetchall())
print(db.execute("SELECT name FROM customers WHERE country = ?", (country,)).fetchall())

country = "Côte d'Ivoire"      # a perfectly honest value
db.execute(f"SELECT name FROM customers WHERE country = '{country}'")`, "injection.py"),
        code("text", `
[('Linh',), ('Minh',), ('Anna',), ('Bob',), ('Carla',)]
[]
sqlite3.OperationalError: near "Ivoire": syntax error`, "output"),
        p("With the f-string, the quote in the input closes the SQL string and `OR '1'='1'` returns every customer. With `?`, the driver sends the value separately and SQLite compares it as one string, quotes and all. The same rule holds for every database driver (psycopg for PostgreSQL writes its placeholders as `%s` or `%(name)s`, but they are still parameters, not string formatting). Placeholders work for **values** only: table and column names cannot be parameters, so if those must vary, pick them from a fixed list in your code."),

        h2("4. Four checks before you send"),
        p("A query that runs is not a query that is right. The fix for the incident is a habit: after the query, run a few cheap checks against the database itself, and send nothing until they all pass."),
        image("report-sanity-pipeline", {
            alt: "Pipeline diagram. A query box (db.execute with the period, rows as dicts) feeds four amber check boxes in a row: 1 Reconcile, the parts add up to a total from a second independent query; 2 Grain, one row per key with no duplicates after trim and upper case; 3 Completeness, no NULL keys and every expected country and month present; 4 Ranges, percentages between 0 and 100 summing to 100 within rounding, counts not negative. If all pass, a green Send box follows. A red fail arrow under each check leads to a red bar: stop, list every failed check, fix the query, send nothing. Below, a red panel shows the incident report failing reconcile (140000 vs 125000 cents), grain (two rows for VN) and ranges (112.0 percent); a green panel shows the fixed query's rows VN 70000, DE 30000, US 25000, summing to 125000 cents and 100.0 percent, with all checks passed.",
            caption: "Each check compares the result with something the query did not produce: a second query, a known key list, or arithmetic.",
        }),

        h3("1. Reconcile: the parts add up to an independent total"),
        p("Compute the total a second way, with a query that is as simple as possible - no joins, no grouping - and compare it with the sum of the report's rows. A fan-out, a filter that drops rows, or a join that loses customers all break this equality. Compare cents as integers, with `==`:"),
        code("python", `
PAID_TOTAL = """
SELECT SUM(total_cents) FROM orders
WHERE status = 'paid' AND ordered_at >= :start AND ordered_at < :end
"""
(reference,) = db.execute(PAID_TOTAL, period).fetchone()
parts = sum(row["revenue_cents"] for row in rows)
print(parts, reference, parts - reference)`, "reconcile.py"),
        code("text", `
140000 125000 15000`, "output"),
        p("The second query must be independent. Dividing each country by the report's own sum, or checking the total with a query that has the same `payments` join, can only confirm the same mistake."),

        h3("2. Grain: one row per key"),
        p("Decide what one row of the report means - here, one country - and check that no key appears twice. Normalise the key the way the business sees it before you count, or `'VN'` and `'vn '` slip through as two \"different\" countries. `collections.Counter` counts in one line:"),
        code("python", `
from collections import Counter

counts = Counter(row["country"].strip().upper() for row in rows)
print(counts)
print([key for key, n in counts.items() if n > 1])`, "grain.py"),
        code("text", `
Counter({'VN': 2, 'DE': 1, 'US': 1})
['VN']`, "output"),
        p("Duplicate keys in a result usually mean one of two things: the data needs cleaning (fix it in the query with `UPPER(TRIM(country))`, and tell whoever owns the signup form), or the query grouped by more columns than the grain."),

        h3("3. Completeness: nothing missing, nothing unexpected"),
        bullets([
            "**No NULL or blank keys.** A LEFT JOIN that found no customer produces a row with country `None`; nobody can act on it.",
            "**Every expected category is present.** Get the expected set from the database (the countries that had paid orders in the period) or from a fixed list, and compare sets: `expected - found` is what is missing, `found - expected` is what is surprising.",
            "**Every expected month is present** in a monthly report. `GROUP BY` never invents a month with no orders (lesson 1.4), so a chart quietly skips it.",
        ]),
        code("python", `
months = [m for (m,) in db.execute("""
    SELECT DISTINCT strftime('%Y-%m', o.ordered_at) FROM orders o
    JOIN customers c ON c.customer_id = o.customer_id
    WHERE o.status = 'paid' AND c.country = 'DE'
      AND o.ordered_at >= :start AND o.ordered_at < :end""", period)]
expected = ["2026-01", "2026-02", "2026-03"]
print(months, [m for m in expected if m not in months])`, "months.py"),
        code("text", `
['2026-02'] ['2026-01', '2026-03']`, "output"),
        p("A \"DE revenue by month\" chart built from this query would have one bar. Whether that is right (Germany only ordered in February) or a bug, a human should decide it before the chart is shared."),

        h3("4. Ranges: values that cannot be true"),
        bullets([
            "Every percentage is between 0 and 100; every count and every revenue that cannot be negative is not.",
            "Percentages of a whole add up to 100 - **within rounding**. Three countries with a third each are reported as 33.3 + 33.3 + 33.3 = 99.9, which is correct. Compare with a tolerance, never with `==`.",
        ]),
        code("python", `
print(sum([33.3, 33.3, 33.3]), sum([33.3, 33.3, 33.3]) == 99.9)
print(round(sum(row["pct"] for row in rows), 1))
print(all(0 <= row["pct"] <= 100 for row in rows))`, "ranges.py"),
        code("text", `
99.89999999999999 False
112.0
True`, "output"),
        p("Floats are binary approximations, so even the sum of three rounded percentages is not exactly 99.9. A rule such as `abs(total - 100) <= 0.5` accepts honest rounding and rejects 112 - and also rejects 100.6, which rounding of a few rows cannot produce. Note that every percentage was in range: a single check would not have caught this report."),

        h3("And one known number"),
        p("Finally, compare one count with a number you trust from somewhere else: the ops dashboard says Q1 had **5 paid orders**. The same count before and after the join is the row-count check from lesson 2.1:"),
        code("python", `
PAID_COUNT = "SELECT COUNT(*) FROM orders WHERE status = 'paid' AND ordered_at >= :start AND ordered_at < :end"
print(db.execute(PAID_COUNT, period).fetchone()[0])
print(db.execute("""SELECT COUNT(*) FROM orders o JOIN payments p ON p.order_id = o.order_id
    WHERE o.status = 'paid' AND o.ordered_at >= :start AND o.ordered_at < :end""", period).fetchone()[0])`, "row_count.py"),
        code("text", `
5
6`, "output"),
        p("5 matches the dashboard, so the period and status filter are right. 6 rows after the join means one order now appears twice - the fan-out, found before any money was summed."),
        challenge("chal_quiz_sqlf_331"),

        h2("5. Make the checks stop the report"),
        p("A check that prints a warning nobody reads is not a check. The report script must **refuse to produce the report** when any check fails. Python's `assert` stops at the first failure:"),
        code("python", `
assert parts == reference, f"countries add up to {parts}, paid orders total {reference}"`, "assert.py"),
        code("text", `
AssertionError: countries add up to 140000, paid orders total 125000`, "output"),
        p("That is fine in a notebook, with two drawbacks for a report script: you only learn about the first problem, and `python -O` removes every `assert`. A more useful shape is a set of small functions that each return a list of problems, and one gate that collects them all:"),
        code("python", `
def check_reconcile(db, rows, period):
    (reference,) = db.execute(PAID_TOTAL, period).fetchone()
    parts = sum(row["revenue_cents"] for row in rows)
    if parts != reference:
        return [f"reconcile: countries add up to {parts} cents, paid orders total {reference}"]
    return []

# check_grain(rows), check_completeness(rows), check_ranges(rows) and
# check_row_count(db, period, expected=5) follow the same pattern.

def find_problems(db, rows, period):
    return (check_reconcile(db, rows, period) + check_grain(rows) + check_completeness(rows)
            + check_ranges(rows) + check_row_count(db, period, expected=5))

problems = find_problems(db, rows, period)
if problems:
    sys.exit("Report NOT sent:\\n  " + "\\n  ".join(problems))
send_report(rows)`, "send_report.py"),
        code("text", `
Report NOT sent:
  reconcile: countries add up to 140000 cents, paid orders total 125000
  grain: more than one row for ['VN']
  ranges: percentages add up to 112.0`, "output"),
        p("Three problems, found in milliseconds, with enough detail to fix the query. Now write the same idea as a reusable function with a precise contract: given the database, the report rows and the period, return the names of the checks that fail."),
        challenge("chal_coding_sqlf_332", "Normalise each country once (None counts as empty, then strip and upper-case) and reuse the keys for the null, duplicate and missing-country checks. Get the reference total and the expected countries with two parameterised queries over the same half-open period, and collect failures in a set so each name appears once. Then think about a quarter with no orders at all: what does SUM return, and what should the percentage check do with zero rows?"),

        h2("6. The fix"),
        p("With the checks in place, fixing the query is quick, and you know when you are done. Drop the `payments` join (`status = 'paid'` already says which orders count), normalise the country in the query, and compute the percentages from the same rows they describe:"),
        code("sql", `
WITH paid AS (
    SELECT o.order_id, o.total_cents, UPPER(TRIM(c.country)) AS country
    FROM orders o
    JOIN customers c ON c.customer_id = o.customer_id
    WHERE o.status = 'paid'
      AND o.ordered_at >= :start AND o.ordered_at < :end
)
SELECT country,
       SUM(total_cents) AS revenue_cents,
       ROUND(100.0 * SUM(total_cents) / (SELECT SUM(total_cents) FROM paid), 1) AS pct
FROM paid
GROUP BY country
ORDER BY revenue_cents DESC, country`, "q1_by_country.sql"),
        code("text", `
{'country': 'VN', 'revenue_cents': 70000, 'pct': 56.0}
{'country': 'DE', 'revenue_cents': 30000, 'pct': 24.0}
{'country': 'US', 'revenue_cents': 25000, 'pct': 20.0}
All checks passed: sending 3 rows`, "output"),
        p("125000 cents, 100.0%, one row per country. The CEO gets a corrected table and one sentence on what changed: \"order 101 was counted once per payment, and Vietnam was split by a typo in a customer's country\"."),
        callout("info", "The same checks in pandas",
            "Most analysts load results into pandas: pd.read_sql_query(sql, db, params=period) returns a DataFrame. The checks translate one to one: df[\"revenue_cents\"].sum() == reference, df[\"country\"].str.strip().str.upper().duplicated().any(), df[\"country\"].isna().any(), df[\"pct\"].between(0, 100).all(). The idea matters more than the library; the challenge uses only the standard library."),

        h2("7. Pitfalls"),
        bullets([
            "**Checking a result against itself.** Percentages divided by the report's own total always add up to about 100. Reconcile against a second, simpler query.",
            "**`==` on floats.** Sums of rounded percentages are approximations; use a tolerance. Keep money in integer cents so the total can be compared exactly.",
            "**Empty periods.** `SUM` over no rows is NULL, which Python receives as `None`, and an empty report's percentages add up to 0, not 100. Decide what an empty report should look like before a quiet month surprises you.",
            "**Comparing raw keys.** `'VN'`, `'vn '` and `' VN'` are three strings and one country. Normalise before counting duplicates or comparing sets.",
            "**f-strings and `%` formatting in SQL.** One quote in a name breaks the query; a crafted value rewrites it. Use `?` or `:name` placeholders.",
            "**`assert` as the only gate.** It stops at the first problem and disappears with `python -O`. Collect problems and exit with a non-zero status.",
            "**Checks that nobody runs.** Put them in the script that produces the report, not in a separate notebook.",
        ]),

        h2("8. Checklist"),
        bullets([
            "The query runs from a script with `sqlite3`, values passed as `?` or `:name` parameters.",
            "Rows are read by name (`row_factory = sqlite3.Row`, `dict(row)`), not by position.",
            "The parts add up, in integer cents, to a total from an independent query.",
            "No key appears twice after normalisation; no key is NULL or blank.",
            "Every expected category and month is present, and nothing unexpected appeared.",
            "Percentages are within 0-100 and sum to 100 within rounding; counts are not negative.",
            "At least one count matches a number you trust from another source.",
            "Any failed check stops the report and lists every problem.",
        ]),

        h2("9. What you can do now"),
        p("This was the last lesson of the course. Every lesson started with a number that someone at Beanbox did not believe, and every fix was a habit you can now apply on your own:"),
        numbered([
            "**SELECT, WHERE & the order clauses run in:** filter correctly, with parentheses around OR, and know why an alias cannot be used in WHERE.",
            "**Aggregates & GROUP BY:** count the right thing (`COUNT(*)`, `COUNT(col)`, `COUNT(DISTINCT col)`) at the right grain, and filter groups with HAVING.",
            "**NULLs:** use `IS NULL`, `COALESCE` and `NULLIF`, and spot the filters and averages that silently drop NULL rows.",
            "**Dates & CASE:** use half-open date ranges and conditional aggregation for monthly reports that add up.",
            "**Joins without double counting:** check row counts around every join and pre-aggregate before joining one-to-many tables.",
            "**Subqueries & CTEs:** build an analysis in named steps that a reviewer can check one by one.",
            "**Window functions:** running totals, rankings, top-N per group and month-over-month change, without collapsing rows.",
            "**Cohorts & retention:** group customers by first order month and divide by the right denominator.",
            "**Sanity checks in Python:** run the query from code with parameters, and send nothing until reconcile, grain, completeness and range checks pass.",
        ]),
        p("Next time a number looks surprising, you know where to look first: the grain, the joins, the NULLs and the date boundaries - and you have a script that checks them before anyone else has to."),
    ],
});
