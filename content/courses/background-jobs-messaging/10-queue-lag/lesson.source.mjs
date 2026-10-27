// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-4-1",
    title: "Measuring queue lag & age",
    slug: { _type: "slug", current: "measuring-queue-lag-age" },
    description:
        "The grading queue looked normal on the depth chart while learners waited six minutes for a result. Learn the four numbers every queue needs - depth, age of the oldest waiting job, wait time and processing time - why depth alone hides delay, why a wait time recorded at dequeue goes blind when the queue is stuck, how to compute nearest-rank percentiles per queue and per minute from an event log with duplicates and out-of-order lines, and how to set a per-queue SLO on age.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "On Monday at 18:40 support forwards eleven tickets in ten minutes: \"My submission has said Grading... for five minutes.\" The on-call dashboard for the grading queue shows a depth of about 240 jobs, the same as at 17:40, and far below the alert threshold of 1,000. No alert fired. Two of the eight grading workers had been crash-looping since 18:05 and the code runner was answering slowly, so the queue drained at a tenth of its normal speed. The team had measured how many jobs were waiting, but never how long they had been waiting.",
    },

    content: [
        h2("1. The incident: a normal-looking queue and a six-minute wait"),
        p("Every submission on https://app.codedev.test becomes a job on the `grading` queue. A grading worker takes the job, sends the learner's code to the code runner, stores the result and pushes it to the learner's browser. On a normal evening a learner sees the result one or two seconds after clicking Submit."),
        p("This is the only queue panel the on-call team had, and the alert attached to it:"),
        code("yaml", `
# alerts/queues.yaml - the version in production on Monday
- alert: GradingQueueBacklog
  expr: queue_depth{queue="grading"} > 1000
  for: 5m
  labels: { severity: page }`, "alerts/queues.yaml"),
        p("At 18:40 the depth was 238. At 17:40 it had been 240. The alert stayed green, and the panel looked like every other Monday evening. Yet the learners in the tickets were right: their submissions had been waiting for minutes. A count of waiting jobs cannot tell you that, because it says nothing about **how fast those jobs are leaving**."),
        p("The fix for the workers was quick (roll back the image that crash-looped, raise the code runner's pool back to normal). The fix this lesson is about is the one that stops the next incident from being discovered by support: measure the delay itself."),

        h2("2. Read the evidence: count, rate and age"),
        p("The workers write one line per job event. These are the lines for one submission that evening, pulled with `grep sub-88412` from the worker logs:"),
        code("text", `
2026-10-19T18:34:28Z enqueue  grading sub-88412
2026-10-19T18:40:31Z dequeue  grading sub-88412
2026-10-19T18:40:40Z complete grading sub-88412`, "worker-events.log"),
        p("Three timestamps give two durations: the job **waited** 6 minutes 3 seconds in the queue and was **processed** in 9 seconds. The processing time was slower than usual but not dramatic; the wait was the problem. Now compare two ways of describing the queue at 18:40:"),
        bullets([
            "**Depth: about 240 jobs.** True, and useless on its own. 300 jobs drained at 600 per minute is a 30-second wait; the same 300 jobs drained at 30 per minute is a ten-minute wait. The depth panel draws both as the same line.",
            "**Age of the oldest waiting job: about 6 minutes.** This one number says what learners experience right now, and it does not depend on knowing the throughput.",
        ]),
        p("The relationship between the two is worth remembering as a rule of thumb: the time a new job will wait is roughly **depth divided by throughput**. A depth chart only means something next to a throughput chart, and even then you have to do the division in your head at 18:40 on a Monday. The age of the oldest job does the division for you."),

        h2("3. Four numbers per queue, and what each one hides"),
        p("Measure each queue separately (grading, emails, certificates have very different normal values) and keep these four numbers:"),
        numbered([
            "**Depth** - jobs waiting to be taken. Useful for capacity planning and for the backpressure limit of lesson 12. It hides delay: the same depth can mean seconds or hours.",
            "**Age of the oldest waiting job** - `now - enqueuedAt` of the job at the front of the line, sampled on a timer. The best single signal of a stuck or slow queue: when nothing is taken, it climbs by exactly one minute per minute. It hides how many jobs are affected, which is what depth is for.",
            "**Wait time (queue time)** - `dequeuedAt - enqueuedAt` for each job, as percentiles per minute. It describes what jobs that started actually experienced. It hides jobs that are still waiting: it is recorded only when a job leaves the queue.",
            "**Processing time (service time)** - `completedAt - dequeuedAt`. It tells you whether the workers got slower (a slow code runner) or the queue got longer (more arrivals, fewer workers). It is the number you need for scaling in lesson 11.",
        ]),
        p("Also keep **in flight**: jobs taken by a worker and not yet finished. They are not waiting, so they do not belong in depth or in the oldest age. SQS reports them separately as `ApproximateNumberOfMessagesNotVisible`, next to `ApproximateNumberOfMessagesVisible` (waiting) and `ApproximateAgeOfOldestMessage`."),
        h3("Why the oldest age, and not the wait-time percentile, goes on the alert"),
        p("A wait time is observed at the moment a worker takes a job. If every worker stops, nothing is taken, and the wait-time panel goes quiet or keeps its last healthy value, exactly while the queue is at its worst. This is survivor bias: you only measure the jobs that made it out. The oldest age is sampled on a clock, independently of the workers, so it keeps rising when nothing moves. Use wait-time percentiles to describe normal operation and the oldest age to detect trouble."),
        h3("When not to bother (or to measure differently)"),
        bullets([
            "**A queue that is meant to wait.** A nightly analytics export can sit for hours without harming anyone. It still gets an age measurement, but its SLO is hours, not seconds, and it does not page at night.",
            "**Delayed and retried jobs.** A job scheduled for 03:00, or a retry waiting for its backoff (lesson 3), is not late while it waits for its time. Measure its age from the moment it became ready to run, not from when it was first created.",
            "**A queue with a handful of jobs a day.** Percentiles over three samples are noise. The oldest age is still meaningful; skip the p95 panel.",
        ]),
        challenge("chal_quiz_bjm_411"),

        h2("4. Worked example: instrument the worker"),
        p("The simplest reliable design records three timestamps on the job itself and turns them into metrics in the worker. The producer stores when the job became ready; the worker observes the wait when it takes the job and the processing time when it finishes; a separate timer samples the oldest age. The interfaces below are small on purpose so that the same code works with an in-memory queue in tests and with a real broker in production:"),
        code("typescript", `
// metrics/queueMetrics.ts
export interface JobTimes {
    queue: string;
    readyAt: number;      // ms; enqueue time, or the run-at time of a delayed job or a retry
    startedAt?: number;   // ms; set when a worker takes the job
}

export interface Histogram { observe(labels: { queue: string }, seconds: number): void }
export interface Gauge { set(labels: { queue: string }, value: number): void }

export function onJobStarted(job: JobTimes, now: number, wait: Histogram): void {
    job.startedAt = now;
    wait.observe({ queue: job.queue }, (now - job.readyAt) / 1000);
}

export function onJobFinished(job: JobTimes, now: number, processing: Histogram): void {
    if (job.startedAt === undefined) return; // never started here: no processing time to report
    processing.observe({ queue: job.queue }, (now - job.startedAt) / 1000);
}

// Runs every 15 s from a timer, NOT from the worker loop: it must keep running when workers stop.
export function sampleQueue(
    queue: string,
    now: number,
    waiting: { depth(): number; oldestReadyAt(): number | null },
    depthGauge: Gauge,
    ageGauge: Gauge,
): void {
    const oldest = waiting.oldestReadyAt();
    depthGauge.set({ queue }, waiting.depth());
    ageGauge.set({ queue }, oldest === null ? 0 : (now - oldest) / 1000);
}`, "metrics/queueMetrics.ts"),
        p("With a broker you rarely need to store the timestamps yourself, but check which clock each one comes from. In BullMQ a job carries `timestamp` (created), `processedOn` (taken by a worker) and `finishedOn`; a delayed job also has its `delay`, so its ready time is `timestamp + delay`. In SQS each message has a `SentTimestamp` attribute and CloudWatch publishes `ApproximateAgeOfOldestMessage` per queue. Broker timestamps come from one clock; timestamps written by producers on different machines can disagree by a few seconds, which matters when your SLO is 30 seconds."),
        h3("Percentiles you can explain"),
        p("An average hides the slow tail: 95 jobs that waited 1 second and 5 jobs that waited 5 minutes average to about 16 seconds, a number nobody experienced. Report percentiles, and say which definition you use. The **nearest-rank** method is the easiest to check by hand: sort the n values ascending; the pth percentile is the value at 1-based rank `ceil(p / 100 * n)`. For the waits `[2, 9, 4, 30]` sorted to `[2, 4, 9, 30]`, p50 is rank 2 (4 s) and p95 is rank 4 (30 s)."),
        bullets([
            "Compute a percentile from the raw samples of one queue and one window (or from a histogram that keeps the buckets). Never average two p95 values: the average of the p95 of grading and the p95 of emails is not the p95 of anything.",
            "A window with no samples has no percentile. Show `null` or a gap, never 0: a 0-second wait in a minute when nothing was taken is a lie that looks like good news.",
            "A p95 over a 1-minute window with 8 samples is the 8th value, the maximum. That is fine for an investigation; for an alert, prefer the oldest age.",
        ]),

        h2("5. From an event log to a per-minute report"),
        p("During an incident you often do not have the panel you need yet, but you do have the worker logs. Turning them into per-queue, per-minute numbers has four traps, all of which appear in real logs:"),
        bullets([
            "**Out-of-order lines.** Logs from several worker pods are shipped separately; a `dequeue` line can arrive before its `enqueue` line. Group the lines by job first, then compute; never assume the file order is the time order.",
            "**Duplicates.** A log shipper that retries sends the same line twice, and at-least-once delivery (lesson 4) can dequeue the same job twice. Keep the earliest timestamp of each event type per job, so the wait reflects the first time a worker took it.",
            "**Missing lines.** A job dequeued but never completed is in flight (or its worker died); a job with a complete line but no dequeue line lost a log line. Neither is waiting. A job whose enqueue happened before the log starts has no known wait: leave it out rather than invent one.",
            "**Window edges.** Use half-open windows `[start, end)` so an event exactly on the minute belongs to exactly one window, and measure depth and oldest age at the window's end.",
        ]),
        p("Here is the shape of the log in the exercise. The per-minute report it asks for is what the team wished they had at 18:40: one row per queue and minute with depth, oldest age, wait p50/p95, processing p95, and a flag when the oldest age exceeds the queue's SLO."),
        code("text", `
2026-10-19T18:39:58Z enqueue grading sub-88530
2026-10-19T18:40:02Z dequeue grading sub-88412
2026-10-19T18:40:01Z dequeue grading sub-88409      <- shipped late, out of order
2026-10-19T18:40:02Z dequeue grading sub-88412      <- duplicate
2026-10-19T18:40:05Z enqueue emails  mail-20114
2026-10-19 18:40:06 complete grading sub-88409      <- malformed timestamp: skip and count it`, "worker-events.log"),
        challenge("chal_coding_bjm_412"),

        h2("6. How to verify your lag numbers"),
        bullets([
            "**Stop the workers in staging.** Scale the grading workers to zero for five minutes while a script submits a job every few seconds. The oldest-age line must rise in a straight line at 60 seconds per minute, depth must grow, and the wait-time panel must go quiet. If the oldest age stays flat, it is being computed by the workers rather than by an independent timer.",
            "**Compare with the broker.** Your oldest-age gauge for an SQS queue should track CloudWatch's `ApproximateAgeOfOldestMessage` within the sampling interval. A steady offset of a few seconds usually means producer clock skew.",
            "**Replay a known log.** Keep a small log with hand-computed answers (like the public tests of the exercise) and run your report over it in CI. Shuffle the lines and duplicate a few: the report must not change.",
            "**Test the alert, not just the metric.** In staging, enqueue one job to a queue with no workers and confirm the age alert fires after its SLO plus its `for` duration, and that it resolves after the job is taken.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Alerting on depth alone.** It fires during every busy evening and stays silent on a slow, small queue. Spot it: look for an alert rule whose only expression is a count of waiting jobs.",
            "**Measuring age from the worker.** If the worker loop updates the oldest-age gauge, the gauge freezes when the workers die. Spot it: the age panel shows a flat line or no data during a worker outage, as in the staging test above.",
            "**Counting in-flight jobs as waiting.** Depth computed as `enqueued - completed` includes jobs that workers are processing, and the oldest age then points at a slow job instead of the front of the line. Spot it: depth never drops below your worker concurrency, even when the queue is idle.",
            "**One number for all queues.** Averaging grading (seconds) with nightly exports (hours) makes both meaningless. Spot it: a panel or metric without a `queue` label.",
            "**Measuring a retry's wait from its first enqueue.** A job retried after a 5-minute backoff looks 5 minutes late. Spot it: wait-time spikes that line up with the retry backoff schedule rather than with load.",
        ]),

        h2("8. Summary"),
        bullets([
            "Depth counts waiting jobs; the age of the oldest waiting job measures the delay learners feel. Wait time ≈ depth / throughput, so depth means nothing without a rate.",
            "Record readiness, start and finish per job, per queue; observe wait and processing times as percentiles (nearest-rank, from raw samples, null for empty windows) and sample the oldest age on an independent timer.",
            "Logs used for lag are out of order, duplicated and incomplete: group by job, keep the earliest timestamps, exclude in-flight jobs from depth, and set an SLO on age per queue.",
        ]),

        h2("Sources"),
        bullets([
            "Amazon SQS Developer Guide: available CloudWatch metrics for Amazon SQS (ApproximateAgeOfOldestMessage, ApproximateNumberOfMessagesVisible, ApproximateNumberOfMessagesNotVisible) and message attributes (SentTimestamp) - docs.aws.amazon.com/AWSSimpleQueueService",
            "BullMQ documentation: Job (timestamp, processedOn, finishedOn, delay), queue metrics and events - docs.bullmq.io (check the current version)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the worker logs of one of your own queues for a busy hour and run your report from the exercise over them. Then write down an SLO for each queue - the oldest age at which a learner or a teammate would notice - and compare it with the worst minute in the report. Which queue would have paged, and when?"),
    ],
});
