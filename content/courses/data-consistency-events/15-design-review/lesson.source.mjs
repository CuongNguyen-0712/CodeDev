// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-5-3",
    title: "Design review: enrollment, payment & certificate flow",
    slug: { _type: "slug", current: "design-review-enrollment-payment-certificate-flow" },
    description:
        "One support ticket touched every service: a learner paid during the sale, was enrolled 40 minutes later, got double leaderboard points for one lesson and never received a certificate. Review the whole flow - payment, enrollment, progress, leaderboard, certificate - arrow by arrow: which mechanism gives each guarantee (a local transaction, the outbox, the inbox, a saga with compensation, reconciliation), how each arrow fails, how you would notice, and the checklist to run before the next flow ships.",
    estimatedTime: 30,

    scenario: {
        role: "Senior backend engineer leading the design review, CodeDev learning platform",
        problem:
            "Ticket #4471, opened Monday. A learner bought the Data Consistency course at 23:58 on sale night; the payment provider confirmed it at once, but the course appeared in their dashboard only at 00:39. During the week they got +100 instead of +50 leaderboard points for lesson 7. On Sunday they reached 15 of 15 lessons and no certificate arrived. Each team looked at its own service and found it \"working as designed\". The engineering manager asks for one review of the whole flow before the next sale: for every arrow between services, who guarantees what, and how would we know when it breaks?",
    },

    content: [
        h2("1. The incident: three symptoms, one flow"),
        p("Ticket #4471 is a good review case because each symptom sits on a different arrow:"),
        bullets([
            "**Enrolled 41 minutes late.** Between the payment commit and the enrollment.",
            "**Double points for one lesson.** Between the progress service and the leaderboard.",
            "**No certificate.** Between the progress service and the certificate service.",
        ]),
        p("No single service was broken. The flow as a whole had no owner, so no one could say which guarantee was supposed to hold on each arrow. That is what a design review produces: a map from every arrow to the mechanism that protects it, the ways it fails, and the signal that tells you it failed."),

        h2("2. Read the evidence"),
        code("text", `
23:58:09  payments       COMMIT payment pay_812 succeeded + outbox ob_88120 PaymentSucceeded
23:58:09  payments       webhook evt_pp_7731 payment.succeeded pay_812 -> 200
23:58:10  outbox-pub     oldest_pending_age_seconds=2214  pending=96412      (sale peak)
00:39:02  outbox-pub     published ob_88120 PaymentSucceeded key=pay_812
00:39:03  enrollment     enrollment enr_5512 created for pay_812

Wed 10:02:03  outbox-pub    published ob_90017 ProgressRecorded as broker msg m-5521
Wed 10:02:03  outbox-pub    process killed before marking ob_90017 published
Wed 10:02:04  leaderboard   inbox insert message_id=m-5521 -> new; +50 points u_77 lesson 7
Wed 10:02:09  outbox-pub    restart; published ob_90017 ProgressRecorded as broker msg m-5530
Wed 10:02:10  leaderboard   inbox insert message_id=m-5530 -> new; +50 points u_77 lesson 7

Sun 18:20:41  certificate   handler error: connection to template-renderer refused (attempt 3/3)
Sun 18:20:41  certificate   moved evt ob_93311 ProgressRecorded(percent=100) to certificate.dlq
              certificate.dlq depth=37, oldest=19 days, no alert configured`, "logs collected for ticket #4471"),
        p("Read it arrow by arrow. The payment commit and its outbox row were atomic, and the event was not lost, only late: the outbox did its job and the publisher could not keep up at the sale peak, which nobody was alerted about. The doubled points come from the leaderboard deduplicating on the **broker message id**, which is new on every publish, instead of the event id, which is the outbox row and never changes. The missing certificate is in a dead-letter queue that has been filling for 19 days, with no owner and no reconciliation check behind it."),

        h2("3. A guarantee on every arrow"),
        p("Every mechanism in this course gives one specific guarantee, and none of them gives more than that. A design review is mostly about naming them precisely:"),
        bullets([
            "**A local transaction** (lesson 1.1): changes in one database commit together or not at all. Nothing beyond that database.",
            "**The outbox** (lessons 1.3 and 2.1): if the business change commits, the event will be published at least once, eventually. Not exactly once, and not immediately.",
            "**The inbox** (lessons 2.2 and 2.3): a redelivered event changes nothing the second time, as long as the key is the event's own id and the inbox insert shares the transaction with the effect.",
            "**Ordering by key** (lesson 3.1): events of one aggregate arrive in the order they were published. No order across aggregates.",
            "**A saga** (lesson 4.1): a multi-step flow ends in an accepted state, either completed or compensated. Intermediate states are visible to everyone while it runs.",
            "**Reconciliation** (lesson 4.2): differences that all of the above missed are found and repaired, within the job's interval.",
            "**Monitoring** (lesson 5.2): someone learns about a broken guarantee from a graph instead of a ticket.",
        ]),
        callout("info", "The simplest design first",
            "The cheapest guarantee is still one transaction. If payments and enrollments live in the same PostgreSQL database (a modular monolith, as many platforms start), confirm the payment and create the enrollment in one transaction, and there is no arrow to protect. Split them only for a reason you can name, such as separate teams, separate scaling or a separate payment compliance boundary. Every arrow you add needs the mechanisms below, and every mechanism needs monitoring."),

        h2("4. The flow, arrow by arrow"),
        code("text", `
  Payment provider
        | (A) webhook, retried by the provider
        v
  payments DB --(B) outbox + publisher--> PaymentSucceeded
                                                | (C) inbox + saga step
                                                v
                                         enrollment DB --(C') failure: RefundRequested --> payments
  progress DB --(D) outbox, key = enrollmentId--> ProgressRecorded
                                                |                     |
                                  (E) inbox + ledger           (F) inbox + unique certificate
                                                v                     v
                                          leaderboard           certificate DB --outbox--> email
  (G) reconciliation jobs compare: provider vs payments, payments vs enrollments,
      progress vs certificates, points ledger vs leaderboard`, "the flow under review"),
        h3("(A) Payment provider to payments: a webhook"),
        bullets([
            "**Mechanism**: verify the signature; update the payment row with a conditional `UPDATE ... WHERE status = 'pending'`, so a retried or duplicated webhook changes nothing; the provider's payment id is unique in `payment`.",
            "**Failure modes**: the webhook never arrives (endpoint down for longer than the provider retries), arrives twice, or arrives after the learner's browser already polled the status.",
            "**Detection**: a reconciliation of the provider's settlement report or API against `payment` (the provider is the source of truth for money).",
        ]),
        h3("(B) payments to the broker: outbox and publisher"),
        bullets([
            "**Mechanism**: the `PaymentSucceeded` outbox row is inserted in the same transaction as the payment update; the publisher publishes at least once and marks rows after the broker acknowledges.",
            "**Failure modes**: publisher down or too slow (the 41 minutes), a poison row, a crash between publish and mark (a duplicate, which (C) must absorb).",
            "**Detection**: `outbox_oldest_pending_age_seconds` paged at 5 minutes. On sale night the age was already 2,214 seconds at 23:58, so it would have paged well before midnight, not via a ticket on Monday.",
        ]),
        h3("(C) PaymentSucceeded to enrollment, and (C') the compensation"),
        bullets([
            "**Mechanism**: an inbox keyed by eventId in the same transaction as the enrollment insert; a unique `(user_id, course_id)` on enrollment as a second line of defence; the saga's state stored in a table, not in memory.",
            "**Failure modes**: a transient error (retry with backoff), a permanent one (course archived, learner banned): the saga moves to compensation and asks payments to refund. A refund can fail too, so the saga keeps retrying it and alerts if it stays stuck.",
            "**Detection**: sagas in a non-final state for longer than an agreed time; the paid-but-not-enrolled reconciliation check.",
        ]),
        h3("(D) progress to the broker: outbox with a key"),
        bullets([
            "**Mechanism**: an outbox row per completed lesson, keyed by enrollmentId so one learner's events stay in order; the payload carries absolute values (`completedLessons: 11`, `percent: 73`), not deltas, so a duplicate or a replay cannot add up twice.",
            "**Failure modes**: the same as (B), plus schema changes that break readers (lesson 5.1).",
            "**Detection**: the same outbox metrics; per-version consumer metrics after a producer deploy.",
        ]),
        h3("(E) ProgressRecorded to the leaderboard"),
        bullets([
            "**Mechanism**: the inbox insert of the **eventId** and the points-ledger insert in one transaction; the leaderboard score is a read model derived from the ledger and can be rebuilt from it.",
            "**Failure modes**: deduplicating on a transport id (the doubled +50), applying points outside the inbox transaction, out-of-order delivery across partitions after a re-key.",
            "**Detection**: the inbox duplicate rate (which stayed at zero here, because the wrong key made every duplicate look new); the ledger-versus-leaderboard reconciliation.",
        ]),
        h3("(F) ProgressRecorded to the certificate service"),
        bullets([
            "**Mechanism**: issue when the event says 15 of 15; a unique `(user_id, course_id)` on certificate makes a second issue a no-op; the email goes through the certificate service's own outbox, so \"certificate saved\" and \"email will be sent\" commit together.",
            "**Failure modes**: a dependency down long enough to exhaust the retries (the DLQ), an event that arrives before the enrollment is known locally, a semantic schema break (5.1).",
            "**Detection**: DLQ age with an owner; the completed-without-certificate reconciliation check.",
        ]),
        h3("(G) Reconciliation, the net under every arrow"),
        p("Each check compares a source of truth with what was derived from it, repairs the difference through the normal path (publish the missing event, or call the same idempotent handler) and counts what it fixed:"),
        code("sql", `
-- paid but not enrolled for more than 15 minutes
SELECT p.id AS payment_id, p.user_id, p.course_id, p.succeeded_at
FROM payment p
LEFT JOIN enrollment e ON e.user_id = p.user_id AND e.course_id = p.course_id
WHERE p.status = 'succeeded'
  AND p.succeeded_at < now() - interval '15 minutes'
  AND e.id IS NULL;

-- points ledger versus leaderboard read model
SELECT l.user_id, l.ledger_points, b.score
FROM (SELECT user_id, sum(points) AS ledger_points FROM points_ledger GROUP BY user_id) l
JOIN leaderboard b ON b.user_id = l.user_id
WHERE b.score <> l.ledger_points;`, "reconciliation checks"),
        p("In a split-database setup these run against replicas or exported snapshots of each service's data, not with a cross-database join in production; the queries show what is compared, not where it runs."),

        challenge("chal_quiz_dce_531"),

        h2("5. Fixing ticket #4471"),
        p("With the map, each symptom has a precise fix and a precise test:"),
        numbered([
            "**Late enrollment (B)**: page on the oldest pending outbox age; give the publisher a batch size and parallelism per partition that a load test at 3 times the last sale's peak can sustain. Verify: replay the sale-night outbox volume in staging and watch the age stay under a minute.",
            "**Double points (E)**: deduplicate on the eventId carried in the message (the outbox row id), never on the broker's message id or offset. Verify: a test that publishes the same outbox row twice as two broker messages and expects one ledger row.",
            "**Missing certificate (F)**: give `certificate.dlq` an owner and a ticket alert at one hour; add the completed-without-certificate reconciliation; redrive the 37 parked events (safe, because issuing is idempotent). Verify: the reconciliation's fixed count for the redrive equals 37, then stays at zero.",
        ]),
        code("typescript", `
// before: the transport id changes on every publish of the same outbox row
await tx.query("INSERT INTO inbox (consumer, event_id) VALUES ('leaderboard', $1) ON CONFLICT DO NOTHING", [msg.brokerMessageId]);

// after: the event's own id, written once by the producer into the outbox row and the envelope
await tx.query("INSERT INTO inbox (consumer, event_id) VALUES ('leaderboard', $1) ON CONFLICT DO NOTHING", [msg.envelope.eventId]);`, "leaderboard/handler.ts"),

        h2("6. The design review checklist"),
        p("Run it for every new flow, and again whenever an arrow is added. Each question needs a concrete answer: a table name, a key, a metric, a runbook link."),
        bullets([
            "**Boundaries.** Which changes must be atomic? Are they in one database? If yes, use one transaction and stop here.",
            "**Publishing.** Is every event written in the same transaction as the change it describes (outbox or CDC, lesson 4.3)? What happens if the process dies right after the commit?",
            "**Identity.** Does every event carry a stable eventId created by the producer? Is that the id every consumer deduplicates on?",
            "**Consumers.** Is the inbox insert in the same transaction as the effect? Is the effect safe to replay (absolute values or a ledger keyed by event)? Is there a unique constraint as a second line of defence?",
            "**Ordering.** What is the partition key? Which consumers need order, and what happens if two events of different keys arrive in either order?",
            "**Failure.** For each step of a multi-service flow: what is the compensation, can it fail, and what state is visible to users while it runs?",
            "**Evolution.** Is there a version in the envelope, a golden example per version, and a tolerant reader in every consumer?",
            "**Detection.** For each arrow: which metric moves first when it breaks, which alert fires, which runbook it links, and which reconciliation check repairs the leftovers?",
            "**Promise.** What delay do users accept for each derived view (lesson 3.3), and do the alert thresholds come from it?",
        ]),

        h2("7. How to verify the design"),
        bullets([
            "**One failure test per arrow.** Kill the process after commit and before publish (B, D); deliver every message twice (C, E, F); replay a topic from offset 0 (E); fail the enrollment step permanently (C'). Each is a test you have written in this course's challenges, now run against the real services in staging.",
            "**Reconciliation as an oracle.** After every failure test, run all checks: their fixed counts must be zero once the system has recovered, or the test found a gap.",
            "**A game day before the sale.** Replay peak traffic with the publisher throttled, watch which alert fires first and whether the runbook is enough for someone who did not write it.",
        ]),

        h2("8. Common mistakes in a review"),
        bullets([
            "**\"The broker guarantees it.\"** A broker guarantees delivery between itself and its clients, not that your database and your event agree. Spot it: an arrow whose only listed mechanism is the broker's name.",
            "**Exactly-once claimed end to end.** What you can build is at-least-once delivery plus idempotent effects. Spot it: ask what happens when the publisher crashes after publish and before mark; if the answer is \"it can't\", the review is not done.",
            "**Transport ids as identity.** Broker message ids, offsets and receipt handles change between publishes or redeliveries. Spot it: grep consumers for the key passed to the inbox insert.",
            "**Compensation treated as rollback.** A refund is a new business action that the learner sees, with its own failure modes. Spot it: the review has no answer for \"what if the refund fails\" or \"what did the learner see in between\".",
            "**Safety nets without owners.** A DLQ or reconciliation job that nobody reads. Spot it: every queue and every check in the map names a team and an alert.",
        ]),

        h2("9. Summary"),
        bullets([
            "Each mechanism gives one guarantee: a transaction is atomic locally, the outbox publishes at least once, the inbox makes repeats harmless, a saga ends in completed or compensated, reconciliation repairs what slipped through.",
            "Review a flow arrow by arrow: the mechanism, how it fails, and the metric, alert and reconciliation check that tell you it failed.",
            "The simplest design is still one transaction; every arrow you add must earn its outbox, inbox, monitoring and reconciliation.",
        ]),

        h2("Sources"),
        bullets([
            "Transactional outbox pattern - microservices.io/patterns/data/transactional-outbox.html",
            "Saga pattern - microservices.io/patterns/data/saga.html",
            "PostgreSQL documentation: logical replication (for the CDC alternative of lesson 4.3) - postgresql.org/docs/current/logical-replication.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Draw the payment -> enrollment -> progress -> leaderboard -> certificate flow on one page, as boxes and arrows. On each arrow write three things: the mechanism that protects it (transaction, outbox, inbox, saga step, unique constraint), the failure you fear most there, and the metric or reconciliation check that would tell you. Then do the same for one flow in your own system and bring the drawing to your next design review."),
    ],
});
