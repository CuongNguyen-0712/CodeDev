// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kfk-1-2",
    title: "Idempotent producers and acks",
    slug: { _type: "slug", current: "kafka-idempotent-producers-acks" },
    description:
        "With acks=1 a leader failure silently dropped an OrderPlaced; with retries but no idempotence a lost acknowledgement wrote another one twice. Learn what acks, min.insync.replicas, retries, delivery timeouts, idempotence and in-flight requests each guarantee, and fix the producer settings so an event is never lost and never stored twice.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api produces order events to orders.v1 (replication factor 3, min.insync.replicas 2). In one month the team saw both failures a producer can cause: an order that never reached courier-matcher after a broker restart, and an order that two couriers were offered at the same time.",
    },

    content: [
        h2("Situation"),
        p("These were the producer settings, chosen for speed:"),
        code("ini", `
acks=1
retries=10
enable.idempotence=false
max.in.flight.requests.per.connection=10`, "api producer settings"),
        bullets([
            "Broker-2, leader of partition 7, shut down right after acknowledging OrderPlaced o-2977. Broker-3 took over without it; o-2977 never reached any consumer, and its offset was reused.",
            "OrderPlaced o-3050 timed out after 30 seconds and was retried. Both requests had been written: the partition holds the same event at offsets 77309 and 77310, and courier-matcher offered the order twice.",
        ]),

        h2("The core you need"),
        bullets([
            "**acks says when a write counts.** `0`: the producer does not wait. `1`: the leader has the record. `all` (`-1`): every replica in the in-sync replica set (ISR) has it. Only `all` survives a leader failure, because the new leader is always chosen from the ISR.",
            "**min.insync.replicas guards acks=all.** With `min.insync.replicas=2`, a write with acks=all needs at least two in-sync replicas; otherwise the broker answers NotEnoughReplicas, which the producer retries. It does nothing for producers using acks=1.",
            "**Retries are bounded by time.** The producer retries retriable errors until `delivery.timeout.ms` (two minutes by default) runs out; `retries` is usually left at its very large default. Each request waits `request.timeout.ms` (30 seconds by default) for an answer.",
            "**A timeout does not mean the write failed.** When an acknowledgement is lost, the producer cannot tell whether the broker stored the record, so a retry can write it again.",
            "**Idempotence removes producer duplicates.** With `enable.idempotence=true` the producer gets a producer id and numbers its records per partition; the broker drops a record whose sequence number it already has and rejects a gap. It requires `acks=all`, retries above zero and at most 5 in-flight requests per connection. Recent clients turn it on by default when the other settings allow it; set it explicitly so a config change cannot turn it off silently.",
            "**In-flight requests and order.** With several requests in flight, a failed first request retried after the second one succeeded lands after it. Idempotence keeps the order for up to 5 in-flight requests, because the broker refuses out-of-sequence records until the gap is filled.",
            "**Transactions are a different tool.** They make a read-process-write step atomic across topics. A producer that only publishes events needs idempotence, not transactions.",
        ]),

        h2("Apply it in the project"),
        p("Set the producer properties explicitly. With `@confluentinc/kafka-javascript` they are passed as librdkafka properties; check the client documentation for the names of its KafkaJS-style options:"),
        code("ini", `
acks=all
enable.idempotence=true
delivery.timeout.ms=120000
max.in.flight.requests.per.connection=5
# retries: keep the client's default (very large); delivery.timeout.ms bounds the total time`, "api producer settings"),
        p("Fail loudly when the time budget runs out, so the order can be marked as not published and retried by the outbox (lesson 6) instead of disappearing:"),
        code("ts", `
try {
  await producer.send({ topic: "orders.v1", messages: [message] });
} catch (error) {
  // delivery.timeout.ms expired or a non-retriable error: the event was NOT confirmed.
  logger.error({ orderId: event.orderId, error }, "order event not published");
  throw error;
}`, "api/src/events/publish.ts"),
        callout("info", "Idempotence is per producer session",
            "The broker deduplicates resends of one producer instance. If the api pod restarts between two attempts, the new producer has a new id and can write the event again. That is why consumers still deduplicate by event id (lesson 4)."),

        h2("Verify"),
        code("bash", `
kafka-topics --bootstrap-server kafka:9092 --describe --topic orders.v1 | head -1
# ... ReplicationFactor: 3  Configs: min.insync.replicas=2
# Stop one broker during a load test, then count events against the api's own count:
kafka-get-offsets --bootstrap-server kafka:9092 --topic orders.v1 \\
  | awk -F: '{ sum += $3 } END { print sum }'
# equals the number of orders the load test placed: nothing lost, nothing doubled`, "terminal"),
        p("In the producer's startup log, the effective configuration lists `enable.idempotence = true` and `acks = -1` (\"all\")."),

        h2("Pitfalls"),
        bullets([
            "**acks=all with min.insync.replicas=1.** The topic default is 1, so acks=all is satisfied by the leader alone and behaves like acks=1 when followers lag. Check `Configs:` in `kafka-topics --describe` for every production topic.",
            "**Incompatible settings.** Asking for idempotence with acks=1 or more than 5 in-flight requests makes the client refuse to start (or, when idempotence was not requested explicitly, run without it). Read the effective configuration in the producer's startup log.",
            "**Retries without a bounded time.** A huge `delivery.timeout.ms` makes a request hang for a long time while the api waits on it. Keep the default two minutes and handle the error.",
        ]),

        challenge("chal_quiz_kfk_121"),
        p("Now fix the settings. The editor holds `main.ts` with `producerConfig()` missing its settings, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are last month's settings on purpose. Run starts the producer and replays four failures against one partition."),
        challenge("chal_coding_kfk_122"),
    ],
});
