// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-3-2",
    title: "Backpressure: a bounded submission queue",
    slug: { _type: "slug", current: "backpressure-bounded-submission-queue" },
    description:
        "On the mock exam the submission queue accepted every job in under 200 ms and grew to 30,000 jobs; the last learners waited more than five minutes for a result and kept pressing Run. Learn why an unbounded queue hides overload instead of absorbing it, how to size the bound from the wait you can promise, how to shed practice runs before graded exam submissions without ever dropping an accepted job, and how to derive Retry-After from the measured drain time.",
    estimatedTime: 35,

    scenario: {
        role: "Backend engineer owning the submission path, CodeDev learning platform",
        problem:
            "Mock exam, Saturday 10:00. Arrivals on POST /submissions reached the planned 340 per second and stayed there for two minutes. The scheduled scaling had brought the grader fleet to 400 slots (lesson 2 estimated about 300; the team added headroom after the rehearsal), and the API answered 202 Accepted in 120-180 ms throughout, so every dashboard on the submit path was green. Meanwhile the grading queue reached 30,120 jobs, results arrived up to 5 minutes 38 seconds after submission, 6,800 learners pressed Run again while waiting, and the queue only emptied at 10:09. Practice runs from learners revising for other courses sat in the same queue, ahead of exam submissions that had been sent later.",
    },

    content: [
        h2("1. The incident: every request accepted, nothing finished"),
        p("The per-learner rate limit from lesson 7 was in place and it worked: no single learner sent more than one submission every 5 seconds. The problem was the sum. The queue metrics for the first minutes of the exam:"),
        code("text", `
time      arrivals/s  graded/s  queue depth  oldest job age  POST /submissions p95
10:00:00         340        89            0            0 s  120 ms
10:01:00         340        89       15,060          169 s  170 ms
10:02:00         340        89       30,120          338 s  180 ms
10:03:00         120        89       31,980          359 s  150 ms
10:09:00          40        89            0            0 s  110 ms`, "grafana: submission queue, mock exam"),
        p("The `p95` column is the requirement the team was watching: p95 2 s for submit acceptance. It was met all morning. But **accepting** a submission only writes a job to the queue; the learner is waiting for the **result**. With arrivals above grading capacity, the queue did what queues do: it turned a rate problem into a waiting problem, and it did so silently. Every 202 was a promise the platform could not keep on time."),

        h2("2. Read the evidence: the numbers that predict the wait"),
        p("Two numbers explain the whole table. Grading capacity is slots divided by the average grading time: 400 slots / 4.5 s = **89 jobs per second**. Arrivals were 340 per second. The queue therefore grows by 340 - 89 = 251 jobs every second, 15,060 a minute. And the wait of a job that joins the queue is the depth in front of it divided by the drain rate:"),
        code("text", `
wait ≈ depth / throughput
     = 30,120 jobs / 89 jobs/s ≈ 338 s          (the "oldest job age" column agrees)

Little's law, for a steady state:  jobs in system = arrival rate x time in system
If the arrival rate is above the throughput, there is no steady state: the time grows without bound.`, "back of the envelope"),
        p("You can check the prediction against the queue itself: the age of the oldest waiting job (the Background Jobs & Messaging course measures it in \"Measuring queue lag & age\") matched depth / throughput within a few seconds. That makes the depth an honest, cheap admission signal: the API can read it on every request and know how long a new job will wait."),

        h2("3. Core idea: push back at the door"),
        p("**Backpressure** means that a component that cannot keep up tells the components upstream to slow down, instead of buffering without limit. For an HTTP API the signal is a refusal with advice: `429 Too Many Requests` (or `503`) and `Retry-After`. Its job is different from the per-learner rate limit: the rate limit is about fairness per client; backpressure protects **total** capacity, even when every client is well-behaved."),
        h3("Size the bound from the wait you promise"),
        p("The bound is not a memory setting. It is the longest wait the product accepts, multiplied by the throughput: with 89 jobs per second, a bound of 5,000 waiting jobs means no accepted exam submission starts grading more than about 5,000 / 89 = 56 seconds after it was accepted. If 56 seconds is too long, the answer is a smaller bound (more 429s) or more grader slots (more cost, lesson 14) - a trade-off a product owner can decide with these numbers in front of them."),
        h3("Shed the least important work first"),
        p("Not every submission matters equally on exam day. A graded exam submission decides a learner's certificate; a practice run in another course can wait or be retried in a minute. CodeDev gives each priority its own **admission threshold**: practice runs are accepted only while the depth is below 2,000; exam submissions until 5,000. Workers take waiting exam jobs before practice runs. When load rises, practice traffic is refused first and exam traffic keeps the capacity."),
        h3("A 202 is a promise: never drop an accepted job"),
        p("The tempting shortcut is to make room for an exam submission by deleting a practice run that is already waiting. Do not. The practice learner received 202 and is watching a spinner; a job that silently disappears is worse than a 429, because the client cannot know it must retry, and it breaks every count downstream (\"submitted 3, graded 2\"). Shedding happens **at the door**, by rejecting new work, never by discarding accepted work."),
        callout("warning", "When not to add priorities",
            "Priorities add a failure mode: starvation. Under a long exam burst, workers keep taking exam jobs and practice runs that got in can wait minutes (the exercise's burst shows practice waits several times longer than exam waits). That is acceptable on CodeDev because practice is cheap to redo and the exam window is short. If both classes had deadlines, you would reserve a share of the slots for each class or promote jobs by age instead. With one class of traffic, a single bound is simpler and enough."),

        challenge("chal_quiz_sdc_321"),

        h2("4. Retry-After from the drain time"),
        p("A 429 without advice invites the worst client behaviour: immediate retries that arrive exactly when the queue is fullest. A 429 with a constant `Retry-After: 30` is better but wrong in both directions: too long early in the burst, too short at its peak. Derive it from the same numbers that predicted the wait: the job could get in once the depth drops below its threshold, so it must wait for `depth - threshold + 1` jobs to be taken, at the measured rate:"),
        code("text", `
retryAfterSec = ceil( (depth - threshold + 1) x averageGradeMs / (workers x 1000) )

practice at depth 4,100 (threshold 2,000), 400 workers, average 4,500 ms:
  ceil( 2,101 x 4,500 / 400,000 ) = ceil(23.6) = 24 s
exam at depth 5,000 (threshold 5,000):
  ceil(     1 x 4,500 / 400,000 ) = ceil(0.011) = 1 s`, "Retry-After"),
        p("Use the **measured** grading time, an average over the last few hundred completed jobs, not a constant from the design doc. Grading time depends on the challenge (a Python + sqlite3 challenge with 80 hidden tests takes 8 s, a quiz-like one 1 s), and on exam day everyone runs the same few challenges. The estimate should move with the work actually being done. Clients add jitter to the advised delay (the Background Jobs & Messaging course, \"Retries with exponential backoff & jitter\") so that 5,000 rejected learners do not come back in the same second."),

        h2("5. Worked example: admission in the API"),
        p("In production the bounded queue is a check in the NestJS submissions handler in front of the real queue, plus the worker's priority order. The depth comes from the queue (an approximate count is fine: a bound of 5,000 that is sometimes 5,030 still bounds the wait), and the average grading time from the workers' completion metrics:"),
        code("typescript", `
// submissions.controller.ts - admission before the job is enqueued
const THRESHOLD = { exam: 5_000, practice: 2_000 } as const;

@Post()
async submit(@Body() dto: SubmitDto, @Res({ passthrough: true }) res: Response) {
  const depth = await this.queue.waitingCount();             // jobs accepted, not yet taken
  const threshold = THRESHOLD[dto.priority];
  if (depth >= threshold) {
    const { sumMs, count } = await this.graderStats.recent(200);   // last 200 completed jobs
    const excess = depth - threshold + 1;
    const retryAfter = Math.ceil((excess * sumMs) / (count * this.graderSlots() * 1000));
    res.setHeader("Retry-After", String(retryAfter));
    throw new HttpException({ code: "GRADING_BUSY", retryAfterSec: retryAfter }, 429);
  }
  const submission = await this.submissions.create(dto);       // same transaction as the outbox row (lesson 10)
  res.status(202);
  return { submissionId: submission.id, status: "queued" };
}`, "submissions.controller.ts"),
        p("Three things to notice. The integer form of the formula (`excess * sumMs / (count * workers * 1000)`) avoids rounding an average twice. The check uses the threshold of the request's own priority. And the response is a clear contract: a 429 carries a machine-readable code and a delay, which the web client shows as \"Graders are busy, retrying in 24 s\" with a countdown, instead of a generic error that makes people click again."),

        h2("6. Build it and run the burst"),
        p("Implement the queue's side of the design: admission per priority, a Retry-After from the measured drain time, exam-first dispatch, and the wait statistics per priority. The runner drives grader workers on a fake clock and, for the large tests, generates an exam-day burst: 340 submissions per second for 60 seconds against 400 slots, and an unplanned burst on the 40 always-on slots."),
        challenge("chal_coding_sdc_322"),

        h2("7. How to verify it"),
        numbered([
            "**Simulate before you load test.** The exercise's runner is a model of the system: change the bound, the thresholds or the number of slots and compare the maximum wait per priority and the 429 count. Pick the numbers there, where a run takes milliseconds.",
            "**Load test the real path** at the planned peak (for example a k6 scenario at 340 requests per second for 3 minutes against a staging fleet). Pass criteria: the queue depth stops at the bound, the oldest job age stays under bound / throughput, every 429 has a Retry-After, and the count of accepted submissions equals the count of graded ones.",
            "**Reconcile accepted and graded.** After the test, `SELECT count(*) FROM submissions WHERE status = 'queued' AND created_at < now() - interval '10 minutes'` must be 0. Any row there is an accepted job the system lost or forgot.",
            "**Watch the right signals on exam day**: depth and oldest age per priority, 429s per priority per minute, the Retry-After values sent, and the result latency (accepted to graded), not only the acceptance latency.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Monitoring only the acceptance latency of an asynchronous path.** It stays green while results take minutes. Spot it: no dashboard shows queue age or accepted-to-graded time.",
            "**A bound chosen from memory size instead of the promised wait.** \"Redis can hold a million jobs\" is true and irrelevant. Spot it: nobody can say how long the last accepted job waits at the bound.",
            "**Dropping accepted low-priority jobs to make room.** Learners with a 202 never get a result. Spot it: accepted count minus graded count is above zero after the queue drains.",
            "**A constant or under-estimated Retry-After.** Clients come back while the queue is still full, and the retries become part of the burst. Spot it: many 429s for the same learner within the advised delay plus a few seconds, or a Retry-After that does not change while the depth does.",
            "**One threshold for everything.** Practice traffic fills the queue that exam submissions need. Spot it: exam submissions get 429 while practice runs are waiting in the queue.",
        ]),

        h2("9. Summary"),
        bullets([
            "A queue absorbs short bursts; when arrivals stay above throughput it only hides overload as growing waits. Bound the depth by throughput x the longest wait you promise.",
            "Shed at the door by priority (a lower threshold for practice runs), dispatch exam submissions first, and never drop a job that already got a 202.",
            "Answer 429 with a Retry-After derived from the measured drain time to the request's threshold, and verify with a simulation, a load test and an accepted-versus-graded reconciliation.",
        ]),

        callout("tip", "Practice on your own (not graded)",
            "Extend your queue with age-based promotion: a practice run that has waited longer than 60 s is taken before newer exam jobs. Rerun the exam-day burst and compare the maximum practice wait and the maximum exam wait with and without it, then write two sentences for the design doc on which one CodeDev should ship and why."),
    ],
});
