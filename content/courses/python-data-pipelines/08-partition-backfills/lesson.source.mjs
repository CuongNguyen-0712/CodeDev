// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pdp-3-2",
    title: "Partitioning and backfills",
    slug: { _type: "slug", current: "data-pipelines-partitioning-backfills" },
    description:
        "A commission rate fix needed October recomputed; the first backfill doubled October and the nightly job had been cutting days at UTC midnight. Learn to partition a fact table by business day, make one run own one partition so reruns are safe, backfill a range, and reprocess a few days for late data.",
    estimatedTime: 15,

    scenario: {
        role: "Data engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "fact_commission feeds the monthly restaurant invoices. A rate bug (15% instead of 18%) was fixed on Nov 3 and finance asked for October to be recomputed before invoicing. The backfill script appended its results, so October's commission doubled in the invoice preview. The same review found that the nightly job had always loaded 'today in UTC', so orders placed between 00:00 and 07:00 local time landed on the wrong day.",
    },

    content: [
        h2("Situation"),
        code("text", `
$ python backfill.py --start 2026-10-01
loaded 31 days, 1,206 rows

invoice preview, restaurant 21 (Pho Thin), October
  commission (fact_commission)      9,559,000 VND
  commission (recomputed by hand)   5,214,000 VND      <- 15% rows + 18% rows, both present

SELECT day, COUNT(*) FROM fact_commission WHERE restaurant_id = 21 GROUP BY day HAVING COUNT(*) > 1;
-- 2026-10-01 | 2
-- 2026-10-02 | 2   ... every October day twice`, "terminal"),
        bullets([
            "The backfill inserted October again on top of the old rows: no step said that one run replaces one day.",
            "`--start` without `--end` ran up to 'today', so the backfill also reprocessed days nobody asked for.",
            "The nightly job selected `placed_at >= today 00:00 UTC`, which is 07:00 in Ho Chi Minh City: breakfast orders were counted on the previous business day.",
        ]),

        h2("The core you need"),
        bullets([
            "**Partition by the business key of time.** Commission, invoices and dashboards think in business days in Ho Chi Minh City, so the fact table is partitioned by that day. A business day is a UTC range: `[day 00:00 +07, next day 00:00 +07)`, which starts at 17:00 UTC the day before.",
            "**One run owns one partition.** A run for day D deletes D and inserts D again, in one transaction (in a warehouse: `INSERT OVERWRITE` of the partition, or `MERGE` / a partition swap). Running it once or five times gives the same rows, which is what makes retries and backfills safe.",
            "**A run uses its logical date, never the clock.** The code receives the day to process. `datetime.now()` inside a task makes a backfill compute today's data 31 times; Airflow passes the interval as `data_interval_start` / logical date, Dagster as the partition key.",
            "**A backfill is the same task over a range.** Run every partition from start to end (both included, oldest first), with a bounded number in parallel so the source database is not flattened. Orchestrators do this for you (`airflow backfill create` in Airflow 3, partition backfills in Dagster).",
            "**Late data needs a lookback.** Orders keep arriving for yesterday (offline phones, corrected exports). The nightly run recomputes the last N days, not just yesterday; N comes from measuring how late data really arrives.",
        ]),

        h2("Apply it in the project"),
        code("python", `
def day_bounds(day):
    start = datetime.fromisoformat(day) - timedelta(hours=7)   # 00:00 in Ho Chi Minh City
    end = start + timedelta(days=1)
    return start.strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")


def run_day(db, day):
    start, end = day_bounds(day)
    with db:                                                     # delete + insert, all or nothing
        db.execute("DELETE FROM fact_commission WHERE day = ?", (day,))
        db.execute(
            """INSERT INTO fact_commission (day, restaurant_id, orders, commission_vnd)
               SELECT ?, restaurant_id, COUNT(*), CAST(ROUND(SUM(subtotal_vnd) * 0.18) AS INTEGER)
               FROM orders WHERE placed_at >= ? AND placed_at < ?
               GROUP BY restaurant_id""",
            (day, start, end),
        )`, "pipelines/commission.py"),
        p("In Airflow the same task is a daily, partition-aware DAG; the backfill is a command, not a new script:"),
        code("python", `
@dag(schedule="0 2 * * *", start_date=pendulum.datetime(2026, 10, 1, tz="Asia/Ho_Chi_Minh"),
     catchup=False, max_active_runs=1)
def commission():
    @task(retries=3)
    def recompute(data_interval_start=None):
        day = data_interval_start.in_timezone("Asia/Ho_Chi_Minh").date().isoformat()
        for d in lookback_days(day, 3):
            run_day(warehouse(), d)
    recompute()

commission()
# airflow backfill create --dag-id commission --from-date 2026-10-01 --to-date 2026-10-31 --max-active-runs 4`, "dags/commission.py"),
        callout("info", "Version note",
            "The backfill command and its flags changed in Airflow 3 (`airflow backfill create`); Airflow 2 used `airflow dags backfill -s ... -e ...`. Check `airflow backfill --help` on your version."),

        h2("Verify"),
        code("bash", `
python -m pipelines.commission backfill 2026-10-01 2026-10-31
# processed 31 days: 2026-10-01 .. 2026-10-31
python -m pipelines.commission backfill 2026-10-01 2026-10-31      # again: same rows
sqlite3 warehouse.db "SELECT COUNT(*), COUNT(DISTINCT day || '/' || restaurant_id) FROM fact_commission WHERE day LIKE '2026-10-%'"
# 1206|1206
sqlite3 warehouse.db "SELECT SUM(commission_vnd) FROM fact_commission WHERE restaurant_id = 21 AND day LIKE '2026-10-%'"
# 5214000`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Append-only reruns.** Any `INSERT` without the matching `DELETE` (or overwrite) doubles the partition on the second run. Detect it with a uniqueness check on `(day, restaurant_id)` after every load.",
            "**UTC days for local business.** Cutting days at UTC midnight moves seven hours of orders to the wrong day. Reconcile one day against the restaurant app's own daily report, which uses local time.",
            "**Open-ended backfills.** A range without an end, or with an exclusive end, either reprocesses days nobody asked for or silently skips the last day. Make the CLI require both ends and print the list of days before running.",
        ]),

        p("Now write the partitioned job. The editor holds the module with its key pieces missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the old backfill's mistakes on purpose. Run executes single days, a backfill over old rows and two nightly runs with a late order, then prints the days each step processed and the fact table."),
        challenge("chal_coding_pdp_182"),
    ],
});
