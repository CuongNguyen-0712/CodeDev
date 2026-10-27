// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-2-3",
    title: "Spot the AI mistake: Redis as the source of truth",
    slug: { _type: "slug", current: "spot-the-ai-mistake-redis-source-of-truth" },
    description:
        "Asked to make the leaderboard fast, an AI assistant moved every score into a Redis sorted set and stopped writing score events to PostgreSQL. It was fast, it passed review, and two weeks later a Redis restart erased every score. Learn to tell the source of truth from a derived copy, what Redis persistence, eviction and replication do and do not promise, how to write events idempotently first and update Redis second, how to rebuild a missing leaderboard, and how to review AI-generated code for exactly this mistake.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer and code reviewer, CodeDev learning platform",
        problem:
            "On Monday morning the leaderboard at https://app.codedev.test/leaderboard is empty and every learner's profile shows 0 points. Redis was restarted for maintenance on Sunday night. Two weeks earlier, a pull request written with an AI coding assistant had replaced the slow leaderboard query with a Redis sorted set; it cut the page from 900 ms to 4 ms and was approved. Support also has older tickets from learners whose points jumped by the same amount twice within a minute.",
    },

    content: [
        h2("1. The incident: fast, and nowhere else"),
        p("The request to the assistant was one line: \"GET /leaderboard is slow: it runs SUM(points) GROUP BY user_id over every score event on each request. Make the leaderboard fast.\" This is the diff it produced, slightly shortened:"),
        code("typescript", `
// leaderboard/leaderboard.service.ts
 async awardPoints(event: ScoreEvent): Promise<AwardResult> {
   if (!isValidEvent(event)) return "rejected";
-  await this.db.query(
-    "INSERT INTO score_events (event_id, user_id, points) VALUES ($1, $2, $3)",
-    [event.eventId, event.userId, event.points],
-  );
+  // Sorted sets keep members ordered by score: ZINCRBY is O(log n) and the
+  // top N is one ZREVRANGE instead of a GROUP BY over every score event.
+  await this.redis.zincrby("leaderboard:global", event.points, event.userId);
   return "counted";
 }

 async top(n: number) {
-  return this.db.query("SELECT user_id, SUM(points) AS total FROM score_events GROUP BY user_id ORDER BY total DESC LIMIT $1", [n]);
+  return this.redis.zrevrange("leaderboard:global", 0, n - 1, "WITHSCORES");
 }`, "the merged diff"),
        p("Every line is reasonable on its own. A sorted set is the right structure for a leaderboard (lesson 3.1 builds one properly). The comment is accurate. The tests passed, because they awarded points and read them back from the same Redis. What the diff also did, in two deleted lines, was stop writing the score events anywhere durable. From that deploy on, the only copy of every learner's points was in Redis memory."),

        h2("2. Reproduce it and read the evidence"),
        p("Start with the Redis configuration. A cache instance is often configured to keep nothing on disk, because a cache can always be refilled:"),
        code("bash", `
$ redis-cli CONFIG GET save
1) "save"
2) ""                      # RDB snapshots disabled
$ redis-cli CONFIG GET appendonly
1) "appendonly"
2) "no"                    # no append-only file
$ redis-cli CONFIG GET maxmemory-policy
1) "maxmemory-policy"
2) "allkeys-lru"           # may evict ANY key when memory is full
$ redis-cli ZCARD leaderboard:global
(integer) 0`, "terminal, Monday 08:40"),
        p("Then the database, which used to be the record of every point:"),
        code("sql", `
SELECT max(created_at), count(*) FROM score_events;
--          max            | count
-- 2026-10-12 08:59:41+07  | 1840233      <- nothing since the deploy`, "psql"),
        p("You can reproduce the loss in staging in a minute: award points, run `docker restart redis` (or restart the service), and load the leaderboard. The duplicate tickets reproduce just as easily: the grading worker delivers events **at least once** and retries when it does not get an acknowledgement in time, so the same `eventId` can arrive twice. The old INSERT failed on the primary key the second time; `ZINCRBY` simply adds the points again."),

        h2("3. Core idea: the source of truth and its copies"),
        p("For every piece of data, one store is the **source of truth**: if it says a learner has 1,240 points, that is the answer, and every other store holds a copy derived from it. Ask one question of every Redis key in a design: *if this key disappeared right now, from what would I rebuild it, and how long would that take?* If the answer is \"from nothing\", Redis is your source of truth, whether you meant it or not."),
        h3("What can make a Redis key disappear"),
        bullets([
            "**A restart without persistence.** With `save \"\"` and `appendonly no`, a restart starts empty.",
            "**Persistence that is not durable enough.** RDB snapshots run at intervals, so a crash loses everything since the last snapshot. AOF with `appendfsync everysec`, the usual setting, can lose about one second of writes on a crash; `appendfsync always` is safer and much slower.",
            "**Eviction.** With `maxmemory` and an `allkeys-*` policy, Redis deletes keys to make room. A leaderboard sharing an instance with a busy cache can be evicted like any page cache entry.",
            "**Failover.** Replication is asynchronous: a replica promoted after the primary fails may not have the last writes.",
            "**People and scripts.** A `FLUSHALL` on the wrong instance, a key-pattern cleanup that matched too much, a TTL added by someone who thought it was a cache.",
        ]),
        p("Persistence and replicas reduce how often and how much you lose. They do not make every write durable at the moment you acknowledge it, and none of them helps with the second bug: a retried event counted twice."),
        h3("Events first, projections second"),
        p("The robust shape for scores is to store **facts** durably and treat totals as a **projection** of those facts:"),
        numbered([
            "Each award is an event with a unique id (the submission id that earned it). Insert it into PostgreSQL with `ON CONFLICT (event_id) DO NOTHING`. If the row already exists, the event was already counted: stop. This makes the award **idempotent**, so retries are harmless.",
            "Only after the insert succeeded, update the Redis projection with `ZINCRBY`.",
            "When the projection is missing (restart, eviction, a new deploy), rebuild it from the events: one `SUM(points) GROUP BY user_id`, then `ZADD` each total.",
        ]),
        p("The leaderboard stays fast: reads hit Redis, and the slow query runs once per rebuild instead of once per page view. If Redis vanishes, you lose speed for one request, not data."),
        callout("info", "When Redis as the only store is acceptable",
            "Some data is fine to lose: who is online right now, rate-limit counters (lesson 2.2), a \"recently viewed\" list, a cache. Sessions are a judgement call: losing them logs everyone out. Ask the product owner what a loss would mean, write the answer next to the key name, and configure persistence to match. Points that learners earned, payments, enrollments and anything you would restore from a backup belong in the database."),

        challenge("chal_quiz_rdp_231"),

        h2("4. Worked example: popular courses, rebuilt from enrollments"),
        p("The same shape on different data: the catalog's \"most popular courses\" list is a sorted set `courses:popular` scored by the number of enrollments. Enrollments are the facts; the sorted set is a projection."),
        code("typescript", `
async enroll(userId: string, courseId: string): Promise<"enrolled" | "already-enrolled"> {
  // 1. The fact, idempotent: one row per (user, course).
  const inserted = await this.db.query(
    \`INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)
     ON CONFLICT (user_id, course_id) DO NOTHING RETURNING 1\`,
    [userId, courseId],
  );
  if (inserted.rowCount === 0) return "already-enrolled";
  // 2. The projection, only if it exists: ZINCRBY on a missing key would create
  //    a "popular" list that contains one course.
  await this.redis.eval(INCR_IF_EXISTS, 1, "courses:popular", 1, courseId);
  return "enrolled";
}

async popular(n: number) {
  if ((await this.redis.exists("courses:popular")) === 0) {
    const rows = await this.db.query("SELECT course_id, count(*)::int AS total FROM enrollments GROUP BY course_id");
    const pipeline = this.redis.pipeline();
    for (const r of rows.rows) pipeline.zadd("courses:popular", r.total, r.course_id);
    await pipeline.exec();
  }
  return this.redis.zrevrange("courses:popular", 0, n - 1, "WITHSCORES");
}`, "catalog/popular-courses.service.ts"),
        code("text", `
-- INCR_IF_EXISTS: KEYS[1] = sorted set, ARGV[1] = increment, ARGV[2] = member
if redis.call('EXISTS', KEYS[1]) == 1 then
  return redis.call('ZINCRBY', KEYS[1], ARGV[1], ARGV[2])
end
return false`, "incr-if-exists.lua"),
        bullets([
            "The Lua script makes \"exists, then increment\" one atomic step. As two commands, the key could be evicted between them and the increment would re-create it with one member.",
            "The rebuild query needs an index that matches it (here on `enrollments (course_id)`), and its cost decides how often you can afford a missing key. Lesson 4.2 covers what happens when many requests find the key missing at the same moment.",
            "One window is still open: an enrollment that commits after the rebuild's SELECT but whose increment ran while the key was still missing is in the database and not in the rebuilt set. A periodic rebuild or reconciliation closes it; lesson 3.3 rebuilds the leaderboard from the event log into a new key and swaps it in without this gap.",
        ]),

        h2("5. Reviewing AI-generated data code"),
        p("Assistants optimise for the request in front of them. \"Make it fast\" was satisfied; \"keep every point\" was never said, so nothing in the code protected it, and the tests the assistant wrote checked the new path against itself. Read every generated change that touches data with these questions:"),
        numbered([
            "**Where is the durable write?** Follow one request from the controller to storage. If the only write is to Redis, ask whether losing that key is acceptable, in writing.",
            "**What did the diff delete?** Removed INSERTs, removed transactions and removed constraints are easy to miss in a diff that mostly adds. Read the red lines first.",
            "**What happens on a retry?** Any handler fed by a queue, a webhook or a client retry will see the same event twice. Look for the idempotency key and the constraint that enforces it.",
            "**What happens when the key is missing?** Ask for the code path after a restart, an eviction and a fresh deploy. `ZINCRBY`, `INCR` and `HINCRBY` on a missing key silently create a new one starting from zero.",
            "**Which test would have failed?** For this change: award, restart Redis, read. If the pull request has no such test, write it before approving, and next time put it in the prompt: \"PostgreSQL stays the source of truth; include a test that restarts Redis\".",
        ]),
        p("The challenge contains the assistant's `LeaderboardService`, an in-memory sorted set model and a fake PostgreSQL with the two queries you need. The public tests award points and read them back, as the original review did, and they pass on the assistant's code. The hidden tests restart Redis, replay events with the same id and check what PostgreSQL holds and how often the leaderboard was rebuilt."),
        challenge("chal_coding_rdp_232"),

        h2("6. How to verify the fix"),
        bullets([
            "**A restart test.** Award, wipe Redis, read: the top N and every score must match. In the fake it is one call; in staging, restart the container.",
            "**A duplicate test.** Send the same event twice (and once more after a restart): the score and the number of rows in `score_events` must not change.",
            "**Reconcile against SQL.** A scheduled job compares the Redis top 100 with `SELECT user_id, SUM(points) ... ORDER BY 2 DESC LIMIT 100` and alerts on any difference. It catches every class of drift, including the ones you did not think of.",
            "**Read the Redis configuration.** `CONFIG GET save`, `appendonly` and `maxmemory-policy` on the instance that holds the projection, so the team knows what a restart or memory pressure will do to it.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Redis as the only write.** Spot it: a handler that changes user-visible data and has no database write, or whose database write was deleted in the diff.",
            "**Incrementing without an idempotency check.** Spot it: `ZINCRBY`/`INCRBY` with no event id, or an INSERT whose result (`rowCount`, conflict) is ignored.",
            "**Updating Redis before the database.** If the INSERT then fails or turns out to be a duplicate, Redis already counted it. Spot it: the Redis call is above the database call.",
            "**Incrementing a missing projection.** After a restart the first award creates a leaderboard with one learner, and reads no longer see the key as missing. Spot it: no EXISTS check, script or rebuild before the increment.",
            "**Trusting persistence settings as durability.** Spot it: a design document that says \"Redis has AOF, so it is safe\" for data that must not be lost.",
        ]),

        h2("8. Summary"),
        numbered([
            "Every Redis key needs an answer to \"if it vanished now, what would I rebuild it from?\"; if the answer is nothing, Redis has become the source of truth, and restarts, eviction, failover and retries will show it.",
            "Store each event durably and idempotently first (unique event id, ON CONFLICT DO NOTHING), then update the Redis projection, and rebuild the projection from the events when it is missing.",
            "Review AI-generated data code for the deleted durable write, the retry path and the missing-key path, and demand the restart and duplicate tests that prove it.",
        ]),

        h2("Sources"),
        bullets([
            "Redis documentation: persistence (RDB, AOF, appendfsync trade-offs) - redis.io/docs/latest/operate/oss_and_stack/management/persistence/",
            "Redis documentation: sorted sets (ZADD, ZINCRBY, ZREVRANGE) - redis.io/docs/latest/develop/data-types/sorted-sets/",
            "PostgreSQL documentation: INSERT ... ON CONFLICT DO NOTHING - postgresql.org/docs/current/sql-insert.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List every Redis key family in a project you work on. For each, write the source it is rebuilt from (or \"none\"), how long a rebuild takes, and what users would see if it vanished. For every \"none\" that is not explicitly acceptable, sketch the event table, its idempotency key and the rebuild query."),
    ],
});
