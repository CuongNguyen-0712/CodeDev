// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-2-3",
    title: "Transactional outbox & idempotent consumers",
    slug: { _type: "slug", current: "transactional-outbox-idempotent-consumers" },
    description:
        "A deploy restarts the top-up service between COMMIT and publish, and 312 paid top-ups never reach the wallets. Fix the dual write with a transactional outbox and a relay, then make the consumer idempotent so at-least-once delivery never credits a wallet twice.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, wallet ledger team of an e-wallet",
        problem:
            "Wednesday, 16:05. A rolling deploy restarts the top-up service. 312 bank top-ups are committed in PostgreSQL, but the WalletCredited events were still in process memory and are never published: customers paid and see no money. The hotfix republishes events on startup - and the next Kafka consumer rebalance redelivers a batch, crediting 57 wallets twice. Finance now has both missing and duplicated money to reconcile.",
    },

    content: [
        h2("1. The incident"),
        p("The top-up handler looked correct in code review: store the top-up, then tell the wallet service about it."),
        code("javascript", `
async function confirmTopup(db, kafka, topup) {
    await db.query(
        "INSERT INTO topups (id, wallet_id, amount, status) VALUES ($1, $2, $3, 'confirmed')",
        [topup.id, topup.walletId, topup.amount],
    );
    // <- a deploy, an OOM kill or a broker timeout here loses the event forever
    await kafka.send({
        topic: "wallet-events",
        messages: [{ key: topup.walletId, value: JSON.stringify({ type: "WalletCredited", ...topup }) }],
    });
}`, "src/topups/confirm.js"),
        p("Two systems are written, one after the other, with no transaction spanning both. Any crash between the two writes leaves them disagreeing - and on the consumer side, the broker's redelivery after a rebalance turned the 'fix' into double credits. Both halves of the incident have the same root cause: the code assumed each message happens **exactly once**."),

        h2("2. The dual-write problem"),
        p("PostgreSQL and Kafka cannot commit together. Whatever order you choose, one failure mode remains:"),
        bullets([
            "**Commit, then publish**: a crash after `COMMIT` loses the event. The top-up exists, the wallet is never credited.",
            "**Publish, then commit**: a crash or a constraint violation before `COMMIT` leaves an event for a top-up that does not exist. The wallet is credited with money that never arrived.",
            "**Publish inside the transaction**: the broker cannot be rolled back, so a later rollback still leaves the event out. You have also made the transaction as slow as the broker.",
        ]),
        p("Distributed transactions (two-phase commit) between a database and a broker are rarely available and are slow and fragile when they are. The practical answer is to stop writing to two systems in the request at all."),
        challenge("chal_quiz_nhp_221"),

        h2("3. The outbox table"),
        p("Write the event **into the same database, in the same transaction**, as the business change. Either both rows commit or neither does - the dual write becomes a single write."),
        code("sql", `
CREATE TABLE outbox (
    id            bigserial   PRIMARY KEY,         -- also the publish order
    message_id    uuid        NOT NULL UNIQUE,     -- stable id the consumer deduplicates on
    aggregate_id  text        NOT NULL,            -- walletId: the ordering / partition key
    type          text        NOT NULL,
    payload       jsonb       NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    published_at  timestamptz
);
CREATE INDEX outbox_unpublished ON outbox (id) WHERE published_at IS NULL;`),
        code("javascript", `
import { randomUUID } from "node:crypto";

async function confirmTopup(pool, topup) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            "INSERT INTO topups (id, wallet_id, amount, status) VALUES ($1, $2, $3, 'confirmed')",
            [topup.id, topup.walletId, topup.amount],
        );
        await client.query(
            "INSERT INTO outbox (message_id, aggregate_id, type, payload) VALUES ($1, $2, 'WalletCredited', $3)",
            [randomUUID(), topup.walletId, { topupId: topup.id, walletId: topup.walletId, amount: topup.amount }],
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}`, "src/topups/confirm.js"),
        image("outbox-relay-consumer", {
            alt: "The top-up API writes the top-up and an outbox row in one PostgreSQL transaction. A relay polls the outbox and publishes to Kafka keyed by walletId. The wallet consumer inserts into processed_messages and updates the wallet in one transaction.",
            caption: "Two transactions, one on each side of the broker. The relay in between may publish an event more than once.",
        }),

        h2("4. The relay: at-least-once, in order"),
        p("A separate loop (the **relay**) reads unpublished rows, publishes them and marks them as published. It can run inside the same service or as its own process:"),
        code("javascript", `
async function relayBatch(pool, producer) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            \`SELECT id, message_id, aggregate_id, type, payload
             FROM outbox
             WHERE published_at IS NULL
             ORDER BY id
             LIMIT 100
             FOR UPDATE SKIP LOCKED\`,
        );
        if (rows.length > 0) {
            await producer.send({
                topic: "wallet-events",
                messages: rows.map((row) => ({
                    key: row.aggregate_id,                        // same wallet -> same partition
                    headers: { "message-id": row.message_id },
                    value: JSON.stringify({ type: row.type, ...row.payload }),
                })),
            });
            await client.query("UPDATE outbox SET published_at = now() WHERE id = ANY($1)", [rows.map((r) => r.id)]);
        }
        await client.query("COMMIT");
        return rows.length;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}`, "src/outbox/relay.js"),
        p("Look at the gap between `producer.send()` and the `UPDATE`. If the relay dies there, Kafka has the messages but the rows are still unpublished, and the next run sends them again. The outbox turns 'sometimes lost' into **at-least-once**: nothing is lost, but duplicates are normal, not exceptional."),
        h3("Ordering per aggregate"),
        p("Consumers usually need the events of **one wallet** in order (credit before the debit that spends it); events of different wallets can be processed in parallel. Get that by publishing in outbox `id` order with the wallet id as the message key: Kafka keeps order within a partition, and one key always maps to one partition."),
        callout("warning", "Parallel relays can reorder",
            "SKIP LOCKED lets several relays share the table, but two relays can then publish events of the same wallet out of order. If per-aggregate order matters, run one active relay (leader election or an advisory lock), or shard relays by aggregate. Change data capture (for example Debezium reading the PostgreSQL WAL) is an alternative relay that preserves commit order without polling."),
        p("Operate the outbox like any queue: alert on the age of the oldest unpublished row, and delete published rows after a retention period so the table stays small."),
        challenge("chal_quiz_nhp_223"),

        h2("5. Idempotent consumers"),
        p("Because delivery is at-least-once, the consumer is where 'exactly once' is finally achieved - as **exactly-once effect**. The consumer records every message id it has applied, and the record is written **in the same transaction as the side effect**:"),
        code("sql", `
CREATE TABLE processed_messages (
    consumer      text        NOT NULL,      -- several consumers may read the same topic
    message_id    uuid        NOT NULL,
    processed_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer, message_id)
);

BEGIN;
INSERT INTO processed_messages (consumer, message_id)
VALUES ('wallet-credit', $1)
ON CONFLICT DO NOTHING;                 -- 0 rows: already applied -> ROLLBACK, ack, stop
UPDATE wallets SET balance = balance + $3 WHERE id = $2;
COMMIT;                                 -- ack the message only after this succeeds`),
        p("Three details carry the whole guarantee:"),
        numbered([
            "**The primary key decides, not a prior SELECT.** Two deliveries that run at the same time can both see 'not processed'. Only one of them can insert the row; the other one's INSERT waits and then reports a conflict.",
            "**Same transaction as the side effect.** Marking a message processed in its own commit and crediting afterwards means a failed credit is remembered as done - the money is silently lost.",
            "**Ack after commit, and let failures fail.** If the transaction throws, do not acknowledge the message; the broker redelivers it and the retry runs from a clean, rolled-back state.",
        ]),
        challenge("chal_fix_nhp_222", "Use the boolean returned by insertProcessed as the only dedupe decision, and run it in the same db.transaction() as the credit. Let errors propagate."),
        callout("tip", "When the side effect is not in your database",
            "If the consumer calls an external API instead of updating a local table, you cannot share a transaction with it. Pass the message id as that API's idempotency key (lesson 2.1) so a redelivery replays the first result instead of repeating the effect."),

        h2("6. Checklist"),
        bullets([
            "Never write to the database and the broker in the same request path; write an outbox row in the business transaction instead.",
            "Give every event a stable message id at creation time and carry it in a header.",
            "Relay in outbox order with the aggregate id as the message key; avoid parallel relays when per-aggregate order matters.",
            "Treat delivery as at-least-once everywhere: relay crashes, retries and consumer rebalances all produce duplicates.",
            "Consumers insert into `processed_messages` (unique message id) in the same transaction as the side effect, and ack only after commit.",
            "Monitor the oldest unpublished outbox row and prune published rows and old processed ids on a schedule.",
        ]),
    ],
});
