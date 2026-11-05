// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pgp-4-2",
    title: "Vacuum, bloat and the metrics to watch",
    slug: { _type: "slug", current: "postgres-vacuum-bloat-metrics" },
    description:
        "courier_locations, a small table updated every few seconds per courier, grew from 200 MB to 9 GB while the dashboards watched only CPU. Learn how MVCC leaves dead rows behind, when autovacuum starts, what holds cleanup back, why VACUUM does not shrink files, and fix the vacuum health check that said \"ok\" for a month.",
    estimatedTime: 17,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Every courier app sends its position every few seconds, and the api updates one row per courier in courier_locations. The table holds about 120,000 rows, yet it reached 9 GB, the courier map slowed to seconds per refresh, and the vacuum check of the monitoring job stayed green the whole time.",
    },

    content: [
        h2("Situation"),
        code("sql", `
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum,
       pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_stat_user_tables WHERE relname = 'courier_locations';
--      relname       | n_live_tup | n_dead_tup |        last_autovacuum        |  size
-- -------------------+------------+------------+-------------------------------+---------
--  courier_locations |     120034 |    4796210 | 2026-11-03 10:41:02.18+07     | 9012 MB`, "psql"),
        bullets([
            "Autovacuum ran minutes ago, and still 4.8 million dead rows remain.",
            "A session from an analyst's laptop had been `idle in transaction` for three days: a BEGIN, one SELECT, and a closed laptop lid.",
            "An old replication slot `old_replica`, left from a replica deleted last month, was still listed in `pg_replication_slots`.",
            "The health check compared dead rows with a threshold it computed wrongly, and never looked at sessions or slots.",
        ]),

        h2("The core you need"),
        bullets([
            "**MVCC leaves dead rows.** An UPDATE writes a new row version and marks the old one dead; a DELETE marks it dead. Readers with an older snapshot may still need the old version, so it stays until vacuum removes it.",
            "**When autovacuum starts.** A table is vacuumed when `n_dead_tup > autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor * reltuples` (defaults 50 and 0.2; `reltuples` is the row estimate in `pg_class`). A table's own storage parameters (`ALTER TABLE ... SET (...)`) override the server settings. PostgreSQL 18 also adds `autovacuum_vacuum_max_threshold`, a cap for very large tables.",
            "**The xmin horizon.** Vacuum may only remove versions that died before the oldest snapshot still in use. A transaction left open, an inactive replication slot with an old `xmin`, or a forgotten prepared transaction holds that horizon back: autovacuum runs and reports the rows as \"dead but not yet removable\".",
            "**VACUUM frees space inside the file.** The space of removed rows is reused by new rows; the file shrinks only when empty pages sit at its end. Shrinking a bloated table needs a rewrite: `VACUUM FULL` (locks the table for the whole rewrite) or `pg_repack` (online, short locks).",
            "**Wraparound.** Transaction ids are 32-bit; vacuum freezes old rows so ids can be reused. A horizon held for days also blocks freezing; watch `age(datfrozenxid)` per database.",
            "**What to watch.** `n_dead_tup` against the trigger and `last_autovacuum` per table, `age(backend_xmin)` of sessions, `age(xmin)` of slots, and table size over time. CPU says nothing about any of them.",
        ]),

        h2("Apply it in the project"),
        p("End what holds the horizon, give the hot table its own trigger, and make the monitoring query read all three sources:"),
        code("sql", `
-- 1. What holds the horizon (oldest first)
SELECT pid, state, now() - xact_start AS open_for, age(backend_xmin) AS xmin_age
FROM pg_stat_activity WHERE backend_xmin IS NOT NULL ORDER BY xmin_age DESC LIMIT 3;
SELECT slot_name, active, age(xmin) AS xmin_age FROM pg_replication_slots ORDER BY 3 DESC NULLS LAST;

SELECT pg_terminate_backend(4242);            -- the laptop session
SELECT pg_drop_replication_slot('old_replica'); -- the replica is gone

-- 2. Stop sessions from parking in a transaction (lesson 2) and vacuum the hot table early
ALTER ROLE analyst SET idle_in_transaction_session_timeout = '5min';
ALTER TABLE courier_locations SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_threshold = 1000
);

-- 3. Clean up now, then shrink the file online
VACUUM (VERBOSE) courier_locations;
-- pg_repack --table=courier_locations --no-superuser-check rice_rocket   (extension installed by the provider)`, "fix_bloat.sql"),
        callout("info", "Why a sum, not a product",
            "The trigger is a fixed floor plus a fraction of the table. For courier_locations: 1,000 + 0.01 x 120,000 = 2,200 dead rows. Multiplying the two settings instead gives 1,200,000, a number the table never reaches, and the check stays green forever."),

        h2("Verify"),
        code("sql", `
VACUUM (VERBOSE) courier_locations;
-- tuples: 4796210 removed, 120034 remain, 0 are dead but not yet removable
SELECT n_dead_tup, last_autovacuum FROM pg_stat_user_tables WHERE relname = 'courier_locations';
--  n_dead_tup |        last_autovacuum
-- ------------+-------------------------------
--        1873 | 2026-11-03 16:02:11.40+07          (a few minutes later, autovacuum keeps up)
SELECT pg_size_pretty(pg_total_relation_size('courier_locations'));
--  31 MB                                            (after pg_repack)
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC LIMIT 1;
--  rice_rocket | 61234510                           (far below the 200 million autovacuum_freeze_max_age)`, "psql"),

        h2("Pitfalls"),
        bullets([
            "**Reading `n_live_tup` as the table size.** The trigger uses `pg_class.reltuples`; the counters in `pg_stat_user_tables` are approximate and reset after a crash. Compute the threshold from `reltuples`.",
            "**Slots nobody owns.** A logical or physical slot of a decommissioned replica keeps WAL and the xmin horizon forever. Alert when a slot is `active = false` for more than an hour.",
            "**`VACUUM FULL` at lunch.** It takes an ACCESS EXCLUSIVE lock for the whole rewrite: every courier update and every map read waits. Use `pg_repack`, or run `VACUUM FULL` in a maintenance window.",
        ]),

        challenge("chal_quiz_pgp_181"),
        p("Now fix the health check. The editor starts from `vacuum_check.py` with its functions missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are last month's bugs on purpose. Run feeds it the rows the monitoring job reads from `pg_stat_user_tables`, `pg_stat_activity` and `pg_replication_slots`."),
        challenge("chal_coding_pgp_182"),
    ],
});
