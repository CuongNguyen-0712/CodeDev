// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-1-1",
    title: "What belongs in a background job, and what doesn't",
    slug: { _type: "slug", current: "what-belongs-in-a-background-job" },
    description:
        "POST /submissions graded the code, recomputed the leaderboard and sent the certificate email before it answered, so a contest evening turned into 504s, duplicate submissions and a 500 for a learner who had passed. Learn to sort work into what the response needs now and what can run later, why validation and the write the user must see stay in the request, how to answer 202 Accepted with a status URL, how not to lose the job between the database write and the enqueue, and what a queue costs you before you add one.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "During the Friday evening contest, POST /submissions on https://api.codedev.test answered 504 Gateway Timeout for one request in five. The handler runs the learner's code in the sandbox, updates progress, recomputes the leaderboard and, when the course is complete, sends the certificate email, all before it responds. The gateway gives up after 30 seconds. Learners who saw the 504 clicked Run again, and the submissions table now has 1,847 duplicate rows. One learner who finished the course got a 500 \"Something went wrong\": the grading had passed and was saved, but the mail provider timed out and the exception reached the controller.",
    },

    content: [
        h2("1. The incident: one request that does everything"),
        p("This is the handler that shipped. Every step is reasonable on its own, and every step runs before the learner sees anything:"),
        code("typescript", `
// submissions.controller.ts - the version that shipped
@Post()
async submit(@Body() dto: CreateSubmissionDto, @CurrentUser() user: User) {
    const submission = await this.submissions.create(user.id, dto);          // INSERT, ~10 ms
    const result = await this.sandbox.run(dto.challengeId, dto.code);        // 2-25 s, depends on the code
    await this.submissions.saveResult(submission.id, result);                // UPDATE, ~10 ms
    await this.progress.recordAttempt(user.id, dto.challengeId, result);     // UPDATE, ~10 ms
    await this.leaderboard.recompute(dto.courseId);                          // 1-6 s during a contest
    if (await this.progress.isCourseComplete(user.id, dto.courseId)) {
        await this.mail.sendCertificate(user.id, dto.courseId);              // 0.3 s, or 30 s when the provider is slow
    }
    return result;
}`, "submissions.controller.ts"),
        p("Three different problems hide in these lines. The slow steps add up past the gateway's 30-second limit. A failure in a step the learner does not need right now (the certificate email) fails the whole request, even though the grading succeeded and was saved. And a client that times out does not know whether its submission exists, so it sends it again."),
        p("Moving work into a **background job** fixes all three, but only for the right steps. Move the wrong ones and you get new bugs: a learner who pays for a course and then cannot open it, or a form that says \"saved\" for something that was never saved. This lesson is about drawing that line before you write any queue code."),

        h2("2. Read the evidence"),
        p("The trace of one failed request (OpenTelemetry, as shown in the tracing UI) tells you where the time went:"),
        code("text", `
POST /submissions  trace 7f3c9e...   29.98 s   status 504 (gateway timeout, client gone)
  submissions.create              12 ms
  sandbox.run  challenge c_17  21,804 ms     8 tests, CPU-bound, queue of 40 runs ahead
  submissions.saveResult           9 ms
  progress.recordAttempt           8 ms
  leaderboard.recompute         5,912 ms     SELECT ... ORDER BY score DESC on 48k rows
  mail.sendCertificate          2,240 ms     (span still open when the gateway gave up)`, "trace"),
        p("The duplicates are visible in the database. Every learner who retried has two rows with the same code within a minute:"),
        code("sql", `
SELECT user_id, challenge_id, count(*) AS copies
FROM submissions
WHERE created_at > now() - interval '3 hours'
GROUP BY user_id, challenge_id, md5(code), date_trunc('minute', created_at)
HAVING count(*) > 1
ORDER BY copies DESC
LIMIT 5;

 user_id | challenge_id | copies
---------+--------------+--------
 u_5521  | c_17         |      4
 u_0932  | c_17         |      3
 u_7710  | c_21         |      3
 ...`, "psql"),
        p("And the 500 came from the last line of the handler. The API log shows the order: the result was saved, then the mail provider timed out, and the exception turned a passed submission into an error page:"),
        code("text", `
21:14:07.311 INFO  submission s_88412 saved result=passed score=100
21:14:07.402 INFO  course ts-foundations complete for u_2290, sending certificate
21:14:37.405 ERROR MailTimeoutError: provider did not answer in 30000 ms
21:14:37.406 ERROR POST /submissions 500 (u_2290)`, "api.log"),
        p("Read the three pieces together: two steps (`sandbox.run`, `leaderboard.recompute`) make the request slow, one step (`mail.sendCertificate`) makes it fragile, and none of those three is needed to tell the learner \"we have your submission\"."),

        h2("3. Three questions for every step"),
        p("For each step of a request handler, ask:"),
        numbered([
            "**Does the response need its result?** If the user's next screen depends on it, it belongs in the request. If the user only needs to know that it will happen, it does not.",
            "**Is it slow or unreliable?** Slow: seconds, or a duration that depends on input you do not control (the learner's code). Unreliable: it calls a third party (mail, payment webhooks, storage) that can be down when you are not.",
            "**Can it run later, and be retried safely?** Later means a delay of seconds or minutes is acceptable to the user. Retried means running it twice does no harm, or you can make it so (lesson 4).",
        ]),
        p("A step moves to a job when the answer to 1 is no and the answer to 2 and 3 is yes. Applied to the handler:"),
        bullets([
            "**Grade a submission** (`sandbox.run` + `saveResult`): the learner wants the result, but not inside one HTTP request. It is slow, its duration depends on the code, and it can be retried. Job.",
            "**Recompute the leaderboard**: nobody waits for it, it is slow under load, and recomputing twice gives the same leaderboard. Job (and in a real contest, one recompute every few seconds is enough, not one per submission).",
            "**Send the certificate email**: not needed for the response, depends on a third party, can be retried, but sending it twice is visible to the learner, so the job must be idempotent (lessons 4 and 9). Job.",
            "**Generate a course export** (an admin downloads a ZIP of all lessons): minutes of work, the admin only needs a link when it is ready. Job.",
        ]),
        h3("What stays in the request"),
        p("Some work must succeed or fail while the user is still there, because the user's next action depends on it:"),
        bullets([
            "**Validation and authorization.** A submission for a challenge the learner is not enrolled in must be rejected with `403` now, not accepted and failed later in a job nobody watches. A job is not a place to discover that the request was invalid.",
            "**The write the user must see.** Saving the submission row itself, enrolling after a points payment, changing a password, accepting a course invite. If the next page reads it, it must be committed before the response. A job that \"will enroll you in a second\" loses the race with the browser that opens the course page in 200 ms.",
            "**Fast, local work.** A 10 ms `UPDATE` does not get faster in a queue; it gets slower (enqueue, wait, dequeue) and harder to debug.",
        ]),
        callout("info", "The rule of thumb is about the user, not the code",
            "\"Slow\" alone is not enough to move something, and \"fast\" alone is not enough to keep it. A password change that takes 2 seconds stays in the request, because the user must know it worked before they close the tab. A 50 ms call to the mail provider moves out, because the provider being down must not fail the request that triggered it."),

        h2("4. The response: 202 Accepted and a status URL"),
        p("Once grading is a job, `POST /submissions` cannot return the result. It returns what it knows for sure: the submission is saved and grading is queued. HTTP has a status for that. RFC 9110 defines **202 Accepted** as \"accepted for processing, but the processing has not been completed\", and recommends that the response describe the current status and point to where the client can check it. A `Location` header and a `statusUrl` in the body do that:"),
        code("typescript", `
// submissions.controller.ts - the request does only what the learner needs now
@Post()
@HttpCode(HttpStatus.ACCEPTED)
async submit(
    @Body() dto: CreateSubmissionDto,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
) {
    await this.enrollments.assertEnrolled(user.id, dto.courseId);        // 403 now, not later
    const submission = await this.submissions.createQueued(user.id, dto); // INSERT ... status 'queued'
    await this.gradingQueue.add(
        "grade-submission",
        { submissionId: submission.id },
        { jobId: submission.id },                                        // one job per submission
    );
    const statusUrl = \`/submissions/\${submission.id}\`;
    res.setHeader("Location", statusUrl);
    return { submissionId: submission.id, status: "queued", statusUrl };
}`, "submissions.controller.ts"),
        p("The grading itself moves to a worker. With `@nestjs/bullmq` a worker is a class decorated with `@Processor` that extends `WorkerHost`; it runs in its own process, so a slow sandbox run no longer holds an HTTP connection open:"),
        code("typescript", `
// grading.processor.ts - runs in the worker process, not in the API
@Processor("grading")
export class GradingProcessor extends WorkerHost {
    constructor(private readonly sandbox: SandboxService, private readonly submissions: SubmissionsService) {
        super();
    }

    async process(job: Job<{ submissionId: string }>) {
        const submission = await this.submissions.markRunning(job.data.submissionId);
        const result = await this.sandbox.run(submission.challengeId, submission.code);
        await this.submissions.saveResult(submission.id, result);
        // next jobs: progress, leaderboard, certificate (each its own job)
    }
}`, "grading.processor.ts"),
        p("The client shows \"Grading...\" and checks `GET /submissions/s_88412` every second or two, or listens for a realtime event (CodeDev already uses Pusher for notifications), until the status is `passed` or `failed`. A learner who reloads the page still sees the right state, because the status lives in the database, not in an open request."),
        callout("warning", "Check the queue library's API before you copy it",
            "The calls above follow BullMQ's `queue.add(name, data, opts)` and the `@nestjs/bullmq` `WorkerHost` pattern. Options such as `jobId` (BullMQ does not add a second job with an id that already exists in the queue) and how long finished jobs are kept change between versions. Check the current BullMQ and NestJS docs for the version you install. On SQS the shape is different (`SendMessage` with a JSON body), but the controller logic is the same."),
        h3("Do not lose the job between the INSERT and the enqueue"),
        p("Look at the two writes in the new controller: one to PostgreSQL, one to Redis. They are not one transaction. If the API process crashes, or Redis is unreachable, after the `INSERT` and before `queue.add`, the submission sits in `queued` forever and nobody grades it. Two simple defences, in order of effort:"),
        bullets([
            "**Write first, enqueue second, sweep for orphans.** The row is the source of truth. A small scheduled job looks for submissions still `queued` after a few minutes with no job in the queue and enqueues them again. The `jobId` keeps that from creating a second job when the first one does exist.",
            "**Transactional outbox.** Insert an `outbox` row in the same transaction as the submission, and let a relay process move outbox rows to the queue. More moving parts; worth it when losing a job is expensive (payments, certificates).",
        ]),
        p("The order matters: enqueue first and insert second, and a worker can pick up a job for a submission that does not exist yet, or never will if the `INSERT` fails."),

        challenge("chal_quiz_bjm_111"),

        h2("5. What a queue costs you"),
        p("A queue is another moving part, and every lesson in this course exists because of one of its costs. Before you add one, count them:"),
        bullets([
            "**Infrastructure to run and watch.** Redis (for BullMQ) or a managed queue (SQS), plus worker processes to deploy, scale and restart. When Redis is down, your API must decide what `POST /submissions` does.",
            "**States instead of one answer.** A request either returned or threw. A job is queued, running, failed, retrying, cancelled or done, and the UI must show each one (lesson 2).",
            "**Duplicates.** Queues deliver at least once: a job can run twice after a worker crash or a slow attempt (lessons 4 and 5). Every job must be safe to repeat.",
            "**Lag.** Work happens later, and \"later\" can become hours when workers fall behind (lesson 10). You need to measure it before your users do.",
            "**Harder debugging.** One user action now spans an API trace and a worker trace. Pass the trace context and the submission id into the job, or you cannot connect them.",
        ]),
        h3("When not to use a queue"),
        bullets([
            "The work is fast, local and the response needs it: keep it in the request.",
            "The work is slow but rare and an operator runs it by hand: a script or an admin endpoint with a long timeout may be enough.",
            "You only want to answer faster: `void this.mail.sendCertificate(...)` without `await` (\"fire and forget\") looks like a background job but is not one. It runs in the API process, so a deploy or a crash loses it, nothing retries it, and an unhandled rejection can take the process down. If the work matters, give it a real queue; if it does not, ask why it runs at all.",
        ]),

        h2("6. How to verify the split"),
        bullets([
            "**Trace after the change.** The `POST /submissions` trace should now contain only `assertEnrolled`, `createQueued` and the enqueue: tens of milliseconds, not seconds. The grading appears as its own trace in the worker, linked by the submission id.",
            "**Kill the dependency.** Point the mail client at a closed port in staging and submit a passing solution for the last challenge of a course. The request must still return `202` and the submission must end as `passed`; only the certificate job fails and waits for a retry.",
            "**Kill the worker mid-job.** Stop the worker process while a grading job runs. After it restarts, the submission must still reach `passed` or `failed`, not stay `running` forever (lessons 2 and 5).",
            "**Count duplicates.** Rerun the SQL from section 2 after the next contest. Learners no longer have a reason to click Run twice, because the API answers in milliseconds.",
            "**Kill Redis.** Stop Redis in staging and submit. Decide, and test, what happens: a clear `503` the client can retry, or a saved `queued` row that the orphan sweep enqueues later. Silence is not an option.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Moving validation into the job.** The API says `202` for a submission to a challenge the learner cannot access, and the job fails later where nobody sees it. Spot it: jobs that fail with `403`, `404` or validation errors in the worker log. Validate in the request.",
            "**Moving the write the user reads next.** Enrollment after payment returns `202`, the browser opens the course page and gets `403`. Spot it: support tickets that say \"it worked after I refreshed\", and a job whose result the next request reads.",
            "**Enqueue before commit.** The worker picks up a job for a row that is not committed yet and fails with \"submission not found\", or the transaction rolls back and the job runs for nothing. Spot it: \"not found\" errors in the worker within milliseconds of the enqueue. Enqueue after the commit.",
            "**No status for the client.** The API returns `202` with no id and no status URL, so the client cannot tell queued from lost. Spot it: the frontend polls a list endpoint and guesses. Return the id and a `statusUrl`.",
            "**Fire and forget in the API process.** A promise that is not awaited is not a job. Spot it: work that disappears around deploys and an `unhandledRejection` in the logs.",
        ]),

        h2("8. Summary"),
        bullets([
            "Move a step to a job when the response does not need its result and the step is slow or depends on someone else; keep validation, authorization and the write the user reads next in the request.",
            "Answer `202 Accepted` with the job's id and a status URL, keep the status in the database, and enqueue after the commit with a way to recover jobs that were never enqueued.",
            "A queue adds states, duplicates, lag and infrastructure; add one when you can name the step that needs it, and test what happens when the worker, the dependency or the queue itself is down.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9110, HTTP Semantics: section 15.3.3 (202 Accepted) - rfc-editor.org/rfc/rfc9110",
            "BullMQ documentation: queues, workers and job options - docs.bullmq.io",
            "NestJS documentation: Queues (@nestjs/bullmq) - docs.nestjs.com/techniques/queues",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List every step of one handler in your own project and answer the three questions for each. For one step that should move, sketch the 202 response, the status the client polls, and what happens if the process dies between the database write and the enqueue. Then decide whether you need an outbox or whether an orphan sweep is enough, and write down why."),
    ],
});
