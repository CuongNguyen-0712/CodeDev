// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-3-2",
    title: "Replay events from an offset without doubling",
    slug: { _type: "slug", current: "replay-events-without-doubling" },
    description:
        "To recover points lost to a bug, an engineer reset the leaderboard consumer to Monday and every score earned since Monday doubled. Learn why replay is a normal operation for a read model, how to make it safe by storing the last applied offset per partition in the same transaction as the state, why that only works with in-order processing, how a replay that overlaps live consumption stays correct, and how to rebuild a projection into a new version and switch to it only when it has caught up.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, CodeDev learning platform",
        problem:
            "From Monday to Thursday the leaderboard consumer silently ignored points events sent by the mobile app (a field was renamed in the app's events). On Thursday the handler was fixed and, to bring the missing points back, the consumer group was reset to Monday 00:00 and restarted. The mobile points came back - and every point earned on the web since Monday was counted a second time. By Friday morning the weekly top 10, which pays a 200-point reward, was led by learners who had simply been active on the web, and learners were posting screenshots of scores that had doubled overnight.",
    },

    content: [
        h2("1. The incident: a replay that doubled every score"),
        p("The leaderboard is a **read model**: a table built from the `points-events` topic (4 partitions, keyed by learner id) for fast ranking queries. The source of truth for points is the `points_ledger` table in the points service. The handler was as simple as it gets:"),
        code("typescript", `
// leaderboard/leaderboard.consumer.ts - the handler on Thursday
async handle(e: PointsAwarded) {
  await this.db.query(
    \`INSERT INTO leaderboard (learner_id, score) VALUES ($1, $2)
     ON CONFLICT (learner_id) DO UPDATE SET score = leaderboard.score + EXCLUDED.score\`,
    [e.learnerId, e.points]);
}`, "leaderboard.consumer.ts"),
        p("And this is how the missing events were brought back, after stopping the consumers of the group:"),
        code("bash", `
kafka-consumer-groups.sh --bootstrap-server kafka.codedev.test:9092 \\
  --group leaderboard --topic points-events \\
  --reset-offsets --to-datetime 2026-10-19T00:00:00.000 --execute`, "terminal"),
        p("Resetting the group moved the consumer's position back. It did not move the **table** back. The handler cannot tell an event it has never seen from one it applied on Tuesday, so it added both."),

        h2("2. Read the evidence"),
        p("Compare the read model with its source of truth. Points awarded since Monday, per learner, against the leaderboard's growth over the same period (from a nightly snapshot taken Sunday):"),
        code("sql", `
SELECT l.learner_id,
       l.score - s.score                         AS leaderboard_gain,
       coalesce(sum(pl.points), 0)               AS ledger_points,
       coalesce(sum(pl.points) FILTER (WHERE pl.source = 'web'), 0) AS web_points
FROM leaderboard l
JOIN leaderboard_snapshot_2026_10_18 s USING (learner_id)
LEFT JOIN points_ledger pl ON pl.learner_id = l.learner_id AND pl.created_at >= '2026-10-19'
GROUP BY l.learner_id, l.score, s.score
ORDER BY (l.score - s.score) - coalesce(sum(pl.points), 0) DESC
LIMIT 3;

 learner_id | leaderboard_gain | ledger_points | web_points
------------+------------------+---------------+-----------
 u_2291     |             2410 |          1205 |       1205
 u_17       |             1630 |          1020 |        610
 u_42       |              980 |           760 |        220`, "psql"),
        p("The difference is exactly the web points: those events were applied on the day they arrived and again during the replay. Mobile-only points (u_17's other 410) were applied once, as intended. The evidence also tells you what a fix must guarantee: **each event counts at most once per read model, however many times it is delivered.**"),

        h2("3. Core idea: replay is normal, so make it safe"),
        p("A read model is a fold over a log: start empty, apply every event in order. That makes replay an everyday operation, not an emergency one: you replay to fix a handler bug, to add a column to a projection, to build a new projection, and - in a small way - after every crash, because an at-least-once consumer redelivers what it had not committed. A projection that breaks when it sees an event twice is broken already; the replay only made it visible at scale."),
        p("There are three ways to make applying an event idempotent. Pick by how your events are ordered and what the projection stores:"),
        bullets([
            "**Recompute from the source.** If the projection is a pure function of a source table (score = sum of the ledger), recompute the affected rows instead of adding deltas. Simplest when the source is queryable and cheap enough.",
            "**Inbox by event id** (lesson 5). Store every applied event id with the change; skip known ids. Works in any order, at the cost of one row per event.",
            "**A high-water mark per partition.** Store the last applied offset of each partition **in the same transaction** as the state change; skip any event at or below it. One row per partition, and it tells you exactly where to resume.",
        ]),
        callout("warning", "A high-water mark needs in-order processing",
            "\"Skip everything at or below the last offset\" assumes offsets are applied in order within a partition. If a consumer processes a partition concurrently (lesson 7) and offset 105 finishes before 104, the mark jumps to 105 and 104 is skipped forever. With concurrency inside a partition, use an inbox by event id instead."),
        p("Whatever you choose, keep **side effects out of the projection**. A handler that also sends the \"You reached the top 10\" email or pays the weekly reward will do it again on every replay. Projections only write their own tables; jobs that act on them read the projection."),

        h2("4. Worked example: offsets stored with the state"),
        p("Each projection version gets its rows in two tables. The `projection` column lets a new version be built next to the old one later:"),
        code("sql", `
CREATE TABLE leaderboard_scores (
  projection text   NOT NULL,           -- 'leaderboard_v1', 'leaderboard_v2', ...
  learner_id text   NOT NULL,
  score      bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (projection, learner_id)
);

CREATE TABLE projection_offsets (
  projection  text   NOT NULL,
  partition   int    NOT NULL,
  last_offset bigint NOT NULL,
  PRIMARY KEY (projection, partition)
);

CREATE VIEW leaderboard AS
  SELECT learner_id, score FROM leaderboard_scores WHERE projection = 'leaderboard_v1';`, "migration"),
        p("Applying one event is one transaction. It first **claims** the offset with a conditional upsert, and only changes the score if the claim succeeded:"),
        code("typescript", `
const CLAIM = \`
  INSERT INTO projection_offsets (projection, partition, last_offset) VALUES ($1, $2, $3)
  ON CONFLICT (projection, partition) DO UPDATE SET last_offset = EXCLUDED.last_offset
  WHERE projection_offsets.last_offset < EXCLUDED.last_offset
  RETURNING last_offset\`;

async apply(projection: string, partition: number, offset: string, e: PointsAwarded) {
  await this.db.transaction(async (tx) => {
    const claim = await tx.query(CLAIM, [projection, partition, offset]);
    if (claim.rowCount === 0) return;                    // at or below the mark: already applied
    await tx.query(
      \`INSERT INTO leaderboard_scores (projection, learner_id, score) VALUES ($1, $2, $3)
       ON CONFLICT (projection, learner_id) DO UPDATE SET score = leaderboard_scores.score + EXCLUDED.score\`,
      [projection, e.learnerId, e.points]);
  });                                                    // both rows or neither
}`, "leaderboard.repository.ts"),
        p("On startup, the consumer reads `projection_offsets` and seeks each partition to `last_offset + 1`. The broker's committed group offset is still useful as a hint, but the database is the authority: it is the only place where the position and the state are guaranteed to agree."),

        challenge("chal_quiz_dce_321"),

        h2("5. A replay that overlaps live consumption"),
        p("Thursday's recovery done right does not stop the live consumer. A replay job reads partition 2 from Monday's offset while the live consumer keeps applying new events to the same projection. Two deliverers, one projection, overlapping offsets: the replay reaches the head of the partition and applies events the live consumer has not reached yet; the live consumer then delivers them again."),
        p("The conditional upsert handles this because the check and the claim are **one statement on one row**. If both transactions claim the same partition at once, PostgreSQL makes the second wait for the first's row lock; when the first commits, the second re-checks its `WHERE` against the new row, finds the offset no longer newer, and returns no row. Replace it with a `SELECT` followed by an `UPDATE`, or with the check in one transaction and the write in another, and both deliverers can pass the check before either writes."),

        h2("6. Rebuild into a new version, then switch"),
        p("Sometimes patching the existing projection is the wrong tool: the handler changed how points are computed, or the old data is wrong in ways you cannot enumerate. Build a fresh version next to the old one instead:"),
        numbered([
            "**Start `leaderboard_v2`** with no rows and a rebuild job that reads the topic from the beginning and applies into projection `leaderboard_v2`. It has its own offsets, so v1's marks do not make it skip anything.",
            "**Keep v1 serving** and consuming live events. Readers notice nothing.",
            "**Wait until v2 has caught up**: for every partition, v2's last offset is at least v1's. Being ahead on one partition does not make up for being behind on another.",
            "**Switch in one transaction** with that check, by pointing the view at v2. v2's consumer goes on as the live one; stop v1's.",
            "**Keep v1 for a while** so you can switch back, then delete its rows.",
        ]),
        code("sql", `
BEGIN;
-- partitions where v2 is still behind v1; the switch happens only if there are none
SELECT v1.partition, v1.last_offset AS v1_offset, v2.last_offset AS v2_offset
FROM projection_offsets v1
LEFT JOIN projection_offsets v2
  ON v2.projection = 'leaderboard_v2' AND v2.partition = v1.partition
WHERE v1.projection = 'leaderboard_v1'
  AND (v2.last_offset IS NULL OR v2.last_offset < v1.last_offset);

-- zero rows: switch
CREATE OR REPLACE VIEW leaderboard AS
  SELECT learner_id, score FROM leaderboard_scores WHERE projection = 'leaderboard_v2';
COMMIT;`, "switch.sql"),
        callout("info", "A rebuild needs the whole history",
            "Reading a topic from offset 0 only rebuilds everything if the topic still has everything. Kafka deletes old segments after the topic's retention period unless retention is unlimited or the topic is compacted. If it does not keep the full history, rebuild from the source of truth (the points ledger) up to a known offset, then continue from the topic. Check your topic's retention settings before you plan on replays."),
        p("In the exercise you write the leaderboard store behind all of this: versioned scores, offsets per version and partition kept atomically with the scores, a switch that refuses a version that has not caught up, all on an in-memory database with transactions. The runner mixes live consumption, replays from an offset, a rebuild and crashes right after a commit, and prints the final offsets and scores. A naive projection doubles them."),

        challenge("chal_coding_dce_322"),

        h2("7. How to verify a replay is safe"),
        bullets([
            "**Apply the log twice.** The cheapest idempotency test there is: the state after `apply(log)` must equal the state after `apply(log + log)` and after `apply(log)` followed by a replay of any suffix.",
            "**Crash between every step.** In tests, crash right after each commit and restart from the last committed position; the final state must not change. A design with two transactions fails this immediately.",
            "**Reconcile with the source.** Before and after a replay, compare the projection with the ledger (the query from section 2, without the snapshot): `sum(points_ledger.points)` per learner must equal the projection's score.",
            "**Diff versions before switching.** Count learners whose score differs between v1 and v2 and look at a sample. A new version should differ only where you meant it to.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Resetting the consumer group as the replay.** Spot it: a runbook that says `--reset-offsets` for a handler that adds deltas without an offset or inbox table.",
            "**Offset and state in different transactions** - or the offset only in the broker's committed group offset. Spot it: two autocommit statements, or a commit to the broker after the database commit, with nothing in the database that records the position.",
            "**A high-water mark with concurrent processing in a partition.** Spot it: `Promise.all` or a worker pool in front of a handler that skips by offset.",
            "**One offset row shared by all projection versions.** Spot it: `projection_offsets` without a projection column; a rebuild that applies nothing.",
            "**Switching before the new version caught up**, or projections that send emails and rewards. Spot it: a switch that checks only one partition, or a mailer injected into a projection handler.",
        ]),

        h2("9. Summary"),
        bullets([
            "Replays, rebuilds and redeliveries are normal; a projection must count each event at most once per version, however it is delivered.",
            "Store the last applied offset per partition in the same transaction as the state, claim it with a conditional update, and resume from it - this needs in-order processing per partition; otherwise use an inbox.",
            "Rebuild into a new version with its own offsets, switch only when it has caught up on every partition, and keep side effects out of projections.",
        ]),

        h2("Sources"),
        bullets([
            "Apache Kafka documentation: consumer positions and committed offsets, kafka-consumer-groups.sh, log retention and compaction - kafka.apache.org/documentation",
            "PostgreSQL documentation: INSERT ... ON CONFLICT DO UPDATE, CREATE VIEW - postgresql.org/docs/current",
            "microservices.io: Transactional outbox pattern",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the runbook for Thursday's recovery done right: which job replays what, into which projection version, how you check that it caught up, how you switch and how you switch back. Then add the query that proves, after the switch, that the leaderboard matches the points ledger for every learner."),
    ],
});
