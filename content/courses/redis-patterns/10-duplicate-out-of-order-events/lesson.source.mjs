// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-4-1",
    title: "Cache drift & duplicate events: when late events overwrite new scores",
    slug: { _type: "slug", current: "cache-drift-duplicate-events-late-events-overwrite-scores" },
    description:
        "During Monday's deploy, learners watched their score on the CodeDev leaderboard go backwards while PostgreSQL still held the right total. Work through the incident like the on-call engineer: read the consumer log, the leaderboard API, learner_score, Redis MONITOR and the consumer code, form a hypothesis, rule out \"Redis lost data\" and clock skew, choose a fix that survives redelivery, reordering and restarts, and prove it with a replay test and a drift check against the source of truth.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "Monday 10:07 UTC. Support forwards three tickets in five minutes: \"my score went down by itself\". One learner, u_2041, attached two screenshots of https://app.codedev.test/leaderboard: 1310 points and rank 212 at 10:00:04, 1240 points and rank 231 two seconds later, with no new submission in between. The admin page, which reads learner_score in PostgreSQL, still shows 1310. The leaderboard is a Redis sorted set fed by a queue consumer, and the consumer was redeployed at 10:00.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario. It combines what you built in module 3: a sorted-set leaderboard (lesson 3.1), versioned score events (lesson 3.2) and the event log you can rebuild from (lesson 3.3). The difference is that this time nobody wrote the version check, and the bug only shows when the queue does something it is allowed to do."),
        p("The pipeline is the simple one from earlier lessons. When a submission passes, the API updates the learner's row in PostgreSQL and writes an outbox row in the same transaction; a relay publishes it as a **score.updated** message; the **lb-consumer** workers (three of them) read the queue and update Redis:"),
        code("sql", `
-- in the submission transaction (PostgreSQL is the source of truth)
UPDATE learner_score
   SET total = total + $2, version = version + 1, updated_at = now()
 WHERE user_id = $1
RETURNING total, version;

INSERT INTO outbox (event_id, type, payload)
VALUES ($3, 'score.updated', jsonb_build_object('userId', $1, 'total', $4, 'version', $5));`, "api: award points"),
        p("Before you change anything, **prove** what happened. On call, the evidence tells you what a fix must preserve and how you will know it worked. The goal of this lesson is the method, applied to one class of bug that every event-driven cache meets sooner or later."),

        h2("2. The evidence pack"),
        p("Four pieces of evidence were collected in the first twenty minutes. The quiz refers to them by letter."),
        h3("A. The consumer log"),
        code("text", `
# learner u_2041
10:00:01.204 consumer-1 recv evt_a91 user=u_2041 total=1180 v=16 attempt=1
10:00:01.209 consumer-1 ZADD lb:global 1180 u_2041, ack evt_a91
10:00:01.958 consumer-1 recv evt_b07 user=u_2041 total=1240 v=17 attempt=1
10:00:01.962 consumer-1 ZADD lb:global 1240 u_2041
10:00:01.963 consumer-1 SIGTERM (deploy 2026.10.26-2): exiting, not acked: evt_b07
10:00:03.115 consumer-2 recv evt_c55 user=u_2041 total=1310 v=18 attempt=1
10:00:03.118 consumer-2 ZADD lb:global 1310 u_2041, ack evt_c55
10:00:05.401 consumer-2 recv evt_b07 user=u_2041 total=1240 v=17 attempt=2 (redelivered: ack deadline 3 s passed)
10:00:05.405 consumer-2 ZADD lb:global 1240 u_2041, ack evt_b07

# learner u_3307
10:00:03.402 consumer-3 recv evt_e40 user=u_3307 total=1025 v=10 published=10:00:03.390 (api-2) attempt=1
10:00:03.420 consumer-3 ZADD lb:global 1025 u_3307, ack evt_e40
10:00:03.588 consumer-2 recv evt_e31 user=u_3307 total=990 v=9 published=10:00:02.731 (api-1) attempt=1
10:00:03.591 consumer-2 ZADD lb:global 990 u_3307, ack evt_e31`, "lb-consumer, 2026-10-26, times in UTC"),
        h3("B. The leaderboard API and PostgreSQL"),
        code("text", `
10:00:04.010 GET /leaderboard/me (u_2041) -> {"score":1310,"rank":212}
10:00:06.230 GET /leaderboard/me (u_2041) -> {"score":1240,"rank":231}

SELECT user_id, total, version FROM learner_score WHERE user_id IN ('u_2041', 'u_3307');
 user_id | total | version
 u_2041  |  1310 |      18
 u_3307  |  1025 |      10`, "api.codedev.test access log, then psql"),
        h3("C. Redis MONITOR and INFO"),
        code("text", `
1793008801.209000 [0 10.0.3.21:51022] "ZADD" "lb:global" "1180" "u_2041"
1793008801.962000 [0 10.0.3.21:51022] "ZADD" "lb:global" "1240" "u_2041"
1793008803.118000 [0 10.0.3.22:40318] "ZADD" "lb:global" "1310" "u_2041"
1793008803.420000 [0 10.0.3.23:38804] "ZADD" "lb:global" "1025" "u_3307"
1793008803.591000 [0 10.0.3.22:40318] "ZADD" "lb:global" "990" "u_3307"
1793008805.405000 [0 10.0.3.22:40318] "ZADD" "lb:global" "1240" "u_2041"

$ redis-cli INFO server | grep uptime_in_seconds
uptime_in_seconds:1843215`, "redis-cli MONITOR on the primary, captured for 60 s by the deploy check from 10:00:00, filtered on lb:global"),
        h3("D. The consumer"),
        code("typescript", `
// workers/leaderboard-consumer.ts
queue.consume("score.updated", { prefetch: 10, ackDeadlineSeconds: 3 }, async (msg) => {
  const event = JSON.parse(msg.body) as ScoreUpdated; // { eventId, userId, total, version }
  await redis.zadd("lb:global", event.total, event.userId);
  await msg.ack();
});`, "leaderboard-consumer.ts"),

        h2("3. Reading the evidence"),
        p("Read each piece for what it **shows**, not for what you expect. One line per piece:"),
        bullets([
            "**A** shows two separate stories. For u_2041, consumer-1 wrote version 17, was killed by the deploy before it acknowledged, and the queue redelivered the same message (attempt=2) to consumer-2 *after* version 18 had been written. For u_3307, two consumers took two different events in parallel and the older one (version 9) finished last.",
            "**B** shows the symptom (1310 then 1240) and the source of truth: PostgreSQL holds 1310 at version 18 and 1025 at version 10. The database is right; the cache drifted.",
            "**C** shows Redis executing exactly the writes in A, in that order, stamped by its own clock. Uptime of about 21 days says Redis itself did not restart.",
            "**D** shows a consumer that never compares anything. It writes whatever arrives and acknowledges after the write.",
        ]),
        callout("warning", "MONITOR is a diagnostic, not a dashboard",
            "MONITOR streams every command the server executes and costs a noticeable share of throughput while it runs. The deploy check runs it for one minute and stops it; never leave it running, and filter the capture before you share it, because it contains every value written, session data included. For ongoing production numbers use INFO, SLOWLOG and your own metrics (lesson 4.3)."),

        h2("4. Hypothesis: last write wins on a stream with no order"),
        p("Put the facts together and you get one mechanism with two triggers. The queue promises **at-least-once** delivery and, with several consumers, **no order**. The consumer applies events with **last write wins**. Follow it for u_2041:"),
        numbered([
            "consumer-1 receives evt_b07 (version 17) and runs ZADD 1240. The deploy sends SIGTERM before the ack.",
            "consumer-2 receives evt_c55 (version 18) and runs ZADD 1310. The leaderboard is right for two seconds.",
            "The ack deadline of evt_b07 passes. The queue does what it promises and delivers it again.",
            "consumer-2 runs ZADD 1240. ZADD on an existing member replaces its score, so version 17 now sits on top of version 18.",
        ]),
        p("u_3307 needs no redelivery at all: two different events, each delivered once, finished in the wrong order because two consumers worked in parallel. A good hypothesis explains **all** the evidence: the repeated id in A, the order of writes in C, the drop in rank in B, the correct row in PostgreSQL and the timing of the deploy. This one does. Writing a total is idempotent, so a duplicate alone is harmless; what breaks it is a duplicate, or any event, that arrives *after* a newer one."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"Redis lost data.\"** A restart that reloaded an old snapshot would show a small uptime and would roll back many keys at once. C shows 21 days of uptime and an explicit ZADD 1240 at 10:00:05.405 from consumer-2's address. Redis stored exactly what it was told. Persistence is a real risk (lesson 4.3), just not this one.",
            "**\"Clock skew between servers.\"** api-1 and api-2 may well disagree by a few hundred milliseconds, but nothing in the pipeline reads those clocks: the consumer ignores published, and Redis executes commands in arrival order, not by any client timestamp. Syncing NTP would change nothing. Ordering by wall-clock time is what you must *avoid* in the fix, precisely because clocks skew.",
            "**\"The queue is broken.\"** Redelivery after a missing ack is the queue's contract, and so is parallel delivery with several consumers. Switching to a queue that \"guarantees exactly once\" usually moves the deduplication somewhere else rather than removing the need for it.",
        ]),

        h2("5. Choose the fix"),
        p("Write the requirements down from the evidence and from the feature, before you write code:"),
        bullets([
            "A message delivered twice changes the leaderboard at most once.",
            "An event older than the one already applied for that learner never changes the score.",
            "A newer event is applied even when its total is **lower**: an admin correction after a plagiarism review is a legitimate decrease.",
            "The protection survives a consumer restart and works across all three consumers.",
            "Redis memory for the protection stays bounded.",
        ]),
        p("Test each candidate against the list, not just against \"u_2041 is fixed\":"),
        bullets([
            "**Deduplicate by eventId only.** Fixes u_2041, not u_3307: evt_e31 and evt_e40 are different events. Fails requirement 2.",
            "**Only let scores grow (ZADD with the GT flag, or max(current, total)).** Looks right on this incident and silently drops every correction. Fails requirement 3.",
            "**Keep a Set of seen ids in the consumer process.** Each consumer sees only its own share, and the deploy that caused the incident wipes it. Fails requirement 4.",
            "**Compare published timestamps.** Two API hosts, two clocks. It works until the skew is larger than the gap between two submissions. The version from learner_score is a counter of one row in one database: it orders events of one learner without any clock.",
            "**One consumer, or partitioning the queue by userId.** Reduces reordering between consumers and is worth doing, but a restart still redelivers an old message after a newer one was processed. Helpful, not sufficient.",
        ]),
        p("The fix that meets all five combines two checks that answer different questions, with all state in Redis:"),
        numbered([
            "**Is this the same message again?** Keep a marker **lb:seen:<eventId>** for every processed event, with a TTL longer than the longest time the queue can redeliver a message. Our queue keeps an unacknowledged message for up to 24 hours, so the marker lives 48 hours. Without a TTL you keep one key per event forever; with a TTL shorter than the redelivery window, a late redelivery slips through.",
            "**Is this message older than what I already have?** Keep the last applied version per learner (a hash **lb:version**, field userId) and apply an event only if its version is higher. Equal or lower is stale: leave the score alone.",
            "Mark the event as processed whether it was applied or stale, and count both outcomes in your metrics: duplicates spike on deploys, stale events show reordering.",
        ]),
        p("With the version check in place, a duplicate of a total could not do harm on its own. The id marker earns its keep anyway: it tells redelivery apart from reordering in your metrics, and it protects any side effect of the consumer that is not idempotent, such as a ZINCRBY on a weekly board or a \"you moved up\" notification."),
        p("The checks and writes must not interleave with another consumer handling the same learner, so in production they run as one Lua script, which Redis executes atomically:"),
        code("typescript", `
// workers/apply-score.ts (ioredis)
const APPLY_SCORE = \`
-- KEYS[1] lb:seen:<eventId>  KEYS[2] lb:version  KEYS[3] lb:global
-- ARGV[1] userId  ARGV[2] version  ARGV[3] total  ARGV[4] seen TTL (seconds)
if redis.call("EXISTS", KEYS[1]) == 1 then return "duplicate" end
local stored = tonumber(redis.call("HGET", KEYS[2], ARGV[1]) or "0")
local outcome = "stale"
if tonumber(ARGV[2]) > stored then
  redis.call("ZADD", KEYS[3], ARGV[3], ARGV[1])
  redis.call("HSET", KEYS[2], ARGV[1], ARGV[2])
  outcome = "applied"
end
redis.call("SET", KEYS[1], "1", "EX", ARGV[4])
return outcome\`;

const SEEN_TTL_SECONDS = 48 * 60 * 60; // queue redelivers for up to 24 h

redis.defineCommand("applyScore", { numberOfKeys: 3, lua: APPLY_SCORE });

queue.consume("score.updated", { prefetch: 10, ackDeadlineSeconds: 3 }, async (msg) => {
  const event = parseScoreUpdated(msg.body); // validates eventId, userId, total, version
  if (event === null) return msg.deadLetter();
  const outcome: string = await (redis as any).applyScore(
    \`lb:seen:\${event.eventId}\`, "lb:version", "lb:global",
    event.userId, event.version, event.total, SEEN_TTL_SECONDS,
  );
  metrics.increment("lb_events_total", { outcome }); // applied | duplicate | stale
  await msg.ack();
});`, "apply-score.ts"),
        callout("info", "Redis Cluster and scripts",
            "A script may only touch keys in one hash slot when Redis runs as a cluster. If you move to Cluster, give the three keys a common hash tag, for example {lb}:seen:<eventId>, {lb}:version and {lb}:global. On a single primary with replicas, as here, the plain names work."),
        p("Two loose ends belong to the fix. The **rebuild** from lesson 3.3 must rebuild lb:version together with lb:global, from the same rows of learner_score, or the first event after a rebuild is compared with a version that no longer exists. And the markers cost memory: at roughly 100 bytes per small key (measure with MEMORY USAGE on your version), 300,000 events a day kept for 48 hours is in the order of 60 MB."),

        challenge("chal_quiz_rdp_411"),

        h2("6. The challenge: replay the incident"),
        p("The code runner has no Redis, so the challenge file brings the in-memory Redis model used throughout this course. What matters for this challenge:"),
        bullets([
            "**FakeRedis** implements the commands you need with Redis semantics: SET with ex and nx, EXISTS, HSET and HGET, ZADD (which replaces the score), ZSCORE, ZREVRANGE. Values are strings. Expiry is lazy and follows a **fake clock**, so 48 hours pass in a microsecond.",
            "**The runner** plays a scripted delivery sequence: deliveries, consumer restarts (a new ScoreConsumer object on the same Redis) and clock jumps. Duplicates, reordering and a late redelivery are all in the scripts.",
            "**The output** is what an on-call engineer would want: with trace on, the outcome and ZSCORE after every step; then the outcome counts, the top 10, the drift against PostgreSQL and the number of live lb:seen markers.",
        ]),
        p("Run the starter first and read its trace: you will see ZSCORE go down, the same evidence as MONITOR. The script is one function, so there is no Lua: a single-threaded runner gives you the atomicity a Lua script gives you in production."),
        challenge("chal_coding_rdp_412"),

        h2("7. How to verify the fix"),
        p("\"The leaderboard looks right now\" is not verification: it also looked right for two seconds during the incident. Verify against the source of truth, with something that counts:"),
        bullets([
            "**A replay test.** Feed the logged deliveries of A to the consumer, in the logged order, with a restart where the deploy happened, on an empty Redis. Assert ZSCORE equals learner_score.total for each learner. It fails on the shipped consumer, passes after the fix, and also fails a fix that keeps state in process memory.",
            "**A drift check in production.** Every few minutes, a job samples learners, reads ZSCORE lb:global and learner_score.total, and reports the mismatches. Allow a short lag for events in flight; alert on mismatches that stay. This is the check that would have found the incident before support did.",
            "**Outcome metrics.** lb_events_total by outcome: duplicate should jump during deploys and return to near zero, stale shows how much reordering the consumers see. A spike of applied with no matching traffic in the API is its own red flag.",
            "**Marker hygiene.** TTL lb:seen:<some id> returns a positive number (never -1), and the number of markers levels off after two days instead of growing forever.",
        ]),
        code("sql", `
-- drift check: learners whose cached score differs from the database
-- (run the Redis side with ZMSCORE lb:global <ids...> for the same sample)
SELECT user_id, total, version
  FROM learner_score
 WHERE user_id = ANY($1)   -- the sampled ids
 ORDER BY user_id;`, "drift-check.sql"),
        p("Finally, repair the damage. Fixing the consumer stops new drift; it does not correct learners who already went backwards. The repair is the rebuild from lesson 3.3, run once after the fix is deployed, followed by the drift check."),

        h2("8. Common mistakes with duplicate and late events"),
        bullets([
            "**Assuming exactly-once delivery.** Most queues promise at-least-once, and a deploy is all it takes. Spot it: search the consumer log for attempt=2 or a redelivery flag around each deploy.",
            "**Treating deduplication as ordering.** An id marker stops the same message twice, not an older message once. Spot it: a test with two different events for one learner delivered newest first.",
            "**Fixing the symptom with \"scores only go up\".** It hides this incident and loses every correction. Spot it: a test where a newer version has a lower total.",
            "**Keeping dedup state in the consumer process.** It is per instance and dies with every restart. Spot it: run the replay with a restart in the middle.",
            "**Markers without a TTL, or with a TTL shorter than redelivery.** The first grows Redis memory forever, the second lets late duplicates through. Spot it: TTL on a marker, and the queue's maximum redelivery age in its configuration.",
        ]),

        h2("9. Summary"),
        numbered([
            "At-least-once delivery plus parallel consumers means duplicates and out-of-order events are normal; a consumer that writes with last write wins turns them into a leaderboard that goes backwards.",
            "Two checks, both in Redis and in one atomic step: an id marker with a TTL longer than the redelivery window, and a per-learner version from the source of truth. Apply only newer versions, even when the total is lower.",
            "Verify against PostgreSQL: a replay test with a restart, a drift check in production, and outcome metrics; then rebuild once to repair the learners who already drifted.",
        ]),

        h2("Sources"),
        bullets([
            "Redis documentation: Sorted sets (ZADD and its NX, XX, GT, LT options) - https://redis.io/docs/latest/develop/data-types/sorted-sets/",
            "Redis documentation: Scripting with Lua (atomic execution, keys in one slot in a cluster) - redis.io/docs/latest/develop/interact/programmability/eval-intro/",
            "Redis documentation: MONITOR (and its cost) - redis.io/docs/latest/commands/monitor/",
        ]),
        callout("tip", "Self-practice (not graded): write a runbook for rebuilding the leaderboard",
            "Write the runbook an on-call engineer would follow at 3 a.m. when the drift check reports mismatches, in at most one page: how to confirm the drift (which query, which Redis command), how to pause or keep the consumer running during the rebuild, how to build lb:global and lb:version into new keys from learner_score and swap them in with RENAME so readers never see a half-built board, what to do with events that arrive during the rebuild (the version check is your friend), how to verify the result, and who to tell. Point every step at a command or a query you have tested on staging."),
    ],
});
