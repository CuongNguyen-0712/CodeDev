// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kfk-2-3",
    title: "Retries and dead-letter topics",
    slug: { _type: "slug", current: "kafka-retries-dead-letter-topics" },
    description:
        "One OrderPlaced event without an address stopped Rice Rocket's courier-matcher on a whole partition for 25 minutes; the quick fix that skipped failures then lost real orders during a maps outage. Learn to sort failures into retryable and not, retry through delayed topics without blocking the partition, and park what cannot be fixed in a dead-letter topic someone owns.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The courier-matcher consumes OrderPlaced events from orders.v1 (6 partitions, key = order id) and asks the maps API for travel times before it picks a courier. Two incidents in one week came from the same place: what the consumer does when matching an order fails.",
    },

    content: [
        h2("Situation"),
        p("This was the consumer's message handler. Any exception escaped `eachMessage`:"),
        code("ts", `
await consumer.run({
  eachMessage: async ({ message }) => {
    const order = OrderPlaced.parse(JSON.parse(message.value!.toString()));
    await matchCourier(order);           // calls the maps API
  },
});`, "src/consumer.ts"),
        bullets([
            "Monday, 11:42: one order arrived without an address. `parse` threw, the client did not commit, re-delivered the same record, and it threw again. Partition 5 stopped; about 2,000 orders on it waited 25 minutes while the other five partitions were fine.",
            "The hotfix wrapped the handler in `try { ... } catch { log.warn(...) }`. Thursday, 18:05: the maps API answered 503 for five minutes during the dinner peak. Every order in those five minutes was logged and skipped: their customers never got a courier.",
        ]),
        p("Both versions treat every failure the same way. One record must not hold up the partition, and an order that only needs a second try must not be dropped."),

        h2("The core you need"),
        bullets([
            "**A partition is consumed in order, one record at a time per group.** The committed offset only moves past a record when the handler finishes. A handler that keeps throwing on one record holds up every record behind it on that partition: retrying in place blocks.",
            "**Two kinds of failure.** Some cannot be fixed by waiting: invalid data, a schema the consumer does not understand. Retrying them only burns time. Others are transient: timeouts, 503s, a failover. They usually succeed a little later.",
            "**Retry topics give delayed retries without blocking.** On a transient failure, publish the record to `orders.v1.retry.30s` and move on. A separate consumer reads that topic and handles each record only when it is 30 seconds old (it pauses the partition until then). A second failure goes to `orders.v1.retry.5m`; a third goes to the dead-letter topic.",
            "**The dead-letter topic (DLT) is a queue someone owns.** Records land there with enough context to act on: the attempt count, the last error, where the record came from (topic, partition, offset) and when it first failed. Alert on its size, and keep a tool that replays a fixed record to `orders.v1`.",
            "**The trade-off: ordering.** A record that goes to a retry topic leaves its partition's order. If two events of the same order must stay in sequence (OrderPlaced, then OrderCancelled), the consumer of the later one has to cope with it arriving first, or the team keeps per-key ordering with a slower blocking retry. Decide per topic.",
        ]),

        h2("Apply it in the project"),
        p("The handler now catches every failure, asks a routing function where the record goes, publishes it there and returns, so the offset is committed:"),
        code("ts", `
const RETRY_TOPICS = ["orders.v1.retry.30s", "orders.v1.retry.5m"];
const DEAD_LETTER_TOPIC = "orders.v1.dlt";

function routeFailure(record: Record_, failure: Failure, nowMs: number) {
  const previous = record.headers ?? {};
  const attempts = Number(previous["x-attempts"] ?? "0") + 1;
  const headers = {
    ...previous,
    "x-original-topic": previous["x-original-topic"] ?? record.topic,
    "x-original-partition": previous["x-original-partition"] ?? String(record.partition),
    "x-original-offset": previous["x-original-offset"] ?? String(record.offset),
    "x-first-failed-at": previous["x-first-failed-at"] ?? String(nowMs),
    "x-attempts": String(attempts),
    "x-error": \`\${failure.kind}: \${failure.message}\`,
  };
  if (failure.kind === "validation" || failure.kind === "schema") return { topic: DEAD_LETTER_TOPIC, headers };
  return { topic: RETRY_TOPICS[attempts - 1] ?? DEAD_LETTER_TOPIC, headers };
}`, "src/failures.ts"),
        p("In the real service the same handler runs for the main topic and both retry topics; the retry consumers check the record's timestamp and pause the partition until it is due. With `@confluentinc/kafka-javascript` and its KafkaJS-compatible API that is `consumer.pause([{ topic, partitions: [partition] }])` and a timer that resumes it; check the client's documentation for the exact calls in your version."),
        callout("info", "Why the headers keep their first value",
            "A record on `orders.v1.retry.5m` was written there by the retry consumer, so its own topic and offset point at the retry topic. The `x-original-*` headers are copied only when they are missing, so the DLT entry still says `orders.v1-5@18342`: the offset to inspect and the place to replay to."),

        h2("Verify"),
        code("bash", `
# The partition keeps moving: LAG on orders.v1 stays low while failures happen.
kafka-consumer-groups.sh --bootstrap-server $BROKERS --describe --group courier-matcher
# GROUP            TOPIC      PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG ...
# courier-matcher  orders.v1  5          18350           18352           2   ...

# What is parked, and why:
kafka-console-consumer.sh --bootstrap-server $BROKERS --topic orders.v1.dlt \\
  --from-beginning --property print.headers=true --max-messages 1
# x-original-topic:orders.v1,x-original-partition:5,x-original-offset:18342,
# x-first-failed-at:1793849520000,x-attempts:1,x-error:validation: address is required
# {"orderId":"o-1003","address":null,...}`, "terminal"),
        p("The output is illustrative; the exact header formatting depends on the Kafka version of the console tools."),

        h2("Pitfalls"),
        bullets([
            "**The attempt counter starts over.** A routing function that writes `x-attempts: 1` instead of reading the incoming value sends the record back to the 30-second topic forever, and nothing ever reaches the DLT. Detect it: retry-topic traffic that never decays after an outage ends.",
            "**Everything goes to the DLT.** Treating a 503 like bad data parks every order of a short outage, and someone has to replay them by hand. Detect it: DLT size jumps whenever a dependency blips. Only errors that a retry cannot fix skip the retry topics.",
            "**A DLT nobody reads.** Parked records are lost orders with extra steps. Alert when the DLT is not empty, show the error header in the alert, and test the replay tool before you need it.",
        ]),

        p("Now write the routing. The editor holds `src/failures.ts` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the two incidents on purpose. Run replays a lunch rush second by second against an in-memory broker, with a poison order and an outage of the maps API, and reports when each order was matched and what reached the DLT."),
        challenge("chal_coding_kfk_152"),
    ],
});
