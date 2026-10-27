// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-3-1",
    title: "Ordering per aggregate key",
    slug: { _type: "slug", current: "ordering-per-aggregate-key" },
    description:
        "The progress consumer was made concurrent to cut its lag, and learners' progress started to go backwards: two events of one learner ran at the same time and the older one finished last. Learn where a broker keeps order (a Kafka partition, an SQS FIFO message group, a RabbitMQ queue with one consumer) and where it does not, why the key must be the aggregate the order matters for, when you do not need ordering at all, how to keep order per key in a concurrent consumer without head-of-line blocking, and how per-key sequence numbers reveal gaps.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, CodeDev learning platform",
        problem:
            "To cut a consumer lag of 40 000 messages on the progress-events topic, the progress read model started handling up to 16 messages at once. The lag dropped to a few hundred within minutes. The next morning support had 23 tickets like this one: \"I finished Redis Patterns yesterday, I got the certificate email, but My Courses says 90% and the Continue button sends me to lesson 11.\" The progress table shows percent = 90 for these learners, although the last event published for each of them says 100.",
    },

    content: [
        h2("1. The incident: progress that goes backwards"),
        p("The progress service writes every change to its outbox (lesson 3) and the outbox publisher sends it to the `progress-events` topic with the learner id as the key. The progress read model behind **My Courses** consumes that topic. This is the change that cut the lag:"),
        code("typescript", `
// progress-read-model/progress.consumer.ts - the change that shipped
const limit = pLimit(16);

await consumer.run({
  eachMessage: async ({ message }) => {
    const event = decode(message);              // { learnerId, courseId, percent, ... }
    limit(() => this.progress.apply(event));    // not awaited: up to 16 handlers at once
  },
});

// progress.repository.ts
async apply(e: ProgressUpdated) {
  await this.db.query(
    "UPDATE progress SET percent = $3, updated_at = now() WHERE learner_id = $1 AND course_id = $2",
    [e.learnerId, e.courseId, e.percent]);
}`, "progress.consumer.ts"),
        p("Every `progress.updated` event carries the **absolute** percentage, so the last write wins. That was fine while one message was handled at a time. With 16 at once, two events of the same learner can be in flight together, and nothing says which `UPDATE` finishes last."),

        h2("2. Reproduce it and read the evidence"),
        p("The consumer logs a line when a handler starts and when it ends. Filtering one of the reported learners shows the race:"),
        code("text", `
14:02:07.112  start  p4 offset=88123  u_17 redis-patterns percent=90
14:02:07.113  start  p4 offset=88124  u_17 redis-patterns percent=100
14:02:07.151  done   p4 offset=88124  u_17 redis-patterns percent=100
14:02:07.297  done   p4 offset=88123  u_17 redis-patterns percent=90     <- row lock wait 180 ms`, "consumer log, learner u_17"),
        p("The broker delivered offsets 88123 and 88124 in order, on the same partition, to the same consumer. The order was lost **inside the consumer**: the 90% handler waited 180 ms for a row lock held by another transaction, the 100% handler did not, and the older value was written last. The database agrees:"),
        code("sql", `
SELECT p.percent, p.updated_at, e.payload->>'percent' AS last_published
FROM progress p
JOIN LATERAL (
  SELECT payload FROM outbox
  WHERE aggregate_id = p.learner_id AND payload->>'courseId' = p.course_id
  ORDER BY seq DESC LIMIT 1
) e ON true
WHERE p.learner_id = 'u_17' AND p.course_id = 'redis-patterns';

 percent |          updated_at           | last_published
---------+-------------------------------+---------------
      90 | 2026-10-26 14:02:07.297+07    | 100`, "psql"),
        p("The certificate service consumes the same events with its own consumer, which still handles one message at a time, so it saw 100% and sent the email. Two read models, one stream, two different answers."),

        h2("3. Where a broker keeps order - and where it does not"),
        p("No broker keeps one global order at scale; they keep order **per unit of parallelism**, and you choose what lands in the same unit with a key:"),
        bullets([
            "**Kafka**: order is kept inside a partition. The default partitioner picks the partition from a hash of the message key, so all messages with the same key land in the same partition, in the order they were produced (with idempotent producers, retries do not reorder them). Two partitions have no order between them.",
            "**Amazon SQS FIFO**: order is kept per `MessageGroupId`. While a message of a group is in flight, the queue does not hand out later messages of that group, so different groups are processed in parallel and one group stays sequential.",
            "**RabbitMQ**: a queue is FIFO, but with several consumers, a prefetch count above 1 or a requeue after a failure, messages are processed out of order. Options are a single active consumer per queue, or one queue per shard of keys (for example with the consistent hash exchange plugin).",
        ]),
        callout("info", "Check the details of your broker",
            "Each broker documents its own ordering guarantee and its exceptions (retries, partition count changes, redelivery after a visibility timeout). Read the current documentation of the one you run; this lesson uses the common idea - order per key - that all three support."),
        p("So the first design question is **what the key is**. It must be the **aggregate** the order matters for: the thing whose events must be applied in sequence. For progress that is the learner (or the enrollment); for a payment it is the payment id. Keying by event id or by a random value spreads one learner's events over many partitions and gives up ordering before the consumer even starts."),
        callout("warning", "Changing the number of partitions moves keys",
            "With hash(key) mod N, adding partitions sends a learner's new events to a different partition than their unconsumed old ones. For a while the two partitions race. Plan partition counts ahead, or drain the topic before changing them."),

        h2("4. Do you need ordering at all?"),
        p("Ordering costs throughput: one slow event of a key delays every later event of that key. Before building it, check whether the handler can be made **order-insensitive**:"),
        bullets([
            "**Commutative updates** do not care about order: adding points (`+50`, `-10`) gives the same total in any order, as long as each event counts once (lesson 5, inbox).",
            "**Absolute state with a version** can ignore stale events. If the producer gives every event of a learner an increasing sequence number, the consumer writes only when the event is newer than what it stored. The incident's handler becomes:",
        ]),
        code("sql", `
-- stale events update 0 rows and are simply ignored
UPDATE progress
SET percent = $3, last_seq = $4, updated_at = now()
WHERE learner_id = $1 AND course_id = $2 AND last_seq < $4;`, "progress.repository.ts (SQL)"),
        p("That one condition fixes the incident with no change to the consumer's concurrency. It is the simplest fix and the one to try first."),
        p("You **do** need events applied one after another, in order, when the handler depends on the previous state: a state machine (enrolled, then in progress, then completed, then certificate issued), a running balance with limits, or an event that only makes sense after another (\"lesson 12 completed\" before \"course completed\"). Skipping or reordering those produces states that should not exist."),
        h3("Where the sequence number comes from"),
        p("The producer assigns it, in the same transaction as the change and the outbox row, so the number matches the commit order of that learner's writes:"),
        code("sql", `
BEGIN;
UPDATE progress SET percent = 100 WHERE learner_id = 'u_17' AND course_id = 'redis-patterns';

INSERT INTO learner_event_seq (learner_id, last_seq) VALUES ('u_17', 1)
ON CONFLICT (learner_id) DO UPDATE SET last_seq = learner_event_seq.last_seq + 1
RETURNING last_seq;                                   -- 42; the row stays locked until COMMIT

INSERT INTO outbox (aggregate_id, seq, type, payload)
VALUES ('u_17', 42, 'progress.updated', '{"courseId":"redis-patterns","percent":100}');
COMMIT;`, "progress service, one transaction"),
        p("The row lock on `learner_event_seq` makes two concurrent writes of the same learner take turns, so seq 42 commits before seq 43 can be assigned. Other learners are not blocked."),

        challenge("chal_quiz_dce_311"),

        h2("5. Keep order per key inside a concurrent consumer"),
        p("When the handler does need sequential processing, keep the concurrency, but only **across keys**. The smallest version groups a fetched batch by key and runs each group one event after another:"),
        code("typescript", `
// Different learners in parallel, one learner's events in offset order.
async function processBatch(messages: KafkaMessage[], handle: (m: KafkaMessage) => Promise<void>) {
  const byKey = new Map<string, KafkaMessage[]>();
  for (const m of messages) {
    const key = m.key!.toString();
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(m);                      // keeps offset order inside the key
  }
  await Promise.all([...byKey.values()].map(async (group) => {
    for (const m of group) await handle(m);       // sequential per key
  }));
  // only now is the whole batch done: commit the offset after the last message
}`, "processBatch.ts"),
        p("This is easy to reason about, and it has one weakness: the batch ends only when its slowest key ends, so one learner whose handler waits on a lock holds up the next batch for everybody. That is **head-of-line blocking**, and it is the same problem a partition has when one message is slow - just smaller."),
        p("A long-running worker pool avoids it with a **queue per key**: a free worker takes the oldest event whose key is idle, so a slow or blocked key only delays its own events. Two details make it correct:"),
        numbered([
            "**One in-flight event per key.** A key is busy from the moment a worker takes its event until the handler finishes.",
            "**Offsets are committed by the low-water mark.** With events finishing out of offset order across keys, you may commit offset N only when every event below N is done; otherwise a crash loses the unfinished ones.",
        ]),
        callout("tip", "Libraries that do this",
            "Some clients ship this pattern. KafkaJS can consume several partitions concurrently (partitionsConsumedConcurrently) while keeping each partition in order; the Confluent Parallel Consumer (Java) has a key-ordered mode with per-key concurrency inside a partition. Know what your library guarantees before writing your own."),

        h2("6. Gaps: when an event is missing"),
        p("A per-key sequence number also tells the consumer when something is **missing**. If learner u_17 is at seq 41 and seq 43 arrives, seq 42 is late (still in a retry, on another partition after a repartition, or lost by a bug upstream). The consumer has three choices:"),
        bullets([
            "**Hold** 43 and later events of u_17 until 42 arrives. Other learners keep going.",
            "**Give up after a timeout**: report the gap (a log line and a metric with the key and the missing range), then continue from 43. Acceptable when events carry absolute state, because 43 supersedes 42.",
            "**Park the key** and page someone, when skipping would create a wrong state (a balance, a state machine). Reconciliation (lesson 11) repairs it from the source of truth.",
        ]),
        p("Duplicates fall out of the same bookkeeping: an event whose seq is at or below the key's next expected seq has already been handled (or given up) and is dropped. The timer must run on an injected clock, both so that tests can control it and so that a gap is measured from the moment it appears - not from when the consumer started."),
        p("In the exercise you write the dispatcher of such a pool: per-key queues, one event in flight per key, gap detection with a timeout on a fake clock, and no key blocking another. The runner delivers interleaved, out-of-order and duplicate events with scripted processing times and prints the processing order per key and the completion times."),

        challenge("chal_coding_dce_312"),

        h2("7. How to verify ordering"),
        bullets([
            "**A deterministic test, as in the exercise.** Script deliveries (out of order, duplicated, missing) and processing times on a fake clock, then assert that every key's processed seqs are increasing and that slow keys did not delay others.",
            "**A property check on what was applied.** For each key, the seq of applied events must only grow. If the consumer records what it applied, one query finds every violation (below).",
            "**Metrics.** Events held per key, the age of the oldest held event, gaps given up per hour and duplicates dropped. A rising held count is the first sign of a missing event or a stuck key.",
            "**Compare with the source.** The incident's SQL - read model versus the last published event per learner - turned into a scheduled check catches the drift that ordering bugs leave behind.",
        ]),
        code("sql", `
-- learners whose events were applied out of sequence order
SELECT learner_id, seq, prev_seq, applied_at
FROM (
  SELECT learner_id, seq, applied_at,
         lag(seq) OVER (PARTITION BY learner_id ORDER BY applied_at, id) AS prev_seq
  FROM applied_events
) t
WHERE prev_seq IS NOT NULL AND seq <= prev_seq
ORDER BY applied_at;`, "ordering check"),

        h2("8. Common mistakes"),
        bullets([
            "**Keying by event id, or not keying at all.** Spot it: the producer's `key` is a UUID or empty; one learner's events show up on several partitions.",
            "**Concurrency that ignores the key.** `Promise.all` over a batch, a `pLimit` around every message, or several consumers on one RabbitMQ queue. Spot it: logs where two events of one key overlap in time.",
            "**Not awaiting the handler.** The consumer moves on and commits the offset before the work is done; a crash loses events. Spot it: a handler call without `await` inside `eachMessage`.",
            "**Head-of-line blocking across keys.** One shared queue, or a batch that waits for its slowest key. Spot it: lag grows for every learner when one learner's handler is slow.",
            "**Waiting forever for a gap.** No timeout, no alert: the key is stuck and nobody knows. Spot it: held events whose age only grows.",
        ]),

        h2("9. Summary"),
        bullets([
            "Brokers keep order per partition, message group or queue - never globally. Choose the key as the aggregate the order matters for, and do not lose that order again inside the consumer.",
            "First try to make the handler order-insensitive: commutative updates, or absolute state guarded by a per-key sequence number (`WHERE last_seq < $seq`).",
            "When events must be applied one after another, run them sequentially per key and in parallel across keys, detect gaps with per-key sequence numbers, and give a gap a timeout and an alert.",
        ]),

        h2("Sources"),
        bullets([
            "Apache Kafka documentation: topics, partitions and the ordering guarantee per partition - kafka.apache.org/documentation",
            "Amazon SQS Developer Guide: FIFO queues and message group IDs",
            "RabbitMQ documentation: queues (ordering guarantees) and single active consumer",
            "microservices.io: Transactional outbox pattern",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add a metric to your dispatcher: the age of the oldest held event per key, and the number of gaps given up. Then write the alert you would page on, and decide - for each event type the progress service publishes - whether a timed-out gap should be skipped or the key parked."),
    ],
});
