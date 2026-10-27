// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-1-2",
    title: "DB commit succeeded, publish failed: the event that never arrived",
    slug: { _type: "slug", current: "db-commit-succeeded-publish-failed" },
    description:
        "During a three-minute broker failover, 37 learners were enrolled in PostgreSQL and answered 201 Created, but the certificate service never heard about them: no welcome email, no badge. Work the incident like the on-call engineer: read the reconciliation query, the service log, the code and the broker metrics, name the dual write, rule out a consumer that \"lost\" the events and a fix that wraps the publish in the transaction, close the gap with a transactional outbox and a relay, and prove it with a test that crashes the process between the steps.",
    estimatedTime: 30,

    scenario: {
        role: "Backend engineer on call, enrollments team, CodeDev learning platform",
        problem:
            "Tuesday 27 October, 16:20. Support escalates a batch of tickets: learners who enrolled shortly after 14:00 have no welcome email, no \"Enrolled\" badge and no certificate of enrollment, although the course appears in their dashboard and they can open the lessons. The platform team mentions that the broker cluster had a node upgrade at 14:03. The enrollment service did not report a single error to the client.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario. After the ghost events of lesson 1.1, the enrollments team moved the publish **out** of the transaction: commit first, then publish, and never fail an enrollment because of the broker. That was the code in production on Tuesday:"),
        code("typescript", `
// enrollments/enrollment.service.ts (release 2026.10.26-2)
async enroll(userId: string, courseId: string): Promise<Enrollment> {
  const enrollment = await this.db.transaction(async (tx) => {
    await this.assertCanEnroll(tx, userId, courseId);
    return tx.enrollments.insert({ userId, courseId, status: "active" });
  });                                                   // COMMIT

  try {
    await this.broker.publish("enrollments", {
      id: randomUUID(),
      key: enrollment.id,
      type: "enrollment.created",
      payload: { enrollmentId: enrollment.id, userId, courseId },
    });
  } catch (err) {
    // The learner is enrolled either way: a missing email is not worth a 500.
    this.logger.warn(\`publish enrollment.created failed for \${enrollment.id}: \${err}\`);
  }
  return enrollment;
}`, "enrollment.service.ts"),
        p("Before you name the bug, collect the evidence. The point of this lesson is the method: what each piece proves, which explanations it rules out, and what a fix must therefore guarantee."),

        h2("2. The evidence pack"),
        p("Five pieces were collected in the first half hour. The quiz refers to them by letter."),
        h3("A. The support escalation"),
        code("text", `
Tickets: 37 learners, all enrolled on 27 Oct between 14:03 and 14:06 UTC.
Symptoms: course visible in the dashboard, lessons open; no welcome email,
no "Enrolled" badge, no certificate of enrollment PDF.
No ticket for enrollments before 14:03 or after 14:06.`, "support escalation SUP-2291"),
        h3("B. Reconciliation: enrollments against certificate receipts"),
        code("sql", `
-- analytics warehouse (loads enroll.enrollments and cert.enrollment_receipts every 5 minutes)
SELECT date_trunc('minute', e.created_at) AS minute,
       count(*)                           AS enrolled,
       count(r.enrollment_id)             AS receipted
FROM   enroll.enrollments e
LEFT   JOIN cert.enrollment_receipts r ON r.enrollment_id = e.id
WHERE  e.created_at >= '2026-10-27 14:00' AND e.created_at < '2026-10-27 14:08'
GROUP  BY 1 ORDER BY 1;

       minute        | enrolled | receipted
---------------------+----------+-----------
 2026-10-27 14:00:00 |       29 |        29
 2026-10-27 14:01:00 |       34 |        34
 2026-10-27 14:02:00 |       33 |        33
 2026-10-27 14:03:00 |       31 |        22
 2026-10-27 14:04:00 |       28 |        14
 2026-10-27 14:05:00 |       30 |        16
 2026-10-27 14:06:00 |       27 |        27
 2026-10-27 14:07:00 |       32 |        32`, "warehouse query"),
        h3("C. Enrollment service log"),
        code("text", `
14:04:12.481 INFO  POST /enrollments user=u_51207 course=postgres-performance
14:04:12.493 DEBUG tx COMMIT enrollment enr_88412 (12 ms)
14:04:17.498 WARN  publish enrollment.created failed for enr_88412:
                   BrokerTimeoutError: publish to enrollments timed out after 5000 ms
14:04:17.499 INFO  POST /enrollments 201 Created 5018 ms

$ grep -c "WARN  publish enrollment.created failed" enrollment-service-2026-10-27.log
37      (first 14:03:13.115, last 14:05:54.310)`, "enrollment-service, one request, then a count"),
        h3("D. The code"),
        p("The handler shown in section 1: the transaction commits, then `await this.broker.publish(...)` runs in a `try`, and the `catch` logs a warning and returns the enrollment, so the controller answers 201."),
        h3("E. Broker metrics and the topic itself"),
        code("text", `
14:03:08  broker-2 restarted (node upgrade); leader election for partitions 1 and 4 of "enrollments"
14:05:55  all partitions of "enrollments" have a leader again

Producer errors, client enrollment-service    14:03: 9   14:04: 14   14:05: 14   14:06: 0
Records in, topic enrollments, per minute     14:02: 33  14:03: 22   14:04: 14   14:05: 16   14:06: 27
Consumer group certificate-service, max lag   14:00-14:10: 2 (no partition above 2)

$ search topic "enrollments" for keys of the 37 enrollments (offsets from 14:00 to 14:10)
0 records found`, "broker dashboard and a topic search"),

        h2("3. Reading the evidence"),
        p("One line per piece, only what it shows:"),
        bullets([
            "**A** gives the impact and the window: 37 learners, 14:03 to 14:06, nobody outside it.",
            "**B** shows that the enrollments **exist** (they are counted in `enrolled`) and that the missing receipts are exactly 9 + 14 + 14 = 37, all inside the window.",
            "**C** shows the sequence for one request: COMMIT at .493, a 5-second publish timeout, a warning, and **201 Created**. The count of warnings is 37, and the first and last fall inside the window.",
            "**D** explains why the client never saw an error: the `catch` swallows the publish failure after the commit already happened.",
            "**E** shows a failover from 14:03:08 to 14:05:55, producer errors that add up to 37, records in the topic dropping by the same amounts, a consumer that was never behind, and **no record** in the topic for any of the 37 keys.",
        ]),
        p("Notice what lines up: 37 tickets, 37 missing receipts, 37 warnings, 37 producer errors, 0 records in the topic. The losses happened on the producer side, before the broker, and the database rows were already committed when they happened."),

        h2("4. Hypothesis: a dual write, and the failover landed in the gap"),
        p("Follow one request through the timeline:"),
        numbered([
            "The transaction inserts the enrollment and COMMITs (C, 14:04:12.493). From this moment the enrollment is durable.",
            "The service publishes. The partition for this key has no leader (E), and after 5 seconds the client gives up with a timeout.",
            "The `catch` logs a warning and returns the enrollment. The controller answers 201 (C, D).",
            "No message exists anywhere for this enrollment (E: 0 records). Nothing will ever retry it: the only memory of \"this event still has to go out\" was the request, and the request is over.",
        ]),
        p("This is order A of lesson 1.1, commit then publish, and this time it was not a crash that opened the gap but a three-minute broker failover. A deploy, an OOM kill or a network blip between steps 1 and 2 would lose events the same way, without even a warning in the log."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"The certificate consumer lost them during the rebalance.\"** E says the consumer group was never more than 2 messages behind, and the topic contains **no** record for the 37 keys. A consumer cannot lose a message that was never written. Resetting its offsets would replay what it already processed and deliver nothing new.",
            "**\"The broker lost acknowledged writes.\"** The producer never got an acknowledgement: C shows a timeout, E shows producer errors in exactly those minutes. Nothing was acknowledged and then lost.",
            "**\"Wrap the insert and the publish in one transaction.\"** That is the launch-day code of lesson 1.1: the broker does not take part in PostgreSQL's transaction, so it trades lost events for ghost events, and it would have made every enrollment fail for three minutes.",
            "**\"Retry the publish five times.\"** The failover lasted 2 minutes 47 seconds; a request cannot wait that long, and a pod restart between COMMIT and the first attempt still loses the event.",
        ]),
        callout("warning", "A timeout does not mean \"not delivered\"",
            "Here the topic search proves the 37 messages were not written. In general a publish timeout is ambiguous: the broker may have written the message and the acknowledgement may have been lost. Any fix that re-sends after a timeout must expect duplicates, which is why the consumers deduplicate by event id."),

        h2("5. Choose the fix"),
        p("Write the requirements down from the evidence before choosing a design:"),
        bullets([
            "Every committed enrollment **eventually** produces its `enrollment.created`, even if the broker is down for minutes and the process restarts in between.",
            "No event exists for an enrollment that did not commit (no ghosts, lesson 1.1).",
            "Enrolling does not depend on the broker being up.",
            "Each enrollment produces **one logical event**: it may be delivered more than once, always with the same event id, and the certificate service ignores an id it has already processed.",
        ]),
        p("A retry loop fails the first requirement, publishing inside the transaction fails the second and third, and a retry queue in process memory fails the first as soon as the pod restarts. The transactional outbox meets all four:"),
        code("sql", `
-- In the request: one transaction, two rows
BEGIN;
INSERT INTO enrollments (id, user_id, course_id, status) VALUES ($1, $2, $3, 'active');
INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, status)
VALUES ($4, 'enrollment', $1, 'enrollment.created',
        jsonb_build_object('enrollmentId', $1, 'userId', $2, 'courseId', $3), 'pending');
COMMIT;

-- In the relay, every second: publish what is pending, oldest first
SELECT id, aggregate_id, event_type, payload FROM outbox
WHERE status = 'pending' ORDER BY id LIMIT 100;
-- publish each row with message id = outbox.id, then:
UPDATE outbox SET status = 'sent', sent_at = now() WHERE id = $1;`, "the outbox, in SQL"),
        p("Walk the failure cases through it. A crash before COMMIT leaves neither row. A crash after COMMIT leaves a pending outbox row, and the relay publishes it after the restart. A broker outage leaves rows pending until it ends. A crash after a publish and before the `UPDATE` publishes the row again on the next tick with the **same id**, and the consumer drops the duplicate. The relay is at-least-once; deduplication by event id makes it one logical event. Lesson 1.3 designs the outbox table properly and lesson 2.1 makes the relay safe with several instances."),
        challenge("chal_quiz_dce_121"),

        h2("6. The challenge: the incident in one file"),
        p("The code runner has no PostgreSQL and no broker, so the challenge file brings small stand-ins that keep the properties that matter. You do not need to read all of them:"),
        bullets([
            "**`db.tx(fn)`** runs `fn` on a copy of the tables (`courses`, `enrollments`, `outbox`) and commits the copy only if `fn` returns without throwing, like a transaction. Throwing `Rejected` inside it rolls back and answers 409.",
            "**`broker.publish(topic, message)`** appends the message to the topic, or throws `BrokerTimeout` while the broker is down, and nothing is written.",
            "**Crash points.** A test step can say `crash: \"beforeCommit\" | \"afterCommit\" | \"afterPublish\"`: the process dies the first time it reaches that point. The runner then restarts the service, which loses everything held in memory. A `catch` cannot save a dead process: every later call throws `Crash` too.",
            "**`ids.next(prefix)`** works like a sequence, `clock.now()` is a fake clock.",
            "**The runner** plays the steps (enroll, relay tick, broker down/up), prints what each enroll request answered, then restarts the service, brings the broker up, runs three relay ticks and prints, per committed enrollment, how many distinct events the certificate service received, how many events belong to no committed enrollment, and how many outbox rows are still pending.",
        ]),
        p("Run the starter first: the public tests show `(missing)` for the learners enrolled while the broker was down, the same evidence as query B. Then change `enroll` and `relayOnce` so that every committed enrollment ends with exactly one event."),
        challenge("chal_coding_dce_122"),

        h2("7. How to verify the fix"),
        p("\"No more warnings in the log\" is not verification: the old code also had quiet days. Verify the invariant at every point where the process can die:"),
        bullets([
            "**A crash-point test.** For each crash point (before COMMIT, after COMMIT, after a relay publish, before the relay's UPDATE) and with the broker down for part of the run: enroll, restart, run the relay until nothing is pending, then assert one distinct event id per committed enrollment and none for rolled-back ones. On the code from D it fails at \"after COMMIT\" and with the broker down; on the outbox version it passes everywhere. The coding challenge is this test.",
            "**Query B as a standing check.** Run the reconciliation every few minutes and alert when `enrolled - receipted` stays above zero for longer than the relay's normal delay.",
            "**Outbox health.** Export the number of pending rows and the age of the oldest one. During the next failover the age should rise to a few minutes and fall back to near zero afterwards, with no gap in B.",
            "**Repair the 37.** Once the outbox ships, insert one outbox row per enrollment that B reports as missing, in one transaction, and let the relay publish them. Re-run B: the gap must close to zero, and no learner may get a second email.",
        ]),
        code("sql", `
-- One-off backfill for the incident window, after the outbox is deployed.
-- Run it once; check the count first (expect 37), then run B again.
INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, status)
SELECT gen_random_uuid(), 'enrollment', e.id, 'enrollment.created',
       jsonb_build_object('enrollmentId', e.id, 'userId', e.user_id, 'courseId', e.course_id), 'pending'
FROM   enrollments e
WHERE  e.id = ANY($1::text[]);      -- the 37 ids reported by query B`, "backfill.sql"),

        h2("8. Common mistakes in a lost-event incident"),
        bullets([
            "**Debugging the consumer first.** Missing effects downstream look like a consumer bug. Spot it: check whether the messages are in the topic at all before touching consumer offsets.",
            "**Reading 201 as success.** The service answered 201 for all 37 learners. Spot it: list every side effect of a request and check which ones the status code actually covers.",
            "**Fixing only the trigger.** \"Upgrade brokers one at a time\" or \"raise the publish timeout\" makes this failover smaller and leaves crashes and the next outage untouched. Spot it: ask whether a `kill -9` between COMMIT and publish still loses the event.",
            "**Shipping an outbox relay with fresh ids per publish.** If the relay generates a new message id each time it sends a row, a re-publish after a crash becomes a second, different event and the consumer cannot drop it. Spot it: the id on the wire must be the outbox row's id.",
            "**Marking rows sent before publishing them.** That is at-most-once, the original bug moved into the relay. Spot it: crash the relay between the UPDATE and the publish in a test.",
        ]),

        h2("9. Summary"),
        numbered([
            "Lost events after a successful commit are a dual write: 37 tickets, 37 missing receipts, 37 warnings, 37 producer errors and 0 records in the topic put the loss between COMMIT and publish, not in the consumer.",
            "Neither retries nor publishing inside the transaction close the gap; a transactional outbox writes the event in the same commit, and a relay publishes it at least once with a stable id that consumers deduplicate.",
            "Prove it with a test that crashes at every step and a standing reconciliation query, then repair the incident window with an outbox backfill.",
        ]),

        h2("Sources"),
        bullets([
            "Chris Richardson, Pattern: Transactional outbox - microservices.io/patterns/data/transactional-outbox.html",
            "Chris Richardson, Pattern: Idempotent consumer - microservices.io/patterns/communication-style/idempotent-consumer.html",
            "PostgreSQL documentation: Logical Replication (the CDC alternative of lesson 4.3) - postgresql.org/docs/current/logical-replication.html",
        ]),
        callout("tip", "Self-practice (not graded): write the incident review",
            "Write the incident review as you would post it for the platform team, in at most one page: impact (who, how many, which window, what they did not receive), the timeline from 14:03:08 to the backfill, the root cause in one sentence, why the 201 hid it and why review did not catch it, the fix (outbox and relay, with its at-least-once guarantee and consumer deduplication), how the fix was verified, and three follow-ups (for example the reconciliation alert, the outbox age metric and a crash-point test for every command that publishes). Every claim should point to one piece of evidence, A to E."),
    ],
});
