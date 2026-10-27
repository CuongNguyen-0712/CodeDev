// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-2-1",
    title: "At-least-once delivery & idempotent workers",
    slug: { _type: "slug", current: "at-least-once-delivery-idempotent-workers" },
    description:
        "A deploy stopped the certificates worker after it wrote a certificate but before it acknowledged the job. The queue delivered the job again, and a learner got two certificates, two emails and the course bonus twice. Learn why a queue can promise at-least-once delivery but not exactly-once, how to choose an idempotency key (job id or business key), and how a processed-jobs table written in the same transaction as the side effect turns duplicate deliveries into harmless no-ops.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on the certificates worker, CodeDev learning platform",
        problem:
            "On Thursday at 14:02 a deploy rolled the certificates workers. Within the hour, support received three tickets: learners who finished a course at that moment see two certificates with different serial numbers on their profile, received two \"Congratulations\" emails and got the 150 EXP course bonus twice. The worker code did not change in that deploy. The queue's dashboard shows no errors, only a handful of jobs with a receive count of 2.",
    },

    content: [
        h2("1. The incident: a certificate issued twice"),
        p("When a learner completes the last lesson of a course, `POST /enrollments/:id/complete` on https://api.codedev.test enqueues an `issue-certificate` job. A NestJS worker reads it, inserts a row into `certificates` and publishes a `certificate.issued` event. Two consumers react to that event: one sends the email, the other adds the course bonus EXP. This is the worker as it ran on Thursday:"),
        code("typescript", `
// certificates/certificate.processor.ts (BullMQ via @nestjs/bullmq)
@Processor("certificates")
export class CertificateProcessor extends WorkerHost {
  constructor(private readonly certificates: CertificatesRepository, private readonly events: EventBus) {
    super();
  }

  async process(job: Job<{ userId: string; courseId: string }>): Promise<void> {
    const { userId, courseId } = job.data;
    const certificate = await this.certificates.insert({ userId, courseId, serial: newSerial() });
    await this.events.publish("certificate.issued", { userId, courseId, certificateId: certificate.id });
  }   // returning marks the job completed: that is the "ack"
}`, "certificate.processor.ts (as deployed)"),
        p("Nothing in it is wrong line by line. The problem is what happens **between** two lines: after the insert has committed and before the queue has heard that the job is done."),

        h2("2. Read the evidence"),
        p("Start with the data, because it tells you the scale. A duplicate is two certificates for the same learner and course:"),
        code("sql", `
SELECT user_id, course_id, count(*) AS certificates, min(created_at), max(created_at)
FROM certificates
GROUP BY user_id, course_id
HAVING count(*) > 1;

 user_id | course_id      | certificates | min                 | max
---------+----------------+--------------+---------------------+---------------------
 u_anna  | redis-patterns |            2 | 2026-10-22 14:02:11 | 2026-10-22 14:02:41
 u_minh  | sql-basics     |            2 | 2026-10-22 14:02:12 | 2026-10-22 14:02:42`, "psql"),
        p("Thirty seconds apart, twice. Now the worker logs for the first one, filtered by the job id:"),
        code("text", `
14:02:11.402 certificates-worker-7 job=8812 attempt=1 issue-certificate user=u_anna course=redis-patterns
14:02:11.519 certificates-worker-7 job=8812 INSERT certificates serial=C-5521 OK
14:02:11.523 certificates-worker-7 SIGTERM received, closing worker
14:02:11.530 certificates-worker-7 exited (code 143)
14:02:41.611 certificates-worker-3 job=8812 attempt=2 issue-certificate user=u_anna course=redis-patterns
14:02:41.690 certificates-worker-3 job=8812 INSERT certificates serial=C-5522 OK
14:02:41.702 certificates-worker-3 job=8812 completed`, "worker logs, job 8812"),
        p("Worker 7 inserted the certificate and was killed before `process()` returned, so the queue never recorded the job as done. Thirty seconds later the queue decided the job had been abandoned and handed it to worker 3, which did the whole job again. The queue did exactly what it promises. The worker assumed something the queue never promised: that it would see each job once."),
        callout("info", "Why 30 seconds?",
            "That gap is the time a queue waits before it treats a received job as abandoned: the visibility timeout in SQS, the lock duration plus the stalled-job check in BullMQ. Lesson 2.2 is about that timer. In this lesson, all that matters is that the job came back."),

        h2("3. Core idea: the queue delivers at least once, the worker makes it count once"),
        p("Every queue has to choose what happens when a worker dies at the worst moment. There are only two places to put the acknowledgement:"),
        bullets([
            "**Ack before the work: at-most-once.** The job is removed when it is received. If the worker dies halfway, the job is gone: a learner who finished a course gets no certificate at all, and nothing will ever retry it.",
            "**Ack after the work: at-least-once.** The job is removed only when the worker reports success. If the worker dies after the side effect but before the ack, the job comes back and the side effect happens again.",
        ]),
        p("There is no third position. The ack is a message over the network: it can be lost, or the process can die one instruction before sending it. So **exactly-once delivery** is not something a queue can give you end to end. What you can build is **exactly-once effect**: at-least-once delivery plus a worker that recognises a job it has already handled. That property is called **idempotency**: handling the same job twice has the same effect as handling it once."),
        p("Real queues document this. Amazon SQS standard queues say a message is delivered at least once and occasionally more than once. BullMQ processes a job again when its lock expires while the worker is still busy or dead (a \"stalled\" job). FIFO queues in SQS deduplicate *sends* within a five-minute window, which helps against a producer that retries, but a message is still received again if the consumer does not delete it in time. Check the current documentation of the queue you use; the safe assumption is always \"this job may arrive twice\"."),
        h3("First ask: is the side effect already idempotent?"),
        p("Not every job needs extra machinery. Some side effects are idempotent by nature, and then a duplicate delivery is harmless:"),
        bullets([
            "**Setting a value**: `UPDATE submissions SET status = 'graded', score = 87 WHERE id = $1` twice leaves the same row.",
            "**Recomputing from the source**: rebuilding a course's progress summary from the `progress` table gives the same summary each time.",
            "**Writes with a natural unique key**: an upsert keyed by `(user_id, lesson_id)` cannot create a second row.",
        ]),
        p("The dangerous ones **add** something: insert a row with a new id, send an email, add points, charge money, call an external API that creates a resource. Issuing a certificate does three of those. For these, the worker has to remember what it has already done."),
        h3("Choosing the idempotency key"),
        p("The worker remembers handled jobs by a key. Which key decides which duplicates you catch:"),
        bullets([
            "**The job id** catches redeliveries of the *same* message: the crash in our logs. It does not catch the same request enqueued twice under two ids, which happens when the API's enqueue call times out and is retried, or when two code paths both decide a course is complete.",
            "**A business key** describes the effect itself: one certificate per learner per course, so `certificate:<userId>:<courseId>`. It catches both kinds of duplicate. Use it whenever the business rule says \"at most once per X\".",
            "**A key chosen by the producer** (an idempotency key sent with the job, like the `Idempotency-Key` header of an HTTP API) fits when the same business action may legitimately happen twice, such as two separate payments of the same amount. The producer creates one key per action and the worker deduplicates on it.",
        ]),
        callout("warning", "A key that is too coarse is a bug too",
            "`certificate:<userId>` would stop a learner's second certificate for a different course. Write the rule in words first (\"one certificate per learner and course\") and build the key from exactly the fields in that sentence."),

        challenge("chal_quiz_bjm_211"),

        h2("4. Worked example: a processed-jobs table in the same transaction"),
        p("The simplest reliable design keeps the memory of handled jobs in the same database as the side effect, and writes both in one transaction. Then there are only two possible outcomes of a crash: everything was committed (the redelivery sees the key and skips), or nothing was (the redelivery does the work for the first time)."),
        p("The example uses another worker with the same shape, so the certificates fix stays yours for the challenge. When a submission passes, an `award-points` job adds the challenge's points to the learner's ledger and emits `points.awarded`, which updates the leaderboard. The rule is \"a learner earns the points of a challenge once\", so the key is `points:<userId>:<challengeId>`."),
        code("sql", `
CREATE TABLE processed_jobs (
  key          text PRIMARY KEY,               -- 'points:u_anna:chal_coding_rdp_222'
  job_id       text NOT NULL,                  -- for debugging: which delivery did the work
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- The backstop: even a bug in the worker cannot award a challenge twice.
ALTER TABLE points_ledger
  ADD CONSTRAINT points_ledger_user_challenge_key UNIQUE (user_id, challenge_id);`, "migration"),
        p("The event goes into an **outbox** table in the same transaction instead of straight to the event bus. A separate relay publishes outbox rows after they commit. The event bus is not part of your database transaction, so publishing directly would bring the gap back: commit, crash, no event - or event, crash, rollback. Lesson 3.3 looks at that relay and at the email consumer behind it."),
        code("typescript", `
@Processor("points")
export class PointsProcessor extends WorkerHost {
  constructor(private readonly db: Database) {
    super();
  }

  async process(job: Job<{ userId: string; challengeId: string; points: number }>): Promise<"awarded" | "duplicate"> {
    const { userId, challengeId, points } = job.data;
    const key = \`points:\${userId}:\${challengeId}\`;

    return this.db.transaction(async (tx) => {
      // Claim the key first. ON CONFLICT DO NOTHING is atomic: if two workers race,
      // exactly one INSERT returns a row and the other one gets zero rows.
      const claimed = await tx.query(
        \`INSERT INTO processed_jobs (key, job_id) VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING RETURNING key\`,
        [key, job.id],
      );
      if (claimed.length === 0) return "duplicate";          // already done: ack and move on

      await tx.query(
        \`INSERT INTO points_ledger (user_id, challenge_id, points) VALUES ($1, $2, $3)\`,
        [userId, challengeId, points],
      );
      await tx.query(
        \`INSERT INTO outbox (type, payload) VALUES ('points.awarded', $1)\`,
        [{ userId, challengeId, points }],
      );
      return "awarded";
    });   // COMMIT here; a throw or a crash before it rolls back all three inserts
  }
}`, "points.processor.ts (idempotent)"),
        p("Replay the crash from section 2 against this worker. If it dies before the commit, PostgreSQL rolls back the key, the ledger row and the outbox row together: the redelivery finds no key and awards the points once. If it dies after the commit but before the ack, the redelivery finds the key, returns `\"duplicate\"`, and the job is acknowledged without touching anything."),
        p("Three details that make this hold up in production:"),
        bullets([
            "**Claim with `INSERT ... ON CONFLICT`, not `SELECT` then `INSERT`.** Two deliveries of the same job can run at the same moment on two workers (lesson 2.2 shows how). Both `SELECT`s can see \"not processed\"; only one `INSERT` of the same primary key can succeed.",
            "**Return normally on a duplicate.** A duplicate is success. Throwing would make the queue retry a job that is already done, forever.",
            "**Keep the unique constraint as well.** The processed-jobs table protects the job; the constraint protects the data from every other path that writes to the ledger, including a future bug.",
        ]),
        callout("info", "How long to keep processed keys",
            "A key only has to live as long as a duplicate can arrive. For job-id keys that is the queue's longest redelivery window (retention period plus retries), so old rows can be deleted by a nightly job. A business rule such as one award per challenge, or one certificate per course, is permanent, so its protection should be permanent too: that is what the unique constraint is for. A Redis set with a short TTL is a tempting place for keys, but a key that expires before the last redelivery protects nothing."),

        h2("5. How to verify it"),
        bullets([
            "**A test that delivers twice.** Run the handler, then run it again with the same job: one certificate, one outbox row, and the second call returns `\"duplicate\"`. Repeat with a different job id and the same learner and course.",
            "**A test that crashes in the middle.** Make a fake throw right after the certificate insert, inside the transaction: nothing must be left behind, and the next delivery must issue the certificate exactly once.",
            "**The duplicate query from section 2** returns zero rows after the fix, and keeps returning zero rows in a daily check.",
            "**A chaos run in staging.** Enqueue 1,000 jobs and kill workers with `kill -9` while they run. Count certificates per learner and course afterwards.",
            "**A metric for duplicates.** Count how often the handler returns `\"duplicate\"`. A small non-zero number after deploys is the protection working; a large one points at a producer that enqueues twice.",
        ]),
        p("The challenge runs the certificates worker against an in-memory queue on a fake clock. The test input scripts the deliveries, including crashes after a side effect and before the ack. The queue redelivers each unacknowledged job when its timeout passes, and fakes record every certificate and every event, so the output shows exactly how often each one happened."),
        challenge("chal_coding_bjm_212"),

        h2("6. Common mistakes"),
        bullets([
            "**Acknowledging first to \"avoid duplicates\".** It turns duplicates into lost jobs, which nobody notices until a learner asks where the certificate is. Spot it: the ack (or `job.moveToCompleted`, or `DeleteMessage`) is called before the work, or the queue is configured to auto-acknowledge on receive.",
            "**Check, then act, in two steps.** `if (!(await processed.has(key)))` followed by the side effect leaves a window for a second worker and does not survive a crash between the side effect and `processed.add(key)`. Spot it: the processed check and the side effect are not in one transaction, or the claim is a `SELECT` instead of an atomic insert.",
            "**Keying by job id when the producer can enqueue twice.** Redeliveries are caught; a retried enqueue is not. Spot it: duplicates in the data whose rows show two different job ids.",
            "**Catching every error and returning.** The handler logs the error and returns, so the queue marks the job done although nothing was written. Spot it: a `try/catch` around the whole handler with no rethrow; jobs \"completed\" with error logs.",
            "**A deduplication store that forgets too early.** Keys in Redis with a one-hour TTL, or in memory of one worker process. Spot it: duplicates that appear only for redeliveries after a long delay, or only when a different worker picks up the job.",
        ]),

        h2("7. Summary"),
        numbered([
            "A queue can deliver at least once or at most once. A worker can die between its side effect and its ack, so a job you care about will sometimes arrive twice.",
            "Make the effect happen once: prefer side effects that are idempotent by nature; otherwise record a processed key chosen from the business rule, claimed atomically in the same transaction as the side effect and its outbox event.",
            "Prove it with tests that deliver twice and crash in the middle, and keep a unique constraint and a duplicate query as the last line of defence.",
        ]),

        h2("Sources"),
        bullets([
            "Amazon SQS Developer Guide: at-least-once delivery of standard queues, and exactly-once processing in FIFO queues - docs.aws.amazon.com/AWSSimpleQueueService",
            "BullMQ documentation: Stalled jobs, and Workers - docs.bullmq.io",
            "PostgreSQL documentation: INSERT ... ON CONFLICT - postgresql.org/docs/current/sql-insert.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List the queue consumers in a service you know. For each one, write down its side effects and mark each as idempotent by nature or not. For every \"not\", write the rule in one sentence (\"at most one X per Y\"), derive the idempotency key from it and check whether the code claims that key in the same transaction as the side effect."),
    ],
});
