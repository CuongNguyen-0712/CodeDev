// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-3-1",
    title: "Poison message & a growing queue: one bad job blocks 80,000",
    slug: { _type: "slug", current: "poison-message-growing-queue" },
    description:
        "One truncated test report reached the grading queue at 09:01 and by noon 80,000 submissions were waiting for a grade. Work through the course scenario like the on-call engineer: read the queue dashboard, the worker logs, the retry config and the message itself, name the cause (a poison message, unlimited retries and head-of-line blocking), rule out the two explanations everyone reaches for first (too few workers, a slow grader), choose a fix that bounds the damage of any bad message - max attempts, a dead-letter queue, an alert - and prove it with a replay.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on call for the grading workers, CodeDev learning platform",
        problem:
            "Wednesday 12:02. Support has 140 tickets with the same text: \"I submitted my solution this morning and it still says Grading...\". The grading dashboard shows the grade-submissions queue at 80,300 waiting submissions, up from about 200 at 09:00, and zero grades published since 09:03. The autoscaler added four grader workers at 10:15 and nothing changed. No deploy happened this morning.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario. When a learner presses **Submit** at https://app.codedev.test, `POST /submissions` on https://api.codedev.test stores the code, runs it in the sandbox, and enqueues a `grade-submissions` message with the test report. A NestJS worker reads each message, parses the report, computes the score and publishes the grade to the learner's progress and the leaderboard. Grading is a background job because the request must answer fast (lesson 1.1); results must be published in submission order because the leaderboard shows \"first to solve\"."),
        p("For months this ran at about 600 grades a minute with two workers and a queue that rarely held more than a few hundred messages. This morning it stopped. Nobody deployed anything, the database is healthy, the sandbox is up. The only thing that changed is **one message**."),
        p("Before you fix anything, collect the evidence and read it. The scenario is built so that the two most popular first reactions - \"scale the workers\" and \"the grader must be slow\" - are already in the evidence, and both are wrong."),

        h2("2. The evidence pack"),
        p("Four pieces of evidence, collected in the first ten minutes. The quiz refers to them by letter."),
        h3("A. The queue dashboard"),
        code("text", `
grade-submissions (FIFO, one message group "grading")
time    waiting   graded/min  oldest message age
09:00       200          598     3 s
09:05     1,535            0     3 min 07 s
09:30    12,660            0    28 min 16 s
10:00    26,010            0    58 min 02 s
10:15    autoscaler: grader-worker replicas 2 -> 6
10:30    39,360            0     1 h 28 min
11:00    52,710            0     1 h 58 min
12:02    80,300            0     3 h 00 min
submissions received: about 445 per minute all morning`, "Grafana, Queues > grade-submissions"),
        h3("B. The worker logs"),
        code("text", `
09:02:14.031 grader-worker-7c9f job=sub_8812 attempt=1 ERROR ParseError: Unexpected token '\\u0000' in JSON at position 4096
09:02:14.033 grader-worker-7c9f job=sub_8812 requeued at head of group "grading", next attempt in 30s (attempts: 1 of unlimited)
09:02:44.040 grader-worker-7c9f job=sub_8812 attempt=2 ERROR ParseError: Unexpected token '\\u0000' in JSON at position 4096
09:02:44.041 grader-worker-7c9f job=sub_8812 requeued at head of group "grading", next attempt in 30s (attempts: 2 of unlimited)
... the same two lines every 30 s ...
10:15:52.310 grader-worker-2d11 idle: message group "grading" is locked by an in-flight message
12:01:44.102 grader-worker-7c9f job=sub_8812 attempt=360 ERROR ParseError: Unexpected token '\\u0000' in JSON at position 4096`, "Loki, {app=\"grader-worker\"}, all replicas"),
        h3("C. The queue and consumer config"),
        code("yaml", `
queue: grade-submissions
type: fifo
messageGroupId: "grading"      # one group: results are published in submission order
consumer:
  concurrency: 1               # per message group
retry:
  attempts: 0                  # 0 = unlimited
  backoff: { type: fixed, delay: 30s }
  onFailure: requeue-head
deadLetterQueue: none
alerts: none on queue depth or message age`, "apps/worker/config/grade-submissions.yaml, as deployed"),
        h3("D. The message and the grader"),
        code("text", `
sub_8812: learner u_4471, lesson ts-generics, enqueued 09:01:58, body 9.8 MB
report.json: cut at 4,096 bytes and padded with NUL bytes (sandbox log writer, output over 4 MB)
time to fail one attempt: 38 ms
grader duration p50 before 09:02: 1.1 s; sandbox CPU since 09:02: 2%`, "queue browser and sandbox metrics"),

        h2("3. Reading the evidence"),
        p("One line per piece, describing what it **shows**, not what you expect it to show:"),
        bullets([
            "**A**: the waiting count grows by about 13,350 every 30 minutes, which is 445 a minute - exactly the arrival rate. Zero completions since 09:03. The oldest message is as old as the incident. The autoscaler event at 10:15 changes nothing in the curve.",
            "**B**: one job id, `sub_8812`, attempted every 30 s with an attempt counter that reaches 360 (three hours of attempts). Not a single other job id appears. A second replica says it is idle because the group is locked.",
            "**C**: one message group for every submission, one message in flight per group, unlimited attempts, a failed message goes back to the **head**, and there is nowhere else for it to go. No alert would have fired on depth or age.",
            "**D**: the message is broken in a way no retry can repair: the report is cut at 4 KB and filled with NUL bytes. The grader fails in 38 ms and the sandbox is idle.",
        ]),
        p("Notice the arithmetic in A. If the workers were slow, the queue would grow by arrivals **minus** completions. It grows by the full arrival rate, so completions are zero. That one subtraction already tells you the system is not overloaded; it is stopped."),

        h2("4. Hypothesis: a poison message with nowhere to go"),
        p("A **poison message** is a message that fails every time it is processed, because the problem is in the message (or in how the code handles it), not in the environment. A truncated report, a payload with a schema version the code does not know, a reference to a deleted user, an input that hits a bug in the parser. Retrying it changes nothing: the same bytes meet the same code."),
        p("A poison message on its own is a small problem: one learner gets no grade. It becomes an outage only when three conditions meet, and C shows all three:"),
        numbered([
            "**It never stops being retried.** `attempts: 0` means unlimited. The message has no way out of the queue except success, and success is impossible.",
            "**It keeps its place at the head.** `onFailure: requeue-head` puts it back in front, so it is always the next message.",
            "**Nothing may pass it.** A FIFO queue with a single message group and concurrency 1 allows one in-flight message for the whole queue. Everything behind the head waits, by design, to keep the order.",
        ]),
        p("This is **head-of-line blocking**: the first item in a line blocks everything behind it, even items that would succeed in a second. Follow it through the evidence: at 09:02:14 `sub_8812` fails (B), goes back to the head (C), the group stays locked while it waits 30 s for the next attempt (B, the idle replica), nothing is graded (A, zero per minute) and every new submission joins the tail (A, +445 per minute). The hypothesis explains every line of A to D, and the timing: the incident starts with the first attempt on the first broken message, not with a deploy."),
        h3("Rule out the tempting wrong ones"),
        p("Three explanations come up in every incident channel. Test each against the evidence before anyone acts on it:"),
        bullets([
            "**\"We need more workers.\"** The autoscaler already tried at 10:15 and A did not move. With one message group and one in-flight message per group, the maximum useful number of workers is one. The extra replicas log that they are idle (B). Scaling would help a queue that is *slow*; this one is *blocked*.",
            "**\"The grader is slow.\"** D says 38 ms per failing attempt and a sandbox at 2% CPU. A slow grader produces a lower graded/min, not zero, and a backlog that grows by the difference between arrivals and completions. Here the difference is the full arrival rate.",
            "**\"Use exponential backoff.\"** Backoff spaces out retries of failures that go away by themselves: a timeout, a 503, a lock (lesson 1.3). This failure is in the bytes of the message. With `requeue-head`, a longer delay only means the head waits longer before failing again, and the group stays locked the whole time.",
        ]),
        callout("info", "Mitigate first, then fix",
            "While you prepare the fix, unblock the queue by hand: copy sub_8812's body to a safe place (it is the evidence), then delete that one message from the queue. Grading resumes within seconds and the backlog drains at the workers' real speed. This is mitigation, not a fix: the next truncated report, maybe in an hour, blocks everything again. Write down the time of the deletion; the backlog curve after it is part of your verification."),

        h2("5. The fix: bound the damage of any bad message"),
        p("The goal is not to make `sub_8812` succeed - its report is gone. The goal is that **no single message can stop the queue**, whatever is wrong with it. Write down the requirements from the evidence before choosing the code:"),
        bullets([
            "A message that fails for a passing reason (a sandbox timeout) still gets a few attempts.",
            "A message that keeps failing leaves the main queue after a fixed number of attempts.",
            "It is not thrown away: it is kept with its body, attempt count and last error, so someone can look at it and replay it later.",
            "Someone is told, quickly, without having to watch a dashboard.",
            "The next message is processed right after, and the order of the other messages is unchanged.",
        ]),
        p("Those five lines are the standard answer: **max attempts, then a dead-letter queue (DLQ), plus an alert on the DLQ**. In SQS terms this is a redrive policy on the source queue; the DLQ of a FIFO queue must itself be FIFO:"),
        code("json", `
{
  "RedrivePolicy": {
    "deadLetterTargetArn": "arn:aws:sqs:eu-west-1:123456789012:grade-submissions-dlq.fifo",
    "maxReceiveCount": 3
  },
  "VisibilityTimeout": 30
}`, "grade-submissions.fifo attributes (SQS-style; check the current SQS docs for your setup)"),
        p("Each receive counts; after the third receive that ends without a delete, the broker moves the message to the DLQ and the message group is free again. In the NestJS worker the processor just throws on failure and the broker does the counting. With BullMQ, which has no built-in DLQ, you set `attempts` and move the job yourself when the last attempt fails:"),
        code("typescript", `
// apps/worker/src/grading/grading.processor.ts (BullMQ via @nestjs/bullmq; check the current BullMQ docs)
@Processor("grade-submissions")
export class GradingProcessor extends WorkerHost {
  constructor(
    @InjectQueue("grade-submissions-dlq") private readonly dlq: Queue,
    private readonly grader: GraderService,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<GradeSubmission>): Promise<void> {
    await this.grader.grade(job.data); // throws ParseError, ValidationError, GraderTimeout...
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job<GradeSubmission>, error: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1; // queue default: { attempts: 3, backoff: { type: "fixed", delay: 30_000 } }
    if (job.attemptsMade < maxAttempts) return; // the broker will retry it

    await this.dlq.add(
      "dead",
      {
        original: job.data,
        jobId: job.id,
        attempts: job.attemptsMade,
        lastError: \`\${error.name}: \${error.message}\`,
        failedAt: new Date().toISOString(),
      },
      { jobId: job.id }, // one DLQ entry per job, even if this handler runs twice
    );
    this.metrics.increment("queue_dead_lettered_total", { queue: "grade-submissions" });
  }
}`, "grading.processor.ts"),
        p("And the alert, because a DLQ that nobody watches turns a loud outage into a silent loss of grades:"),
        code("yaml", `
# alert rules (Prometheus-style; SQS exposes the same numbers as CloudWatch metrics)
- alert: GradeSubmissionsDeadLetters
  expr: queue_depth{queue="grade-submissions-dlq"} > 0
  for: 1m
  labels: { severity: ticket }
- alert: GradeSubmissionsStuck
  expr: queue_oldest_message_age_seconds{queue="grade-submissions"} > 300
  for: 5m
  labels: { severity: page }`, "alerts/grading.yaml"),
        p("The second rule is the one that would have paged at 09:07 instead of support noticing at noon. Age of the oldest message is the best single signal for a blocked queue: depth also grows when traffic is just high, but age only grows when the head is not moving (lesson 4.1)."),
        h3("When not to, and what to choose instead"),
        bullets([
            "**How many attempts?** Enough to ride out the passing failures you have seen, few enough that a blocked group recovers fast. With a 30 s delay, 3 attempts block a FIFO group for about a minute per poison message. 50 attempts would block it for 25 minutes each time.",
            "**Do you need one group for everything?** The order that matters here is per learner (\"first to solve\" compares submission times, which the message carries). With `messageGroupId = learnerId`, a poison message blocks only its own learner's group, and different learners are graded in parallel. Keep a single group only if the business rule truly needs one global order.",
            "**Errors that can never succeed** (a `ParseError` on a truncated body) do not need three attempts at all; lesson 2.3 sends them to the DLQ on the first failure. Max attempts is the safety net for everything you did not classify.",
        ]),

        challenge("chal_quiz_bjm_311"),

        h2("6. The challenge: replay the incident on a fake clock"),
        p("The code runner has no broker, so the challenge brings a small FIFO queue on a fake clock that follows the rules of evidence C. You change one function; the rest is the stage:"),
        bullets([
            "**`workOnce(worker, now)`** is called once per second. It may only attempt the message at the head, and only if the head is not waiting for a retry (`notBefore > now`). That is concurrency 1 with strict order.",
            "**The grader** parses the report and throws `ParseError`, `ValidationError` or `GraderTimeout`. A body can ask the sandbox to time out on its first N attempts, so you can see a passing failure succeed on a retry.",
            "**The runner** adds arrivals each second, calls `workOnce`, and prints what an on-call engineer would look at: the processed order with the second of each grade, the dead-letter list, the queue depth over time and what is left at the head.",
        ]),
        p("Run the starter first. The head shows the same message with a growing attempt count and the depth only goes up: the dashboard from evidence A, in a few lines. Then apply the retry policy from the description and watch the depth fall."),
        challenge("chal_coding_bjm_312"),

        h2("7. How to verify the fix"),
        p("\"The queue is draining\" after you deleted `sub_8812` by hand proves the mitigation, not the fix. Verify that the **next** poison message cannot block the queue:"),
        bullets([
            "**Replay the real payload on staging.** Send sub_8812's saved body, then 1,000 normal submissions. Expected: three attempts about 30 s apart, the message in the DLQ with `ParseError` as the last error about 60 s after the first attempt, all 1,000 graded in submission order after it, the DLQ alert firing.",
            "**A unit test on a fake clock** like the challenge: one poison message between good ones, assert the processed order, the DLQ entry (attempts, last error) and that the depth reaches zero. Add one message that times out once and assert it is graded, not dead-lettered: this catches the \"dead-letter on the first failure\" overcorrection.",
            "**Production after the deploy.** Oldest message age back to seconds, graded/min back near 600 until the backlog is gone and then equal to arrivals, DLQ depth at 0 or a few messages, each of which someone looks at.",
        ]),
        code("typescript", `
// grading.consumer.spec.ts - fake clock, no broker
it("parks a poison message after 3 attempts and grades the rest in order", () => {
  const w = worker([good("s1"), poison("s2"), good("s3"), timesOutOnce("s4")]);
  runUntil(w, 120); // seconds

  expect(w.processed).toEqual(["s1@0", "s3@62", "s4@93"]);
  expect(w.dlq).toEqual([{ id: "s2", attempts: 3, lastError: expect.stringMatching(/^ParseError/), at: 61 }]);
  expect(w.queue).toHaveLength(0);
});`, "grading.consumer.spec.ts"),

        h2("8. Common mistakes with poison messages"),
        bullets([
            "**Scaling a blocked queue.** More workers help a slow queue, never a blocked one. Spot it: graded/min at zero (not low), and new replicas logging that they are idle or waiting for a lock.",
            "**Unlimited retries \"to be safe\".** Retrying forever is how one message becomes 80,000 late grades. Spot it: `attempts: 0`, `-1`, `Infinity` or no limit at all in the queue config; an attempt counter in the logs in the hundreds.",
            "**A DLQ without an alert or an owner.** Messages go in and nobody looks: learners silently never get a grade. Spot it: DLQ depth that only ever grows, no alert rule naming the DLQ, no runbook.",
            "**Dead-lettering on the first failure of any kind.** It stops the blocking and also gives up on every sandbox timeout. Spot it: DLQ entries whose last error is a timeout or a 503 and that succeed when replayed unchanged.",
            "**Fixing the one message and calling it done.** Deleting `sub_8812` unblocks today; the next truncated report blocks tomorrow. Spot it: the postmortem's fix list contains \"deleted the message\" and no config or code change.",
        ]),

        h2("9. Summary"),
        numbered([
            "A poison message fails every time because the problem is in the message. It becomes an outage when unlimited retries, requeue-at-head and strict ordering with concurrency 1 come together: head-of-line blocking.",
            "Read the queue arithmetic: growth equal to the arrival rate and zero completions means blocked, not slow, so more workers and backoff cannot help.",
            "Bound the damage of any bad message: max attempts, a dead-letter queue that keeps the body and the last error, an alert on DLQ depth and on oldest message age, and a replay of the real payload as proof.",
        ]),

        h2("Sources"),
        bullets([
            "Amazon SQS Developer Guide: dead-letter queues and redrive policy (maxReceiveCount), FIFO queues and message groups - docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/",
            "Amazon SQS Developer Guide: visibility timeout - docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html",
            "BullMQ documentation: retrying failing jobs (attempts, backoff) and worker events - docs.bullmq.io",
        ]),
        callout("tip", "Self-practice (not graded): write the runbook for draining a DLQ",
            "Write the runbook an on-call engineer follows when the GradeSubmissionsDeadLetters alert fires, in at most fifteen lines. Cover: how to list the dead messages and group them by last error; how to decide, per group, between fix-and-redrive, replay after a data repair, and discard with a note to the learner; who must approve a discard; how fast to redrive so the main queue is not flooded; how to confirm each redriven message was processed; and what to write in the incident log. Lesson 3.2 builds the redrive tool this runbook relies on."),
    ],
});
