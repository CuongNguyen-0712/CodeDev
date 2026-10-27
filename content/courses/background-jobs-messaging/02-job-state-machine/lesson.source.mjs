// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-1-2",
    title: "Job states that can't go wrong: queued, running, succeeded, failed",
    slug: { _type: "slug", current: "job-state-machine" },
    description:
        "A grading job was handed to a second worker after the first one stalled, and the first worker's late \"failed\" overwrote the second one's \"passed\". A cancelled course export still emailed its download link. Learn to model a job as a state machine with explicit transitions and terminal states, to make every transition a compare-and-set on state and owner, to count attempts where they happen, to separate a failure from the decision to retry, and to test that impossible transitions are rejected.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "A learner's submission s_88412 showed \"Passed, +30 XP\" for a few seconds and then flipped to \"Failed\". The XP stayed. The job log shows two workers graded the same job: w-3 stalled, the queue gave the job to w-7, w-7 saved \"passed\", and then w-3 woke up and saved \"failed\" over it. The same week an admin cancelled a 2 GB course export that had been started by mistake; twenty minutes later the instructor received an email with the download link anyway. Both workers end with an UPDATE that sets the status, whatever the status was before.",
    },

    content: [
        h2("1. The incident: the last writer wins"),
        p("Both jobs end the same way. The grading worker:"),
        code("typescript", `
// grading.processor.ts - the version that shipped
async process(job: Job<{ submissionId: string }>) {
    const submission = await this.submissions.findById(job.data.submissionId);
    const result = await this.sandbox.run(submission.challengeId, submission.code);
    await this.db.query(
        "UPDATE submissions SET status = $2, score = $3 WHERE id = $1",
        [submission.id, result.status, result.score],
    );
    if (result.status === "passed") await this.progress.awardXp(submission.userId, submission.challengeId);
}`, "grading.processor.ts"),
        p("The export worker writes `status = 'succeeded'` and sends the email. Neither one asks the question that matters: **is this job still mine, and is it still in a state where my result means something?** A worker that stalled, lost its lock or was cancelled has no right to write a final result, but the `UPDATE` does not know that. Whoever writes last wins."),

        h2("2. Read the evidence"),
        p("The job log for the grading job (BullMQ events, as written to the API's structured log):"),
        code("text", `
10:02:00.104  grade:s_88412  added
10:02:00.350  grade:s_88412  active   worker=w-3  attemptsStarted=1
10:02:05.000  w-3            event loop blocked 71 s (GC pause + sandbox I/O on a full disk)
10:03:00.351  grade:s_88412  stalled  lock expired, moved back to wait
10:03:00.902  grade:s_88412  active   worker=w-7  attemptsStarted=2
10:03:04.118  grade:s_88412  completed worker=w-7  result=passed  score=100
10:03:04.130  progress       awardXp u_2290 c_17 +30
10:03:11.640  submissions    UPDATE s_88412 status=failed (from w-3, rowCount=1)`, "worker.log"),
        p("And the export, from the admin audit log and the mail provider:"),
        code("text", `
14:20:12  admin u_0007  POST /admin/exports/x_311/cancel    -> 200 {"status":"cancelled"}
14:40:55  export-worker w-2  x_311 upload done (2.1 GB)
14:40:56  export-worker w-2  UPDATE exports SET status='succeeded' WHERE id='x_311'  rowCount=1
14:40:57  mail  "Your course export is ready" -> instructor u_0151   delivered`, "audit.log"),
        p("Two facts stand out. First, `rowCount=1` on both late writes: the database accepted a result from a worker that no longer owned the job (w-3) and for a job that had already ended (x_311). Second, the queue did its part correctly: it noticed that w-3 stopped renewing its lock and gave the job to another worker, which is what a queue should do (lesson 5 explains why this is unavoidable). The bug is in our code, which writes results without checking who is allowed to."),

        h2("3. The core idea: a job is a small state machine"),
        p("Write down the states a job can be in and the events that move it between them. Anything not in the table is rejected:"),
        code("text", `
state       event              -> new state    who may send it
---------   ----------------   ------------    ------------------------------
(none)      enqueue            -> queued       the API
queued      start(worker)      -> running      any worker (attempts + 1)
retrying    start(worker)      -> running      any worker (attempts + 1)
running     heartbeat(worker)  -> running      only the worker that owns it
running     succeed(worker)    -> succeeded    only the worker that owns it
running     fail(worker, kind) -> failed       only the worker that owns it
running     timeout            -> failed       the system (lease expired), counts as retryable
failed      retry-scheduled    -> retrying     the retry policy, only after a retryable failure
                                               and while attempts < max attempts
queued      cancel             -> cancelled    an admin or the user
running     cancel             -> cancelled
retrying    cancel             -> cancelled

succeeded and cancelled are terminal: no event leaves them.
failed is terminal unless the retry policy schedules a retry.`, "job-states.txt"),
        p("Every row answers a question the shipped code ignored:"),
        bullets([
            "**Who owns the attempt?** `start` records the worker. Only that worker may heartbeat, succeed or fail the job. After a `timeout` the owner is cleared, so the stalled worker's late result is **stale** and is rejected, even if it arrives while another worker is running the job.",
            "**Is the job over?** A cancelled or succeeded job does not come back. The export worker's `succeed` after a `cancel` is rejected, and so is the email that should only follow a successful transition.",
            "**Is a failure final?** `fail` records what happened (`retryable`: the sandbox host was restarted; `permanent`: the submission references a deleted challenge). Whether and when to try again is a separate decision, `retry-scheduled`, taken by the retry policy (lesson 3). Keeping them apart means a permanent failure can never be retried by accident, and a job that ran out of attempts stays `failed`.",
            "**How many times did it run?** Count attempts at `start`, the moment a worker really begins. Counting at enqueue or at retry-scheduled gives the wrong number for a job cancelled before it started, and the max-attempts rule uses this number.",
        ]),
        callout("info", "Your states versus the queue's states",
            "BullMQ keeps its own job states (waiting, active, delayed, completed, failed and a few more, see the docs for your version) and a lock per active job that the worker must keep renewing; when the lock expires, the job is treated as stalled and moved back to wait. SQS has no job states at all, only messages that become visible again after a timeout. The table above is your domain's state, stored in your database (a `jobs` table, or the `status` of a submission or an export). Keep it when users or admins see the status, can cancel, or when a result must never be overwritten. For a job nobody watches and whose effect is idempotent, such as recomputing the leaderboard, the queue's own state is often enough."),

        challenge("chal_quiz_bjm_121"),

        h2("4. Worked example: transitions as compare-and-set"),
        p("In the database every transition becomes one `UPDATE` whose `WHERE` clause is the \"from\" side of the table. If the row is not in the expected state, or not owned by this worker, the update touches zero rows and the transition is rejected. No locks, no read-then-write race between two workers:"),
        code("sql", `
-- start: claim a queued or retrying job; returns the new attempt number
UPDATE jobs
SET state = 'running', worker_id = $2, attempts = attempts + 1,
    lease_until = now() + interval '60 seconds', last_failure = NULL
WHERE id = $1 AND state IN ('queued', 'retrying')
RETURNING attempts;

-- succeed: only the owner of a running job
UPDATE jobs
SET state = 'succeeded', worker_id = NULL, finished_at = now()
WHERE id = $1 AND state = 'running' AND worker_id = $2;

-- timeout sweep: the system fails attempts whose lease expired
UPDATE jobs
SET state = 'failed', last_failure = 'retryable', worker_id = NULL
WHERE state = 'running' AND lease_until < now();

-- cancel: anything not finished
UPDATE jobs SET state = 'cancelled', worker_id = NULL
WHERE id = $1 AND state IN ('queued', 'running', 'retrying');`, "jobs.sql"),
        p("The worker treats `rowCount = 0` as \"you lost this job\" and does nothing else. The side effects that belong to a successful result (the XP, the email) run only after a transition that returned one row:"),
        code("typescript", `
// grading.processor.ts - results only count from the owner of a running job
async process(job: Job<{ submissionId: string }>) {
    const workerId = \`\${this.hostname}:\${job.id}:\${job.attemptsStarted}\`;   // unique per attempt
    const claimed = await this.jobs.start(job.data.submissionId, workerId);
    if (!claimed) return;                                   // cancelled or already running elsewhere

    const result = await this.sandbox.run(claimed.challengeId, claimed.code, {
        onProgress: () => this.jobs.heartbeat(claimed.id, workerId),   // extends lease_until
    });

    const won = result.ok
        ? await this.jobs.succeed(claimed.id, workerId, result)
        : await this.jobs.fail(claimed.id, workerId, result.retryable ? "retryable" : "permanent");
    if (!won) {
        this.logger.warn({ jobId: claimed.id, workerId }, "stale result discarded");
        this.metrics.increment("job_transition_rejected_total", { reason: "stale_worker" });
        return;
    }
    if (result.ok && result.status === "passed") await this.progress.awardXp(claimed.userId, claimed.challengeId);
}`, "grading.processor.ts"),
        p("Replay the incident against this code. w-3 claims the job with `worker_id = host-a:grade:s_88412:1`. The sweep times it out at 10:03:00 and clears the owner. w-7 claims it as attempt 2 and succeeds. When w-3 wakes up, its `succeed` or `fail` finds `state = 'succeeded'` and returns zero rows: no overwrite, no second XP. The export works the same way: after the cancel, the worker's `succeed` matches nothing, so the email is never sent."),
        h3("Cancelling a running job"),
        p("A transition to `cancelled` stops the result from counting; it does not stop the worker's CPU. For long jobs, the worker should check between steps (before uploading a 2 GB file, before each lesson of an export) whether its job is still `running` and owned by it, and stop early if not. The heartbeat is a natural place: when the heartbeat `UPDATE` returns zero rows, the job was cancelled or reassigned, and the worker can abort."),
        callout("warning", "A worker id must be unique per attempt",
            "If the owner is just the host name, a worker that restarts on the same host, or two attempts of the same job on one host, look like the same owner, and the stale check passes. Use something that changes with every attempt: the attempt number returned by the start update, a random token, or the queue's own lock token. This value is often called a fencing token."),

        h2("5. Model it in plain TypeScript"),
        p("The table is small enough to test exhaustively without a database. Write `applyEvent(jobs, event, maxAttempts)`, which applies one event to an in-memory map of jobs and either accepts it or returns the reason it was rejected. The runner replays a log of events from CodeDev's grading, certificate, leaderboard and export jobs and prints the rejected events and the final state of every job:"),
        challenge("chal_coding_bjm_122"),

        h2("6. How to verify"),
        bullets([
            "**Test the table, cell by cell.** Seven states (including \"no job\") times eight events is 56 cases. A table-driven test that tries every pair and checks accepted or rejected, with the reason, catches the transition someone adds by accident.",
            "**Race two workers.** In an integration test, run the `start` update for the same job from two connections at once. Exactly one must get a row back.",
            "**Pause a worker past its lease.** In staging, send `kill -STOP <pid>` to a worker during a long grading job, wait past the lease, then `kill -CONT`. The job must end with the other worker's result and the log must show \"stale result discarded\" once.",
            "**Ask the database for impossible states.** `SELECT state, count(*) FROM jobs WHERE (state = 'running') <> (worker_id IS NOT NULL) GROUP BY state;` must return no rows. A `CHECK` constraint can enforce the same rule, and `CHECK (state IN (...))` stops a typo such as `'succeded'` at write time.",
            "**Watch the rejection metric.** `job_transition_rejected_total` by reason should be close to zero. A steady stream of `stale_worker` means leases are too short for your jobs (lesson 5).",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**`UPDATE ... SET status = $2 WHERE id = $1`.** No \"from\" state, no owner: last writer wins. Spot it: any status update whose `WHERE` clause has only the id, and a status history where a final state changes again.",
            "**Checking the state but not the owner.** `WHERE state = 'running'` rejects writes after the end, but not a stale worker writing while the new owner is still running. Spot it: two different workers' results in the log for one job, both accepted.",
            "**Booleans instead of a state.** `is_done`, `is_failed`, `is_cancelled` allow `is_done AND is_cancelled`. Spot it: queries with three-column conditions to find \"really pending\" jobs.",
            "**Retrying after any failure.** A `failed` job goes straight back to `queued` without asking whether the failure was permanent or whether attempts are used up. Spot it: the same job id failing with the same validation error every few seconds (lesson 6).",
            "**Side effects before the transition.** The worker sends the email, then tries to mark the job `succeeded` and loses. Spot it: emails or XP for jobs whose final state is `cancelled` or owned by another worker. Commit the transition first, then do the effect (and make the effect idempotent, lesson 4).",
        ]),

        h2("8. Summary"),
        bullets([
            "Write the job's states and allowed events down as a table; succeeded and cancelled are terminal, and failed only leaves through a retry the policy allowed.",
            "Make every transition a compare-and-set on the expected state and, for worker events, on an owner id that is unique per attempt; zero rows updated means the worker lost the job and must do nothing more.",
            "Count attempts when a worker starts, record failures as retryable or permanent, and let a separate retry decision move a job from failed to retrying.",
        ]),

        h2("Sources"),
        bullets([
            "BullMQ documentation: job lifecycle, stalled jobs and job locks - docs.bullmq.io",
            "Amazon SQS Developer Guide: visibility timeout - docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html",
            "PostgreSQL documentation: UPDATE ... RETURNING and CHECK constraints - postgresql.org/docs/current/sql-update.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one background job in your own project and draw its state table. For each row, write the SQL (or the queue call) that performs it and the condition that rejects it. Then look for every place in the code that changes the job's status and check that each one has a \"from\" state and, for worker results, an owner in its WHERE clause."),
    ],
});
