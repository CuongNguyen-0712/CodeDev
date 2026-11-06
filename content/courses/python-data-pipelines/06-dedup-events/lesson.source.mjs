// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pdp-2-3",
    title: "Deduplicating event streams",
    slug: { _type: "slug", current: "data-pipelines-deduplicating-event-streams" },
    description:
        "Rice Rocket's revenue report came out 6% too high: phones resend events they think were lost, and offline phones send yesterday's events tonight. Learn what makes two rows the same event, how to keep one copy inside a file and across nights, and how to put a late event on the business day it happened.",
    estimatedTime: 15,

    scenario: {
        role: "Data engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The customer and courier apps post order events to an ingestion API that writes one file per night. The nightly load appended every row it found. Finance found the paid total 6% above the payment provider's settlement, and when the team replayed a broken night, the load failed halfway.",
    },

    content: [
        h2("Situation"),
        p("Two queries the team ran while looking for the 6%:"),
        code("sql", `
-- the same paid event, loaded twice
SELECT event_id, COUNT(*) AS copies, MIN(ingested_at), MAX(ingested_at)
FROM events WHERE event_type = 'order_paid'
GROUP BY event_id HAVING COUNT(*) > 1 LIMIT 3;
-- e-88412-paid | 2 | 2026-10-14T05:02:11Z | 2026-10-14T05:02:41Z
-- e-88907-paid | 3 | 2026-10-14T11:40:03Z | 2026-10-14T11:41:33Z
-- e-90021-paid | 2 | 2026-10-15T16:55:09Z | 2026-10-16T01:12:40Z

-- revenue grouped by the night the file was loaded
SELECT load_date, SUM(amount_vnd) FROM events WHERE event_type = 'order_paid' GROUP BY load_date;`, "warehouse"),
        bullets([
            "A phone that does not get the API's acknowledgement sends the event again with the same `event_id`, seconds later: two or three copies in one file.",
            "A courier without signal sends the events of 23:50 the next morning: the copy lands in the next night's file, sometimes after the first copy was already loaded.",
            "Revenue was grouped by the night the file was loaded, so late events moved revenue to the wrong day.",
        ]),

        h2("The core you need"),
        bullets([
            "**At-least-once is the normal case.** Mobile clients, queues and webhooks retry; a pipeline that appends whatever it receives counts some events twice. The fix belongs in the load, not in every report.",
            "**Deduplicate on the producer's event id.** The app generates `event_id` once and reuses it on every retry. A business key such as `(order_id, event_type)` is not an identity: an order has one `item_added` event per bowl, and two identical bowls are two events. A hash of the payload breaks as soon as a copy carries a different `ingested_at`.",
            "**Inside one file: keep one row per id.** `ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY ingested_at)` numbers the copies; keep number 1, the copy that arrived first.",
            "**Across nights: let the key refuse copies.** With `event_id` as the primary key, `INSERT ... ON CONFLICT (event_id) DO NOTHING` skips an event loaded on an earlier night, and replaying a whole file changes nothing. A plain `INSERT` fails on the replay; `INSERT OR REPLACE` silently swaps the first copy for a later one.",
            "**Event time, not load time, decides the day.** Group by the time the event happened, converted to the business time zone (Ho Chi Minh City is UTC+7 all year), so 23:50 on the 5th stays on the 5th whichever night it arrived.",
            "**The memory of seen ids costs storage.** Keeping every id forever is simplest at this volume; very large streams keep a window (for example 7 days) and accept that a copy older than the window gets through, or deduplicate per partition.",
        ]),

        h2("Apply it in the project"),
        p("The nightly load stages the file, keeps one copy per event and inserts only new events, in one transaction:"),
        code("python", `
Q_BATCH_UNIQUE = """
SELECT event_id, order_id, event_type, amount_vnd, event_time, ingested_at
FROM (
    SELECT s.*, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY ingested_at, rowid) AS copy
    FROM staging s
)
WHERE copy = 1
"""

Q_INSERT_NEW = """
INSERT INTO events (event_id, order_id, event_type, amount_vnd, event_time, ingested_at)
""" + Q_BATCH_UNIQUE + """
ON CONFLICT (event_id) DO NOTHING
"""


def load_night(db, rows):
    with db:                                   # one transaction: all of tonight's file or nothing
        db.execute("DELETE FROM staging")
        db.executemany("INSERT INTO staging VALUES (?, ?, ?, ?, ?, ?)", rows)
        db.execute(Q_INSERT_NEW)`, "pipelines/order_events.py"),
        p("Reports read the business day from the event time:"),
        code("sql", `
SELECT date(event_time, '+7 hours') AS day, SUM(amount_vnd) AS revenue_vnd
FROM events
WHERE event_type = 'order_paid'
GROUP BY day
ORDER BY day;
-- PostgreSQL / warehouses: (event_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`, "reports/daily_revenue.sql"),
        callout("info", "Why SQLite parses this INSERT",
            "SQLite needs a WHERE clause in the SELECT of an `INSERT ... SELECT ... ON CONFLICT`, otherwise it cannot tell the upsert clause from a join constraint. The `WHERE copy = 1` of the deduplication query already provides it."),

        h2("Verify"),
        code("bash", `
python -m pipelines.order_events --night 2026-11-05
python -m pipelines.order_events --night 2026-11-05     # replay: no error, no new rows
sqlite3 warehouse.db "SELECT COUNT(*), COUNT(DISTINCT event_id) FROM events"
# 48211|48211
sqlite3 warehouse.db "SELECT day, revenue_vnd FROM daily_revenue WHERE day >= '2026-11-04'"
# 2026-11-04|412650000
# 2026-11-05|398120000      (matches the provider's settlement report for the 5th)`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Deduplicating on a business key.** `(order_id, event_type)` quietly collapses legitimate repeats (several `item_added` per order, several partial payments). Detect it by comparing `COUNT(*)` with the source system for one order with repeated items.",
            "**Keeping the last copy instead of the first.** `INSERT OR REPLACE` or `ORDER BY ingested_at DESC` makes the stored arrival time move every time a phone retries, which breaks latency and late-arrival metrics. Check that `ingested_at` of a known event never changes between loads.",
            "**Grouping by UTC or by load date.** Orders paid between 00:00 and 07:00 local time land on the previous UTC day, and late events land on the night they arrived. Reconcile one day against the payment provider's settlement, which uses local business days.",
        ]),

        p("Now write the load. The editor holds the module with its key pieces missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the old load's mistakes on purpose. Run loads several nights into SQLite, including a replay and a late phone, and prints events per type, revenue per business day and which copy of an event was kept."),
        challenge("chal_coding_pdp_162"),
    ],
});
