// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-2-3",
    title: "A leaderboard projection from progress events",
    slug: { _type: "slug", current: "leaderboard-projection-from-progress-events" },
    description:
        "After a deploy restarted the leaderboard consumer, the broker redelivered two hours of events and weekly points doubled; events processed after midnight landed in the wrong week; and learners with equal points were ranked by their user id. Learn to build the leaderboard as a projection of facts stored in PostgreSQL: stated points rules, idempotency by event id, per-learner sequence numbers that hold back out-of-order events, boards keyed by the event's week, a tie rule Redis does not give you for free, and the checks that prove the board matches the source of truth.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer who owns the CodeDev leaderboard",
        problem:
            "Monday 08:10, the week after the exam: the weekly leaderboard at https://app.codedev.test/leaderboard shows Minh first with 1,240 points; the points ledger in PostgreSQL says 620. A deploy at 07:55 restarted the leaderboard consumer before it had acknowledged two hours of events, and the broker redelivered all of them. The same morning two learners report that points they earned on Sunday at 23:58 count for the new week, and a learner who reached 400 points an hour before Anh is ranked below her. Requirement R7 says ranks may lag by up to 10 seconds but points may never be counted twice.",
    },

    content: [
        h2("1. The incident: a consumer that adds whatever it receives"),
        p("The consumer is a few lines long. It reads events from the bus and adds points to two Redis sorted sets:"),
        code("typescript", `
// leaderboard/consumer.ts (current)
bus.subscribe(["challenge.passed", "progress.updated"], async (event) => {
  const points = pointsFor(event);                              // challenge points, +10 lesson, +50 course
  if (points === 0) return;
  const week = isoWeek(new Date());                             // the week when we process it
  await redis.zincrby("lb:all-time", points, event.userId);
  await redis.zincrby(\`lb:week:\${week}\`, points, event.userId);
});`, "the consumer"),
        p("And the evidence, from three sources that should agree and do not:"),
        code("text", `
consumer log, 07:55-07:57
  07:55:02 consumer restarted (deploy leaderboard@4.12.0), 2h of unacknowledged events
  07:55:03 redelivering 18,402 events from offset 3,118,200

redis> ZSCORE lb:week:2026-W45 u_minh          -> "1240"

SELECT sum(points) FROM points_ledger
 WHERE user_id = 'u_minh' AND week = '2026-W45'; -> 620

event e_88120  challenge.passed  u_lan  occurredAt=2026-11-08T23:58:41+07:00 (W45)  processed 2026-11-09T00:00:07 (W46)

redis> ZREVRANGE lb:week:2026-W45 0 2 WITHSCORES
1) "u_minh" 2) "1240"  3) "u_anh" 4) "400"  5) "u_alex" 6) "400"    <- u_alex reached 400 at 14:02, u_anh at 15:10`, "evidence"),

        h2("2. Read the evidence: four separate bugs"),
        numbered([
            "**Double counting.** Delivery is at-least-once: a consumer that crashes or restarts before acknowledging gets the same events again. `ZINCRBY` is not idempotent, so every redelivered event added its points a second time. Minh's 1,240 is exactly 2 × 620.",
            "**The wrong week.** The week comes from the clock when the event is processed, not from when the learner earned the points. Any delay (a backlog, a restart, a replay) moves points across week boundaries. A rebuild next month would put every event in the current week.",
            "**Ties by user id.** Redis orders equal scores by the member string (descending for `ZREVRANGE`), so `u_minh`, `u_anh` and `u_alex` are ordered by name, not by who got there first.",
            "**Out-of-order events, not visible yet.** Events for one learner can arrive in a different order than they happened (different partitions, a retry, a slow publisher). With additive points the total eventually comes out right, but any rule that relies on order (\"apply only newer\") breaks, as the next section shows.",
        ]),

        h2("3. Core idea: the leaderboard is a projection"),
        p("The leaderboard is a **projection** (a read model): a structure derived from facts that live somewhere else, optimised for one query. CodeDev's facts are the challenge passes and progress documents in PostgreSQL (lesson 3); the projection turns their events into sorted sets that answer \"top 10 this week\" and \"what is my rank\" in microseconds. Because it is derived, it may lag (R7 allows 10 s) and it can be thrown away and rebuilt (lesson 11). What it may not do is invent points."),
        h3("When you do not need one"),
        p("At small scale, skip it. `SELECT user_id, sum(points) FROM points_ledger WHERE week = $1 GROUP BY user_id ORDER BY 2 DESC LIMIT 10` with an index and a 10-second cache answers the top 10 cheaply. The projection earns its place for \"my rank among 200,000\" on every page view, and for the read load after an exam (lesson 2), where a sorted set answers `ZREVRANK` in O(log n) without touching PostgreSQL."),
        h3("Rule 1: state the points rules"),
        p("Write them down, because the projection, the rebuild and the reconciliation query must all compute the same thing: a `challenge.passed` event is worth its `points` (the grader records a pass once per learner and challenge, lesson 3); a `progress.updated` event is worth 10 when `lessonPercent` is 100 and another 50 when `coursePercent` is 100. Because the progress service publishes one event per real change and percents never go down (lesson 4), each lesson completion and each course completion produces exactly one such event."),
        h3("Rule 2: idempotent by event id"),
        p("Each event has a unique `eventId` (the outbox row id). The projection remembers the ids it has accepted and ignores a second delivery of the same id. This is consumer-side deduplication; it handles redelivery, and only redelivery: three different events describing one change cannot be fixed here (that was the producer's job in lesson 4)."),
        h3("Rule 3: per-learner order with a sequence number"),
        p("The outbox stamps every event of a learner with `learnerSeq`, a per-learner version: 1, 2, 3, ... with no gaps. The projection keeps, per learner, the last applied sequence number, and:"),
        bullets([
            "`learnerSeq` = last + 1: apply it, then apply any waiting events that continue the sequence.",
            "`learnerSeq` > last + 1: an earlier event is still in flight. Accept it and **hold it back** until the gap closes.",
            "`learnerSeq` <= last, or already waiting: it is old or conflicting. Ignore it as stale.",
        ]),
        p("Why not simply \"apply if newer\"? That rule is correct when each event carries the whole new state (last write wins). Points events carry deltas. If event 7 is applied before 6 and the high-water mark jumps to 7, event 6 then looks old and its points are dropped forever. Holding 7 back keeps the meaning of the high-water mark exact: everything up to it is in. That exactness pays off twice: a gap that stays open for minutes is a precise alert (a specific learner, a specific missing sequence number), and a rebuild can restart from a known point (lesson 11). Order only per learner: a global order would serialise the whole consumer, while per-learner order lets you partition the stream by `userId` and run consumers in parallel."),
        h3("Rule 4: boards are keyed by the event's week"),
        p("The week belongs to the fact, not to the consumer: the producer computes it from `occurredAt` (ISO week, in the platform's time zone) and puts it in the event. The projection adds points to `all-time` and to the board of `event.week`. A late event updates last week's board, which is correct; the current week's board is unaffected."),
        h3("Rule 5: state the tie order, then implement it"),
        p("CodeDev's product rule: on equal points, the learner whose points on that board changed earlier ranks higher. Redis will not do this for you, because members with equal scores are ordered by their names. Two ways to implement it: sort ties in the application after reading a range, or fold the tie-breaker into the score, so the sorted set does the work:"),
        code("text", `
score = points * 10^10 + (10^10 - 1 - tick)       tick = a counter that goes up each time an event is applied

points 400, tick 1,882   ->  4,009,999,998,117
points 400, tick 2,054   ->  4,009,999,997,945     (lower: reached 400 later)
displayed points = floor(score / 10^10)`, "a composite score"),
        p("Check the range before you rely on it: sorted set scores are 64-bit floats, exact for integers up to 2^53 (about 9 × 10^15), so this encoding is exact up to 900,000 points and 10^10 ticks. Write that limit into the code next to the formula."),

        challenge("chal_quiz_sdc_231"),

        h2("4. Worked example: apply one event atomically in Redis"),
        p("In production the per-learner state has to live next to the boards, or a crash between \"update the board\" and \"remember the sequence number\" brings double counting back. A Lua script runs atomically in Redis, so the check and the updates happen together. It applies an event only when it is the learner's next one; the consumer holds back events that report a gap and retries them when the missing one has been applied:"),
        code("javascript", `
// apply-event.lua, loaded with SCRIPT LOAD and called with EVALSHA
// KEYS[1] lb:seq:{userId}   KEYS[2] lb:all-time   KEYS[3] lb:week:{week}   KEYS[4] lb:tick
// ARGV[1] learnerSeq        ARGV[2] points        ARGV[3] userId
const script = \`
local last = tonumber(redis.call('GET', KEYS[1]) or '0')
local seq = tonumber(ARGV[1])
if seq <= last then return 'stale' end
if seq > last + 1 then return 'gap' end
redis.call('SET', KEYS[1], seq)
local points = tonumber(ARGV[2])
if points > 0 then
  local tick = redis.call('INCR', KEYS[4])
  for i = 2, 3 do
    local old = tonumber(redis.call('ZSCORE', KEYS[i], ARGV[3]) or '0')
    local total = math.floor(old / 1e10) + points
    redis.call('ZADD', KEYS[i], total * 1e10 + (1e10 - 1 - tick), ARGV[3])
  end
end
return 'applied'\`;

// consumer: dedup by sequence in Redis, hold back gaps in memory (and alert when one stays open)
async function onEvent(e) {
  const result = await redis.evalsha(sha, 4, \`lb:seq:\${e.userId}\`, "lb:all-time", \`lb:week:\${e.week}\`, "lb:tick",
                                     e.learnerSeq, pointsFor(e), e.userId);
  if (result === "gap") waiting.hold(e);                       // re-tried after the previous learnerSeq is applied
  else if (result === "applied") await waiting.releaseNext(e.userId, onEvent);
  // "stale": a redelivery of something already applied, or a conflicting duplicate; ack and move on
}`, "apply-event.lua and the consumer"),
        p("Notice that the sequence check also deduplicates: a redelivered event has a `learnerSeq` that is already applied, so it returns `stale` without a separate set of event ids. Keeping a set of ids as well (with a TTL longer than the broker's redelivery window) catches the remaining case where a redelivery arrives while the original is still waiting in the gap buffer. In Redis Cluster all keys of one call must hash to the same slot; use a hash tag such as `{lb}` in the key names, or keep the leaderboard on one instance (tens of MB, lesson 2). Redis Patterns covers sorted sets and versioned scores in depth."),
        p("In the challenge you build the same projection in memory, without Redis, so that every rule is yours to get right: validation of untrusted events, deduplication by id, the per-learner sequence with a waiting buffer, points rules, weekly and all-time boards, and the tie order. The runner feeds batches of events (with redeliveries, gaps and invalid events) and prints the top N and the ranks of a few learners after each batch."),
        challenge("chal_coding_sdc_232"),

        h2("5. How to verify the projection"),
        bullets([
            "**Replay test.** Apply a recorded day of events, then apply all of them again: the boards must be identical. This is the test that would have caught the Monday incident.",
            "**Shuffle test.** Shuffle the events (keeping duplicates) and apply them: the final boards must be the same as in order, and `waiting` must be 0 at the end.",
            "**Reconciliation against the source of truth.** A scheduled job compares a sample of learners (and always the top 100) with the points ledger in PostgreSQL and reports drift (Data Consistency & Event-Driven Patterns, reconciliation):",
        ]),
        code("sql", `
-- expected weekly points for the top 100 shown on the board (user ids passed from Redis)
SELECT user_id, sum(points) AS expected
FROM points_ledger
WHERE week = '2026-W45' AND user_id = ANY($1)
GROUP BY user_id;
-- compare with floor(ZSCORE(lb:week:2026-W45, user_id) / 1e10); any difference is drift: alert and rebuild`, "reconciliation"),
        bullets([
            "**Lag and gaps as metrics.** `leaderboard_lag_seconds` (now minus `occurredAt` of the last applied event, R7: under 10 s at p95) and `leaderboard_waiting_events` (held back by a gap). A gap open for more than a few minutes means a lost or stuck event: find it in the outbox by learner and sequence number, or rebuild that learner from PostgreSQL.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Non-idempotent increments on an at-least-once stream.** Spot it: `ZINCRBY` (or `UPDATE ... SET points = points + $1`) in a consumer with no event id or sequence check; scores that are exact multiples of the ledger after a restart.",
            "**\"Apply only newer\" with delta events.** Spot it: a version check that jumps the high-water mark to the newest event, and points that are short by exactly the events that arrived late.",
            "**Processing time instead of event time.** Spot it: `new Date()` in a consumer deciding which week, day or bucket a fact belongs to; points near midnight counted in the wrong period, and a rebuild that puts everything in the current week.",
            "**Assuming Redis orders ties the way the product wants.** Spot it: no tie rule in the requirements, or one that is not tested by swapping the order in which two learners reach the same score.",
            "**A projection without a way back to the truth.** Spot it: no reconciliation job, no rebuild procedure, and no metric for lag or gaps; drift is found by learners, as it was on Monday.",
        ]),

        h2("7. Summary"),
        numbered([
            "The leaderboard is a projection of facts in PostgreSQL: it may lag (R7: 10 s) and can be rebuilt, but it must compute exactly the stated points rules and never count a fact twice.",
            "Make it idempotent by event id, apply each learner's events in learnerSeq order (hold back gaps instead of jumping ahead), key weekly boards by the event's week, and implement the tie rule explicitly (application sort or a composite score).",
            "Prove it with replay and shuffle tests, reconcile it against the points ledger, and watch lag and waiting events so drift and gaps are found by alerts rather than by learners.",
        ]),

        h2("Sources"),
        bullets([
            "Redis documentation, Sorted sets and ZRANGE (ordering of equal scores) - redis.io/docs/latest/develop/data-types/sorted-sets/",
            "Martin Fowler, Patterns of Distributed Systems - martinfowler.com/articles/patterns-of-distributed-systems/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take an event consumer you know and run the replay test: feed it the same hour of events twice in a staging environment and diff the result. Then write down, for each piece of state it keeps, whether its updates are idempotent, which clock decides its time bucket, and how you would rebuild it from the source of truth."),
    ],
});
