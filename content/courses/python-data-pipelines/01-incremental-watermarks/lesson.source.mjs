// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pdp-1-1",
    title: "Incremental extraction with watermarks",
    slug: { _type: "slug", current: "data-pipelines-incremental-watermarks" },
    description:
        "Rice Rocket's nightly copy of orders into the warehouse took two hours as a full extract, and the first incremental version silently lost orders. Learn how a watermark job works - where the watermark lives, which timestamp it records, why it needs a lookback window and why it commits with the load - and write the extract step.",
    estimatedTime: 15,

    scenario: {
        role: "Data engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Finance and operations read their dashboards from a warehouse that a nightly job fills from the app's PostgreSQL database. The job copied all 8 million orders every night. The faster incremental version that replaced it was missing a handful of orders every day, and nobody noticed for two weeks.",
    },

    content: [
        h2("Situation"),
        p("The first incremental job remembered when it last ran and asked for everything updated since then:"),
        code("python", `
last_run = state.get("orders_last_run")           # e.g. 2026-11-05 02:00:00
started = datetime.now()
rows = src.execute("SELECT * FROM orders WHERE updated_at > %s", (last_run,)).fetchall()
load(rows)
state.set("orders_last_run", started)              # saved even if load() failed halfway`, "pipelines/orders_incremental.py"),
        p("Reconciling one day against the source found the gaps:"),
        code("text", `
order_id  updated_at           committed_at         in warehouse
88412     2026-11-05 01:59:58  2026-11-05 02:00:03  no   (transaction committed after the run started)
88419     2026-11-05 02:00:00  2026-11-05 02:00:01  no   (same second as the watermark, '>' skipped it)
88501..   2026-11-04 23:10:00  2026-11-04 23:10:00  no   (the 2026-11-05 run failed on a disk-full error,
                                                         but its start time was saved anyway)`, "reconciliation"),

        h2("The core you need"),
        bullets([
            "**A watermark is the job's memory.** It records how far the last successful run read, in the column the extract filters on (`updated_at`). Keep it in the warehouse (a small `etl_state` table) or in the orchestrator's state, not in a local file on the worker.",
            "**Record what you read, not what the clock says.** The new watermark is the largest `updated_at` the run actually extracted. The clock at run start is later than rows that commit a moment later with an older `updated_at`, so they fall behind the watermark forever.",
            "**Read with overlap.** A row can commit after your query started with an `updated_at` slightly in the past (long transactions, clock skew between app servers). Reading from `watermark - lookback` (here 15 minutes) with `>=` picks those up; the price is re-reading a few rows, which an idempotent upsert absorbs (next lesson).",
            "**Commit the watermark with the data.** Load and watermark update go in one database transaction. If the load fails, the watermark must not move, and the next run reads the same window again.",
            "**What a watermark cannot see.** Hard deletes leave no row to read; use a soft-delete flag or change data capture (Debezium reading the WAL) when deletes matter. An `updated_at` that some code path forgets to set is invisible too; a database trigger that sets it is safer than application code.",
        ]),

        h2("Apply it in the project"),
        p("The warehouse keeps one row of state per job:"),
        code("sql", `
CREATE TABLE etl_state (
    job             TEXT PRIMARY KEY,
    last_updated_at TIMESTAMP NOT NULL
);
INSERT INTO etl_state VALUES ('orders', '1970-01-01 00:00:00');`, "warehouse/etl_state.sql"),
        p("The extract step reads the window, loads it and moves the watermark in one transaction:"),
        code("python", `
LOOKBACK = timedelta(minutes=15)

def run_once(src, wh):
    (watermark,) = wh.execute("SELECT last_updated_at FROM etl_state WHERE job = 'orders'").fetchone()
    since = watermark - LOOKBACK
    rows = src.execute(
        "SELECT order_id, status, total_vnd, updated_at FROM orders "
        "WHERE updated_at >= %s ORDER BY updated_at, order_id", (since,)).fetchall()
    new_watermark = max([r.updated_at for r in rows], default=watermark)
    with wh.transaction():
        wh.upsert("fact_orders", rows, key="order_id")
        wh.execute("UPDATE etl_state SET last_updated_at = %s WHERE job = 'orders'",
                   (max(new_watermark, watermark),))
    return len(rows)`, "pipelines/orders_incremental.py"),
        callout("info", "Index the column you filter on",
            "`WHERE updated_at >= ...` on 8 million rows needs an index on `orders (updated_at)` in the source database, or every incremental run is a full scan in disguise. Create it with `CREATE INDEX CONCURRENTLY` on a live PostgreSQL database."),

        h2("Verify"),
        code("bash", `
python -m pipelines.orders_incremental --job orders
# read 3 rows since 2026-11-05 11:50:00, watermark -> 2026-11-05 12:50:00
psql warehouse -c "SELECT * FROM etl_state"
#  job    | last_updated_at
#  orders | 2026-11-05 12:50:00
# Reconcile counts per day between source and warehouse after a week:
psql app -Atc "SELECT date(updated_at), count(*) FROM orders GROUP BY 1 ORDER BY 1" > src.txt
psql warehouse -Atc "SELECT date(updated_at), count(*) FROM fact_orders GROUP BY 1 ORDER BY 1" > wh.txt
diff src.txt wh.txt && echo "no gaps"`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Lookback shorter than your longest transaction.** A batch job that holds a transaction for 30 minutes writes rows older than a 15-minute window. Check `max(now() - xact_start)` in `pg_stat_activity` over a week and size the lookback above it.",
            "**Timestamps without a time zone.** If the app writes local time and the job compares in UTC, the window is off by seven hours. Store `timestamptz` in the source and compare in UTC; the reconciliation query above catches the symptom as a whole day missing.",
            "**A watermark per environment.** Copying the production `etl_state` into staging (or the other way round) makes a run skip or reread days. Keep state with the data it describes.",
        ]),

        p("Now write the extract step. The editor starts from `pipelines/orders_incremental.py` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first version's mistakes on purpose. Run replays several nights on SQLite, with an order that commits late and a load that fails halfway, and reports every order the warehouse lacks."),
        challenge("chal_coding_pdp_112"),
    ],
});
