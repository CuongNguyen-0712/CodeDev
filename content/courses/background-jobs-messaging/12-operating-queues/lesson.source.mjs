// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-4-3",
    title: "Operating queues: alerts, runbooks & backpressure",
    slug: { _type: "slug", current: "operating-queues-alerts-runbooks-backpressure" },
    description:
        "In one week the email queue stalled for three hours without a page, a deploy killed certificate jobs halfway through, and a payload change sent 214 jobs to the dead-letter queue. Learn to alert on the age of the oldest message and on dead-letter growth instead of depth, to write a runbook an on-call engineer can follow at 02:00, to push back on producers when a queue is too far behind, to shut workers down without losing or repeating work, and to change job payloads safely while old and new code run side by side.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, owner of the CodeDev worker platform",
        problem:
            "The weekly operations review has three items, all on queues. On Thursday night the SMTP credentials of the email worker expired at 01:10 and nobody noticed until a learner wrote to support at 08:30 that her password-reset email had never arrived; the only queue alert, on depth above 1,000, never fired. On Friday morning a rolling deploy restarted the certificate workers, and several learners received their certificate email twice. An hour later the next release renamed a field in the certificate job, and the dead-letter queue filled with jobs the old workers could not read. Each incident had a different trigger; all three were operational gaps, not bugs in a single job.",
    },

    content: [
        h2("1. The incident: three gaps in one week"),
        p("Put the three items side by side and the pattern is clear. The workers were mostly fine. What was missing was the operating layer around them:"),
        bullets([
            "**Detection.** A queue that stopped moving produced no signal, because the only alert counted jobs, and a stuck email queue at night has few jobs.",
            "**Lifecycle.** The workers were stopped the way any process is stopped, without any thought for the job in their hands.",
            "**Contracts.** A job payload written by one version of the code was read by another version, and nobody had treated it as an interface.",
        ]),
        p("Lessons 10 and 11 gave you the numbers (age, wait time, throughput) and the capacity model. This lesson turns them into the things that keep a queue boring in production: alerts, runbooks, backpressure, graceful shutdown and versioned payloads."),

        h2("2. Read the evidence"),
        p("The only queue alert, and what the email queue looked like on Thursday night:"),
        code("yaml", `
# alerts/queues.yaml - before
- alert: QueueBacklog
  expr: queue_depth > 1000
  for: 5m
  labels: { severity: page }`, "alerts/queues.yaml"),
        code("text", `
time    queue   depth  oldest_age  dlq_depth  worker log
01:05   emails      4       2 s        0
01:15   emails     11      5 min       0      535 5.7.8 Authentication credentials invalid  (attempt 1/8)
02:00   emails     18     50 min       0      535 5.7.8 Authentication credentials invalid  (attempt 3/8)
04:20   emails     30   3 h 10 min     6      535 5.7.8 ... attempt 8/8 -> DLQ
08:30   (support ticket: "reset email never arrived")`, "emails queue, Thursday night"),
        p("Every row shows a queue in trouble. The depth never came close to 1,000, so the alert was right by its own definition and useless in practice. Two other columns told the story from 01:15: the oldest age, climbing a minute per minute, and later the dead-letter queue, which started receiving jobs that had used up their retries (lesson 8)."),

        h2("3. Alerts that mean \"someone must act\""),
        p("A page should fire when users are, or are about to be, affected, and stay quiet otherwise. For queues that means two signals per queue, each with its own threshold:"),
        numbered([
            "**Age of the oldest waiting message above the queue's SLO.** This catches a stopped consumer, a slow downstream and a capacity shortfall, whatever the depth. The SLO is per queue: 2 minutes for grading, 15 for emails, 6 hours for a nightly export.",
            "**Growth of the dead-letter queue.** A message in the DLQ is a job that will not run again until a person acts. Alert on messages entering it (an increase over a window), not only on its total size, so a slowly filling DLQ is noticed on day one rather than when it reaches some round number.",
        ]),
        code("yaml", `
# alerts/queues.yaml - after (Prometheus rules; one SLO per queue from a recording rule)
- alert: QueueTooOld
  expr: queue_oldest_age_seconds > on(queue) queue_age_slo_seconds
  for: 5m
  labels: { severity: page }
  annotations:
    summary: "{{ $labels.queue }}: oldest job is {{ $value | humanizeDuration }} old"
    runbook: "https://wiki.codedev.test/runbooks/queue-too-old"

- alert: DeadLetterGrowing
  expr: increase(queue_dead_lettered_total[15m]) > 0
  labels: { severity: ticket }      # page instead for queues where one lost job matters (payments)
  annotations:
    runbook: "https://wiki.codedev.test/runbooks/dead-letter-growing"`, "alerts/queues.yaml"),
        p("Depth keeps a place on the dashboard, and in the backpressure limit of section 5, but not on the pager. An alert on depth alone fires on every harmless evening peak, people learn to ignore it, and it still misses a small queue that has stopped."),
        h3("When not to page"),
        bullets([
            "**Batch queues during their window.** An export that is allowed to run until 06:00 should not page at 01:00 because its oldest job is an hour old. Its SLO says 6 hours.",
            "**Retries that are working.** A few jobs retrying after a downstream blip are what retries are for. Page on the age they cause or on the DLQ, not on each failed attempt.",
            "**Anything with no action.** If the runbook for an alert says \"wait and see\", make it a ticket or a dashboard annotation instead of a page.",
        ]),

        h2("4. Runbooks: the alert's second half"),
        p("At 02:00 the on-call engineer may never have touched the email worker. Every alert links to a runbook that answers four questions in order. Keep it short enough to read on a phone:"),
        code("text", `
RUNBOOK  QueueTooOld

What it means
  The oldest waiting job in <queue> is older than its SLO. Users are waiting for that queue's work.

First checks (5 minutes)
  1. Are workers running and taking jobs?    dashboard "Workers": active slots, completed/min
  2. Is a downstream failing?                worker error log grouped by message (SMTP, code runner, DB)
  3. Did something change?                   deploy log and feature flags of the last 2 hours
  4. Is one tenant flooding the queue?       depth by tenant / lane (lesson 11)

Actions
  - Workers down after a deploy: roll back.
  - Downstream failing for every job: fix it or fail over; do not add workers (more failures, same backlog).
  - Capacity short and downstream healthy: raise replicas up to the downstream limit (lesson 11).
  - Bulk tenant flooding: pause the bulk lane or its producer.

Done when
  Oldest age is back under the SLO and DLQ growth is 0. Then redrive any dead-lettered jobs (runbook: dead-letter-growing).`, "runbooks/queue-too-old"),
        p("A runbook is tested like code: walk through it during a game day in staging, with someone who did not write it, and fix every step where they had to ask a question."),

        h2("5. Backpressure: stop accepting work you cannot do in time"),
        p("A queue absorbs short bursts. It does not create capacity. If producers keep adding jobs while the consumers are down or far behind, the backlog grows until the jobs are useless when they finally run (a grading result for a learner who left an hour ago) and recovery takes hours longer than the outage. Backpressure tells the producer to slow down while the queue is too far behind:"),
        code("typescript", `
// api/routes/regrade.ts - bulk work is refused while its lane is too far behind
const BULK_MAX_AGE_SEC = 900;
const BULK_MAX_DEPTH = 50_000;

app.post("/courses/:id/regrade", async (req, res) => {
    const lag = await queueStats.get("grading-bulk");              // depth and oldest age, cached for 10 s
    if (lag.oldestAgeSec > BULK_MAX_AGE_SEC || lag.depth > BULK_MAX_DEPTH) {
        res.set("Retry-After", "600");
        return res.status(429).json({ error: "queue_busy", message: "Regrades are paused for a few minutes, try again later." });
    }
    const count = await regradeCourse(req.params.id, bulkQueue);
    return res.status(202).json({ queued: count });
});`, "api/routes/regrade.ts"),
        bullets([
            "**Refuse early, before work is accepted.** Once the API has answered 202, the job is a promise. Rejecting at the door with a 429 or 503 and a `Retry-After` keeps every accepted job meaningful.",
            "**Shed the least important work first.** Pause regrades, imports and backfills long before you touch learners' submissions. For interactive work, prefer degrading (\"grading is delayed, we will notify you\") over refusing.",
            "**Bound the queue, but never drop silently.** A maximum depth with an explicit error is backpressure. A queue that discards the oldest jobs when full, without telling anyone, is data loss.",
        ]),

        h2("6. Graceful shutdown: finish or release what you hold"),
        p("Deploys, autoscaling and node maintenance stop workers many times a day. On Kubernetes a pod receives `SIGTERM`, and after `terminationGracePeriodSeconds` (30 seconds by default) it receives `SIGKILL`. A worker that exits on the first signal abandons the job in its hands: the broker redelivers it only after the visibility timeout or lock expires (lesson 5), and any side effect it already performed will be performed again on the next run. A graceful worker does three things:"),
        numbered([
            "**Stop taking new jobs** as soon as the signal arrives.",
            "**Finish in-flight jobs** within a deadline comfortably shorter than the grace period.",
            "**Release what it cannot finish**, so another worker can take it at once instead of after the visibility timeout. With SQS, set the message's visibility timeout to 0 (`ChangeMessageVisibility`); with BullMQ, `worker.close()` waits for active jobs to complete, so keep jobs shorter than the grace period or split them.",
        ]),
        code("typescript", `
// workers/certificates.ts - SQS-style loop with a graceful stop
const stopping = new AbortController();
const inFlight = new Map<string, { message: Message; done: Promise<void> }>();   // by message id

process.on("SIGTERM", () => stopping.abort());                     // 1. stop taking new jobs

async function run(): Promise<void> {
    while (!stopping.signal.aborted) {
        const messages = await sqs.receive({ max: 4, waitSeconds: 10, signal: stopping.signal }).catch(() => []);
        for (const m of messages) {
            const done = handle(m)                                  // idempotent steps (lessons 4 and 9)
                .then(() => sqs.delete(m))
                .catch((error) => log.warn("job failed, the queue will retry it", { id: m.id, error }))
                .finally(() => inFlight.delete(m.id));
            inFlight.set(m.id, { message: m, done });
        }
    }
    // 2. finish what we hold, but stop well before SIGKILL (grace period 30 s)
    const allDone = Promise.all([...inFlight.values()].map((j) => j.done));
    await Promise.race([allDone, new Promise((resolve) => setTimeout(resolve, 20_000))]);
    // 3. release anything still running so it is redelivered now, not in 15 minutes
    await Promise.all([...inFlight.values()].map((j) => sqs.changeVisibility(j.message, 0)));
    process.exit(0);
}`, "workers/certificates.ts"),
        callout("warning", "Graceful shutdown reduces duplicates; it does not remove them",
            "A pod can still be killed by an out-of-memory error or a node failure with no signal at all. Releasing a job that already sent its email means the next worker runs it again. Graceful shutdown makes redelivery fast and rare; only idempotent steps make it harmless."),

        h2("7. Changing a job payload while old and new code both run"),
        p("A job is a message from the code that enqueued it to the code that will run it, possibly days later: delayed jobs, retries with backoff and the DLQ all keep old payloads alive. During a rolling deploy, old and new workers and old and new producers run at the same time. Treat the payload as a versioned contract:"),
        code("typescript", `
// jobs/certificatePayload.ts
type CertificateJobV1 = { userId: string; courseId: string };               // no "v": written by v41 and earlier
type CertificateJobV2 = { v: 2; learnerId: string; courseId: string };

export function parseCertificateJob(raw: unknown): { learnerId: string; courseId: string } {
    const p = raw as Partial<CertificateJobV1 & CertificateJobV2>;
    if (p.v === 2 && typeof p.learnerId === "string" && typeof p.courseId === "string") {
        return { learnerId: p.learnerId, courseId: p.courseId };
    }
    if (p.v === undefined && typeof p.userId === "string" && typeof p.courseId === "string") {
        return { learnerId: p.userId, courseId: p.courseId };
    }
    // unknown version or broken payload: retrying cannot fix it (lesson 6) - dead-letter at once
    throw new NonRetryableError(\`unsupported certificate payload: v=\${String(p.v)}\`);
}`, "jobs/certificatePayload.ts"),
        p("Then roll out the change in an order where no version ever meets a payload it cannot read:"),
        numbered([
            "**Expand the consumers.** Release workers that read both v1 and v2. Wait until every worker runs it.",
            "**Switch the producers.** Release the code that writes v2.",
            "**Drain the old shape.** Wait until no v1 payload is left anywhere: the queue, delayed and scheduled jobs, retries in backoff, and the DLQ (redrive or archive those).",
            "**Contract.** Remove v1 support in a later release.",
        ]),
        p("If producer and consumer ship in one image, steps 1 and 2 are two releases of that image, with the producer change behind a flag that you turn on after the first release is everywhere."),
        challenge("chal_quiz_bjm_431"),

        h2("8. How to verify the operating layer"),
        bullets([
            "**Fire every alert on purpose.** In staging, stop the email workers and confirm `QueueTooOld` pages after the SLO plus 5 minutes; send one job that always fails and confirm `DeadLetterGrowing` fires when it lands in the DLQ. An alert that has never fired is an assumption.",
            "**Kill a worker mid-job.** Send `SIGTERM` to a worker while a slow test job runs: the job must either complete before exit or reappear in the queue within seconds (check its receive count or attempts), and it must not produce a second side effect.",
            "**Load the producer past the limit.** Push the bulk lane over its backpressure limit and confirm the API answers 429 with `Retry-After`, while learner submissions are still accepted.",
            "**Mix versions in a test.** Run the parser against a fixture of every payload version still in production (copy a few real ones from the queue and the DLQ) and in CI against the next release before it ships.",
        ]),

        h2("9. Common mistakes"),
        bullets([
            "**Paging on depth.** Spot it: the alert fires at the same hour every busy day and resolves by itself, while real stalls are found by support.",
            "**A DLQ nobody watches.** Spot it: the DLQ's oldest message is weeks old, and nobody can say what is in it.",
            "**`process.exit()` on SIGTERM.** Spot it: duplicate side effects and jobs that reappear about one visibility timeout after each deploy.",
            "**Unbounded acceptance.** Spot it: after an outage the backlog takes many times longer to drain than the outage lasted, and the oldest jobs are no longer useful when they run.",
            "**Changing producer and consumer in one step.** Spot it: a burst of parse or validation errors in workers right after a deploy, and DLQ messages that all carry the new payload shape.",
        ]),

        h2("10. Summary"),
        bullets([
            "Page on the age of the oldest message per queue SLO and on dead-letter growth, each linked to a runbook with checks, actions and a definition of done; keep depth for dashboards and backpressure.",
            "Apply backpressure at the producer: refuse or delay the least important work with 429 and Retry-After before the backlog makes jobs useless.",
            "Stop workers gracefully (stop taking, finish within the grace period, release the rest) and version job payloads, expanding consumers before producers and removing old versions only when none remain.",
        ]),

        h2("Sources"),
        bullets([
            "Amazon SQS Developer Guide: visibility timeout and ChangeMessageVisibility, dead-letter queues and redrive - docs.aws.amazon.com/AWSSimpleQueueService",
            "Kubernetes documentation: Pod lifecycle, termination of Pods (SIGTERM, terminationGracePeriodSeconds) - kubernetes.io/docs",
            "BullMQ documentation: graceful shutdown (worker.close) and stalled jobs - docs.bullmq.io (check the current version)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one queue you own and write its runbook in the four parts above, with an age SLO and a DLQ alert. Then run a game day in staging: stop its consumer, expire a downstream credential, and deploy a payload change, and time how long each takes to be noticed and fixed with only the runbook in hand."),
    ],
});
