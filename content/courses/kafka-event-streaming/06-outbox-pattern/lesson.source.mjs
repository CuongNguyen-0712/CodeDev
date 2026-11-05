// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kfk-3-1",
    title: "The outbox pattern from the database to Kafka",
    slug: { _type: "slug", current: "kafka-transactional-outbox" },
    description:
        "Rice Rocket's order api wrote the order to PostgreSQL and then produced OrderPlaced to Kafka: a broker blip left orders with no event, and swapping the two calls produced events for orders that rolled back. Learn why two systems cannot be written atomically, write events to an outbox table in the order's own transaction, and build the relay that moves them to Kafka without losing one.",
    estimatedTime: 17,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Every change of an order (placed, paid, assigned, cancelled) must reach orders.v1, where the courier-matcher and the notification service read it. The api writes the order to PostgreSQL 17 and publishes the event, and the two writes keep disagreeing.",
    },

    content: [
        h2("Situation"),
        p("The first version committed the order, then published:"),
        code("ts", `
await db.query("INSERT INTO orders (id, status, ...) VALUES ($1, 'placed', ...)", [order.id]);
await producer.send({ topic: "orders.v1", messages: [{ key: order.id, value: JSON.stringify(placed) }] });`, "src/orders/place.ts"),
        bullets([
            "On a Friday evening the brokers rolled for an upgrade. For about 40 seconds `send` failed after the INSERT had committed: 31 orders were placed and paid, and no courier was ever asked to take them.",
            "The quick fix swapped the two lines. A week later a serialization failure rolled back the INSERT after `send` had succeeded: the courier-matcher assigned a courier to an order that did not exist.",
        ]),
        p("Neither order of the two calls is safe: there is always a moment when one write is done and the other is not, and the process can die or a call can time out exactly then."),

        h2("The core you need"),
        bullets([
            "**The dual-write problem.** PostgreSQL and Kafka do not share a transaction. Nesting the send inside the database transaction does not help either: the broker can store the event and the COMMIT still fail.",
            "**The outbox: one transaction, two tables.** The api inserts the order and a row in an `outbox` table in the same transaction. Either both are committed or neither is: no event without its order, no order without its event.",
            "**A relay moves the rows.** It reads unsent rows oldest first (`ORDER BY id`), publishes them, waits for the broker's acknowledgement, and only then marks them sent. If it dies between publishing and marking, it sends those rows again: delivery is at least once.",
            "**Consumers dedupe by event id.** Every outbox row carries a unique event id, sent as a header. A consumer records the ids it has processed (for example in its own table, in the same transaction as its own change) and skips repeats.",
            "**Ordering per order.** Publish with the order id as the key, so all events of one order go to one partition, in the order of the outbox ids. A relay that reads without `ORDER BY` or publishes without a key can deliver OrderCancelled before OrderPlaced.",
            "**Change data capture is the other relay.** A connector such as Debezium reads committed outbox inserts from the write-ahead log instead of polling the table. The api's transaction stays the same.",
        ]),

        h2("Apply it in the project"),
        p("The outbox table, with a partial index so the relay's query stays fast however many sent rows remain:"),
        code("sql", `
CREATE TABLE outbox (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aggregate_id  text        NOT NULL,              -- the order id, used as the Kafka key
    event_id      text        NOT NULL UNIQUE,       -- consumers dedupe on it
    type          text        NOT NULL,              -- OrderPlaced, OrderPaid, ...
    payload       jsonb       NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    sent_at       timestamptz
);
CREATE INDEX outbox_unsent ON outbox (id) WHERE sent_at IS NULL;`, "migrations/0042_outbox.sql"),
        p("Placing an order writes both rows in one transaction:"),
        code("ts", `
await db.transaction(async (tx) => {
  await tx.query("INSERT INTO orders (id, status, ...) VALUES ($1, 'placed', ...)", [order.id]);
  await tx.query(
    "INSERT INTO outbox (aggregate_id, event_id, type, payload) VALUES ($1, $2, 'OrderPlaced', $3)",
    [order.id, \`\${order.id}:1\`, JSON.stringify(placed)],
  );
});`, "src/orders/place.ts"),
        p("The relay runs as its own process (one replica) every second:"),
        code("ts", `
function relayOnce(db: Db, producer: Producer, batchSize: number): number {
  const rows = db.query(
    "SELECT id, aggregate_id, event_id, type, payload FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT $1",
    [batchSize],
  );
  if (rows.length === 0) return 0;
  producer.send("orders.v1", rows.map((row) => ({
    key: row.aggregateId,
    value: row.payload,
    headers: { "event-id": row.eventId, "event-type": row.type },
  })));
  db.query("UPDATE outbox SET sent_at = now() WHERE id = ANY($1)", [rows.map((row) => row.id)]);
  return rows.length;
}`, "src/outbox-relay.ts"),
        callout("info", "Why one relay replica",
            "Two relays polling the same table send the same rows twice and, worse, can publish two events of one order in the wrong order. Run a single replica (a Kubernetes Deployment with `replicas: 1` and the Recreate strategy), or take a PostgreSQL advisory lock at the start of each pass so only one relay works at a time."),

        h2("Verify"),
        code("bash", `
# Nothing waits for long: the oldest unsent row is seconds old.
psql "$DATABASE_URL" -c "SELECT count(*) AS unsent, now() - min(created_at) AS oldest FROM outbox WHERE sent_at IS NULL"
#  unsent |     oldest
# --------+-----------------
#       2 | 00:00:00.812

# Every event of one order is on one partition, in order:
kafka-console-consumer.sh --bootstrap-server $BROKERS --topic orders.v1 --from-beginning \\
  --property print.partition=true --property print.key=true | grep o-2002
# Partition:4  o-2002  {"eventId":"o-2002:1","type":"OrderPlaced",...}
# Partition:4  o-2002  {"eventId":"o-2002:2","type":"OrderCancelled",...}`, "terminal"),
        p("Then stop the brokers for a minute in staging: the unsent count grows, and drains to zero when they are back, with no order missing its events."),

        h2("Pitfalls"),
        bullets([
            "**Marking before publishing.** It looks like it avoids duplicates, but when `send` fails after the UPDATE the rows are marked sent and never published. Detect it by comparing outbox ids with what the consumer saw after a broker outage in staging.",
            "**Consumers that assume exactly once.** A relay crash re-sends the last batch. A consumer without an event-id check charges or assigns twice. Kill the relay mid-batch in staging and count processed event ids.",
            "**An outbox that only grows.** Sent rows pile up and the table bloats. Delete sent rows older than a few days in a nightly job (lesson 9 of the Kubernetes course), or partition the table by day and drop old partitions.",
        ]),

        challenge("chal_quiz_kfk_161"),
        p("Now write the relay. The editor holds `src/outbox-relay.ts` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are tempting shortcuts on purpose. Run commits orders pass by pass, rolls some transactions back, takes the broker down and kills the relay at the worst moments, then checks what reached `orders.v1`."),
        challenge("chal_coding_kfk_162"),
    ],
});
