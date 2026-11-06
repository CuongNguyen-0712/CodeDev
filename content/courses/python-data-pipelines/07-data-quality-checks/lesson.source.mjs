// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pdp-3-1",
    title: "Data quality checks as code",
    slug: { _type: "slug", current: "data-pipelines-data-quality-checks" },
    description:
        "A broken export reached Rice Rocket's finance dashboard: 30% of delivered orders with a total of 0, and a check that fired only after the rows were published. Learn which checks catch broken data (keys, values, references, volume), how severity decides what blocks a load, and how write-audit-publish keeps a bad night away from the dashboards.",
    estimatedTime: 16,

    scenario: {
        role: "Data engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The restaurant system's export broke one night. The load copied it into the reporting table, the dashboards showed revenue down 30% at 08:00, and two managers escalated before anyone looked at the data. The existing tests (not_null and unique on the keys) all passed.",
    },

    content: [
        h2("Situation"),
        code("text", `
02:10  nightly_load: inserted 20,412 rows into orders (committed)
02:11  check delivered_total_positive: FAILED, 6,180 rows
02:11  check not_null(order_id): passed      check unique(order_id): passed
08:00  dashboard "Revenue by day": 2026-11-05  -30% vs last Thursday
08:40  finance escalates; data team starts looking at 09:15`, "pipeline log"),
        bullets([
            "The only check that saw the problem ran after the commit, on the table the dashboards read.",
            "The key tests passed: a total of 0 is neither missing nor duplicated.",
            "Nothing said whether a failing check should stop the load or only warn, so nobody had made the call at 02:11.",
        ]),

        h2("The core you need"),
        bullets([
            "**A check is a query that counts bad rows.** 0 means pass. Writing checks as SQL (or dbt tests, Great Expectations / Soda rules) keeps them in the repository next to the pipeline, reviewed and versioned like code.",
            "**Four families catch most breakage.** Completeness (required columns present), uniqueness (no repeated key in the batch, and none already published), validity (values in range: a delivered order has a positive total; status in a known set), and references (every restaurant exists in `dim_restaurant`).",
            "**Volume and distribution catch what row rules miss.** A night with half the usual rows passes every row rule. Compare with a robust baseline, such as the median of the last 7 business days, not with yesterday: one promotion day would otherwise trigger an alert the next night.",
            "**Severity is a decision made in advance.** `error` blocks publishing (the data would be wrong); `warn` publishes and alerts (the data is probably right but unusual). Decide per check, before the night it fires.",
            "**Write, audit, publish.** Load into staging (or an unexposed partition), run the checks there, and publish only a batch without error failures. On a failing night the dashboards keep yesterday's correct data, and the alert explains why today is missing.",
        ]),

        h2("Apply it in the project"),
        p("Checks are data: a name, a severity and one query. The load audits staging and publishes in one transaction:"),
        code("python", `
CHECKS = [
    {"name": "required-columns", "severity": "error", "sql": """
        SELECT COUNT(*) FROM staging_orders
        WHERE order_id IS NULL OR restaurant_id IS NULL OR placed_at IS NULL"""},
    {"name": "delivered-total", "severity": "error", "sql": """
        SELECT COUNT(*) FROM staging_orders
        WHERE status = 'delivered' AND (total_vnd IS NULL OR total_vnd <= 0)"""},
    # ... unique-order-id, known-restaurant, volume (warn)
]


def nightly_load(db, export_rows, batch_day):
    with db:
        db.execute("DELETE FROM staging_orders")
        db.executemany("INSERT INTO staging_orders VALUES (?, ?, ?, ?, ?)", export_rows)
    results = audit(db, batch_day)
    decision = decide(results)
    if decision["publish"]:
        with db:
            db.execute("INSERT INTO orders SELECT * FROM staging_orders")
    notify(decision)          # errors page the on-call engineer, warnings go to #data-alerts
    return decision`, "pipelines/order_checks.py"),
        p("The same rules in dbt, for a warehouse that runs the models:"),
        code("yaml", `
models:
  - name: stg_orders
    columns:
      - name: order_id
        tests: [not_null, unique]
      - name: restaurant_id
        tests:
          - not_null
          - relationships: { to: ref('dim_restaurant'), field: restaurant_id }
      - name: total_vnd
        tests:
          - dbt_utils.expression_is_true:
              expression: "> 0"
              config: { where: "status = 'delivered'", severity: error }`, "models/staging/stg_orders.yml"),
        callout("info", "Quarantine or block?",
            "Some teams publish the good rows and move the failing ones to a quarantine table. That works when rows are independent (events); for orders, publishing 70% of a night makes every daily total wrong, so blocking the whole batch is the safer default."),

        h2("Verify"),
        code("bash", `
python -m pipelines.order_checks --day 2026-11-08 --export exports/orders-2026-11-08.csv
# required-columns   0
# unique-order-id    0
# delivered-total    6180   ERROR
# known-restaurant   0
# volume             0
# decision: NOT published (errors: delivered-total); dashboards keep 2026-11-07
sqlite3 warehouse.db "SELECT MAX(date(placed_at, '+7 hours')) FROM orders"
# 2026-11-07`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Checking only the batch for duplicates.** An export that re-sends yesterday's order passes `GROUP BY order_id HAVING COUNT(*) > 1` inside the batch. Also look for each order id in the published table.",
            "**Warnings that block.** If every failure stops the load, a quiet Sunday night with low volume leaves the dashboards empty on Monday. Keep volume and distribution checks as warnings unless the drop is so large that the data must be wrong.",
            "**Checks nobody owns.** An alert that goes to a channel nobody reads at 02:11 is the same as no check. Route error failures to the on-call rota, and review warnings weekly to retire noisy ones.",
        ]),

        challenge("chal_quiz_pdp_171"),
        p("Now write the audit. The editor holds the checks module with its key pieces missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the old pipeline's mistakes on purpose. Run audits several nights in SQLite (a normal one, the broken export, a re-sent order, a thin night, the night after a promotion) and prints each check, the decision and how many orders were published."),
        challenge("chal_coding_pdp_172"),
    ],
});
