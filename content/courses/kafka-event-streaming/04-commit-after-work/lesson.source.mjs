// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kfk-2-2",
    title: "Committing offsets after the work, not before",
    slug: { _type: "slug", current: "kafka-commit-offsets-after-work" },
    description:
        "An OOM-killed notifications pod lost 300 \"your order is on the way\" pushes because auto-commit had already moved the offsets; the first fix sent duplicates after every crash. Learn what a committed offset promises, at-most-once vs at-least-once, why the commit goes after the side effect, and how an idempotency key makes a retried push harmless.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The notifications consumer reads orders.v1 and pushes \"Your order ... is on the way\" when a courier picks an order up. During the Friday dinner peak a pod was OOM-killed mid-batch; 300 customers never got the push, and support tickets asked where the food was.",
    },

    content: [
        h2("Situation"),
        p("The consumer let the client commit on a timer, which is the default of most Kafka clients:"),
        code("ts", `
// notifications/src/main.ts (before)
const config = { "group.id": "notifications", "enable.auto.commit": true, "auto.commit.interval.ms": 5000 };

for (const record of await poll(500)) {
  const event = JSON.parse(record.value);
  if (event.status === "picked_up") await push.send(onTheWay(event));   // 20-40 ms each
}`, "notifications/src/main.ts"),
        code("text", `
18:42:07  notifications-6d8f-4kq2  fetched 500 records, partitions 0-5
18:42:10  (auto-commit) committed offsets up to the end of the fetched batch
18:42:13  notifications-6d8f-4kq2  OOMKilled (exit code 137) after 196 pushes
18:42:31  notifications-6d8f-9wz7  resumed from committed offsets, next push: order-88415`, "notifications logs"),
        p("The batch's offsets were committed while 300 pushes were still waiting. The first fix moved the commit after the loop; after the next kill, customers got the same push twice."),

        h2("The core you need"),
        bullets([
            "**A committed offset is a promise.** It says \"everything before this offset is done\". After a restart or a rebalance the group starts from it. The value is the next record to read: last handled offset + 1.",
            "**Auto-commit ignores your work.** `enable.auto.commit` commits what poll returned, on a timer. A crash between that commit and the end of the work loses the rest: at-most-once.",
            "**Commit after the side effect.** Handle the batch, then commit what you handled. A crash before the commit makes the records run again: at-least-once. Nothing is lost, but the side effect can happen twice.",
            "**Make the retry harmless.** Give each side effect a key that does not change on retry (the event's id), and let the system that performs it drop a key it has seen: an idempotency key on an API, a unique constraint on a table. A Set in the pod's memory does not survive the kill it is meant to handle.",
            "**Exactly-once has limits.** Kafka transactions make consume-transform-produce exactly once inside Kafka. A push to phones is outside Kafka, so the best you get is at-least-once plus an idempotent receiver.",
        ]),

        h2("Apply it in the project"),
        p("Turn auto-commit off, commit per partition after the batch's pushes, and send the event id as the gateway's idempotency key (Rice Rocket's push gateway keeps keys for 24 hours):"),
        code("ts", `
function runConsumer(consumer: ConsumerApi, push: PushGateway): void {
  for (;;) {
    const batch = consumer.poll(50);
    if (batch.length === 0) return;
    const next = new Map<number, number>();
    for (const record of batch) {
      const event = JSON.parse(record.value) as OrderEvent;
      if (event.status === "picked_up") {
        push.send({ userId: event.customerId, text: \`Your order \${event.orderId} is on the way\`, idempotencyKey: event.eventId });
      }
      next.set(record.partition, record.offset + 1);
    }
    for (const [partition, offset] of next) consumer.commit(partition, offset);
  }
}`, "notifications/src/consumer.ts"),
        code("ts", `
export const consumerConfig = {
  "group.id": "notifications",
  "enable.auto.commit": false,
  "max.poll.interval.ms": 300000,
};`, "notifications/src/config.ts"),
        callout("info", "Smaller batches, smaller replays",
            "Everything since the last commit runs again after a kill. Fifty records per batch bounds the replay to fifty idempotent sends; five hundred would replay ten times more work."),

        h2("Verify"),
        code("bash", `
# kill a pod mid-batch during a load test
kubectl -n rice-rocket delete pod -l app.kubernetes.io/name=notifications --grace-period=0 --force
kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group notifications
# LAG drops back to 0 once the new pod catches up
kubectl -n rice-rocket logs deploy/push-gateway | grep -c "duplicate idempotency key, dropped"
# > 0 after a kill: replays happened and were dropped
psql "$GATEWAY_DB" -c "select count(*), count(distinct idempotency_key) from deliveries where created_at > now() - interval '10 minutes'"
# both counts equal: no customer got a push twice`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Committing the last handled offset instead of offset + 1.** Every restart replays one record per partition, and the group lag never reaches 0. Detect it with `kafka-consumer-groups.sh --describe`: CURRENT-OFFSET stays one below LOG-END-OFFSET on an idle topic.",
            "**Deduplicating in memory.** It works in every test that does not restart the pod. Detect it by killing a pod in a load test and counting deliveries per key.",
            "**A key that changes on retry.** A random UUID created at send time is a new key on every replay. Derive the key from the event (`eventId`), which is the same every time the record is read.",
        ]),

        p("Now fix the consumer. The editor holds `runConsumer` with its key blocks missing, each marked by a `// [ ]` line: put the caret on a line and click a piece, or drag a piece onto the line. The pieces include the versions that lost or duplicated pushes. Run kills the pod after a push or during a commit, restarts it from the committed offsets and counts what customers received."),
        challenge("chal_coding_kfk_142"),
    ],
});
