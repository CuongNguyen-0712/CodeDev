// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-2-2",
    title: "Inbox: deduplicate on the consumer side",
    slug: { _type: "slug", current: "inbox-deduplicate-consumer-side" },
    description:
        "The course dashboard says SQL for Analysts issued 1,312 certificates; the certificates table has 1,207. Every rolling deploy of the counter consumer killed it between its database commit and its ack, and the broker delivered those messages again. Learn why at-least-once delivery makes duplicates a normal input, when an effect is already idempotent and needs nothing more, how an inbox table recorded in the same transaction as the effect turns redeliveries into no-ops even when two consumers race, which id to deduplicate on, and how long the inbox has to remember.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, certificates and analytics, CodeDev learning platform",
        problem:
            "Instructors compare the certificate counter on their course dashboard with the certificate list and report that the counter is too high: 1,312 against 1,207 for SQL for Analysts, and similar gaps for every popular course. The counters are maintained by the certificate-counters consumer, which adds 1 per certificate.issued event. The gaps grow by a few dozen after each deploy of that consumer, and the broker's dashboard shows redelivered messages at exactly those times.",
    },

    content: [
        h2("1. The incident: a counter that grows with every deploy"),
        p("The consumer is short. It is the kind of handler most of us have written:"),
        code("typescript", `
// certificate-counters/consumer.ts
broker.subscribe("certificate-events", async (msg) => {
  if (msg.type !== "certificate.issued") return msg.ack();
  await pg.query(
    "UPDATE course_stats SET certificates = certificates + 1 WHERE course_id = $1",
    [msg.payload.courseId],
  );
  await msg.ack();
});`, "consumer.ts (as deployed)"),
        p("It acks after the database write, which is the right order: acking first would lose the certificate when the process dies before the UPDATE. But a process can also die after the UPDATE commits and before the ack reaches the broker. The broker then knows only that the message was not acknowledged, and it does what an at-least-once broker must do: it delivers it again. The UPDATE runs a second time."),

        h2("2. Read the evidence"),
        p("First, measure the drift against the source of truth. The certificates table is written by the certificates service and has one row per certificate, so it is the number the counter should match:"),
        code("sql", `
SELECT s.course_id, s.certificates AS counter, count(c.id) AS actual,
       s.certificates - count(c.id) AS drift
FROM course_stats s
LEFT JOIN certificates c ON c.course_id = s.course_id
GROUP BY s.course_id, s.certificates
HAVING s.certificates <> count(c.id)
ORDER BY drift DESC;

 course_id      | counter | actual | drift
----------------+---------+--------+-------
 sql-analysts   |    1312 |   1207 |   105
 react-201      |     884 |    861 |    23`, "drift query"),
        p("Then find when the extra increments happened. The consumer logs the message id it handles. Grouping the log by id shows the same id handled twice, a few seconds apart, by different pods:"),
        code("text", `
14:02:11.402  certificate-counters-5c8d-x  handled m-30117 course=sql-analysts
14:02:11.950  kubelet                      Stopping container certificate-counters (rolling update)
14:02:41.951  kubelet                      Killing container with grace period 30s exceeded
14:02:44.318  certificate-counters-6f1a-q  handled m-30117 course=sql-analysts  redelivered=true`, "consumer and kubelet logs"),
        p("The old pod committed the UPDATE for m-30117, was asked to stop, did not finish acking within the grace period and was killed. The new pod received the same message, flagged as redelivered by the broker, and counted it again. A graceful shutdown that stops consuming and acks in-flight messages makes this rarer. It cannot make it impossible: OOM kills, node failures and network partitions between the consumer and the broker produce the same timeline."),

        h2("3. Duplicates are input, not an accident"),
        p("Module 1 and lesson 2.1 chose at-least-once on purpose: the outbox relay publishes again after a crash, and the broker delivers again until it gets an ack. Duplicates arrive from both sides, so every consumer has to answer one question: **what happens if this exact message is handled twice?** There are three honest answers."),
        h3("Answer 1: the effect is already idempotent"),
        p("Some effects give the same result however many times they run. Prefer them whenever the domain allows it, because they need no extra table:"),
        bullets([
            "**Set a value instead of adding to it.** `UPDATE enrollments SET status = 'completed' WHERE id = $1` is idempotent; `progress = progress + 10` is not.",
            "**Insert on a business key with a unique constraint.** `INSERT INTO certificates (user_id, course_id, ...) ON CONFLICT (user_id, course_id) DO NOTHING` issues one certificate per user and course however often the event comes.",
            "**Derive instead of counting.** The counter could be `SELECT count(*) FROM certificates WHERE course_id = $1`, or a materialized view refreshed on a schedule, if the dashboard can live with that query or with a short delay.",
        ]),
        h3("Answer 2: an inbox recorded with the effect"),
        p("When the effect is an increment, an append, or anything else that changes again on every run, record that you handled the message, and do it **in the same database transaction as the effect**. That is the inbox: a table of processed message ids with a unique key. Either the effect and the inbox row both commit, and every later copy of the message finds the row and changes nothing, or neither commits and the next copy is handled as the first one."),
        h3("Answer 3: the effect is outside your database"),
        p("An inbox cannot be atomic with a call to an email provider or a payment API. There, use the other system's own idempotency (an idempotency key derived from the message id, if the API supports one), or record the call before and after and accept and monitor a rare duplicate. Do not pretend an inbox in PostgreSQL makes an HTTP call happen once."),
        callout("info", "Which id to deduplicate on",
            "Use an id that the producer assigns once per event and that every copy carries: the outbox row id from lesson 2.1, or an event UUID written into the outbox row. Not the broker's delivery tag, which changes on every redelivery in some brokers, and not the offset alone: when the outbox relay publishes the same row twice after a crash, the two copies are two messages at two different offsets with the same event id. Check what your broker guarantees about redelivered messages before you build on its metadata."),

        h3("Why the check must be inside the transaction"),
        p("A check in a separate step leaves a window. \"SELECT the id; if absent, UPDATE and INSERT\" lets two consumers that received the same message during a rebalance both see \"absent\" and both apply the effect. A cache in front of the database (a Redis `SET NX` on the message id) is worse: the key and the UPDATE are in different stores, so a crash between them either loses the event (key written, UPDATE not) or counts it twice (UPDATE written, key not), depending on the order you picked."),
        p("Make the database decide. With a primary key on the inbox, `INSERT ... ON CONFLICT DO NOTHING` returns 1 row the first time and 0 rows for any later copy. If two sessions insert the same id at the same time, the second waits for the first transaction: if it commits, the second gets 0 rows; if it rolls back, the second inserts. The row count is the answer, even under a race."),

        h3("How long does the inbox remember?"),
        p("The inbox grows by one row per message. You have to delete old rows, and the moment you do, a copy of that message would be handled as new. So the retention is a contract: **the inbox deduplicates only inside its retention window.** Pick a window longer than any delay after which a copy can still arrive: broker redelivery delays, dead-letter queues that are replayed by hand, and especially replays from a log-based broker that keeps events for days (lesson 3.2). If the topic keeps 7 days and the inbox 3, a replay from day 5 goes straight through."),

        challenge("chal_quiz_dce_221"),

        h2("4. Worked example: the inbox in PostgreSQL"),
        p("One inbox table can serve several consumers in the same database if the key includes the consumer name: the same event is new for the counters and, separately, new for the leaderboard."),
        code("sql", `
CREATE TABLE inbox (
  consumer     text        NOT NULL,
  message_id   text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, message_id)
);
CREATE INDEX inbox_processed_at ON inbox (processed_at);`, "migration"),
        code("typescript", `
broker.subscribe("certificate-events", async (msg) => {
  if (msg.type !== "certificate.issued") return msg.ack();
  if (!msg.id || !msg.payload?.courseId) {
    logger.warn({ msg }, "invalid certificate.issued, sent to dead letter");
    return msg.ack();                       // never retry a message that cannot succeed
  }
  await pg.transaction(async (tx) => {
    const first = await tx.query(
      "INSERT INTO inbox (consumer, message_id) VALUES ('certificate-counters', $1) ON CONFLICT DO NOTHING",
      [msg.id],
    );
    if (first.rowCount === 0) {
      metrics.duplicatesSkipped.inc({ consumer: "certificate-counters" });
      return;                               // already counted: change nothing
    }
    await tx.query(
      "UPDATE course_stats SET certificates = certificates + 1 WHERE course_id = $1",
      [msg.payload.courseId],
    );
  });
  await msg.ack();                          // only after the commit
});`, "consumer.ts (with an inbox)"),
        p("A crash at any point now has a safe outcome. Before the commit: nothing was written, the message comes again and is counted once. After the commit and before the ack: the message comes again, the insert returns 0 rows, and the handler acks without counting. Two consumers at once: the primary key decides."),
        p("Cleanup runs on a schedule, in batches, so it never holds long locks or produces one huge transaction:"),
        code("sql", `
-- run every few minutes until it deletes 0 rows
DELETE FROM inbox
WHERE ctid IN (
  SELECT ctid FROM inbox
  WHERE processed_at < now() - interval '14 days'
  LIMIT 10000
);`, "inbox cleanup"),
        p("At high volume, partition the inbox by day and drop whole partitions instead; deleting row by row leaves dead tuples for vacuum to clean up. Either way, write the retention down next to the broker's retention and the longest replay you support, so the next person who shortens one of them sees the other."),
        p("Build the same consumer against an in-memory database whose `tx` commits a copy only when the callback returns. The tests crash the process just before or just after the commit, start a new consumer after a crash, move a fake clock forward and run the cleanup at the retention boundary."),
        challenge("chal_coding_dce_222"),

        h2("5. How to verify deduplication"),
        bullets([
            "**Tests that deliver duplicates on purpose:** the same message twice, a crash after commit followed by the redelivery, a crash before commit followed by the redelivery, a duplicate after cleanup. Each one is a line of input against a fake broker.",
            "**The drift query from section 2, on a schedule.** Counter minus source of truth must stay 0. Anything else is a missed duplicate, a lost event or a bug elsewhere, and it is the input for reconciliation (lesson 4.2).",
            "**A duplicates metric.** Count the 0-row inserts per consumer. A steady trickle is normal; a spike after a deploy confirms the inbox is doing its job, and a value of exactly 0 for weeks is worth a look (is the path tested at all?).",
            "**Kill the consumer between commit and ack in staging.** Send a burst of events, `kill -9` the consumer mid-burst, and check that the counters still equal the certificates count.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**The dedup record in a different store than the effect.** Redis, a local file or an in-memory Set next to a PostgreSQL write. Spot it: two writes to two systems in the handler, or a Set that is empty after every restart.",
            "**Check and insert in two steps.** `SELECT ... WHERE message_id = $1` followed by an INSERT. Spot it: no unique key on the inbox, or the code ignores the row count of the insert.",
            "**The inbox row and the effect in separate transactions.** Whichever commits first, a crash between them loses the event or doubles it. Spot it: two `transaction(...)` blocks, or autocommit statements, per message.",
            "**Deduplicating on a delivery attribute.** Delivery tags and receipt handles change on redelivery; offsets differ for a republished event. Spot it: the inbox key comes from broker metadata instead of the event itself.",
            "**A retention shorter than the longest replay.** Spot it: duplicates appear after replaying a topic or a dead-letter queue, while normal traffic is clean.",
        ]),

        h2("7. Summary"),
        numbered([
            "At-least-once delivery makes duplicates a normal input. First ask whether the effect can be idempotent by itself (set instead of add, insert on a business key); then no inbox is needed.",
            "Otherwise record the event id in an inbox table in the same transaction as the effect, let the primary key decide (`ON CONFLICT DO NOTHING`, 0 rows = duplicate), and ack only after the commit.",
            "The inbox deduplicates only inside its retention window: choose it longer than any redelivery or replay you support, clean it up in batches, and monitor drift and duplicates.",
        ]),

        h2("Sources"),
        bullets([
            "Chris Richardson, Pattern: Idempotent Consumer - microservices.io/patterns/communication-style/idempotent-consumer.html",
            "PostgreSQL documentation: INSERT, ON CONFLICT clause (and the note on concurrent inserts of the same key) - postgresql.org/docs/current/sql-insert.html",
            "Your broker's documentation on acknowledgements and redelivery (RabbitMQ consumer acknowledgements, Kafka consumer offsets, SQS visibility timeout): check the version you run",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Open two psql sessions and run the inbox insert for the same message id in both without committing the first; then commit, and try again with a rollback. Write down what each session reports. Then list the consumers of your own system, mark which effects are already idempotent and which need an inbox, and write the retention each inbox needs next to the broker's retention."),
    ],
});
