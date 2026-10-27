// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-3-3",
    title: "Graceful degradation: progress works when the leaderboard doesn't",
    slug: { _type: "slug", current: "graceful-degradation-progress-without-leaderboard" },
    description:
        "Redis got slow for eleven minutes and POST /progress answered 503 after 5 seconds, although every progress row had already been committed in PostgreSQL. Learn to separate the dependency that must succeed from the ones that may fail, to bound each optional call with a timeout from measured latency, to stop paying that timeout with a circuit breaker per dependency, to defer leaderboard writes to a retry queue that stores user ids instead of scores, to fall back to PostgreSQL for reads, and to tell the client honestly that the answer is degraded.",
    estimatedTime: 35,

    scenario: {
        role: "Backend engineer on the progress service, CodeDev learning platform",
        problem:
            "Tuesday 19:40-19:51, the busiest hour of the week. A maintenance job ran a large ZUNIONSTORE on the shared Redis and its p99 latency went from 1 ms to between 2 and 6 seconds. Redis never went down. In those eleven minutes POST /progress returned 503 to 18,100 requests with p95 5.0 s, the lesson page showed \"Could not save your progress\", and many learners repeated the lesson. PostgreSQL shows 18,400 progress rows committed in the same window: the work was saved, the answer said it was not. The leaderboard page returned 500 for the whole period.",
    },

    content: [
        h2("1. The incident: a saved answer reported as a failure"),
        p("The progress handler does three things in order, and treats them as equally important:"),
        code("typescript", `
// progress.service.ts - before
async completeLesson(userId: string, lessonId: string, points: number) {
  const total = await this.progress.complete(userId, lessonId, points);   // PostgreSQL, commits
  await this.redis.del(\`progress:\${userId}\`);                            // cache invalidation
  await this.redis.zadd("leaderboard", total, userId);                     // leaderboard projection
  return { total };
}

// redis.module.ts
new Redis(process.env.REDIS_URL);   // ioredis defaults: no commandTimeout, maxRetriesPerRequest 20`, "progress.service.ts"),
        p("When Redis became slow, the first `await` after the commit waited until the client gave up, the exception reached the global filter and the API answered 503. The trace of one request shows exactly where the time went:"),
        code("text", `
POST /progress                                  5,031 ms  503
  pg: INSERT lesson_progress ... COMMIT            14 ms  ok
  redis: DEL progress:u_51                      5,000 ms  ERR connection timeout
  (leaderboard ZADD not reached)`, "trace, 19:44:12"),

        h2("2. Read the evidence: what was lost, and what was not"),
        p("Before changing anything, count the damage in the source of truth. If the rows are there, the outage lost nothing but trust and a lot of learners' time:"),
        code("sql", `
SELECT count(*) AS committed
FROM lesson_progress
WHERE completed_at >= '2026-10-20 19:40' AND completed_at < '2026-10-20 19:51';
-- committed: 18,400

-- learners whose leaderboard score is behind PostgreSQL after the outage (from the nightly check)
-- behind: 6,912`, "psql"),
        p("Three facts follow. **PostgreSQL never failed**: every progress write that mattered succeeded. **The 503 was a lie**: it told learners their progress was lost when it was saved. And **the leaderboard was left behind** for 6,912 learners, because the ZADD after a failed DEL never ran and nothing retried it. Redis did not take the progress path down; the code did, by making two optional steps as mandatory as the one that matters."),

        h2("3. Core idea: required and optional dependencies"),
        p("For every call on a request path, ask one question: **if this dependency is unavailable, what should the user get?** On the CodeDev progress path the answers are clear:"),
        bullets([
            "**PostgreSQL (progress store): required.** It is the source of truth. If it is down, the honest answer is an error, and the client keeps the completion locally to retry. Do not pretend.",
            "**Cache (Redis): optional.** Skipping an invalidation means the learner's cached progress can be stale until its TTL (60 s on CodeDev) expires. That is the price, and it is why cached progress has a short TTL. Reads that miss or fail go to PostgreSQL, behind a concurrency limit so a cache outage does not become a database outage (lesson 13).",
            "**Leaderboard (Redis sorted set): optional, and rebuildable.** It is a projection of PostgreSQL. A missed write can be retried later; a lost leaderboard can be rebuilt (lesson 11). Reads fall back to a PostgreSQL query over the progress totals, slower (about 120 ms) but correct.",
        ]),
        p("**Graceful degradation** is doing exactly that in code: the required step decides success, each optional step has a bounded cost and a planned fallback, and the response says which parts were skipped. The client shows \"Saved. The leaderboard will update shortly\" instead of an error."),
        callout("warning", "When not to degrade",
            "Degrade only steps whose absence the product can live with, and know the price of each one. Writing a certificate, charging a payment or recording an exam result are not optional: skipping them silently is data loss with a 200 status. And do not add fallbacks you never test: a fallback to PostgreSQL that has never run under load can turn a Redis incident into a database incident."),

        h2("4. Three mechanisms, each with its own job"),
        h3("A timeout per dependency, from measured latency"),
        p("A timeout bounds what one call can cost. Choose it from the dependency's healthy latency, not from what feels generous: CodeDev's Redis has a p99 of about 1.2 ms, so **50 ms** is roughly forty times that, far above any healthy call and far below the 300 ms read budget. The ioredis default (no command timeout, up to 20 retries) is a choice too, just an unexamined one. Remember that a timeout means \"I do not know\": a slow ZADD may still be applied after the caller gave up, so the retry must be harmless if it was."),
        h3("A circuit breaker per dependency"),
        p("A timeout alone still charges every request 50 ms per dead dependency, and during an outage that is every request. A **circuit breaker** remembers recent failures and stops calling for a while:"),
        bullets([
            "**Closed**: calls go through. A success resets the count; `failureThreshold` consecutive failures (timeouts included) **open** it.",
            "**Open**: calls are skipped at once, costing 0 ms, for `openMs`. This also stops the platform from hammering a Redis that is trying to recover.",
            "**Half-open**: after `openMs`, exactly one trial call goes through. Success closes the breaker; failure opens it again for another `openMs`.",
        ]),
        p("Keep one breaker **per dependency**, even when two share a server: if the leaderboard's sorted set is slow because of one huge key, a single \"Redis\" breaker would also stop cache invalidations that still work."),
        h3("A retry queue that stores who, not what"),
        p("A leaderboard write that failed must happen later. The obvious queue stores the failed write, `{ userId, total }`, and replays it. That is wrong in a subtle way: a delayed replay is a **reordered** write. If the learner completes another lesson after Redis recovers, the direct write sets 150 and the replay then sets the old 120. Store the **user id** and read the current total from PostgreSQL when draining: whatever happened in between, the drain writes the truth. Drain through the same breaker, in small batches, so a recovering Redis is not hit by thousands of writes in the same millisecond."),

        challenge("chal_quiz_sdc_331"),

        h2("5. Worked example: the handler after the fix"),
        code("typescript", `
// progress.service.ts - after
async completeLesson(userId: string, lessonId: string, points: number): Promise<ProgressResponse> {
  const total = await this.progress.complete(userId, lessonId, points);    // required: errors propagate
  const skipped: string[] = [];

  if (!(await this.redisCall("cache", () => this.redis.del(\`progress:\${userId}\`)))) skipped.push("cache");

  const ok = await this.redisCall("leaderboard", () => this.redis.zadd("leaderboard", total, userId));
  if (ok) this.retry.remove(userId);
  else { skipped.push("leaderboard"); this.retry.add(userId); }          // a user id, not a score

  return { total, degraded: skipped.length > 0, skipped };
}

// every Redis call: breaker first, then a 50 ms timeout, then report the outcome to the breaker
private async redisCall(name: "cache" | "leaderboard", op: () => Promise<unknown>): Promise<boolean> {
  const breaker = this.breakers[name];
  if (!breaker.allow()) return false;                                     // open: skip, 0 ms
  try {
    await withTimeout(op(), 50);
    breaker.success();
    return true;
  } catch {
    breaker.failure();                                                    // error or timeout
    return false;
  }
}`, "progress.service.ts"),
        p("The response is now honest and fast. During the incident window a request would have cost 14 ms (PostgreSQL) plus at most 50 ms per Redis call until the breakers opened, then 14 ms, and returned `200 { total, degraded: true, skipped: [\"cache\", \"leaderboard\"] }`. The web client shows the saved state and a small \"leaderboard updating\" note; the leaderboard page, reading from PostgreSQL, shows a \"live ranking delayed\" banner instead of a 500."),
        p("The retry queue in this example lives in memory and is lost on a deploy. That is acceptable only because the leaderboard is a projection: the reconciliation and rebuild from lesson 11 repair anything a lost queue missed. If the projection could not be rebuilt, the deferred write would belong in PostgreSQL, in the same transaction as the progress row (the outbox from lesson 10)."),

        h2("6. Build it"),
        p("Implement the breaker and the service against in-memory fakes with scripted outages: Redis down (fails fast), Redis slow (answers after the timeout, and may still apply the write), and PostgreSQL always up. The runner replays progress updates and leaderboard reads, fires the drain timer, and prints every request result, the breaker transitions and the retry queue."),
        challenge("chal_coding_sdc_332"),

        h2("7. How to verify it"),
        numbered([
            "**Inject the failure you are designing for.** In staging, put Toxiproxy between the API and Redis and add a 3,000 ms latency toxic (slow), then cut the connection (down). For a quick local check, `redis-cli DEBUG SLEEP 5` blocks a development Redis for 5 seconds.",
            "**Assert on the outcome, not on the absence of errors**: POST /progress returns 200 with `degraded: true`, its p95 stays under 300 ms after the breakers open, and the count of new progress rows equals the count of 200 responses.",
            "**Watch the breaker and the queue**: export breaker state per dependency and the retry queue length as metrics (the Observability with OpenTelemetry course covers naming and labels). During the test the queue grows; after the toxic is removed the breaker goes half-open, then closed, and the queue drains to zero.",
            "**Reconcile the projection**: compare the leaderboard with PostgreSQL totals for every learner touched during the test. Zero differences after the drain is the evidence that the retry queue wrote current totals.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Optional steps that throw.** An exception from a cache call reaches the global error filter and fails a request whose real work succeeded. Spot it: 5xx responses for requests whose rows exist in PostgreSQL.",
            "**Client defaults as timeouts.** Seconds-long default timeouts and retries inside the Redis client. Spot it: traces where a single Redis span lasts thousands of milliseconds.",
            "**A timeout without a breaker.** Every request pays the full timeout for the whole outage. Spot it: request latency jumps by exactly the timeout and stays there until the dependency recovers.",
            "**Retrying the stored write instead of the current state.** Late replays overwrite newer scores. Spot it: leaderboard scores lower than PostgreSQL totals right after an outage ends.",
            "**Hiding degradation.** Returning 200 with stale or partial data and no flag. Spot it: users report wrong ranks while every dashboard is green; add the degraded flag and a metric for it.",
        ]),

        h2("9. Summary"),
        bullets([
            "Decide per dependency whether it is required or optional; only the required one (PostgreSQL for progress) decides success, and the response says what was skipped.",
            "Bound every optional call with a timeout from measured latency (50 ms for Redis), and stop paying it with a circuit breaker per dependency: closed, open, one half-open trial.",
            "Defer missed leaderboard writes to a retry queue of user ids drained through the breaker with current totals, serve reads from PostgreSQL meanwhile, and verify with fault injection and a reconciliation against the source of truth.",
        ]),

        callout("tip", "Practice on your own (not graded)",
            "Add a concurrency limit to the PostgreSQL fallback of getLeaderboard (for example at most 20 fallback queries at once; beyond that, answer from a 30-second snapshot) and replay the large test with the cache and leaderboard down for the whole run. Then write the runbook entry: which alert fires, what the on-call engineer checks, and how they confirm the queue drained."),
    ],
});
