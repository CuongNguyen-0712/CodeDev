// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pgp-2-2",
    title: "Locks that block writes: ALTER TABLE in production",
    slug: { _type: "slug", current: "postgres-locks-alter-table" },
    description:
        "A migration that needed 3 milliseconds of work stopped every query on Rice Rocket's orders table for two minutes, because it waited for its lock behind a report. Learn the lock levels DDL takes, how the lock queue turns one waiting statement into an outage, and the safe forms of the common changes: lock_timeout, NOT VALID then VALIDATE, CREATE INDEX CONCURRENTLY and SET NOT NULL through a CHECK constraint.",
    estimatedTime: 17,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "On Friday at 11:40, just before the lunch peak, a release added a `tip_vnd` column to `orders`. The statement itself is metadata-only on PostgreSQL 17, yet for two minutes no order could be placed, read or updated.",
    },

    content: [
        h2("Situation"),
        p("The migration was one line. The weekly revenue report, started a minute earlier by the finance team, was still reading `orders`:"),
        code("sql", `
ALTER TABLE orders ADD COLUMN tip_vnd integer DEFAULT 0;`, "migrations/0051_orders_tip.sql"),
        code("text", `
  pid  | state  | wait_event_type | wait_event | duration | query
 50211 | active |                 |            | 00:02:04 | SELECT ... FROM orders JOIN ... -- weekly report
 50388 | active | Lock            | relation   | 00:01:58 | ALTER TABLE orders ADD COLUMN tip_vnd integer DEFAULT 0
 50401 | active | Lock            | relation   | 00:01:57 | SELECT * FROM orders WHERE id = $1
 50417 | active | Lock            | relation   | 00:01:57 | INSERT INTO orders (...) VALUES (...)
 ... 212 more rows waiting on relation orders`, "pg_stat_activity"),
        bullets([
            "The api's connection pool filled with waiting queries, and the health checks timed out.",
            "When the report finished, the `ALTER TABLE` ran in 3 ms and the 214 waiting queries went through at once.",
        ]),

        h2("The core you need"),
        bullets([
            "**Every statement takes a table lock.** A SELECT takes ACCESS SHARE, writes take ROW EXCLUSIVE, and most `ALTER TABLE` forms take ACCESS EXCLUSIVE, which conflicts with everything, plain reads included. The `ALTER TABLE` page of the documentation names the lock of each form.",
            "**Locks queue in order.** A request that cannot be granted waits, and later requests that conflict with it wait behind it, even if they would not conflict with the lock actually held. A waiting ACCESS EXCLUSIVE therefore stops every new query on the table.",
            "**`lock_timeout` turns waiting into failing.** `SET lock_timeout = '3s'` makes a statement give up when it cannot get its lock in 3 seconds (`canceling statement due to lock timeout`). Retry it a little later: the worst case is now 3 seconds of queued queries, not the length of the slowest query.",
            "**Catalog-only changes are fine with a timeout.** Since PostgreSQL 11, `ADD COLUMN` with no default or a non-volatile default (a constant, `now()`) does not touch the rows. A volatile default (`clock_timestamp()`, `gen_random_uuid()`) rewrites the whole table under ACCESS EXCLUSIVE.",
            "**Split checks from the lock that blocks.** `ADD CONSTRAINT ... NOT VALID` only records the constraint (new rows are checked); `VALIDATE CONSTRAINT` then scans existing rows under SHARE UPDATE EXCLUSIVE, which lets reads and writes continue. Since PostgreSQL 12, `SET NOT NULL` skips its scan when a validated `CHECK (col IS NOT NULL)` already proves it.",
            "**Indexes.** `CREATE INDEX` holds a SHARE lock (writes blocked) for the whole build; `CREATE INDEX CONCURRENTLY` lets writes continue, takes longer, and cannot run inside a transaction block. If it fails it leaves an INVALID index to drop and retry.",
            "**Rewrites and renames.** Most `ALTER COLUMN ... TYPE` changes rewrite the table; a rename breaks the code that still runs. Both go through expand and contract (lesson 3).",
        ]),

        h2("Apply it in the project"),
        p("The migration runner sets a lock timeout for every migration and retries a statement that timed out; slow work moves out of the blocking lock:"),
        code("sql", `
SET lock_timeout = '3s';

-- catalog only: fine with the timeout
ALTER TABLE orders ADD COLUMN tip_vnd integer DEFAULT 0;

-- a foreign key in two steps: record now, check existing rows without blocking writes
ALTER TABLE orders ADD CONSTRAINT orders_courier_fk
  FOREIGN KEY (courier_id) REFERENCES couriers (id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_courier_fk;

-- NOT NULL proved by a validated CHECK, so SET NOT NULL does not scan (PostgreSQL 12+)
ALTER TABLE orders ADD CONSTRAINT orders_restaurant_id_not_null
  CHECK (restaurant_id IS NOT NULL) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_restaurant_id_not_null;
ALTER TABLE orders ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_restaurant_id_not_null;`, "migrations/0052_orders_constraints.sql"),
        code("sql", `
-- its own migration file, run without a transaction (the runner's no-transaction flag)
CREATE INDEX CONCURRENTLY orders_courier_id_idx ON orders (courier_id);`, "migrations/0053_orders_courier_idx.sql"),
        callout("info", "Who holds the lock you are waiting for",
            "`SELECT pid, pg_blocking_pids(pid), wait_event_type, query FROM pg_stat_activity WHERE wait_event_type = 'Lock';` lists each waiting session with the sessions blocking it. Run it whenever a migration seems to hang."),

        h2("Verify"),
        code("bash", `
psql "$DATABASE_URL" -c "SHOW lock_timeout"            # in the migration session: 3s
psql "$DATABASE_URL" -c "SELECT conname, convalidated FROM pg_constraint WHERE conrelid = 'orders'::regclass"
#            conname            | convalidated
# ------------------------------+--------------
#  orders_courier_fk            | t
psql "$DATABASE_URL" -c "SELECT indexrelid::regclass, indisvalid FROM pg_index WHERE indrelid = 'orders'::regclass"
#  orders_courier_id_idx | t                             # f means the concurrent build failed: drop and retry`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A migration tool that wraps every file in a transaction.** `CREATE INDEX CONCURRENTLY` then fails with an error saying it cannot run inside a transaction block. Mark that migration as non-transactional; never wrap it yourself.",
            "**Retrying without a timeout.** A retry loop with no `lock_timeout` still queues everyone on the first attempt. Check the migration logs for `canceling statement due to lock timeout`: that line means the protection worked.",
            "**Forgetting the second step.** A constraint left NOT VALID protects new rows only. Find leftovers with `SELECT conname FROM pg_constraint WHERE NOT convalidated`.",
        ]),

        challenge("chal_quiz_pgp_141"),
        p("Now fix the CI linter that let the incident through. The editor holds the linter with its rule blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are last month's buggy rules on purpose. Run lints sample migrations for PostgreSQL 17 and 10 and compares every finding."),
        challenge("chal_coding_pgp_142"),
    ],
});
