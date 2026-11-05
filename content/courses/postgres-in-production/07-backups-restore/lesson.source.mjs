// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pgp-4-1",
    title: "Backups and a restore you have tested",
    slug: { _type: "slug", current: "postgres-backups-point-in-time-restore" },
    description:
        "A migration with a wrong WHERE deleted 9,000 delivered orders at 14:05, and the only backup the team knew how to restore was last night's pg_dump: 12 hours of orders would have gone with it. Learn logical and physical backups, WAL archiving and point-in-time recovery, RPO and RTO, and write the restore planner the on-call engineer runs after a bad write.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Rice Rocket's managed PostgreSQL 17 database keeps orders, couriers and restaurants. The backup story was a nightly pg_dump that nobody had ever restored. Then a cleanup migration deleted 9,000 delivered orders in the middle of the afternoon.",
    },

    content: [
        h2("Situation"),
        p("The migration was meant to remove test orders. Its WHERE clause had lost a condition in review:"),
        code("sql", `
-- migrations/0142_cleanup_orders.sql
DELETE FROM orders
WHERE status = 'delivered'
  AND created_at < now() - interval '30 days';
-- intended: ... AND customer_id IN (SELECT id FROM customers WHERE is_test)`, "migrations/0142_cleanup_orders.sql"),
        code("text", `
2026-11-03 14:05:12 migration 0142_cleanup_orders: DELETE 9000
2026-11-03 14:31:40 support: restaurants report missing payouts for October
$ ls -lh /backup
-rw-r----- 1 backup backup 40G Nov  3 02:18 rice_rocket-2026-11-03.dump`, "terminal"),
        bullets([
            "The only file the team knew was the 02:00 `pg_dump`. Restoring it would bring back the 9,000 rows and lose every order written between 02:00 and 14:05.",
            "Nobody knew how long a 40 GB restore takes; the first guess was \"maybe an hour\".",
            "The managed provider's console offered \"restore to a point in time\", and nobody on the team could say what it was built on.",
        ]),

        h2("The core you need"),
        bullets([
            "**Logical backup.** `pg_dump` exports one database as SQL or a custom-format archive from one consistent snapshot, taken when it starts. It restores anywhere (another version, another machine) with `pg_restore`, but only to that one moment, and restoring rebuilds every index, so it is slow for big databases.",
            "**Physical backup.** A base backup (`pg_basebackup`, or the provider's snapshot) copies the data files of the whole cluster while it keeps running. It is not consistent on its own: the changes made while it ran are in the WAL.",
            "**WAL archiving.** PostgreSQL writes every change to the write-ahead log first. With `archive_mode = on` and an `archive_command` (or the provider's equivalent), each finished WAL segment is copied to backup storage. A base backup plus every WAL segment since it **started** can be replayed to any later moment.",
            "**Point-in-time recovery (PITR).** Restore the base backup onto a new instance, let it fetch WAL with `restore_command`, and stop at `recovery_target_time`. Commits at the target time itself are included by default, so stop one second before the bad commit. A managed \"restore to a point in time\" is this same mechanism, run by the provider, and it always creates a new instance.",
            "**RPO and RTO.** The recovery point objective is how much data you may lose (the gap between the target and the incident); the recovery time objective is how long the restore may take (copying the base backup plus replaying hours of WAL). A WAL archive with a hole stops the replay at the hole; a base backup outside its retention window is gone.",
            "**A backup is a restore you have timed.** Until a restore drill has run end to end and been measured, the RTO is a guess and the RPO is a hope.",
        ]),

        h2("Apply it in the project"),
        p("The managed database already archives WAL continuously and takes a daily base backup. Rice Rocket restores to a new instance one second before the DELETE, pauses there, and copies the rows back:"),
        code("bash", `
# 1. New instance from the provider's PITR (same mechanism as below, run for you)
#    or, self-managed: base backup + WAL archive on a fresh server
cat >> /var/lib/postgresql/17/restore/postgresql.auto.conf <<'EOF'
restore_command = 'cp /backup/wal/%f %p'
recovery_target_time = '2026-11-03 14:05:11+07'
recovery_target_action = 'pause'
EOF
touch /var/lib/postgresql/17/restore/recovery.signal
pg_ctl -D /var/lib/postgresql/17/restore start`, "restore.sh"),
        code("sql", `
-- 2. On the restored instance: the rows as they were at 14:05:11
\\copy (SELECT * FROM orders WHERE status = 'delivered' AND created_at < '2026-10-04') TO 'orders_0142.csv' CSV HEADER

-- 3. On production: put them back without touching anything written since
CREATE TEMP TABLE orders_restore (LIKE orders INCLUDING DEFAULTS);
\\copy orders_restore FROM 'orders_0142.csv' CSV HEADER
INSERT INTO orders SELECT * FROM orders_restore ON CONFLICT (id) DO NOTHING;
-- INSERT 0 9000`, "restore_rows.sql"),
        callout("info", "Run the drill on a calendar, not during an incident",
            "Once a month, restore last night's base backup to a scratch instance with a target of 23:59, run a row count against production's numbers, and write down how many minutes it took. That number is your RTO; the time gap you could reach is your RPO."),

        h2("Verify"),
        code("bash", `
psql "$RESTORE_URL" -c "SELECT pg_is_in_recovery(), now()"
#  pg_is_in_recovery |              now
# -------------------+-------------------------------
#  t                 | 2026-11-03 15:12:40.1+07       (paused at the target)
psql "$RESTORE_URL" -tc "SELECT count(*) FROM orders WHERE status = 'delivered' AND created_at < '2026-10-04'"
#   9000
psql "$DATABASE_URL" -tc "SELECT count(*) FROM orders WHERE created_at > '2026-11-03 14:05:12+07'"
#   612        (written after the incident, still there)
psql "$DATABASE_URL" -c "SELECT archived_count, failed_count, last_failed_time FROM pg_stat_archiver"   # self-managed: failed_count stays 0`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A silent `archive_command` failure.** When archiving fails, WAL piles up on the server and the archive has a hole; a later PITR stops at the hole. Watch `pg_stat_archiver.failed_count` and `last_failed_time`, and alert on them.",
            "**Retentions that do not overlap.** Base backups kept 7 days with WAL kept 3 days gives a 3-day window at best. Keep WAL from the start of the oldest base backup you rely on.",
            "**Restoring over production.** Rolling the production instance back to 14:05 throws away every write since. Restore to a new instance, compare, copy back; switch over only when the database itself is lost.",
        ]),

        challenge("chal_quiz_pgp_171"),
        p("Now write the planner the on-call engineer runs before touching anything. The editor starts from `restore_plan.py` with its helpers missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the mistakes made under pressure on purpose. Run feeds it backup catalogs and WAL archives from real-looking incidents, with holes and late backups included."),
        challenge("chal_coding_pgp_172"),
    ],
});
