// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-2-2",
    title: "Visibility timeouts: when a slow job runs twice",
    slug: { _type: "slug", current: "visibility-timeouts-slow-job-runs-twice" },
    description:
        "A grading job that took 70 seconds sat in a queue with a 60-second visibility timeout. A second worker received it while the first was still grading, the learner got two results and lost one of five attempts. Learn what a visibility timeout (or a job lock) really is, why the queue cannot tell a slow worker from a dead one, how receipt handles stop an old delivery from acting on a new one, how to choose the timeout from measured durations, and how a heartbeat extends it while the work is still alive.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on the grading workers, CodeDev learning platform",
        problem:
            "A learner writes to support: one Run on the hidden tests of chal_coding_rdp_412 produced two grading results a minute apart, two \"Your submission was graded\" notifications, and the attempt counter jumped from 2 of 5 to 4 of 5. Only large submissions seem affected. The grading workers read submissions from an SQS-style queue whose visibility timeout is 60 seconds; nobody changed it since the queue was created.",
    },

    content: [
        h2("1. The incident: one submission, two gradings"),
        p("Submissions are graded asynchronously. `POST /submissions` stores the code and sends a message to the `grading` queue; a NestJS worker receives it, runs the hidden tests in the code runner, writes the result, notifies the learner and deletes the message. The worker logs for the reported submission:"),
        code("text", `
12:00:00.012 grader-1 received sub_4471 receiveCount=1 (challenge chal_coding_rdp_412, 80 hidden tests)
12:01:00.031 grader-2 received sub_4471 receiveCount=2 (challenge chal_coding_rdp_412, 80 hidden tests)
12:01:10.144 grader-1 graded sub_4471 in 70.1 s -> result r_9001, notification sent
12:01:10.162 grader-1 DeleteMessage sub_4471 (receipt from 12:00:00) -> 200
12:01:10.205 grader-1 received sub_4480 receiveCount=1 (challenge chal_coding_sql_214, 40 hidden tests)
12:02:10.377 grader-2 graded sub_4471 in 70.3 s -> result r_9002, notification sent
12:02:10.391 grader-2 DeleteMessage sub_4471 (receipt from 12:01:00) -> 200`, "grading worker logs"),
        p("Grader 2 received the message exactly 60 seconds after grader 1, while grader 1 was still running the tests. Nothing crashed. The queue did what it was configured to do: it waited 60 seconds for a delete, did not get one, and assumed grader 1 was gone."),

        h2("2. Read the evidence"),
        p("Two numbers explain the incident: the timeout of the queue and the duration of the jobs. The first is one command away:"),
        code("bash", `
aws sqs get-queue-attributes \\
  --queue-url https://sqs.eu-central-1.amazonaws.com/123456789012/grading \\
  --attribute-names VisibilityTimeout ApproximateNumberOfMessagesNotVisible

{
  "Attributes": {
    "VisibilityTimeout": "60",
    "ApproximateNumberOfMessagesNotVisible": "14"
  }
}`, "terminal"),
        p("The second comes from the workers' own records. Every grading run is stored with its duration, so the distribution is one query:"),
        code("sql", `
SELECT percentile_cont(ARRAY[0.5, 0.95, 0.99]) WITHIN GROUP (ORDER BY duration_ms) AS p50_p95_p99,
       max(duration_ms)                                                       AS max_ms,
       count(*) FILTER (WHERE duration_ms > 60000)                             AS over_timeout
FROM grading_runs
WHERE started_at > now() - interval '7 days';

     p50_p95_p99      | max_ms | over_timeout
----------------------+--------+--------------
 {24800,51200,69800}  | 118400 |          312`, "psql"),
        p("The median job is fine, but 312 runs in a week took longer than the timeout. Each of them could be received a second time while still running. Since the grading runs are written per delivery, the duplicates are easy to count: `SELECT submission_id FROM grading_runs GROUP BY submission_id HAVING count(*) > 1` returns roughly the same submissions."),

        h2("3. Core idea: a receive is a lease, not a hand-over"),
        p("When a worker receives a message, the queue does not give the message away. It **hides** it for the visibility timeout and gives the worker a **receipt handle** for this delivery. Three things can happen next:"),
        numbered([
            "**The worker deletes the message with its receipt handle** before the timeout ends. The job is done.",
            "**The worker extends the lease** (`ChangeMessageVisibility` in SQS) because the work is still going. The message stays hidden for a new period, counted from the moment of the call.",
            "**The timeout passes.** The message becomes visible again, the next receive delivers it with a receive count one higher and a **new** receipt handle.",
        ]),
        p("The queue cannot see inside your worker. A worker that is still grading and a worker whose pod was killed look the same from the queue's side: no delete has arrived. The timeout is the queue's only way to recover from dead workers, and the price is that a slow live worker is treated as dead. That is the trade-off behind every value you can choose:"),
        bullets([
            "**Too short** (below your slow jobs): slow jobs run twice or more, as in the incident. With several workers, a job that always takes longer than the timeout can run again and again until a maximum receive count moves it to a dead-letter queue (lesson 3.2).",
            "**Too long** (say one hour for a 30-second job): no duplicates from slowness, but a job whose worker crashed waits the full hour before anyone retries it. Learners wait for a result that is not being produced.",
        ]),
        h3("Receipt handles: only the current delivery may finish the job"),
        p("Each delivery gets its own receipt handle, and the handle of the latest delivery is the one that counts. Once grader 2 has received the message, grader 1's handle describes a lease that no longer exists. In Amazon SQS a delete with an older handle can return success without deleting the message, which is why both deletes in the log say 200. Queues that check the handle strictly reject it instead. Either way, an old delivery must not be able to delete, extend or release a message that a newer delivery is working on."),
        callout("info", "The same idea under other names",
            "Amazon SQS calls it a visibility timeout (30 seconds by default, up to 12 hours per message). BullMQ gives the worker a lock on the job (lockDuration, 30 seconds by default) that the worker renews automatically while it runs; if the lock expires, a stalled-job check moves the job back to waiting, and after maxStalledCount stalls it fails the job. RabbitMQ redelivers unacknowledged messages when the consumer's channel closes, and can time out a delivery that is never acknowledged. Defaults change between versions: check the documentation of the version you run."),

        challenge("chal_quiz_bjm_221"),

        h2("4. Worked example: choose the timeout, then add a heartbeat"),
        h3("Step 1: set the timeout from measured durations"),
        p("Start from the slowest jobs you actually see, not from the average. A timeout clearly above p99, with a margin for a slow node or a busy database, removes most duplicates on its own. For the grading queue, p99 is 70 seconds and the maximum 118 seconds, so 60 seconds was always going to fail. Note that AWS recommends, for a queue that triggers a Lambda function, a visibility timeout of at least six times the function's timeout: the margin is meant to be generous."),
        p("A long timeout alone still has the cost described above: if a grader crashes at second 5, the submission waits for the whole timeout. That is why long or variable jobs usually combine a moderate timeout with a heartbeat."),
        h3("Step 2: extend the lease while the work is alive"),
        p("A **heartbeat** is a timer in the worker that extends the visibility of the message it is working on, well before the current lease ends. While the worker lives, the message stays hidden; when the worker dies, the heartbeats stop and the message comes back after one short period."),
        code("typescript", `
// grading/grading.consumer.ts - AWS SDK v3 inside a NestJS provider
const HEARTBEAT_EVERY_MS = 20_000;     // a third of the lease: two missed beats before it ends
const LEASE_SECONDS = 60;
const MAX_LEASE_MS = 15 * 60_000;      // a run longer than this is stuck: stop extending

async handle(message: Message): Promise<void> {
  const startedAt = Date.now();
  let leaseLost = false;
  const heartbeat = setInterval(() => {
    if (Date.now() - startedAt > MAX_LEASE_MS) return clearInterval(heartbeat);
    this.sqs
      .send(new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
        VisibilityTimeout: LEASE_SECONDS,          // counted from now, not added to the old deadline
      }))
      .catch((error) => {
        leaseLost = true;                           // someone else may have the message now
        this.logger.warn({ error, messageId: message.MessageId }, "heartbeat failed");
      });
  }, HEARTBEAT_EVERY_MS);

  try {
    const result = await this.grader.grade(JSON.parse(message.Body!)); // runs in the code runner, not on this event loop
    if (leaseLost) this.logger.warn({ messageId: message.MessageId }, "finished after losing the lease");
    await this.results.saveOnce(result);                               // idempotent, lesson 2.1
    await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle }));
  } finally {
    clearInterval(heartbeat);
  }
}`, "grading.consumer.ts"),
        p("What each line protects:"),
        bullets([
            "**The interval is a fraction of the lease.** With a 60-second lease and a beat every 20 seconds, one slow or failed beat does not lose the message.",
            "**The extension is counted from now.** `ChangeMessageVisibility` sets a new timeout starting at the call; it does not add to the old deadline. A heartbeat that kept adding would hide the message of a crashed worker for far too long.",
            "**There is a ceiling.** A run that has gone on for 15 minutes is stuck in a loop or waiting on something that will not answer. Extending it forever hides the job from every other worker and from your alerts.",
            "**The result is saved idempotently anyway.** A heartbeat makes duplicates rare; it does not make them impossible. A beat can fail, a pod can pause for a long garbage collection, a network partition can cut the worker off. Lesson 2.1's processed-jobs check stays.",
            "**The work does not block the event loop.** The timer only fires when the event loop is free. Grading runs in the code runner service here; CPU-heavy work inside the worker process belongs in a worker thread or a child process (BullMQ calls these sandboxed processors), or the heartbeat and BullMQ's own lock renewal never get a chance to run.",
        ]),

        h2("5. How to verify it"),
        bullets([
            "**Test the lease rules on a fake clock.** Receive at 0, check that a second receive at 59,999 ms gets nothing and one at 60,000 ms gets the message with receive count 2; then check that the first delivery's handle can no longer delete it. That is the challenge below.",
            "**Watch the receive count.** Log `ApproximateReceiveCount` (SQS) or `attemptsStarted` / the stalled counter (BullMQ) on every delivery and alert on the share of deliveries with a count above 1. After the fix it should drop to the rate of real crashes.",
            "**Compare durations with the lease.** Keep the duration query from section 2 on a dashboard next to the configured timeout. When p99 creeps towards the timeout, raise the timeout or split the job before it becomes an incident.",
            "**Kill a worker on purpose.** In staging, stop a grader in the middle of a long job and time how long the message takes to come back. With a heartbeat it should be about one lease, not the job duration.",
        ]),
        p("In the challenge you build the queue side of this contract: receive hides a message and issues a receipt handle, ack deletes only with the current handle, extendVisibility is the heartbeat, and messages that are not acknowledged come back with a higher receive count. The test runner drives simulated workers on a fake clock, including the 70-second job, heartbeats and crashed workers, and prints the deliveries per message and every rejected ack."),
        challenge("chal_coding_bjm_222"),

        h2("6. Common mistakes"),
        bullets([
            "**A timeout copied from the default.** 30 seconds was chosen by the queue's authors, not from your jobs. Spot it: the queue's timeout is the default value and nobody can say what the job p99 is.",
            "**Raising the timeout to hours to \"fix\" duplicates.** Crashed jobs now wait hours for a retry. Spot it: a timeout far above the slowest job, and complaints about results that arrive very late after a deploy.",
            "**A heartbeat on a blocked event loop.** CPU-bound work in the same process starves the timer, so the lease expires anyway. Spot it: no heartbeat log lines during long runs; BullMQ jobs that end with \"job stalled more than allowable limit\".",
            "**Heartbeats without a ceiling.** A stuck job is extended forever and never reaches the retry or dead-letter path. Spot it: messages \"in flight\" for hours with a receive count of 1.",
            "**Acting on an old receipt.** An old delivery deletes, extends or releases the message after a newer delivery took it over. Spot it: two deletes for one message in the logs, or a message that disappears while a worker is still processing it.",
        ]),

        h2("7. Summary"),
        numbered([
            "A receive is a lease: the message is hidden for the visibility timeout and comes back if it is not deleted in time. The queue cannot tell a slow worker from a dead one.",
            "Choose the timeout from measured durations (well above p99), and for long or variable jobs extend the lease with a heartbeat counted from now, with a ceiling, from a process whose event loop is free.",
            "Only the current receipt handle may finish a delivery, and duplicates can still happen: keep the worker idempotent and watch the receive count.",
        ]),

        h2("Sources"),
        bullets([
            "Amazon SQS Developer Guide: Visibility timeout, and ChangeMessageVisibility - docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html",
            "BullMQ documentation: Stalled jobs, and Sandboxed processors - docs.bullmq.io",
            "AWS Lambda Developer Guide: using Lambda with Amazon SQS (visibility timeout and function timeout)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick a queue you run. Write down its visibility timeout or lock duration, then measure the p50, p99 and maximum duration of its jobs over a week. If p99 is above half the timeout, write the change you would make: a new timeout, a heartbeat with its interval and ceiling, or splitting the job, and how you would show on a dashboard that it worked."),
    ],
});
