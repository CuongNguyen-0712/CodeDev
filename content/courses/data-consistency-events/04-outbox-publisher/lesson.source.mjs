// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-2-1",
    title: "An outbox publisher that survives a crash",
    slug: { _type: "slug", current: "outbox-publisher-survives-crash" },
    description:
        "The outbox closed the dual write, but the relay that copies it to the broker shipped every event twice after a scale-out, spun on a broker outage and let a progress event overtake its enrollment. Learn what a relay can and cannot promise (at least once, order per aggregate, never exactly once), how to claim rows with a lease instead of a long transaction, why marking after publishing is the only safe order, how to back off and park a poison event without stalling every other aggregate, and how to prove it with a fake clock.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, enrollments service, CodeDev learning platform",
        problem:
            "Since the enrollments service moved to an outbox (lesson 1.3), no event has been lost. Then three things happened in one week. The service was scaled from one pod to two, and every pod runs the relay, so the certificates service started receiving every enrollment.created event twice. During a four-minute broker outage the relay retried in a tight loop and wrote 1.2 million error lines. And after the outage the certificates service logged \"progress.updated for unknown enrollment\" for 37 enrollments: their progress event reached the broker before the enrollment.created event that was still being retried.",
    },

    content: [
        h2("1. The incident: a relay that was written in an afternoon"),
        p("The outbox from lesson 1.3 guarantees that an enrollment and its event commit together. Something still has to copy the rows to the broker. This is the relay that shipped with it, running inside every pod of the enrollments service:"),
        code("typescript", `
// enrollments/outbox-relay.ts - the first version
async function relayLoop(): Promise<void> {
  for (;;) {
    const { rows } = await db.query(
      "SELECT id, aggregate_id, event_type, payload FROM outbox WHERE sent_at IS NULL ORDER BY seq LIMIT 100",
    );
    for (const row of rows) {
      try {
        await broker.publish("enrollment-events", { id: row.id, key: row.aggregate_id, payload: row.payload });
        await db.query("UPDATE outbox SET sent_at = now() WHERE id = $1", [row.id]);
      } catch (err) {
        logger.error({ err, id: row.id }, "publish failed, will retry");
      }
    }
    if (rows.length === 0) await sleep(200);
  }
}`, "outbox-relay.ts (as shipped)"),
        p("It looks reasonable: it reads unsent rows in id order, publishes each one, marks it sent, and leaves a failed row for the next loop. With one pod and a healthy broker it worked for months. Each line of the incident comes from one assumption it makes without saying so: that it is the only relay, that a failed publish should be retried immediately, and that skipping a failed row is harmless."),

        h2("2. Read the evidence"),
        p("Start with the duplicates. The certificates service logs the outbox id it receives with every message, so a query on its own log table shows which ids came twice and from where:"),
        code("text", `
received_at   outbox_id  type                producer
10:14:07.311  5501       enrollment.created  enrollments-7d9f-a
10:14:07.318  5501       enrollment.created  enrollments-7d9f-b
10:14:07.402  5502       enrollment.created  enrollments-7d9f-a
10:14:07.405  5502       enrollment.created  enrollments-7d9f-b`, "certificates: received events after the scale-out"),
        p("Both pods ran the same SELECT at the same moment, saw the same unsent rows and published all of them. Nothing in the query says \"this row is being handled\". Now the outage. The relay log has one line per failed publish, with no delay between attempts:"),
        code("text", `
09:00:00.004 ERROR publish failed, will retry  id=6120 err="broker unavailable"
09:00:00.005 ERROR publish failed, will retry  id=6121 err="broker unavailable"
09:00:00.007 ERROR publish failed, will retry  id=6120 err="broker unavailable"
... 1,206,331 lines until 09:04:02 ...
09:04:02.913 INFO  published id=6121 aggregate=e-9131 type=progress.updated
09:04:02.917 INFO  published id=6120 aggregate=e-9131 type=enrollment.created`, "relay log during the broker outage"),
        p("The last two lines are the ordering bug. Row 6120 (the enrollment) and row 6121 (its first progress) belong to the same aggregate, enrollment e-9131. Each loop tried them in id order, but a publish is a network call: when the broker came back, the attempt for 6120 had just failed and the one for 6121 succeeded. Because the loop simply moves on after a failure, a later event of the same enrollment overtook an earlier one."),
        p("Finally, check what the table says while the system is running. Two queries answer most questions about an outbox:"),
        code("sql", `
-- how far behind is the relay, and is anything stuck?
SELECT status, count(*) AS rows, min(created_at) AS oldest
FROM outbox
WHERE status <> 'sent'
GROUP BY status;

-- which aggregates have more than one unsent event (candidates for overtaking)?
SELECT aggregate_id, array_agg(id ORDER BY seq) AS unsent
FROM outbox
WHERE status <> 'sent'
GROUP BY aggregate_id
HAVING count(*) > 1;`, "outbox health queries"),

        h2("3. What a relay can promise, and what it cannot"),
        p("The relay writes to two systems again: it publishes to the broker and it updates the outbox row. That is the dual write from lesson 1.1, and no ordering of the two calls makes it atomic. The difference from lesson 1.1 is that now the event is safe in PostgreSQL, so the relay can always try again. You get to choose which way a crash fails:"),
        bullets([
            "**Mark, then publish: at most once.** A crash or a broker error after the mark loses the event for good. The certificate is never issued and nobody is told.",
            "**Publish, then mark: at least once.** A crash after the publish and before the mark leaves the row unsent, so it is published again later. The consumer sees a duplicate with the same outbox id, which it can detect (lesson 2.2).",
        ]),
        p("Every production relay picks the second. \"Exactly once\" between a database and a broker is not something a relay can provide by itself: what you build instead is **at-least-once delivery plus idempotent consumers**. Some brokers offer transactional or idempotent producers that remove duplicates caused by the producer's own retries; they do not cover a relay process that dies between two different systems, so check what your broker's feature actually guarantees before relying on it."),
        p("The second promise is **order per aggregate, not global order**. The certificates service needs `enrollment.created` before `progress.updated` for the same enrollment. It does not care whether enrollment e-1 is published before or after e-2. Global order would force one relay, one row at a time, and one stuck event would stop everything. Order per aggregate allows parallel relays and lets a broken event block only its own aggregate. On the broker side, use the aggregate id as the message key, so that a broker that partitions by key (Kafka, for example) keeps the events of one aggregate in one ordered partition."),
        callout("info", "When you do not need this lesson",
            "If the relay runs as a single process (one replica, or a leader elected by your platform), the broker is reliable enough that a short pause on error is fine, and consumers do not depend on order, the simple loop plus a backoff is enough: do not add leases you cannot test. If you already run change data capture with an outbox router (for example Debezium, lesson 4.3), that tool is your relay and its documentation defines these guarantees. Build the version below when several instances publish, or when order per aggregate matters."),

        h3("Claiming rows: a lease, not a long transaction"),
        p("Two relays must not handle the same row at the same time. The first idea is a row lock: `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction, publish, mark, commit. It works, but it keeps a database transaction open across a network call to the broker. A slow broker then means long transactions, held locks and connections, and in PostgreSQL old row versions that vacuum cannot remove while they are open. A crash in the middle is handled (the transaction rolls back), but the price is paid on every publish."),
        p("A **lease** keeps transactions short. A relay claims rows in one quick transaction by writing its name and an expiry time on them, commits, and then publishes outside any transaction:"),
        bullets([
            "**Claim:** `lease_owner = 'relay-a'`, `lease_until = now() + 30 s`. Other relays skip rows with a live lease.",
            "**Publish and mark:** each row is marked sent in its own short transaction right after its publish succeeds, so a crash loses at most the mark of one row.",
            "**Expiry:** if the relay dies, nobody releases its lease. After 30 s the lease is expired and another relay claims the rows and publishes them again. That is the duplicate you accepted above.",
            "**Lost lease:** before publishing, a relay reads only rows whose lease it still holds at that moment. A relay that paused longer than its lease (a long GC pause, a frozen container) finds that the rows now belong to someone else and publishes nothing.",
        ]),
        p("Choose the lease well above the time one batch takes to publish, measured, not guessed: too short and a slow but healthy relay loses its rows to another relay, which publishes them a second time; too long and a crashed relay delays its events for that long."),

        h3("Keeping order: block the aggregate, not just the row"),
        p("Ordering breaks whenever a later row of an aggregate is published while an earlier one is still unsent. That happens in three ways: the earlier row failed and waits for a retry, it was parked after too many failures, or another relay holds it under a lease. The rule that covers all three: **walk the unsent rows in id order, and when a row cannot be taken now, block its aggregate for the rest of the walk.** Rows of other aggregates keep flowing. The same rule applies while publishing: when a publish fails, skip the remaining rows of that aggregate in the batch."),

        h3("Broker errors: back off, then park"),
        p("A broker error is not a reason to try again a millisecond later. Store the failure on the row: `attempts = attempts + 1` and `next_attempt_at = now() + base * 2^(attempts - 1)` (1 s, 2 s, 4 s ...). The claim skips rows whose time has not come, so the relay stays quiet during an outage. After a maximum number of attempts, set the row to `failed` (parked): the payload might be too large for the broker or the topic might not exist, and retrying will not fix that. A parked row blocks its aggregate until an engineer looks at it, which is exactly what you want, and an alert on `status = 'failed'` makes sure someone does."),

        challenge("chal_quiz_dce_211"),

        h2("4. Worked example: the relay in PostgreSQL and TypeScript"),
        p("The outbox table gets the columns that the relay needs. The partial index keeps the claim query fast however many sent rows the table holds:"),
        code("sql", `
-- Lesson 1.3's table already has seq, status ('pending' | 'sent') and sent_at.
ALTER TABLE outbox
  DROP CONSTRAINT outbox_status_check,
  ADD CONSTRAINT outbox_status_check CHECK (status IN ('pending', 'sent', 'failed')),
  ADD COLUMN attempts        int         NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN lease_owner     text,
  ADD COLUMN lease_until     timestamptz;

DROP INDEX outbox_pending;
CREATE INDEX outbox_unsent ON outbox (seq) WHERE status <> 'sent';`, "migration"),
        p("The claim runs in one short transaction. It takes a transaction-level advisory lock first so that two claims never interleave: the per-aggregate check reads earlier rows without locking them, and two concurrent claims could otherwise both decide that their row is the first unsent one of its aggregate. Claims take milliseconds, so serialising them costs little; publishing still runs in parallel."),
        code("sql", `
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('outbox-claim'));

WITH candidates AS (
  SELECT o.id
  FROM outbox o
  WHERE o.status = 'pending'
    AND o.next_attempt_at <= now()
    AND (o.lease_until IS NULL OR o.lease_until <= now() OR o.lease_owner = $1)
    AND NOT EXISTS (                       -- an earlier event of this aggregate is still out
      SELECT 1 FROM outbox e
      WHERE e.aggregate_id = o.aggregate_id
        AND e.seq < o.seq
        AND e.status <> 'sent'
        AND (e.status = 'failed'
             OR e.next_attempt_at > now()
             OR (e.lease_owner <> $1 AND e.lease_until > now()))
    )
  ORDER BY o.seq
  LIMIT $2
)
UPDATE outbox o
SET lease_owner = $1, lease_until = now() + interval '30 seconds'
FROM candidates c
WHERE o.id = c.id
RETURNING o.id;

COMMIT;`, "claim.sql ($1 = relay name, $2 = batch size)"),
        p("Then the publish loop, outside any transaction. The mark is conditional on the owner: if it updates zero rows, the lease was lost while publishing, another relay may publish the row again, and that is the at-least-once contract, not an error."),
        code("typescript", `
async function publishClaimed(relay: string): Promise<void> {
  const { rows } = await db.query<OutboxRow>(
    \`SELECT id, aggregate_id, event_type, payload, attempts FROM outbox
     WHERE status = 'pending' AND lease_owner = $1 AND lease_until > now()
     ORDER BY seq\`, [relay]);
  const blocked = new Set<string>();
  for (const row of rows) {
    if (blocked.has(row.aggregate_id)) continue;           // keep order inside the batch
    try {
      await broker.publish("enrollment-events", { id: String(row.id), key: row.aggregate_id, payload: row.payload });
    } catch (err) {
      blocked.add(row.aggregate_id);
      await db.query(
        \`UPDATE outbox SET attempts = attempts + 1,
           status = CASE WHEN attempts + 1 >= $3 THEN 'failed' ELSE status END,
           next_attempt_at = now() + make_interval(secs => $2 * 2 ^ attempts),
           lease_owner = NULL, lease_until = NULL
         WHERE id = $1 AND lease_owner = $4\`, [row.id, 1, 8, relay]);
      metrics.outboxPublishErrors.inc();
      continue;
    }
    // a crash here means: published, not marked -> published again after the lease expires
    await db.query(
      "UPDATE outbox SET status = 'sent', sent_at = now(), lease_owner = NULL, lease_until = NULL WHERE id = $1 AND lease_owner = $2",
      [row.id, relay]);
  }
  await db.query("UPDATE outbox SET lease_owner = NULL, lease_until = NULL WHERE status = 'pending' AND lease_owner = $1", [relay]);
}`, "outbox-relay.ts (fixed)"),
        p("In the backoff update, `attempts` on the right-hand side is the value before the update, so the delay is 1 s, 2 s, 4 s ... for the first, second, third failure. Wrap the loop in a short sleep when a claim returns nothing, and stop it on SIGTERM after the current row, so a deploy does not cut a batch in half more often than necessary."),
        p("Write the same relay against in-memory building blocks: a `FakeDb` whose `tx` commits a copy only when the callback returns, a `FakeBroker` that the tests script to fail or to crash the process right after a publish, and a fake clock. The tests interleave two relays, expire leases, and replay outages, and print every publish and the final state of the outbox."),
        challenge("chal_coding_dce_212"),

        h2("5. How to verify a relay"),
        bullets([
            "**Unit tests on a fake clock**, as in the exercise: a crash after the Nth publish, two relays claiming before either publishes, a lease that expires before the publish, N broker errors in a row. Each failure is a line of input, not a sleep.",
            "**Two psql sessions on the claim.** Run the claim in session 1 without committing, run it in session 2: session 2 waits on the advisory lock, then sees session 1's leases after the commit and claims other aggregates. Without the lock, both sessions can claim different events of the same aggregate.",
            "**Kill the relay between publish and mark in staging.** `kill -9` the relay process during a burst, then count deliveries per outbox id on the consumer side: some ids arrive twice, none are missing (`SELECT count(*) FROM outbox WHERE status <> 'sent'` goes back to 0).",
            "**Metrics that would have caught each incident:** the age of the oldest unsent row (relay lag), publish errors per minute (the hot loop), rows with `status = 'failed'` (parked events, alert on more than 0), and duplicates detected by consumers (lesson 5.2).",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Marking the row sent before publishing.** It turns every broker error or crash into a lost event. Spot it: the UPDATE to `sent` comes before the `publish` call, or both happen in one transaction that commits even when the publish throws.",
            "**Publishing inside the claim transaction.** `FOR UPDATE SKIP LOCKED` around a network call holds locks and a transaction for as long as the broker is slow. Spot it: `pg_stat_activity` shows the relay `idle in transaction` with a growing `xact_start` age.",
            "**Skipping a failed row and moving on.** The next row of the same aggregate overtakes it. Spot it: the health query above shows aggregates with several unsent rows, and consumers log events for unknown entities after an outage.",
            "**Retrying without a delay.** A broker outage becomes a CPU and log storm and delays recovery. Spot it: publish errors per second in the thousands, all for the same few ids.",
            "**Never deleting sent rows.** The outbox grows without limit. Delete sent rows older than a few days in small batches (or use time partitions and drop old ones), and keep them long enough to debug and to republish if a consumer needs it.",
        ]),

        h2("7. Summary"),
        numbered([
            "A relay writes to two systems, so it cannot be exactly once. Publish first, mark after: a crash costs a duplicate with the same outbox id, which consumers deduplicate, never a lost event.",
            "Claim with a short transaction and a lease (owner + expiry), publish outside the transaction, mark each row as soon as its publish succeeds, and publish only rows whose lease you still hold.",
            "Keep order per aggregate by blocking an aggregate whenever one of its earlier events cannot go now (retry delay, parked, leased elsewhere); back off exponentially on broker errors and park a poison event so it blocks only its own aggregate.",
        ]),

        h2("Sources"),
        bullets([
            "Chris Richardson, Pattern: Transactional outbox (and the Polling publisher pattern) - microservices.io/patterns/data/transactional-outbox.html",
            "PostgreSQL documentation: SELECT, The Locking Clause (FOR UPDATE, SKIP LOCKED) and Advisory Locks (pg_advisory_xact_lock) - postgresql.org/docs/current",
            "Your broker's documentation on producer idempotence and message keys/partitioning (for example Kafka's idempotent producer): check the version you run",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run the claim query in two psql sessions with and without the advisory lock and write down which rows each session claims. Then add a 'republish' admin command that resets a parked row to pending with attempts = 0, and decide which checks it needs (who may run it, and what happens to the later events of that aggregate that were waiting behind it)."),
    ],
});
