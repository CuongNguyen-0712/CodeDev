// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pgp-1-2",
    title: "Statement timeouts and idle transactions",
    slug: { _type: "slug", current: "postgres-statement-timeouts-idle-transactions" },
    description:
        "A checkout locked an order row, then waited three minutes on a payment provider while every other checkout for that order queued behind it; a 40-minute analytics query ran on the primary the same day. Learn PostgreSQL's timeouts, how to read pg_stat_activity, and the difference between cancelling a query and terminating a session, then fix the watchdog that enforces them.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Orders for one popular restaurant hung for three minutes at dinner time. The database was not overloaded: one session held a row lock and did nothing, and nothing in the stack had a time limit.",
    },

    content: [
        h2("Situation"),
        p("The checkout handler, simplified:"),
        code("ts", `
await db.query("BEGIN");
const order = await db.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
const payment = await paymentProvider.charge(order.rows[0]);   // hung for 3 minutes
await db.query("UPDATE orders SET status = 'paid', payment_id = $2 WHERE id = $1", [orderId, payment.id]);
await db.query("COMMIT");`, "api/src/checkout.ts"),
        p("What the database showed while customers waited:"),
        code("text", `
rocket=# SELECT pid, usename, state, wait_event_type, now() - state_change AS in_state, left(query, 50)
         FROM pg_stat_activity WHERE backend_type = 'client backend' AND state <> 'idle';
  pid  |  usename  |        state        | wait_event_type | in_state |                 left
-------+-----------+---------------------+-----------------+----------+---------------------------------------
 31337 | api       | idle in transaction | Client          | 00:02:58 | SELECT * FROM orders WHERE id = $1 FOR
 31401 | api       | active              | Lock            | 00:02:50 | SELECT * FROM orders WHERE id = $1 FOR
 31402 | api       | active              | Lock            | 00:02:41 | SELECT * FROM orders WHERE id = $1 FOR
 31500 | analytics | active              |                 | 00:40:12 | SELECT date_trunc('hour', created_at),`, "terminal"),

        h2("The core you need"),
        bullets([
            "**Read `state` first.** `active` runs a query; `idle` waits for the next one (normal for pooled connections); `idle in transaction` has an open transaction and runs nothing, still holding every lock it took. `wait_event_type = Lock` means waiting for someone else's lock.",
            "**Three clocks.** `xact_start` is when the transaction began, `query_start` when the current or last query began, `state_change` when the state last changed. How long a session has been idle is `now() - state_change`.",
            "**One timeout per failure.** `statement_timeout` cancels a statement that runs too long; `lock_timeout` limits the wait for a lock; `idle_in_transaction_session_timeout` terminates a session idle inside a transaction; PostgreSQL 17 adds `transaction_timeout` for a whole transaction; `idle_session_timeout` ends idle sessions (rarely wanted behind a pool).",
            "**Set them where they belong.** Per role (`ALTER ROLE api SET statement_timeout = '5s'`) for the defaults, applied when a session starts; per transaction (`SET LOCAL statement_timeout = '10min'`) for the one report that needs longer.",
            "**Cancel or terminate.** `pg_cancel_backend(pid)` stops the running query and keeps the session; `pg_terminate_backend(pid)` ends the session and rolls back its transaction. A session idle in a transaction runs no query, so only terminating it frees its locks.",
            "**Never wait on the network inside a transaction.** Call the payment provider first (with an idempotency key), then open a short transaction to record the result.",
        ]),

        h2("Apply it in the project"),
        p("The checkout no longer holds a lock while it talks to the provider, and gives up quickly on a busy row:"),
        code("ts", `
const payment = await paymentProvider.charge({ orderId, idempotencyKey: \`order-\${orderId}\` });
await db.query("BEGIN");
await db.query("SET LOCAL lock_timeout = '2s'");
await db.query("UPDATE orders SET status = 'paid', payment_id = $2 WHERE id = $1 AND status = 'pending'", [orderId, payment.id]);
await db.query("COMMIT");`, "api/src/checkout.ts"),
        p("And the database enforces the limits for each role, so a bug in one handler cannot hold locks for minutes:"),
        code("sql", `
ALTER ROLE api       SET statement_timeout = '5s';
ALTER ROLE api       SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE api       SET lock_timeout = '3s';
ALTER ROLE analytics SET statement_timeout = '15min';   -- better: run it on a read replica`, "db/roles.sql"),
        callout("info", "Why the watchdog still exists",
            "Role settings reach a session only when it connects, and pools keep connections for hours. Until every connection has been recycled, and for roles nobody configured, a small watchdog that reads `pg_stat_activity` catches what the settings miss."),

        h2("Verify"),
        code("bash", `
psql "host=pgbouncer.rice-rocket port=6432 dbname=rocket user=api" -c "SHOW idle_in_transaction_session_timeout;"
#  30s                          <- a fresh connection has the role settings
psql "host=db.internal.ricerocket.vn dbname=rocket user=api" <<'SQL'
BEGIN; SELECT 1;
\\! sleep 35
SELECT 2;
SQL
# FATAL:  terminating connection due to idle-in-transaction timeout   (the session sat idle in its transaction for 35s)
psql "host=db.internal.ricerocket.vn dbname=rocket user=api" -c "SELECT pg_sleep(10);"
# ERROR:  canceling statement due to statement timeout`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Expecting ALTER ROLE to change live sessions.** Pooled connections keep their old settings until they reconnect. Check with `SHOW statement_timeout` on a new connection, and recycle the pool (PgBouncer's `RECONNECT`, or a rolling restart).",
            "**A statement_timeout that breaks migrations.** `CREATE INDEX` on a big table runs longer than 5s and fails halfway. Give the migration role its own settings, or `SET statement_timeout = 0` inside the migration's session.",
            "**Cancelling an idle-in-transaction session.** `pg_cancel_backend` returns true and changes nothing; the lock stays. Watch `state` after the call, and use `pg_terminate_backend` for these sessions.",
        ]),

        challenge("chal_quiz_pgp_121"),
        p("Now fix the watchdog. The editor starts from `watchdog.py` with its decision blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are last week's buggy versions on purpose. Run feeds it snapshots of `pg_stat_activity`, including the stuck checkout and the replication connection it once killed."),
        challenge("chal_coding_pgp_122"),
    ],
});
