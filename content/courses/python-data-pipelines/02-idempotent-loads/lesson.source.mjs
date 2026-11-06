// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pdp-1-2",
    title: "Idempotent loads: upserts and natural keys",
    slug: { _type: "slug", current: "data-pipelines-idempotent-loads" },
    description:
        "An Airflow retry loaded one night of restaurant payouts twice and finance paid a restaurant double. Learn what makes a load safe to rerun - a natural key, an upsert that only touches the columns it owns, a version guard and one transaction - and fix the payout loader.",
    estimatedTime: 15,

    scenario: {
        role: "Data engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Each night a job computes what Rice Rocket owes every partner restaurant for the previous day and loads it into restaurant_payouts; finance pays from that table and stamps paid_at when the bank transfer leaves. After a timeout and an automatic retry, 412 restaurants had two rows for the same day.",
    },

    content: [
        h2("Situation"),
        p("The loader and the table it wrote to:"),
        code("python", `
SCHEMA = """
CREATE TABLE restaurant_payouts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    business_date TEXT    NOT NULL,
    amount_vnd    INTEGER NOT NULL,
    orders        INTEGER NOT NULL,
    computed_at   TEXT    NOT NULL,
    paid_at       TEXT
)"""

def load(wh, rows):
    for row in rows:
        wh.execute("INSERT INTO restaurant_payouts (restaurant_id, business_date, amount_vnd, orders, computed_at) "
                   "VALUES (:restaurant_id, :business_date, :amount_vnd, :orders, :computed_at)", row)
        wh.commit()`, "pipelines/load_payouts.py"),
        bullets([
            "The first attempt committed all 412 rows, then hit the 30-second `execution_timeout`; Airflow retried and inserted them again.",
            "The quick fix, `INSERT OR REPLACE`, stopped the duplicates and wiped `paid_at` on every retry after finance had paid, so the same restaurants showed up as unpaid.",
            "When finance replayed an old file to compare numbers, it overwrote a correction made later that morning.",
        ]),

        h2("The core you need"),
        bullets([
            "**Idempotent means rerunnable.** Running a load twice with the same input leaves the same table. Orchestrators retry on timeouts, workers die after commit, people rerun by hand: assume every task runs more than once.",
            "**Key rows by what they mean.** A surrogate `id` makes every insert a new row. The natural key of a payout is `(restaurant_id, business_date)`; declare it as the primary key or a unique constraint so the database itself refuses a second copy.",
            "**Upsert only the columns you own.** `INSERT ... ON CONFLICT (key) DO UPDATE SET col = excluded.col` updates the existing row in place (SQLite 3.24+, PostgreSQL 9.5+). `INSERT OR REPLACE` deletes the old row first, so columns written by someone else (`paid_at`) are lost.",
            "**Guard against old data.** Add `WHERE excluded.computed_at > restaurant_payouts.computed_at` to the `DO UPDATE`: a replay or a late retry of an older computation then changes nothing, and loads can arrive in any order.",
            "**One transaction per load.** Commit all rows together (`with conn:` in Python's sqlite3, one transaction in your warehouse client). A failure halfway leaves the table as it was, and the retry starts from a clean state. For a whole partition, delete-and-insert inside one transaction is the other idempotent pattern.",
        ]),

        h2("Apply it in the project"),
        code("python", `
SCHEMA = """
CREATE TABLE restaurant_payouts (
    restaurant_id INTEGER NOT NULL,
    business_date TEXT    NOT NULL,
    amount_vnd    INTEGER NOT NULL,
    orders        INTEGER NOT NULL,
    computed_at   TEXT    NOT NULL,
    paid_at       TEXT,                       -- owned by finance, never written here
    PRIMARY KEY (restaurant_id, business_date)
)"""

UPSERT = """
INSERT INTO restaurant_payouts (restaurant_id, business_date, amount_vnd, orders, computed_at)
VALUES (:restaurant_id, :business_date, :amount_vnd, :orders, :computed_at)
ON CONFLICT (restaurant_id, business_date) DO UPDATE SET
    amount_vnd  = excluded.amount_vnd,
    orders      = excluded.orders,
    computed_at = excluded.computed_at
WHERE excluded.computed_at > restaurant_payouts.computed_at
"""

def load(wh, rows):
    with wh:                                    # one transaction: all rows or none
        wh.executemany(UPSERT, list(rows))`, "pipelines/load_payouts.py"),
        p("Moving the existing table to the natural key needs the duplicates gone first: keep the newest computation per key, then add the constraint."),
        code("sql", `
DELETE FROM restaurant_payouts
WHERE id NOT IN (
    SELECT max(id) FROM restaurant_payouts GROUP BY restaurant_id, business_date
);
CREATE UNIQUE INDEX uq_payouts_restaurant_day ON restaurant_payouts (restaurant_id, business_date);`, "migrations/2026-11-06-payouts-key.sql"),
        callout("info", "In the DAG",
            "In Airflow, keep `retries` and `execution_timeout` on the task: with an idempotent load they are a safety net instead of a source of duplicates. Pass the business date (`{{ ds }}`) into the task instead of computing \"yesterday\" inside it, so a retry or a backfill loads the same day."),

        h2("Verify"),
        code("bash", `
python -m pipelines.load_payouts --date 2026-11-04
python -m pipelines.load_payouts --date 2026-11-04      # run it again on purpose
sqlite3 warehouse.db "SELECT restaurant_id, business_date, count(*) FROM restaurant_payouts
                      GROUP BY 1, 2 HAVING count(*) > 1"
# (no rows)
sqlite3 warehouse.db "SELECT count(*) FROM restaurant_payouts WHERE paid_at IS NOT NULL"
# same count as before the rerun`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Upserting on a key that is not unique.** `ON CONFLICT (restaurant_id, business_date)` fails with an error in SQLite and PostgreSQL when no unique constraint or primary key covers exactly those columns. Add the constraint in the same migration that introduces the upsert, and check the table definition, not only the statement.",
            "**Guarding on load time.** `WHERE now() > ...` is always true; the guard must compare a value that travels with the data (`computed_at`, a version number, the source's `updated_at`).",
            "**Committing per row.** A loop with `commit()` inside leaves half a day loaded when it fails, and the next report shows partial totals. Detect it with a count per business date compared to the source.",
        ]),

        challenge("chal_quiz_pdp_121"),
        p("Now fix the loader. The editor starts from `pipelines/load_payouts.py` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are the old loader's code on purpose. Run replays a retry, a payment by finance, a correction followed by an old replay, and a load that fails halfway."),
        challenge("chal_coding_pdp_122"),
    ],
});
