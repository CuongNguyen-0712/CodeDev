// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kfk-2-1",
    title: "Consumer groups and rebalancing",
    slug: { _type: "slug", current: "kafka-consumer-groups-rebalancing" },
    description:
        "Rice Rocket autoscaled its courier-matcher consumers and got idle pods, a group that froze on every scale event, and orders matched twice after a slow batch. Learn how a consumer group splits partitions, what a rebalance does under the eager and cooperative protocols, the two timers that remove a member, and how a worker commits its progress before partitions move.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "courier-matcher reads order events from orders.v1 (6 partitions, keyed by order id) and matches a courier to each order. It runs on Kubernetes with an HPA. On the first busy evening the HPA went to 9 pods, the group stalled on every scale event, and some customers got two couriers while other orders waited for none.",
    },

    content: [
        h2("Situation"),
        p("The consumer was written in an afternoon. It polls, matches, and lets the client commit in the background:"),
        code("ts", `
const consumer = kafka.consumer({ "group.id": "courier-matcher", "enable.auto.commit": true });
await consumer.subscribe({ topics: ["orders.v1"] });
await consumer.run({
  eachMessage: async ({ message }) => {
    await matchCourier(JSON.parse(message.value.toString()));   // 0.3 to 1 s per order
  },
});`, "courier-matcher/src/main.ts"),
        bullets([
            "At 18:40 the HPA scaled from 6 to 9 pods. Consumer lag kept growing; `kafka-consumer-groups.sh --describe --members` showed three members with 0 partitions.",
            "Each scale event (up or down) froze matching for every pod for several seconds.",
            "A pod logged `Application maximum poll interval (300000ms) exceeded ... leaving group`; afterwards 9 orders got a second courier.",
        ]),

        h2("The core you need"),
        bullets([
            "**One partition, one reader per group.** The partitions of a topic are split among the members of a consumer group, and each partition is read by at most one member at a time; that keeps one key's records in order. Members beyond the partition count get nothing.",
            "**A rebalance moves partitions.** It starts when a member joins, leaves, or is declared dead. The group hands out a new assignment, and a member must stop reading what it lost and start reading what it gained.",
            "**Eager vs cooperative.** Under the eager protocol (range, round-robin) every member first revokes all its partitions, then everyone gets a new assignment: the whole group pauses. Cooperative-sticky assignment is incremental: members keep what they still own and only moved partitions are revoked. Kafka 4 adds a broker-driven group protocol (KIP-848) that is incremental by design; whether you can use it depends on your client version.",
            "**Two timers.** `session.timeout.ms` (45 s by default in recent versions) expires when heartbeats stop, for example when a pod dies. `max.poll.interval.ms` (5 minutes by default) expires when the gap between two polls is too long: a slow batch. Heartbeats run in the background, so they cannot save a slow batch.",
            "**Commit what you handled, before you lose it.** The committed offset of a partition is the next record the group reads after a move: last handled offset + 1. Commit it when partitions are revoked (the client calls you before it hands them over), and periodically. Whatever was handled but not committed runs again on the new owner: at-least-once.",
            "**Static membership.** Setting `group.instance.id` (for example to the pod name of a StatefulSet) lets a restarted pod take back its partitions without a rebalance, if it returns within the session timeout.",
        ]),

        h2("Apply it in the project"),
        p("Cap the HPA at the partition count, switch to incremental rebalancing, keep batches well under the poll interval and commit by hand:"),
        code("ts", `
// courier-matcher/src/config.ts (librdkafka property names, used by @confluentinc/kafka-javascript)
export const consumerConfig = {
  "group.id": "courier-matcher",
  "partition.assignment.strategy": "cooperative-sticky",
  "enable.auto.commit": false,          // the worker commits what it handled
  "max.poll.interval.ms": 300000,       // 5 min between polls at most
  "session.timeout.ms": 45000,
};
export const MAX_BATCH = 100;           // 100 x ~1 s per order, far below 5 min`, "courier-matcher/src/config.ts"),
        code("yaml", `
spec:
  minReplicas: 2
  maxReplicas: 6        # orders.v1 has 6 partitions: a 7th pod would sit idle`, "k8s/courier-matcher-hpa.yaml"),
        p("The worker keeps two offsets per partition: what it fetched and what it handled. Only the second one is safe to commit. The client's rebalance callback calls `onRevoke` before partitions move and `onAssign` after:"),
        code("ts", `
onAssign(partitions) {
  for (const p of partitions) {
    const start = committedOffset("courier-matcher", "orders.v1", p) ?? 0;
    position.set(p, start);
    done.set(p, start);
  }
},
onRevoke(partitions) {
  for (const p of partitions) {
    const next = done.get(p);
    if (next !== undefined) commit("courier-matcher", "orders.v1", p, next);
    position.delete(p);
    done.delete(p);
  }
},`, "courier-matcher/src/worker.ts"),
        callout("info", "Exactly once is not on offer here",
            "A courier match calls an outside service, so the commit and the side effect cannot happen atomically. Expect a record to run again after a crash or a kick, and make the handler safe to repeat (lesson 4)."),

        h2("Verify"),
        code("bash", `
kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group courier-matcher
# GROUP            TOPIC      PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG  CONSUMER-ID ...
# courier-matcher  orders.v1  0          18211           18214           3    courier-matcher-7f9c-0a1b ...
# courier-matcher  orders.v1  1          17990           17990           0    courier-matcher-7f9c-0a1b ...
kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group courier-matcher --members
# 6 members, #PARTITIONS 1 each
kubectl -n rice-rocket scale deployment/courier-matcher --replicas=5
kubectl -n rice-rocket logs deploy/courier-matcher | grep rebalance
# only the moved partition is revoked: rebalance: revoking partitions: orders.v1 [5]`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Autoscaling past the partition count.** Extra pods cost money and add rebalances without adding throughput. Detect it in `--describe --members` (members with 0 partitions); cap `maxReplicas` or add partitions.",
            "**Committing what was fetched, not what was handled.** After a rebalance the new owner skips the records between the two offsets, and nobody notices until a customer complains. Detect it by comparing handled counts with the topic's end offsets in a test like the one below.",
            "**Raising `session.timeout.ms` for slow batches.** It only governs heartbeats. A batch that outlives `max.poll.interval.ms` still gets the member kicked; shrink the batch instead.",
        ]),

        challenge("chal_quiz_kfk_131"),
        p("Now write the worker. The editor holds `createWorker` with its key blocks missing, each marked by a `// [ ]` line: put the caret on a line and click a piece, or drag a piece onto the line. Some pieces repeat last evening's mistakes on purpose. Run produces orders and plays joins, leaves, a kicked pod and interrupted batches, then counts duplicates and lost orders."),
        challenge("chal_coding_kfk_132"),
    ],
});
