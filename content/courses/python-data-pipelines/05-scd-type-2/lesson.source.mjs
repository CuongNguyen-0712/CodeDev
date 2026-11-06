// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pdp-2-2",
    title: "Slowly changing dimensions (type 2)",
    slug: { _type: "slug", current: "data-pipelines-scd-type-2" },
    description:
        "Finance recomputed September's restaurant commissions with October's rates because the restaurant dimension was overwritten every night. Learn to keep history in a dimension - versions with validity dates, tracked and untracked attributes, idempotent snapshots and point-in-time lookups - and write the nightly SCD type 2 step.",
    estimatedTime: 16,

    scenario: {
        role: "Data engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Rice Rocket's commission is a percentage of each order that differs per restaurant. On 1 October 40 restaurants moved from 15% to 18%. When finance reran the September settlement report in October, it charged those restaurants 18% for September too, and three of them noticed before finance did.",
    },

    content: [
        h2("Situation"),
        p("The nightly job replaced each restaurant's row with the app's current values (type 1):"),
        code("sql", `
UPDATE dim_restaurant
SET name = :name, district = :district, commission_pct = :commission_pct
WHERE restaurant_id = :restaurant_id;`, "pipelines/dim_restaurant.sql"),
        code("text", `
settlement 2026-09, Pho Ha Noi (101)
  run on 2026-09-30:  orders 4,812  gross 1,203,000,000  commission 15% = 180,450,000
  run on 2026-10-06:  orders 4,812  gross 1,203,000,000  commission 18% = 216,540,000`, "finance report"),

        h2("The core you need"),
        bullets([
            "**Type 1 overwrites, type 2 keeps history.** A type 1 attribute (a name typo fix) is corrected everywhere. A type 2 attribute (commission rate, district) gets a new row, a version, each time it changes, so a fact can be read with the value that applied on its date.",
            "**Each version has a validity range.** `valid_from` (inclusive) and `valid_to` (exclusive, `'9999-12-31'` for the open version), plus `is_current` for fast \"today\" queries. Half-open ranges mean the version that ends on 1 October and the one that starts on 1 October never overlap.",
            "**Every version gets its own surrogate key.** `restaurant_sk` identifies a version; `restaurant_id` (the app's key) groups the versions of one restaurant. Facts store the `restaurant_sk` valid on the order's date, or are looked up by date at query time.",
            "**Close with the effective date, not the load date.** The snapshot says what was true on a given day; closing a version with today's date when you load an older snapshot (a backfill, a late file) makes ranges overlap.",
            "**Idempotent by comparison.** Compare the incoming tracked attributes with the current version; equal means nothing to do. Reapplying a snapshot then creates no duplicate versions.",
        ]),

        h2("Apply it in the project"),
        code("sql", `
CREATE TABLE dim_restaurant (
    restaurant_sk  INTEGER PRIMARY KEY,           -- one per version
    restaurant_id  INTEGER NOT NULL,              -- the app's id
    name           TEXT    NOT NULL,              -- type 1
    district       TEXT    NOT NULL,              -- type 2
    commission_pct NUMERIC NOT NULL,              -- type 2
    valid_from     DATE    NOT NULL,
    valid_to       DATE    NOT NULL DEFAULT '9999-12-31',
    is_current     BOOLEAN NOT NULL
);
CREATE INDEX ix_dim_restaurant_lookup ON dim_restaurant (restaurant_id, valid_from);`, "warehouse/dim_restaurant.sql"),
        code("python", `
def apply_snapshot(wh, snapshot_date, rows):
    with wh:
        for row in rows:
            cur = current_version(wh, row["restaurant_id"])
            if cur is None:
                insert_version(wh, row, valid_from=snapshot_date)
                continue
            if row["name"] != cur.name:                        # type 1: fix every version
                wh.execute("UPDATE dim_restaurant SET name = ? WHERE restaurant_id = ?",
                           (row["name"], row["restaurant_id"]))
            if (row["district"], row["commission_pct"]) != (cur.district, cur.commission_pct):
                wh.execute("UPDATE dim_restaurant SET valid_to = ?, is_current = 0 WHERE restaurant_sk = ?",
                           (snapshot_date, cur.restaurant_sk))
                insert_version(wh, row, valid_from=snapshot_date)

def restaurant_sk_at(wh, restaurant_id, day):
    return wh.execute("SELECT restaurant_sk FROM dim_restaurant "
                      "WHERE restaurant_id = ? AND valid_from <= ? AND ? < valid_to",
                      (restaurant_id, day, day)).fetchone()`, "pipelines/dim_restaurant_scd2.py"),
        callout("info", "In dbt",
            "dbt snapshots implement the same pattern: a `snapshot` with `strategy: check` and `check_cols: ['district', 'commission_pct']` (or `strategy: timestamp` on an `updated_at` column) adds `dbt_valid_from` and `dbt_valid_to` columns. Type 1 attributes are then joined from the current source instead of the snapshot."),

        h2("Verify"),
        code("bash", `
sqlite3 warehouse.db "SELECT restaurant_sk, commission_pct, valid_from, valid_to, is_current
                      FROM dim_restaurant WHERE restaurant_id = 101 ORDER BY valid_from"
# 1|15|2026-08-01|2026-10-01|0
# 4|18|2026-10-01|9999-12-31|1
# No restaurant has two current versions, and no ranges overlap:
sqlite3 warehouse.db "SELECT restaurant_id FROM dim_restaurant GROUP BY 1 HAVING sum(is_current) <> 1"
sqlite3 warehouse.db "SELECT a.restaurant_id FROM dim_restaurant a JOIN dim_restaurant b
                      ON a.restaurant_id = b.restaurant_id AND a.restaurant_sk < b.restaurant_sk
                      AND a.valid_from < b.valid_to AND b.valid_from < a.valid_to"
# (no rows for either)`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Tracking every column.** Comparing all attributes makes a typo fix or a new phone number a new version, and the dimension grows without meaning. Decide per column, and write the decision next to the table definition.",
            "**Joining facts to `is_current = 1`.** Easy and wrong for history: every past order gets today's attributes. Use the `restaurant_sk` stored on the fact, or a date-range join.",
            "**Comparing floats.** `15.0 != 15.000000001` after a currency conversion creates a version per night. Store rates as fixed-point numbers (`NUMERIC`, or basis points as integers) and compare those.",
        ]),

        p("Now write the nightly step. The editor starts from `pipelines/dim_restaurant_scd2.py` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run applies a series of snapshots, including a repeated one and a name fix, then prices orders on the days around each change."),
        challenge("chal_coding_pdp_152"),
    ],
});
