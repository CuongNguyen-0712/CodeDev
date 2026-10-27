// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-1-3",
    title: "Choosing the architecture & data flow",
    slug: { _type: "slug", current: "choosing-architecture-data-flow" },
    description:
        "A prototype graded submissions inside the HTTP request and fell over at 50 submissions per second; a competing proposal split CodeDev into eight microservices. Learn to choose the simplest architecture that meets the requirements (a modular monolith, grader workers, PostgreSQL and Redis), to place the sync/async boundary right after a durable write, to trace a submission end to end, and to name the source of truth for every piece of data.",
    estimatedTime: 20,

    scenario: {
        role: "Lead engineer presenting the CodeDev architecture to the team",
        problem:
            "Two proposals are on the table for CodeDev v2. The first is a prototype that grades code inside POST /submissions: in a load test at 50 submissions per second its p95 response time reached 24 seconds and the API logged hundreds of connection pool timeouts. The second, from a consultant, splits the platform into eight microservices with eight databases and a message broker between each pair. The team of four has to ship before the next exam season and wants an architecture it can defend with the numbers from lessons 1 and 2.",
    },

    content: [
        h2("1. The incident: grading inside the request"),
        p("The prototype was the obvious first version: receive the code, run the tests, return the result. In development it felt instant. This is the handler and one trace from the load test at 50 submissions per second:"),
        code("typescript", `
// submissions.controller.ts (prototype)
@Post("submissions")
async submit(@Body() body: SubmitDto, @User() user: AuthUser) {
  return this.db.transaction(async (tx) => {
    const sub = await tx.submission.insert({ userId: user.id, challengeId: body.challengeId, code: body.code });
    const result = await this.grader.run(body.challengeId, body.code);   // 1-8 s in a sandbox
    await tx.submission.update(sub.id, { status: result.passed ? "passed" : "failed", result });
    if (result.passed) await this.progress.onChallengePassed(tx, user.id, body.challengeId);
    await this.leaderboard.addPoints(user.id, result.points);           // Redis ZINCRBY
    return result;
  });
}`, "the prototype"),
        code("text", `
POST /submissions                                   6,912 ms   200
  pg.connect (wait for a pool connection)           1,480 ms
  BEGIN
    INSERT submission                                   4 ms
    grader.run  chal_sql_33                         5,390 ms   <- connection held, idle in transaction
    UPDATE submission                                   3 ms
    progress.onChallengePassed                          9 ms
    redis ZINCRBY lb:all-time                           1 ms
  COMMIT                                                6 ms

API log, same minute (x 412):
  Error: timeout exceeded when trying to connect   (pool size 20)`, "trace, load test at 50 submissions/s"),
        p("The second proposal looks like the opposite answer: a catalog service, an enrollment service, a progress service, a submission service, a grading service, a leaderboard service, a certificate service and a notification service, each with its own database, talking through a broker. Before choosing, read what the evidence says the problem actually is."),

        h2("2. Read the evidence: Little's Law again"),
        p("Each request holds a database connection for the whole grading time, about 5.4 seconds. Little's Law from lesson 2 gives the number of connections it needs: 50 requests/s × 5.4 s = **270 connections in use**, against a pool of 20. The other 250 requests wait in `pg.connect`, which is where the 1,480 ms and the timeouts come from. At the exam peak of 340/s it would need about 1,800 connections, and 1,800 open HTTP requests waiting several seconds each, while PostgreSQL itself was nearly idle."),
        p("So the bottleneck is not the size of the codebase or the number of services. It is that **a slow, failure-prone step (running untrusted code) sits inside the request and inside a transaction**. Eight microservices with the same synchronous chain would have the same problem plus seven network hops. The fix is to move the boundary, not to multiply the boxes."),

        h2("3. Core idea: the simplest architecture that meets the requirements"),
        h3("The building blocks"),
        bullets([
            "**API: a modular monolith (NestJS).** One deployable with clear modules: catalog, enrollment, progress, submissions, leaderboard, certificates. Modules talk through their public services, never through each other's tables. It runs as several identical instances behind a load balancer.",
            "**Grader workers: a separate deployable.** They run untrusted learner code in a sandbox, take 1-8 s per job and scale on a different schedule (40 slots always on, about 300 in exam windows, lesson 2). Those three facts, security isolation, a different resource profile and a different scaling curve, are the evidence that justifies this one split.",
            "**PostgreSQL: the source of truth.** Users, enrollments, progress, submissions, challenge passes, points, certificates and the outbox. Lesson 2 showed it all fits on one primary with room to spare, and keeping it together lets one transaction cover a pass, its progress change and its events.",
            "**Redis: fast, rebuildable state.** Cache, per-user rate limits, the submission job queue and the leaderboard projection (a sorted set). Every Redis call gets a short timeout (50 ms) and a PostgreSQL fallback, so a Redis outage degrades the platform instead of stopping it (lessons 9 and 12).",
        ]),
        h3("Why not the eight services, and when to split"),
        p("Each service boundary costs a network call that can fail, a deployment to coordinate, data that can no longer change in one transaction, and on-call knowledge for a team of four. Those costs buy independent scaling, independent deploys and team ownership. None of them is needed today except for grading: lesson 2 found every other load small. Split a module out later when you can show the evidence, for example a module whose load is ten times the rest, a team that keeps blocking another team's releases, or a compliance boundary. The modular monolith makes that split cheap, because the module already has an interface and owns its tables. The NestJS modular monolith course (a prerequisite) covers the module rules."),
        h3("Where the request ends: the sync/async boundary"),
        p("For each operation, ask what the user needs a promise about right now, and make the response wait for exactly that and nothing more. The promise must be **durable before the response**, so that everything after the boundary can fail and be retried without breaking it:"),
        bullets([
            "**Submit:** the learner needs \"we have your code, and it was on time\" (R6a). Synchronous: authenticate, validate, rate limit, insert the submission row and an outbox row in one transaction, answer `202 Accepted` with the submission id. Asynchronous: grading, the pass record, progress, points, leaderboard, certificate, notifications.",
            "**Progress update:** the learner needs \"saved\" (R5), and the work is one short write. Synchronous, in PostgreSQL. The leaderboard update it causes is asynchronous.",
            "**Leaderboard read:** synchronous from the Redis projection, falling back to a slower PostgreSQL query when Redis is unavailable. R7 allows it to lag by up to 10 seconds.",
        ]),
        p("Making something asynchronous is not free: the client now has to learn about the result later (polling with backoff or a push, lesson 2), and every consumer must cope with retries and duplicates. Keep operations synchronous when they are short, cheap and the user is waiting for the outcome anyway, like a progress update."),
        h3("A submission, end to end"),
        numbered([
            "**Web app** sends `POST /submissions` with the code and an `Idempotency-Key`.",
            "**API (submissions module)** authenticates, checks enrollment and the per-user rate limit (Redis), then in one PostgreSQL transaction inserts `submission` (status `queued`, `accepted_at`) and an `outbox` row `submission.created`. It answers `202 { submissionId }`. Target: p95 under 2 s (R2b); measured 38 ms.",
            "**Outbox publisher** reads new outbox rows and pushes a grading job onto the submission queue (Redis). If Redis loses the queue, a sweeper re-enqueues submissions still `queued` after a few minutes: the queue is rebuildable from PostgreSQL.",
            "**Grader worker** takes the job, runs the hidden tests in a sandbox (1-8 s) and, in one PostgreSQL transaction, sets the submission result, inserts the `challenge_pass` (once per learner and challenge), applies the progress update through the progress service (lesson 4) and writes outbox rows `challenge.passed` and `progress.updated`. Then it acknowledges the job.",
            "**Outbox publisher** publishes those events to the event bus.",
            "**Leaderboard projection** consumes them, idempotently and in per-learner order, and updates the Redis sorted sets (lesson 6). Target: within 10 s (R7).",
            "**Certificate service** consumes `progress.updated` with `coursePercent` 100 and issues the certificate once (an outbox event again, lesson 10).",
            "**Web app** learns the result by polling `GET /submissions/:id` with backoff, or from a push; both read the submission row, not the queue.",
        ]),
        h3("The source of truth for each piece of data"),
        p("For every piece of data, name the one place that is right when two places disagree, and how every other copy is rebuilt from it. If you cannot name it, you will find out during an incident:"),
        code("text", `
data                         source of truth             other copies (rebuildable)
users, enrollments           PostgreSQL                  Redis cache (TTL), session tokens
lesson & course progress     PostgreSQL course_progress  progress.updated events, cached course page
submissions & results        PostgreSQL submission       job in the Redis queue (rebuilt from status = queued)
challenge passes, points     PostgreSQL challenge_pass,  leaderboard sorted sets in Redis (projection)
                             points_ledger (one row per scoring fact, with its week)
leaderboard ranks            derived, never stored       Redis sorted sets, rebuilt from challenge_pass + progress
rate-limit counters          Redis (allowed to be lost)  none: losing them resets limits for one window
course content               CMS (Sanity)                CDN / Redis cache
certificates                 PostgreSQL certificate      PDF in object storage (re-renderable)`, "source of truth per piece of data"),
        p("Two lines deserve attention. Leaderboard ranks have no stored truth at all: they are a function of passes and progress, so losing Redis loses nothing that cannot be recomputed. Rate-limit counters are the opposite: Redis is their only home, and that is a deliberate decision, because losing them means a few learners get an extra submission for one window, which the requirements tolerate."),

        challenge("chal_quiz_sdc_131"),

        h2("4. Worked example: the boundary in code"),
        p("The API side does only the durable hand-off. It uses one transaction for the submission and its outbox row, so there is never a submission without a job or a job without a submission (the dual-write problem from Data Consistency & Event-Driven Patterns):"),
        code("typescript", `
// submissions/submissions.service.ts
async accept(user: AuthUser, dto: SubmitDto, idempotencyKey: string): Promise<{ submissionId: string }> {
  await this.enrollment.assertEnrolled(user.id, dto.challengeId);
  await this.rateLimit.consume(user.id);                        // 429 + Retry-After when over the limit

  return this.db.transaction(async (tx) => {
    const existing = await tx.query(
      "SELECT id FROM submission WHERE user_id = $1 AND idempotency_key = $2", [user.id, idempotencyKey]);
    if (existing.rows[0]) return { submissionId: existing.rows[0].id };      // a retried POST

    const { rows } = await tx.query(
      \`INSERT INTO submission (user_id, challenge_id, code, status, accepted_at, idempotency_key)
       VALUES ($1, $2, $3, 'queued', now(), $4) RETURNING id\`,
      [user.id, dto.challengeId, dto.code, idempotencyKey]);
    await tx.query(
      "INSERT INTO outbox (topic, key, payload) VALUES ('submission.created', $1, $2)",
      [rows[0].id, { submissionId: rows[0].id }]);
    return { submissionId: rows[0].id };                        // controller answers 202
  });
}`, "the synchronous part"),
        p("The worker side does the slow work and then records every consequence in one transaction, written so that running the same job twice changes nothing the second time:"),
        code("typescript", `
// grader-worker/handle-job.ts
export async function handleJob(job: { submissionId: string }): Promise<void> {
  const sub = await db.one("SELECT * FROM submission WHERE id = $1", [job.submissionId]);
  if (sub.status !== "queued" && sub.status !== "running") return;          // already graded: redelivery

  const result = await sandbox.run(sub.challengeId, sub.code, { timeoutMs: 10_000 });

  await db.transaction(async (tx) => {
    const updated = await tx.query(
      "UPDATE submission SET status = $2, result = $3, graded_at = now() WHERE id = $1 AND status IN ('queued', 'running')",
      [sub.id, result.passed ? "passed" : "failed", result]);
    if (updated.rowCount === 0) return;                                     // another worker won the race
    if (!result.passed) return;

    const pass = await tx.query(
      \`INSERT INTO challenge_pass (user_id, challenge_id, points, submission_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, challenge_id) DO NOTHING RETURNING id\`,
      [sub.userId, sub.challengeId, result.points, sub.id]);
    if (pass.rowCount === 0) return;                                        // passed before: no new points
    await tx.query("INSERT INTO outbox (topic, key, payload) VALUES ('challenge.passed', $1, $2)",
      [sub.userId, { userId: sub.userId, challengeId: sub.challengeId, points: result.points }]);
    await progress.onChallengePassed(tx, sub.userId, sub.challengeId);      // writes progress.updated to the outbox
  });
}`, "the asynchronous part"),
        p("Notice what is not here: no Redis write. The worker never touches the leaderboard; it records facts in PostgreSQL and the projection derives ranks from the events. That is what makes the leaderboard rebuildable, and it removes one more slow, failure-prone call from the worker's transaction."),

        h2("5. How to verify the architecture"),
        bullets([
            "**The boundary is where you think it is.** In a trace of `POST /submissions`, no grading span and no Redis leaderboard span may appear under the request. Load test at 340/s: p95 of the 202 under 2 s (R2b), and database connections in use around 340 × 0.02 s = 7, not hundreds.",
            "**The hand-off survives crashes.** Kill a grader worker in the middle of a job: the job is redelivered and the submission is graded exactly once (one `challenge_pass` row, one `challenge.passed` event). Flush the Redis queue: the sweeper re-enqueues every submission still `queued`.",
            "**Every copy is rebuildable from its source of truth.** Flush the leaderboard keys in staging, run the rebuild (lesson 11) and compare the result with a SQL query over `challenge_pass` and `course_progress`.",
            "**Modules keep to their tables.** A CI check that fails when a module queries another module's tables, for example a grep over the SQL in each module folder for table names it does not own.",
        ]),
        code("sql", `
-- after a crash test: no submission is stuck, and every passed submission is backed by a pass row
-- (the UNIQUE (user_id, challenge_id) constraint already makes a second pass row impossible)
SELECT s.id, s.status
FROM submission s
LEFT JOIN challenge_pass p ON p.user_id = s.user_id AND p.challenge_id = s.challenge_id
WHERE (s.status = 'passed' AND p.id IS NULL)
   OR (s.status IN ('queued', 'running') AND s.accepted_at < now() - interval '10 minutes');   -- must return no rows`, "crash test check"),
        callout("info", "Write the decision down",
            "Record the choice as an architecture decision record: context (requirements and estimates), decision (modular monolith, separate graders, PostgreSQL as source of truth, Redis for rebuildable state), alternatives considered (synchronous grading, eight services) and the evidence that would change it. Lesson 15 turns these records into the design doc; lesson 12 defends them in front of a review board."),

        h2("6. Common mistakes"),
        bullets([
            "**A slow step inside the request or the transaction.** Spot it: a trace where most of the request time is one child span calling something external, with the database connection idle in transaction.",
            "**Splitting into services before the evidence.** Spot it: a service per noun, each with its own database, while the capacity estimate shows one database at a few percent load and the team has four people.",
            "**A cache or a projection as the only copy.** Points only in a Redis sorted set, progress only in a session. Spot it: the source-of-truth table has a row whose only location is Redis and whose loss is not acceptable.",
            "**An asynchronous hand-off that is not durable.** Answering 202 before the commit, or enqueuing the job outside the transaction. Spot it: kill the process right after the response and see whether the work still happens.",
            "**Workers that assume exactly-once delivery.** Spot it: a job handler that inserts points or sends emails without a uniqueness constraint or a status check, so a redelivered job does it twice.",
        ]),

        h2("7. Summary"),
        numbered([
            "Start from the requirements and estimates: a modular monolith (NestJS) plus grader workers plus PostgreSQL plus Redis meets CodeDev's numbers; split further only when evidence (load, ownership, isolation) shows a module needs it.",
            "Put the sync/async boundary right after the durable write the user needs a promise about: submit answers 202 after the submission and outbox rows commit; grading, progress, points and ranks follow asynchronously and must tolerate retries.",
            "Name the source of truth for every piece of data: PostgreSQL for facts (progress, submissions, passes, points), Redis for rebuildable or disposable state (queue, cache, rate limits, leaderboard), and test that every copy can be rebuilt.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler, Patterns of Distributed Systems - martinfowler.com/articles/patterns-of-distributed-systems/",
            "Google SRE book, Addressing Cascading Failures - sre.google/sre-book/addressing-cascading-failures/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Draw the data flow of the most important write in a system you know, from the client to every copy of the data it creates. Mark where the response is sent and check that everything before it is durable. Then write the source-of-truth table for that flow and pick one copy to delete in staging: can you rebuild it, and how long does it take?"),
    ],
});
