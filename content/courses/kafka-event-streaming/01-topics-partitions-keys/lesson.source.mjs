// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kfk-1-1",
    title: "Topics, partitions and message keys",
    slug: { _type: "slug", current: "kafka-topics-partitions-keys" },
    description:
        "Rice Rocket's first order events reached consumers out of order, and the fix that keyed them by restaurant made one partition carry a whole chain's lunch rush. Learn what Kafka orders and what it does not - partitions, keys, the default partitioner, partition counts and replication - and key the order events so each order stays in order and the load spreads.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api now publishes every order event (OrderPlaced, OrderAccepted, CourierAssigned, OrderDelivered, OrderCancelled) to the topic orders.v1, and three services consume it: courier-matcher, notifications and analytics. Customers got \"Your courier is here\" before \"A courier accepted your order\", and a week later courier-matcher fell 18,000 events behind at lunch while most of its consumers sat idle.",
    },

    content: [
        h2("Situation"),
        p("The first producer, in the api, sent each event without a key:"),
        code("ts", `
await producer.send({
  topic: "orders.v1",
  messages: [{ value: JSON.stringify(event) }],
});`, "api/src/events/publish.ts"),
        bullets([
            "For order o-1842 the four events landed in partitions 3, 0, 5 and 1, and notifications processed OrderDelivered before CourierAssigned.",
            "The quick fix used `key: event.restaurantId`. At lunch, partition 4 had a lag of 18,225 while the other eleven had under 10: most lunch orders come from one restaurant chain.",
        ]),

        h2("The core you need"),
        bullets([
            "**A topic is split into partitions, and each partition is an ordered, append-only log.** Every record gets an offset in its partition. Kafka guarantees order within a partition only; across partitions there is no order at all.",
            "**A consumer group reads each partition with exactly one of its consumers.** Partitions are processed independently and in parallel, so two events in different partitions can be handled in either order. More consumers than partitions leaves the extra ones idle.",
            "**The key picks the partition.** The default partitioner hashes the key bytes with murmur2 and takes the result modulo the partition count, so the same key always lands in the same partition. Records without a key are spread over partitions with no order between them.",
            "**Key by the entity whose events must stay in order.** For order events that is the order id: all of one order's events share a partition, and thousands of order ids spread evenly. A coarse key (restaurant, city) makes a hot partition as soon as one value carries most of the traffic.",
            "**Choose the partition count up front.** Adding partitions later changes `hash mod count`, so existing keys move and an order can be split across two partitions for a while. Partitions can be added, never removed. The count also caps a group's parallelism.",
            "**Replication protects the data.** A production topic uses replication factor 3 and `min.insync.replicas` 2: one broker can be down and writes still succeed with two copies. Kafka 4 runs in KRaft mode, so topics are managed by the brokers' own controllers, with no ZooKeeper.",
        ]),

        h2("Apply it in the project"),
        p("Create the topic once, with room to grow:"),
        code("bash", `
kafka-topics --bootstrap-server kafka:9092 --create --topic orders.v1 \\
  --partitions 12 --replication-factor 3 --config min.insync.replicas=2`, "terminal"),
        p("Key every event by its order id and put the event type and schema version in headers, so a consumer can skip or route an event before parsing it. The client is `@confluentinc/kafka-javascript`, whose promise API follows the KafkaJS style (KafkaJS itself is no longer actively maintained):"),
        code("ts", `
import { KafkaJS } from "@confluentinc/kafka-javascript";

const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: process.env.KAFKA_BROKERS!.split(",") } });
const producer = kafka.producer();
await producer.connect();

export async function publish(event: OrderEvent) {
  await producer.send({
    topic: "orders.v1",
    messages: [{
      key: event.orderId,
      value: JSON.stringify(event),
      headers: { "event-type": event.type, "schema-version": "1" },
    }],
  });
}`, "api/src/events/publish.ts"),
        callout("info", "When one order is not the unit",
            "Key by a coarser entity only when events of different orders must be ordered relative to each other, for example a restaurant's menu changes. Then size partitions for the busiest key, or split that key (restaurant id plus a bucket) and accept ordering per bucket."),

        h2("Verify"),
        code("bash", `
kafka-topics --bootstrap-server kafka:9092 --describe --topic orders.v1 | head -1
# Topic: orders.v1  PartitionCount: 12  ReplicationFactor: 3  Configs: min.insync.replicas=2
kafka-console-consumer --bootstrap-server kafka:9092 --topic orders.v1 --from-beginning \\
  --property print.key=true --property print.partition=true | grep o-2005
# Partition:7  o-2005  {"type":"OrderPlaced",...}
# Partition:7  o-2005  {"type":"OrderAccepted",...}
# Partition:7  o-2005  {"type":"CourierAssigned",...}
# Partition:7  o-2005  {"type":"OrderDelivered",...}
kafka-consumer-groups --bootstrap-server kafka:9092 --describe --group courier-matcher
# the LAG column stays in the same range on all 12 partitions during the lunch rush`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A key that is too fine.** Keying by event id spreads the load perfectly and splits every order across partitions, which is the same as no key for ordering. Detect it by grepping one order id in a console consumer with `print.partition=true`.",
            "**Growing partitions under traffic.** `--alter --partitions` remaps most keys at once. Detect the risk before running it: any consumer that relies on per-key order sees a short window of mixed order. Plan the count for a few years of growth, or migrate to a new topic.",
            "**Replication factor 1 in production.** A topic created with the defaults of a dev cluster may have one replica: one broker restart loses its partitions until it comes back. Check `ReplicationFactor` in `kafka-topics --describe`.",
        ]),

        challenge("chal_quiz_kfk_111"),
        p("Now key the events. The editor holds `main.ts` with the topic spec and `toMessage` missing their key blocks, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first attempts on purpose. Run produces a lunch rush into an in-memory broker with Kafka's default partitioner and checks order per order and the spread over partitions."),
        challenge("chal_coding_kfk_112"),
    ],
});
