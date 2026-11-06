// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-jrm-2-2",
    title: "The transactional outbox and at-least-once delivery",
    slug: { _type: "slug", current: "java-transactional-outbox" },
    description:
        "Rice Rocket's order-service sent OrderPlaced from inside its database transaction: couriers got offers for orders that had rolled back, and checkout stopped whenever Kafka did. Learn the outbox pattern in Spring Boot - the event row written in the order's transaction, a relay that claims rows with FOR UPDATE SKIP LOCKED, publishes, waits for the acknowledgement and only then marks the row sent - and fix the relay.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The order-service (Spring Boot, PostgreSQL) publishes OrderPlaced to the Kafka topic orders.v1, which the courier-matcher consumes. Two incidents in one week: offers for orders that did not exist, and a 20-minute checkout outage during a Kafka upgrade.",
    },

    content: [
        h2("Situation"),
        p("The checkout method, and what the logs showed for one of the phantom orders:"),
        code("java", `
@Transactional
public Order place(PlaceOrder cmd) {
    Order order = orders.save(Order.from(cmd));                  // INSERT is flushed at commit
    kafka.send("orders.v1", order.id(), new OrderPlaced(order.id()));
    return order;
}`, "OrderService.java"),
        code("text", `
10:42:07.118 KafkaProducer        sent orders.v1 key=o-88213 offset=91822
10:42:07.131 SqlExceptionHelper   ERROR: duplicate key value violates unique constraint "orders_idempotency_key"
10:42:07.132 TransactionInterceptor rolling back order placement
-- during the Kafka upgrade, 14:03-14:23:
14:03:41.904 OrderController      POST /orders 500 org.apache.kafka.common.errors.TimeoutException`, "order-service logs"),
        bullets([
            "Kafka accepted the event 13 ms before PostgreSQL refused the order: the courier-matcher offered a delivery for an order that never existed.",
            "While Kafka was unavailable, `kafka.send` timed out inside the request and every checkout returned 500.",
            "Moving the send after the commit (an `@TransactionalEventListener(AFTER_COMMIT)`) fixes the first problem and creates another: a pod restart between commit and send loses the event.",
        ]),

        h2("The core you need"),
        bullets([
            "**`@Transactional` covers the database only.** A Kafka send inside it is a second system with its own outcome; no rollback can recall a record that Kafka acknowledged.",
            "**The outbox.** In the same transaction as the order, insert a row into an `outbox` table (`id`, `aggregate_id`, `type`, `payload`, `sent_at`). The order and the intent to publish now commit or roll back together, and checkout no longer depends on Kafka being up.",
            "**The relay.** A scheduled job (or Debezium reading the WAL) publishes committed outbox rows in id order, with the order id as the Kafka key, and marks a row sent only after Kafka acknowledged it. A crash between the two re-sends the row: delivery is at least once, so consumers dedupe by event id (lesson 4).",
            "**Several relay pods.** `SELECT ... FOR UPDATE SKIP LOCKED` lets each pod lock its own batch and skip rows another pod holds, without waiting. Without a lock clause both pods read the same rows; with `FOR UPDATE` alone the second pod blocks until the first commits.",
            "**Order across pods is not free.** Each batch is in id order, but two pods can publish two events of one order from different batches in the wrong order. Run one active relay, partition the claim by a hash of `aggregate_id`, or let consumers check a per-order version.",
        ]),

        h2("Apply it in the project"),
        p("Checkout writes the order and its event; nothing talks to Kafka:"),
        code("java", `
@Transactional
public Order place(PlaceOrder cmd) {
    Order order = orders.save(Order.from(cmd));
    outbox.save(OutboxEvent.of(order.id(), "OrderPlaced", json.write(new OrderPlaced(order.id()))));
    return order;
}`, "OrderService.java"),
        p("The relay claims a batch, publishes each row and waits for the acknowledgement before marking it:"),
        code("java", `
@Component
class OutboxRelay {
    private static final String CLAIM = """
        SELECT id, aggregate_id, type, payload FROM outbox
        WHERE sent_at IS NULL ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED""";

    @Scheduled(fixedDelay = 500)
    @Transactional
    public void relay() {
        for (OutboxRow row : jdbc.query(CLAIM, OutboxRow.MAPPER, 100)) {
            try {
                kafka.send("orders.v1", row.aggregateId(), row.payload()).get(10, TimeUnit.SECONDS);
            } catch (Exception e) {
                break;                      // Kafka not reachable: the rest stays for the next poll
            }
            jdbc.update("UPDATE outbox SET sent_at = now() WHERE id = ?", row.id());
        }
    }
}`, "OutboxRelay.java"),
        callout("info", "Debezium instead of a poller",
            "A change-data-capture connector reads committed outbox inserts from PostgreSQL's write-ahead log and publishes them, with no polling query and no `sent_at` column. It is one more system to run; the guarantees are the same at-least-once."),

        h2("Verify"),
        code("bash", `
# events waiting longer than a minute (alert on this, not on CPU)
psql -c "SELECT count(*), min(created_at) FROM outbox WHERE sent_at IS NULL AND created_at < now() - interval '1 minute'"
# stop Kafka for a minute, place orders, start it again: checkout keeps answering 201
for i in 1 2 3; do curl -s -o /dev/null -w '%{http_code}\\n' -X POST localhost:8080/orders -d @order.json; done
# 201 201 201
# every committed order has exactly one OrderPlaced (dedupe by event id on the consumer side)
kafka-console-consumer --bootstrap-server kafka:9092 --topic orders.v1 --from-beginning --timeout-ms 5000 | wc -l`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Not waiting for the acknowledgement.** `KafkaTemplate.send` returns a future; marking the row sent right after calling it marks events that may still fail. Wait on the future (with a timeout) before the UPDATE; detect it by stopping Kafka and checking for rows marked sent that never reached the topic.",
            "**An outbox that only grows.** Delete or archive sent rows on a schedule (or partition the table by day); a large outbox slows the claim query. Watch the table size and the claim query time.",
            "**Assuming exactly once.** A relay pod killed after Kafka acknowledged but before its transaction committed publishes the row again on the next poll. Consumers must treat a repeated event id as already handled.",
        ]),

        challenge("chal_quiz_jrm_151"),
        p("Now fix the relay. The editor holds `Main.java` with the three places to fix missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat last week's bugs on purpose. Run replays a rolled-back order, a Kafka outage, a failure in the middle of a batch and two relay pods polling together, and reports what reached Kafka."),
        challenge("chal_coding_jrm_152"),
    ],
});
