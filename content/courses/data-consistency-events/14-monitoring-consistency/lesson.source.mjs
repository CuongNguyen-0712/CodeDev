// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-5-2",
    title: "Monitoring lag, duplicates & drift",
    slug: { _type: "slug", current: "monitoring-lag-duplicates-drift" },
    description:
        "On a Saturday morning certificates and leaderboard updates arrived three hours late, and not one alert fired: the outbox publisher was up, the broker was up, every consumer was up. Learn which numbers actually describe an event pipeline - the oldest pending outbox row, consumer lag per partition in messages and in time, end-to-end latency, the duplicate rate seen by the inbox, dead-letter queues and reconciliation fix counts - how to turn them into a few alerts on what learners feel, and how to write the runbook that comes with each alert.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer on call for the platform team, CodeDev learning platform",
        problem:
            "Saturday 12:15. Support forwards eleven tickets: learners finished a course in the morning and have no certificate, and the leaderboard has not moved since about 09:10. The on-call dashboard is green: the outbox publisher's health check answers 200, the broker cluster is healthy, every consumer pod is running. The outbox table tells a different story: 21,480 rows are waiting to be published and the oldest has been waiting since 09:08. The publisher has been retrying the same row, a LessonCompleted event whose payload embedded the learner's whole submission (2.3 MB), for three hours.",
    },

    content: [
        h2("1. The incident: everything was up, nothing was moving"),
        p("The outbox publisher from lesson 2.1 reads the oldest unpublished rows in order, publishes them and marks them published. To keep events in order it stops a batch at the first failure and starts again from the same row on the next poll. At 09:08 a new feature, \"attach your solution to the completion event\", wrote a `LessonCompleted` row with the learner's full submission in the payload. The broker rejected it as larger than its maximum message size. From then on every poll published nothing:"),
        code("text", `
outbox-publisher 09:08:02 WARN publish failed id=ob_771203 type=LessonCompleted size=2411022 error="record too large" attempt=1
outbox-publisher 09:08:07 WARN publish failed id=ob_771203 type=LessonCompleted size=2411022 error="record too large" attempt=2
...
outbox-publisher 12:14:57 WARN publish failed id=ob_771203 type=LessonCompleted size=2411022 error="record too large" attempt=2240
outbox-publisher 12:15:00 INFO health check ok`, "outbox-publisher logs"),
        p("Each monitored thing was honestly healthy. The health check proved the process was alive, not that it was doing its job. Nothing on the dashboard measured the one thing learners care about: **how long a change takes to reach the places that show it**."),

        h2("2. Read the evidence"),
        code("sql", `
SELECT count(*)                                  AS pending,
       min(created_at)                           AS oldest_created_at,
       now() - min(created_at)                   AS oldest_pending_age,
       max(attempts)                             AS max_attempts
FROM outbox
WHERE published_at IS NULL;

 pending | oldest_created_at      | oldest_pending_age | max_attempts
---------+------------------------+--------------------+--------------
   21480 | 2026-10-24 09:08:01+07 | 03:07:12           |         2240`, "psql, Saturday 12:15"),
        p("Two numbers matter here, and they say different things. **21,480 pending rows** is large, but on a weekday at 20:00, the busiest hour, the publisher routinely carries a few thousand rows for a few seconds. A count alone does not say whether that is a backlog or normal traffic. **Three hours since the oldest row was written** is unambiguous: some learner has been waiting three hours for something that should take a second. That number is the user-visible one."),
        p("The fix that morning was two steps: park the poison row (set its `status` to `'parked'` so the publisher stops picking it up) so the queue behind it could drain, then remove the embedded submission from the event and publish a reference (`submissionId`) instead. The queue drained in four minutes. The rest of this lesson is about finding out at 09:15 instead of 12:15."),

        h2("3. What to measure, and why each number"),
        p("Monitoring an event pipeline is monitoring delays and discrepancies, not processes. Each hop from lessons 1 to 4 has one number that tells you whether it keeps its promise."),
        h3("Outbox: oldest pending age, not just the count"),
        bullets([
            "**`outbox_oldest_pending_age_seconds`**: `now() - min(created_at)` over unpublished rows, 0 when there are none. This is the delay the slowest waiting event has already suffered. It grows by one second per second whenever the publisher is stuck, whatever the traffic.",
            "**`outbox_pending_rows`**: useful for capacity (is the publisher keeping up at peak?), useless as a stuck detector at night or on a weekend, when traffic is low.",
            "**Failed attempts and parked rows**: a counter of publish failures by event type, and the number of parked rows. A parked row is a decision that needs a human: it should never sit there silently.",
        ]),
        p("If the publisher skips a failing row and carries on instead of stopping (a common choice, since only events of the same aggregate key need to stay in order), the count stays normal while the age still exposes the stuck row: one learner's events are blocked even though everyone else's flow."),
        h3("Consumer lag: per partition, in messages and in time"),
        p("Lag is how far a consumer group is behind the end of the log. On Kafka, `kafka-consumer-groups.sh --describe --group <name>` prints it per partition; SQS exposes `ApproximateAgeOfOldestMessage` per queue; RabbitMQ shows ready and unacknowledged messages per queue. Names and exporters differ, so check the docs of the broker and exporter you run. Two rules apply everywhere:"),
        bullets([
            "**Look at the worst partition, not the sum or the average.** Events are keyed by aggregate (lesson 3.1), so one stuck key blocks its whole partition while the others are at zero. An average over 12 partitions divides a real outage by 12.",
            "**Prefer time lag to offset lag.** 40,000 messages behind is a minute at peak and a day at night. \"The oldest unprocessed message was written 18 minutes ago\" means the same thing at any hour. Some exporters (kafka-lag-exporter, for one) estimate time lag from offsets; otherwise the consumer can report it itself as now minus the timestamp of the oldest message it has not finished.",
        ]),
        h3("End-to-end latency from the envelope"),
        p("Every event carries `occurredAt` (lesson 5.1). When a consumer finishes handling an event, it records `now - occurredAt` in a histogram. That one number covers the outbox, the publisher, the broker and the consumer together, and it is the number you can compare with the promise you made in lesson 3.3 (for example, \"a completed lesson shows on the leaderboard within one minute for 99% of events\"). Clocks on different machines drift: treat a few hundred milliseconds of noise, and negative values, as clock skew, not as an incident."),
        h3("Duplicate rate from the inbox"),
        p("The inbox (lesson 2.2) already knows when it sees an event twice: the insert of the event id hits the unique key and changes nothing. Count it."),
        bullets([
            "**`inbox_duplicates_total / inbox_deliveries_total`** per consumer. A small baseline is normal: a publisher crash between publish and mark (lesson 2.1), a consumer rebalance, a deploy.",
            "**A sustained rise is a loop.** The typical cause is a handler that takes longer than the broker's redelivery deadline (the SQS visibility timeout, Kafka's `max.poll.interval.ms`), so the message is delivered again while the first attempt is still running. The inbox keeps the data correct; the counter tells you the system is doing every piece of work twice.",
            "**It is a cause, not a symptom.** No learner sees a duplicate the inbox absorbed. It earns a ticket, not a page.",
        ]),
        h3("Dead-letter queues"),
        p("A DLQ is a list of events the system gave up on, and each one is a business action that did not happen: a certificate not issued, points not added. Measure its depth and the age of its oldest message per consumer, and give every DLQ an owner. A DLQ nobody reads is a slower way to lose events."),
        h3("Reconciliation fix counts: drift made visible"),
        p("The reconciliation jobs from lesson 4.2 compare sources of truth with what consumers built (paid but not enrolled, completed but no certificate, points ledger sum versus leaderboard score) and repair the differences. A job that repairs silently hides the bug that caused the drift. Make every run report what it fixed, per check:"),
        code("typescript", `
// reconciliation/run.ts - after each check
metrics.counter("reconciliation_checked_total", { check: "paid_not_enrolled" }).inc(result.checked);
metrics.counter("reconciliation_fixed_total",   { check: "paid_not_enrolled" }).inc(result.fixed);
log.info("reconciliation done", { check: "paid_not_enrolled", checked: result.checked, fixed: result.fixed, sampleIds: result.fixedIds.slice(0, 20) });`, "reconciliation/run.ts"),
        p("For most checks the healthy value is zero. A fix is evidence that some path lost, duplicated or misordered an event, and the sample ids are where the investigation starts. A steady trickle means a bug that is still in the code; a spike means an incident that already happened."),

        challenge("chal_quiz_dce_521"),

        h2("4. Worked example: the numbers in code and the alerts on top"),
        p("The outbox metrics come from one query run by the publisher (or a small exporter) every 15 seconds. A partial index on unpublished rows keeps it cheap even when the table holds millions of published rows:"),
        code("sql", `
CREATE INDEX IF NOT EXISTS outbox_unpublished_created_at
  ON outbox (created_at)
  WHERE published_at IS NULL;

-- gauges, every 15 s
SELECT count(*) FILTER (WHERE status = 'pending')                                           AS pending_rows,
       count(*) FILTER (WHERE status = 'parked')                                            AS parked_rows,
       coalesce(extract(epoch FROM now() - min(created_at) FILTER (WHERE status = 'pending')), 0) AS oldest_pending_age_seconds
FROM outbox
WHERE published_at IS NULL;`, "outbox metrics query"),
        p("In the consumer, the inbox insert and the business change share one transaction (lesson 2.2); the metrics are recorded after the commit:"),
        code("typescript", `
async function handle(msg: { eventId: string; occurredAt: string; partition: number; payload: unknown }) {
  const isNew = await db.tx(async (tx) => {
    const inserted = await tx.query(
      "INSERT INTO inbox (consumer, event_id) VALUES ('leaderboard', $1) ON CONFLICT DO NOTHING",
      [msg.eventId],
    );
    if (inserted.rowCount === 0) return false;     // seen before: change nothing
    await applyScore(tx, msg.payload);
    return true;
  });
  metrics.counter("inbox_deliveries_total", { consumer: "leaderboard" }).inc();
  if (!isNew) metrics.counter("inbox_duplicates_total", { consumer: "leaderboard" }).inc();
  metrics.histogram("event_end_to_end_seconds", { consumer: "leaderboard" })
    .observe((clock.now() - Date.parse(msg.occurredAt)) / 1000);
}`, "leaderboard/handler.ts"),
        p("Then a short list of alerts. Page a human only for what learners feel; open a ticket for causes. Thresholds come from the promise in lesson 3.3, not from what the graph looked like last Tuesday. The rules below use Prometheus syntax; metric names depend on your exporters:"),
        code("yaml", `
groups:
  - name: event-pipeline
    rules:
      # PAGE: a learner is waiting for something that should take seconds
      - alert: OutboxOldestPendingTooOld
        expr: outbox_oldest_pending_age_seconds > 300
        for: 5m
        labels: { severity: page }
        annotations: { runbook: "https://runbooks.codedev.test/outbox-stuck" }
      - alert: ConsumerTimeLagHigh
        expr: max by (group) (consumer_time_lag_seconds) > 600      # worst partition, not avg/sum
        for: 10m
        labels: { severity: page }
        annotations: { runbook: "https://runbooks.codedev.test/consumer-lag" }
      - alert: PaidNotEnrolled
        expr: increase(reconciliation_fixed_total{check="paid_not_enrolled"}[1h]) > 0
        labels: { severity: page }
        annotations: { runbook: "https://runbooks.codedev.test/paid-not-enrolled" }
      # TICKET: something is wrong underneath, nobody is hurt yet
      - alert: OutboxParkedRows
        expr: outbox_parked_rows > 0
        labels: { severity: ticket }
      - alert: DlqNotEmpty
        expr: max by (queue) (dlq_oldest_message_age_seconds) > 3600
        labels: { severity: ticket }
      - alert: DuplicateRateHigh
        expr: |
          sum by (consumer) (rate(inbox_duplicates_total[30m]))
            / sum by (consumer) (rate(inbox_deliveries_total[30m])) > 0.05
        for: 30m
        labels: { severity: ticket }`, "alerts/event-pipeline.yaml"),
        callout("info", "When not to add all of this",
            "A pipeline with one producer, one consumer and a reconciliation job that runs hourly can start with two alerts: the oldest pending outbox age and the reconciliation fix count. Add per-partition time lag when there is a broker with real traffic, and the duplicate rate when you have seen a redelivery loop once. Every alert costs attention; an alert that fires and is ignored trains people to ignore the next one."),

        h2("5. Runbooks: what the person who gets paged does"),
        p("An alert without a runbook wakes someone up and leaves them guessing. Keep each runbook short, next to the alert, and tested in a drill. The one for the Saturday incident:"),
        code("text", `
RUNBOOK: OutboxOldestPendingTooOld

Meaning   Events are waiting in the outbox longer than 5 minutes. Downstream (enrollment, leaderboard,
          certificates) is stale for the affected aggregates.

1. Find the head of the queue:
     SELECT id, event_type, aggregate_id, attempts, last_error, octet_length(payload::text) AS bytes, created_at
     FROM outbox WHERE published_at IS NULL AND status = 'pending' ORDER BY created_at LIMIT 5;
2. Decide:
     publisher not running / no recent "published batch" log  -> restart it, watch the age fall
     broker unreachable (every attempt fails, many ids)        -> broker incident, escalate to platform
     one id fails again and again (poison row)                 -> park it:
         UPDATE outbox SET status = 'parked' WHERE id = '<id>';
       and open a ticket with the id and last_error
3. Never DELETE outbox rows and never set published_at by hand: the event would be lost for every consumer.
   Re-publishing is safe: consumers deduplicate by eventId (inbox).
4. Recovered when: oldest_pending_age < 60 s and the backlog is draining.
   Afterwards run the reconciliation checks for the affected window and record their fixed counts.`, "runbooks/outbox-stuck.md"),

        h2("6. How to verify the monitoring itself"),
        bullets([
            "**Break it on purpose in staging.** Stop the publisher for ten minutes, insert an oversized row, pause one consumer partition. Each alert must fire within its `for` window, link the right runbook, and resolve on its own after the fix. An alert that never fired in a drill is an assumption.",
            "**Unit-test the rules.** Prometheus rule files can be tested with `promtool test rules` against synthetic series (check the docs for your version); a test that feeds one partition at 40,000 and eleven at 0 proves the alert uses the worst partition.",
            "**Compare with the business.** After each incident, check that `event_end_to_end_seconds` showed it, and that the reconciliation fixed count matched the number of learners affected. If support found the problem before the dashboard did, a measurement is missing.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Health checks as the only signal.** The process is up and doing nothing useful. Spot it: ask \"which graph would have moved at 09:08?\" If the answer is none, the dashboard measures liveness, not delivery.",
            "**Alerting on the pending count.** It is high at peak and tiny at night, so its threshold is wrong half of the day. Spot it: an alert that fires every evening and is silenced, or one that never fires on weekends.",
            "**Summing or averaging lag across partitions.** A single stuck key disappears into the average. Spot it: the query has `sum(` or `avg(` over the partition label.",
            "**Reconciliation that fixes and says nothing.** The data looks right and the bug lives on. Spot it: the job's log has no fixed count, or no one has ever looked at it.",
            "**Alerts without owners or runbooks.** A DLQ alert routed to a channel nobody reads. Spot it: every alert should name a team and link a runbook that someone on that team has followed in a drill.",
        ]),

        h2("8. Summary"),
        bullets([
            "Measure delays and discrepancies, not processes: the oldest pending outbox row, the worst partition's time lag, end-to-end latency from occurredAt, DLQ age and reconciliation fixes.",
            "Page on what learners feel, with thresholds from your consistency promise; open tickets for causes such as parked rows, a rising duplicate rate or a non-empty DLQ.",
            "Every alert has a runbook with safe actions (park, never delete; re-publish, because consumers are idempotent), and every alert has fired at least once in a drill.",
        ]),

        h2("Sources"),
        bullets([
            "Transactional outbox pattern - microservices.io/patterns/data/transactional-outbox.html",
            "Apache Kafka documentation: consumer groups and kafka-consumer-groups.sh; AWS SQS documentation: ApproximateAgeOfOldestMessage - check current docs",
            "Prometheus documentation: alerting rules and promtool rule unit tests",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List the hops of one event flow in your own system and write down, for each, the number that would have moved first if that hop stopped. Then write the runbook for the alert you would be most afraid to receive at 3 a.m., and run it once in staging by breaking that hop on purpose."),
    ],
});
