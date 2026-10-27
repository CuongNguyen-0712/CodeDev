// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-1-3",
    title: "Retries with exponential backoff & jitter",
    slug: { _type: "slug", current: "retries-exponential-backoff-jitter" },
    description:
        "When the mail provider went down for four minutes, 12,000 certificate jobs retried every 5 seconds in lockstep, ignored the provider's Retry-After, used up all ten attempts in under a minute and ended in the failed list. Learn why retries need exponential backoff, a cap and full jitter, how to bound them by attempts and by a deadline that fits each job, when the server's Retry-After wins, and how to compute and test a retry schedule with an injected random source.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "At 10:00 the spring cohort of TypeScript Foundations finished, and 12,000 send-certificate jobs were queued within a minute. At the same moment the mail provider had an incident that lasted until 10:04. The certificate queue is configured with attempts: 10 and a fixed backoff of 5 seconds. The provider's dashboard shows our account sending 12,000 requests in the same second every 5 seconds, then answering 429 with Retry-After: 60. At 10:00:50 the queue was empty again: 11,874 jobs were in the failed list with \"attempts exhausted\", four minutes before the provider recovered. Support spent the afternoon answering \"where is my certificate?\"",
    },

    content: [
        h2("1. The incident: ten attempts in fifty seconds"),
        p("The certificate queue was set up a year ago with the first options that worked:"),
        code("typescript", `
// certificates.module.ts - the version that shipped
BullModule.registerQueue({
    name: "certificates",
    defaultJobOptions: {
        attempts: 10,
        backoff: { type: "fixed", delay: 5000 },   // retry every 5 s
    },
}),`, "certificates.module.ts"),
        p("On a normal day a send fails once in a while, the job waits 5 seconds and the second attempt succeeds. That day every job failed at once, so every job waited exactly 5 seconds and failed again, at once. The retry policy turned one outage into a synchronised wave every 5 seconds, and its total time budget, 9 waits of 5 seconds, was shorter than an ordinary incident at the provider."),

        h2("2. Read the evidence"),
        p("Requests from our account, per second, from the provider's dashboard (seconds with no requests left out):"),
        code("text", `
second     requests   2xx    429     503
10:00:00     12,000     0      0  12,000
10:00:05     12,000     0      0  12,000
10:00:10     12,000     0  11,412     588    429 carries Retry-After: 60
10:00:15     12,000     0  11,950      50
...                                          (the same every 5 s)
10:00:45     11,874     0  11,874       0
10:04:02          0                          provider healthy again, nothing left to send`, "provider dashboard"),
        p("And the queue's own view, from the BullMQ failed list:"),
        code("bash", `
$ redis-cli ZCARD bull:certificates:failed
(integer) 11874

$ redis-cli HMGET bull:certificates:c_u2290_tsf attemptsMade failedReason
1) "10"
2) "MailProviderError: 429 Too Many Requests (retry after 60 s)"`, "redis-cli"),
        p("Three problems are visible. **The retries are synchronised**: 12,000 jobs failed in the same second, so a fixed delay brings them back in the same second, every time. **The retries ignore the server**: the provider said \"come back in 60 seconds\" and we came back in 5. **The budget is in the wrong unit**: ten attempts sounds generous, but with a fixed 5-second delay it means \"give up after 50 seconds\", and nobody chose 50 seconds on purpose."),

        h2("3. The core idea: back off, cap it, randomise it, bound it"),
        p("A retry is a bet that the failure was temporary. Four rules keep the bet cheap for you and for the service you call:"),
        numbered([
            "**Exponential backoff.** Wait longer after each failure: `base * 2^(attempt - 1)`. With a 1-second base: 1, 2, 4, 8, 16 seconds. A blip is retried quickly; a long outage gets fewer and fewer attempts per minute, which gives the other side room to recover.",
            "**A cap.** Without one, the delay grows without limit: attempt 15 with a 1-second base would wait over two hours. `min(maxDelay, base * 2^(attempt - 1))` keeps the longest wait at a value you chose, such as 5 minutes.",
            "**Jitter.** Thousands of jobs that failed in the same second also back off by the same amount, so exponential backoff alone still sends them back together, only less often. **Full jitter** picks the delay at random between 0 and the capped value: `floor(random() * capped)`. The wave becomes a spread.",
            "**Bounds: max attempts and a deadline.** Stop after a number of attempts, and also stop when the next retry would start after a deadline measured from the first attempt. The deadline is the bound users notice: a certificate that arrives within 24 hours is fine, a grading result after 10 minutes is not, because the learner has left the page.",
        ]),
        p("Then one exception: when the error carries a **Retry-After** (an HTTP 429 or 503 from the provider, translated by your client into milliseconds), and it is longer than the delay you computed, wait for Retry-After. The server knows its own state better than your formula. If Retry-After is shorter than your jittered delay, keep your delay: shortening it would bring the synchronised wave back."),
        callout("info", "Why full jitter, and not just a little noise",
            "The Amazon Builders' Library article \"Timeouts, retries, and backoff with jitter\" (see Sources) compares no jitter with several jitter strategies for many clients competing for the same resource. Adding jitter spreads retries out in time and reduces the total work the overloaded service sees; full jitter, a uniform delay between zero and the backoff value, is the simple variant it recommends as a default. Some delays come out short, even zero. That is intended: what matters to the provider is how many requests arrive per second, not how long one job waits."),
        h3("When not to retry, or not like this"),
        bullets([
            "**The error cannot go away.** A 400 from the mail API because the address is invalid fails the same way in an hour. Mark the attempt `permanent` (lesson 2) and do not schedule a retry; lesson 6 is about the AI-written retry loop that forgot this.",
            "**Someone is waiting on a socket.** Inside an HTTP request, back off for hundreds of milliseconds, not minutes. Long backoff belongs in a background job, where waiting costs nothing but a delayed timestamp.",
            "**The work is replaced anyway.** A failed leaderboard recompute does not need ten retries: the next recompute, a few seconds later, does the same work with fresher data. One retry, or none, is enough.",
            "**Retries in several layers.** If the mail client already retries 3 times inside each job attempt, 10 job attempts become 30 requests per certificate. Retry in one layer, the job, and make the client fail fast.",
            "**The job is not idempotent.** A retried attempt can repeat a side effect that the failed attempt already did (the email went out, then the connection dropped). Retrying is only safe once the job is idempotent (lesson 4).",
        ]),

        challenge("chal_quiz_bjm_131"),

        h2("4. Worked example: one function decides the next attempt"),
        p("Keep the policy in a pure function with the random source passed in. It is then easy to read, easy to test with fixed numbers, and the same in every worker:"),
        code("typescript", `
// retry-policy.ts
export type RetryPolicy = { baseDelayMs: number; maxDelayMs: number; maxAttempts: number; deadlineMs: number };

export const CERTIFICATE_POLICY: RetryPolicy = {
    baseDelayMs: 2_000,          // first retry within 0-2 s
    maxDelayMs: 300_000,         // never wait more than 5 min between attempts
    maxAttempts: 12,
    deadlineMs: 24 * 3_600_000,  // a certificate is still useful the next day
};

/** null = do not retry. attempt = the attempt that just failed (1-based). */
export function nextRetryAt(
    attempt: number, failedAt: number, firstAttemptAt: number,
    policy: RetryPolicy, retryAfterMs: number | undefined, random: () => number,
): number | null {
    if (attempt >= policy.maxAttempts) return null;
    const capped = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
    let delay = Math.floor(random() * capped);                         // full jitter
    if (retryAfterMs !== undefined && retryAfterMs > delay) delay = retryAfterMs;
    const retryAt = failedAt + delay;
    return retryAt > firstAttemptAt + policy.deadlineMs ? null : retryAt;
}`, "retry-policy.ts"),
        p("The worker calls it after a retryable failure, in the same compare-and-set style as lesson 2: the `fail` transition records the failure, and the retry is scheduled only if the policy returns a time. Otherwise the job stays `failed`, visible in the admin and counted in a metric, instead of being retried forever:"),
        code("typescript", `
// certificates.processor.ts (excerpt): after a failed send
const retryAt = error.retryable
    ? nextRetryAt(job.attempts, Date.now(), job.firstAttemptAt, CERTIFICATE_POLICY, error.retryAfterMs, Math.random)
    : null;
if (retryAt !== null) {
    await this.jobs.scheduleRetry(job.id, new Date(retryAt));   // failed -> retrying, run_at = retryAt
} else {
    this.metrics.increment("job_gave_up_total", { queue: "certificates", reason: error.retryable ? "budget" : "permanent" });
}`, "certificates.processor.ts"),
        callout("warning", "Built-in backoff: check what your queue really does",
            "BullMQ has built-in `fixed` and `exponential` backoff, and recent versions add a jitter option and accept a custom backoff strategy on the worker. SQS has no backoff setting; a consumer delays the next delivery of a message by changing its visibility timeout (ChangeMessageVisibility, up to 12 hours). Exact option names, formulas and limits differ between versions, so read the current docs and test the delays you actually get. Whatever the queue offers, the policy questions are the same: which errors, how many attempts, which deadline, and does Retry-After win."),
        p("Replay the incident with `CERTIFICATE_POLICY`. The 12,000 first retries spread over 0-2 seconds instead of one instant. From then on the provider answers 429 with Retry-After: 60, which is longer than any jittered delay in the first attempts, so each job waits 60 seconds: one attempt per job per minute instead of twelve. When the provider recovers at 10:04, a typical job has used 5 or 6 of its 12 attempts and the deadline is 24 hours away, so the next attempt succeeds and nothing lands in the failed list."),
        p("Notice what Retry-After does to the spread: every job waits the same 60 seconds, so the jobs stay only as spread out as their first failures were. When a server returns the same Retry-After to everyone, some teams add jitter on top of it (Retry-After plus a random part) so the returning wave is spread too. This course keeps the simpler rule, the larger of the two, so that the server's minimum is always respected."),

        h2("5. Compute a retry schedule"),
        p("Write `planRetries(job, policy, random)`. It walks the recorded outcome of each attempt of a job, decides after every failure whether to retry and when, and returns the schedule with delays and absolute times. The runner shares one random sequence across several jobs, so calling `random()` when you should not changes the next job's delays too:"),
        challenge("chal_coding_bjm_132"),

        h2("6. How to verify"),
        bullets([
            "**Unit-test the policy with fixed random numbers.** With `random = () => 0.5`, base 1,000 and cap 30,000, the delays after attempts 1 to 7 are 500, 1,000, 2,000, 4,000, 8,000, 15,000, 15,000. Test the boundaries: random 0 gives 0, random 0.999999 stays below the cap, a Retry-After larger than the delay wins, a retry exactly at the deadline is allowed and one millisecond later is not.",
            "**Draw the schedule before you ship it.** Print the worst case (random close to 1) for the whole budget: attempts, cumulative wait, and the time of the last attempt. If the last attempt is at 50 seconds for a job that should survive a one-hour outage, the policy is wrong before any incident.",
            "**Look at the retry histogram during an outage.** In staging, make the mail client return 503 for 5 minutes. Requests per second to the fake provider should rise smoothly after recovery, not in spikes at fixed intervals. The `job_gave_up_total` counter should stay at zero for an outage shorter than the deadline.",
            "**Check Retry-After end to end.** Make the fake provider answer 429 with Retry-After: 30. The next attempt of that job must start at least 30 seconds later, visible in the job's `run_at` or delayed timestamp.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Fixed delay for a shared dependency.** Every job that failed together retries together. Spot it: request spikes at a constant interval in the dependency's dashboard during an incident.",
            "**Exponential without a cap.** Fine for 5 attempts, absurd for 15: the last waits are hours long and look like lost jobs. Spot it: jobs in `delayed` with a run time days away.",
            "**Jitter applied after the cap, or added on top.** `min(cap, random * 2^n * base)` or `capped + random * 100` changes the distribution: delays pile up at the cap or stay in sync. Spot it: a histogram of delays with a spike at one value.",
            "**Ignoring Retry-After.** The provider rate-limits us longer because we keep knocking. Spot it: a run of 429 responses closer together than their Retry-After values.",
            "**A budget in attempts only.** Ten attempts can mean 50 seconds or 3 days depending on the delays. Spot it: nobody can say how long a job is retried before it gives up. Add the deadline and write it next to the policy.",
        ]),

        h2("8. Summary"),
        bullets([
            "Retry only failures that can go away, in one layer, once the job is idempotent; send everything else straight to failed.",
            "Delay = floor(random() * min(maxDelay, base * 2^(attempt - 1))): exponential growth, a cap, and full jitter so jobs that failed together do not come back together; a larger Retry-After from the server wins.",
            "Bound retries by max attempts and by a deadline from the first attempt that fits the job, and test the schedule with an injected random source before an outage tests it for you.",
        ]),

        h2("Sources"),
        bullets([
            "Amazon Builders' Library: Timeouts, retries, and backoff with jitter - aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/",
            "RFC 9110, HTTP Semantics: section 10.2.3 (Retry-After) - rfc-editor.org/rfc/rfc9110",
            "BullMQ documentation: retrying failing jobs and custom backoff strategies - docs.bullmq.io",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the retry policy of each job in your own system in one table: retryable errors, base delay, cap, max attempts, deadline, and what happens when the budget runs out. Print the worst-case schedule for each with random close to 1 and check that it survives your dependency's longest outage of the last year. Then find one place where two layers retry the same call and remove one of them."),
    ],
});
