// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-2-3",
    title: "Spot the AI mistake: a consumer that adds points twice",
    slug: { _type: "slug", current: "spot-ai-mistake-consumer-adds-points-twice" },
    description:
        "An AI assistant wrote the wallet consumer in one prompt: validate the event, add the points in a transaction, tests green. After a rebalance, learners' points doubled. Learn to read a consumer the way the broker will run it, why balance = balance + amount is the bug and the transaction is not the fix, which follow-up fixes an assistant tends to offer and why they fail (an in-memory Set, Redis, offsets, deduplicating on user and amount), the two designs that work (an inbox or a ledger keyed by event id), how to repair the balances, and what to ask for in the prompt next time.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer and code reviewer, points and wallet, CodeDev learning platform",
        problem:
            "On Monday at 10:00 a deploy restarted the wallet consumers and the consumer group rebalanced. By noon support had 41 tickets saying \"my points doubled\", and the weekly leaderboard, which ranks by wallet balance, had new leaders. The wallet consumer was written two weeks earlier with an AI coding assistant and approved because its tests passed and the code looked careful: validation, a transaction, a typed handler.",
    },

    content: [
        h2("1. The incident: a careful-looking consumer"),
        p("The request to the assistant was one sentence: \"Write a consumer that adds the points from `points.awarded` events to the wallet balance.\" This is what it produced, with a test for each branch:"),
        code("typescript", `
// wallet/points-awarded.consumer.ts
@Injectable()
export class PointsAwardedConsumer {
  constructor(private readonly db: DataSource) {}

  @EventPattern("points.awarded")
  async handle(@Payload() event: PointsAwarded): Promise<void> {
    if (!event.userId || !Number.isInteger(event.amount) || event.amount <= 0) {
      this.logger.warn({ event }, "invalid points.awarded");
      return;
    }
    await this.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE wallets SET balance = balance + $2 WHERE user_id = $1",
        [event.userId, event.amount],
      );
    });
  }
}`, "points-awarded.consumer.ts (as merged)"),
        p("Nothing in it is wrong on its own. The validation is sensible, the transaction is real, the SQL is parameterised. The tests deliver each event once and check the balance, which is exactly what the request asked for. The problem is what the request did not say: the broker delivers each event **at least** once."),

        h2("2. Reproduce it and read the evidence"),
        p("The consumer client commits offsets periodically, every few seconds, after processing. Here is one partition around the deploy, from the consumer logs:"),
        code("text", `
10:00:05.000  wallet-1  points-3: processed up to 4812, committed offset 4813
10:00:06.200  wallet-1  points-3: processed 4813, 4814, 4815
10:00:07.010  wallet-1  SIGTERM, left the group without committing
10:00:09.480  wallet-2  assigned points-3, starting at offset 4813
10:00:09.512  wallet-2  processed 4813, 4814, 4815`, "consumer group logs"),
        p("wallet-1 had already run the UPDATEs for 4813 to 4815 in PostgreSQL. It never told the broker. wallet-2 started where the broker's record ended and ran them again. The database shows the result. The points service keeps its own table of awarded points, so the expected balance can be recomputed:"),
        code("sql", `
SELECT w.user_id, w.balance, a.awarded, w.balance - a.awarded AS extra
FROM wallets w
JOIN (SELECT user_id, sum(amount) AS awarded
      FROM points_awards GROUP BY user_id) a ON a.user_id = w.user_id
WHERE w.balance <> a.awarded
ORDER BY extra DESC;

 user_id | balance | awarded | extra
---------+---------+---------+-------
 u-18    |    2350 |    1300 |  1050
 u-602   |     980 |     540 |   440`, "drift: wallets against awarded points (points_awards is a replica of the points service's table)"),
        p("Reproducing it locally needs no cluster: deliver the same event twice to the handler, or deliver it, \"crash\" before the ack, and deliver it again. The balance moves twice. That is the test the assistant did not write, because nobody asked for it."),

        h2("3. Core idea: a delivery is not an event"),
        p("An **event** happened once: the points service awarded 50 points to u-18 for finishing a challenge, and gave it the id p-9001. A **delivery** is the broker handing a copy of that event to a consumer, and there can be several: after a rebalance (positions since the last offset commit are replayed), after a crash before the ack, after a broker failover, and after an outbox relay republishes a row it had published but not yet marked (lesson 2.1). The handler is called per delivery, so the question for every line of it is: **what does this line do the second time?**"),
        p("`UPDATE ... SET balance = balance + $2` adds again. The transaction around it guarantees that the UPDATE is all or nothing; it says nothing about whether this event was already applied by an earlier transaction. A transaction makes one delivery atomic. Idempotency makes many deliveries count once. They are different properties, and the code has only the first."),
        h3("Why the tests passed"),
        p("The tests encoded the request: one event, one call, one balance. They are correct tests of the wrong contract. When you review generated code that touches a broker, the missing tests are usually the ones about delivery: the same message twice, a crash between the commit and the ack, a redelivery after newer messages, a restart of the consumer. If the change has none of them, the reviewer's first job is to write one."),

        h3("Two designs that work"),
        bullets([
            "**An inbox (processed events table).** In the same transaction as the balance change, insert the event id into `processed_events` with a primary key. If it is already there, change nothing (lesson 2.2). The balance stays a plain number.",
            "**A ledger keyed by event id.** Insert one row per event into `points_ledger (event_id PRIMARY KEY, user_id, amount)` and treat the balance as derived: `SELECT sum(amount) FROM points_ledger WHERE user_id = $1`, or a `wallets.balance` column updated in the same transaction only when the ledger insert actually inserted. The ledger is the inbox and the audit trail at once: reversals become new rows with negative amounts, and reconciliation (lesson 4.2) compares ledgers instead of guessing.",
        ]),
        p("Both put the deduplication record and the effect in one transaction, keyed by the id the producer gave the event. For money-like values, the ledger is usually the better long-term design; the inbox is the smaller change to existing code."),

        h3("The fixes an assistant tends to offer next"),
        p("Ask an assistant to \"make it handle duplicates\" without more context and you will often get one of these. Each one passes a test that delivers the same message twice in a row, which is why you need better tests than that:"),
        bullets([
            "**An in-memory `Set` of seen ids.** Empty after every restart and on every other consumer instance, which is exactly when redeliveries happen.",
            "**Redis `SET NX` before the UPDATE.** Two stores, two commits: a crash between them loses the points (key written, UPDATE not), and putting the key after the UPDATE doubles them instead.",
            "**\"Skip offsets we already processed\".** Storing the last offset per partition in the same transaction does stop replays of the same positions after a rebalance. It does not stop an outbox relay's republish, which arrives at a new, higher offset, or a queue that redelivers a message after newer ones; and a global high-water mark across partitions is simply wrong.",
            "**Deduplicating on `(userId, amount)`.** Two real awards of 50 points to the same learner on the same day become one. A business key works only when it really identifies one event (one certificate per user and course); points awards have no such key except the event id.",
        ]),

        challenge("chal_quiz_dce_231"),

        h2("4. The fix, and the review that should have happened"),
        p("The smallest correct change keeps the assistant's structure and adds the missing record in the same transaction. Validation also gains a rule: an event without an id cannot be deduplicated, so it is rejected (and sent to a dead-letter queue to investigate) instead of applied:"),
        code("typescript", `
@EventPattern("points.awarded")
async handle(@Payload() event: PointsAwarded): Promise<void> {
  if (!event.eventId || !event.userId || !Number.isInteger(event.amount) || event.amount <= 0) {
    this.logger.warn({ event }, "invalid points.awarded, sent to dead letter");
    return;
  }
  await this.db.transaction(async (tx) => {
    const first = await tx.query(
      "INSERT INTO points_ledger (event_id, user_id, amount) VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING",
      [event.eventId, event.userId, event.amount],
    );
    if (first.rowCount === 0) return;          // this event already changed the balance
    await tx.query(
      "UPDATE wallets SET balance = balance + $2 WHERE user_id = $1",
      [event.userId, event.amount],
    );
  });
}`, "points-awarded.consumer.ts (fixed, ledger keyed by event id)"),
        p("Now walk through the deliveries again. A redelivery after a rebalance: the insert returns 0 rows, nothing changes. A crash before the commit: nothing was written, the redelivery applies the points once. A crash after the commit and before the ack: the redelivery returns 0 rows. A republish by the outbox relay at a new offset: same event id, 0 rows. Two awards of 50: two ids, two rows. How the framework acks (automatically after the handler returns, or explicitly) does not change any of this; it only has to ack after the transaction commits."),
        h3("A review checklist for generated consumers"),
        numbered([
            "**Find the effect and ask what it does twice.** `+ $n`, `push`, `INSERT` without a unique key, sending an email: each needs deduplication. `SET status = 'x'` and upserts on a real business key may not.",
            "**Find the id.** Is there an event id assigned once by the producer (the outbox row id or a UUID in the payload)? If the payload has none, that is the first bug to fix, on the producer side.",
            "**Check that the dedup record and the effect share one transaction** in one database. Two stores or two transactions means a crash window.",
            "**Check when the message is acked** relative to the commit: after, never before.",
            "**Ask for the delivery tests**: the same message twice, crash before commit, crash after commit, redelivery after newer messages, a restart between deliveries. Put them in the prompt next time: \"the broker delivers at least once and may redeliver after a restart; write the tests for that first.\"",
        ]),
        p("You will review and fix the assistant's consumer in the challenge. The file has an in-memory `FakeDb` with the `wallets`, `processed_events` and `points_ledger` tables and a test runner that delivers messages, crashes the process just before or just after the commit, and hands the partition to a new consumer on a rebalance. The public tests deliver each event once, like the assistant's tests, and pass on its code; the hidden ones do what the broker does."),
        challenge("chal_coding_dce_232"),

        h2("5. How to verify the fix, and repair the data"),
        bullets([
            "**Delivery tests** with a fake broker and crash points, as in the challenge: every outcome must leave the balance equal to the sum of distinct events.",
            "**The drift query from section 2**, scheduled after the fix is deployed: `extra` must stop growing. Rows already wrong stay wrong; the fix only stops new damage.",
            "**A duplicates metric**: count the 0-row ledger inserts. It should rise briefly after every deploy, which is now harmless and proves the path runs in production.",
        ]),
        p("Then repair the balances, from the source of truth and in a way you can check before and after. With a ledger, the wallet balance can be rebuilt from it. For this incident the ledger did not exist yet, so the awards table of the points service is the reference:"),
        code("sql", `
BEGIN;
-- 1. keep the evidence
CREATE TABLE wallets_backup_20261026 AS SELECT * FROM wallets;
-- 2. backfill the ledger from the producer's awards (one row per event id)
INSERT INTO points_ledger (event_id, user_id, amount)
SELECT event_id, user_id, amount FROM points_awards
ON CONFLICT (event_id) DO NOTHING;
-- 3. recompute balances from the ledger
UPDATE wallets w
SET balance = l.total
FROM (SELECT user_id, sum(amount) AS total FROM points_ledger GROUP BY user_id) l
WHERE l.user_id = w.user_id AND w.balance <> l.total;
-- 4. check: the drift query returns no rows, then COMMIT (or ROLLBACK)`, "repair.sql (review it, run it on a copy first)"),
        p("Wallets also change for other reasons (points spent in the shop, admin corrections); a real repair must include those movements, which is one more argument for putting every change into the ledger. Run the repair while the consumer is paused, so no event lands between the backfill and the recompute, and tell the learners whose leaderboard positions change."),

        h2("6. Common mistakes"),
        bullets([
            "**Treating the transaction as the idempotency guarantee.** Spot it: a handler that wraps a non-idempotent statement in `transaction(...)` and has no unique key on anything per event.",
            "**Testing one delivery per event.** Spot it: no test calls the handler twice with the same message, and no test restarts the consumer.",
            "**Accepting the first deduplication the assistant offers.** In-memory sets, Redis keys and offset watermarks all pass a back-to-back duplicate test. Spot it: the test has no crash, no restart and no reordering.",
            "**Deduplicating on business values that are not unique.** Spot it: a key built from user, amount, course or timestamp instead of an event id.",
            "**Fixing the code and forgetting the data.** Spot it: the drift query still returns rows a week later.",
        ]),

        h2("7. Summary"),
        numbered([
            "Handlers run per delivery, not per event. `balance = balance + amount` applies the event again on every redelivery, and the transaction around it does not change that.",
            "Record the producer's event id in the same transaction as the effect: an inbox table, or a ledger keyed by event id from which the balance follows. In-memory sets, a separate Redis key, offsets and non-unique business values all fail on a crash, a restart, a republish or a reorder.",
            "Review generated consumers for the effect, the id, the shared transaction and the ack order; demand delivery tests (duplicates, crashes, restarts, reordering) and repair existing data from the source of truth.",
        ]),

        h2("Sources"),
        bullets([
            "Chris Richardson, Pattern: Idempotent Consumer - microservices.io/patterns/communication-style/idempotent-consumer.html",
            "PostgreSQL documentation: INSERT, ON CONFLICT clause - postgresql.org/docs/current/sql-insert.html",
            "Your broker's and client's documentation on offset commits, rebalances and redelivery (for example Kafka consumer offset management): check the version you run",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Give an AI assistant the same one-sentence request, then a second prompt that states the delivery contract (at least once, redelivery after restarts and after newer messages) and asks for the tests first. Compare the two results against the review checklist above. Then pick one consumer in your own system and write the crash-after-commit test for it."),
    ],
});
