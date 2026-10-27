// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-2-3",
    title: "Spot the AI mistake: retrying errors that can never succeed",
    slug: { _type: "slug", current: "spot-the-ai-mistake-retrying-errors-that-never-succeed" },
    description:
        "Asked to make the course export worker reliable, an AI assistant wrapped it in a retry loop with backoff that retries every error up to 10 times: timeouts, but also invalid course ids, 404s from the reports API and missing template files. The queue fell behind and alerts came minutes late. Learn to sort errors into retryable and permanent, why 408 and 429 are the exceptions among 4xx, how to stop retries in BullMQ and SQS, and how to review generated retry code with tests that use the failures it forgot.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer and code reviewer, CodeDev learning platform",
        problem:
            "Instructors export their course progress as CSV or XLSX from https://app.codedev.test. Since last week's \"make the export worker reliable\" change, written with an AI assistant, the export queue is behind every afternoon, valid exports take minutes instead of seconds, and the on-call engineer learns about broken exports from instructors before the alert fires. The worker logs are full of the same errors repeated ten times.",
    },

    content: [
        h2("1. The incident: a reliable worker that never gives up"),
        p("Exports used to fail now and then when the reports API was slow, and instructors had to click Export again. The request to the assistant was one sentence: \"The course export worker fails now and then and instructors have to click Export again. Make the export worker reliable.\" This is the change it produced, and it was merged after its tests passed:"),
        code("typescript", `
// exports/export.processor.ts (@nestjs/bullmq; the job itself is not retried by BullMQ)
const MAX_ATTEMPTS = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/** Retries failed exports with exponential backoff so a flaky dependency does not fail the export. */
async function runExportJob(job: ExportJob, deps: Deps): Promise<ExportResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await exportCourse(job, deps);      // validate id, GET progress, read template, upload
      return { status: "done" };
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
      const retryAfterMs = error instanceof HttpError ? error.retryAfterMs : undefined;
      await deps.sleep(retryAfterMs ?? Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS));
    }
  }
  deps.alert(\`export \${job.id} failed: \${describe(lastError)}\`);
  return { status: "failed", error: describe(lastError) };
}`, "export.processor.ts (as merged)"),
        p("It looks careful: a limit, exponential backoff with a cap, `Retry-After` honoured, an alert at the end. Its tests scripted a reports API that timed out or answered 503 or 429 and then recovered, and the export succeeded every time. Look at the `catch`, though: it never asks **what** failed. Every error gets the same treatment."),

        h2("2. Read the evidence"),
        p("The worker log for one export, filtered by job id:"),
        code("text", `
14:03:02.118 export-worker-2 exp-7731 attempt=1 HttpError: reports API answered 404 (course "nestjs-basics")
14:03:03.121 export-worker-2 exp-7731 attempt=2 HttpError: reports API answered 404 (course "nestjs-basics")
14:03:05.125 export-worker-2 exp-7731 attempt=3 HttpError: reports API answered 404 (course "nestjs-basics")
14:03:09.130 export-worker-2 exp-7731 attempt=4 HttpError: reports API answered 404 (course "nestjs-basics")
   ... attempts 5 to 9, after waiting 8 s, 16 s, then 30 s each ...
14:05:33.161 export-worker-2 exp-7731 attempt=10 HttpError: reports API answered 404 (course "nestjs-basics")
14:05:33.163 export-worker-2 exp-7731 ALERT export exp-7731 failed`, "export worker logs"),
        p("The course `nestjs-basics` was renamed months ago; the reports API answers 404 for it and always will. The worker spent 151 seconds asking anyway, and the alert came at the end of it. Counting one day of attempts by error type shows that this is not an exception:"),
        code("text", `
error type                        attempts   exports   attempts per export
-------------------------------  ---------  --------  -------------------
HttpError 404 (reports API)          1,840       184                 10.0
ValidationError (course id)            960        96                 10.0
Error ENOENT (template file)           410        41                 10.0
TimeoutError (reports API)             356       301                  1.2
HttpError 503 (reports API)            122        97                  1.3
HttpError 429 (reports API)             64        55                  1.2`, "attempts by error type, one day"),
        p("The transient errors - timeouts, 503, 429 - needed about one retry each and then succeeded: the loop did its job for them. The other three never succeeded on any attempt, and they used 3,210 of 3,752 attempts: about 85% of the worker's failed work. A single worker that spends 151 seconds on a hopeless export is a worker that is not running the 30 exports queued behind it."),

        h2("3. Core idea: retry only what can change"),
        p("A retry is a bet that the next attempt will meet a different world: the reports API has restarted, the rate limit window has passed, the network path is back. Before writing a retry, ask of each error: **if I send exactly the same request again, can the answer be different?**"),
        bullets([
            "**Retryable (transient).** Timeouts, connection resets, `5xx` from a dependency (`502`, `503`, `504`, and in a background job usually `500` too), `408 Request Timeout`, and `429 Too Many Requests`, waiting for `Retry-After` when the server sends it. These depend on the state of the other side, and that state changes.",
            "**Permanent.** Your own validation errors (a malformed course id), `4xx` other than `408` and `429` (`400`, `401`, `403`, `404`, `409`, `410`, `422`), and a file that does not exist (`ENOENT`). The answer is about the request itself, and the request does not change between attempts.",
        ]),
        p("`408` and `429` are the two 4xx exceptions. `408` means the server gave up waiting for the request, which says nothing about the request's content. `429` says \"not now\", not \"never\", and often says exactly when (`Retry-After`). Treating every 4xx as permanent would fail exports during a busy hour that would have succeeded a few seconds later."),
        h3("What a permanent error should do instead"),
        bullets([
            "**Fail at once, with the reason.** Mark the export failed with the error message the instructor can act on (\"course nestjs-basics not found\").",
            "**Alert at once,** or count it on a dashboard, depending on whose problem it is. A missing template file is a deploy bug and should page someone now, not in two and a half minutes.",
            "**Free the worker.** The next export in the queue starts immediately.",
        ]),
        callout("info", "When you cannot tell",
            "Some errors are unclear: an `Error` from a library without a code, a `500` from a service you do not know well. A reasonable default in a background job is to retry them with the limit and backoff, and to log them with a marker such as `unclassified=true` so you can move them into one of the two lists once you know what they mean. What you should not do is decide by matching words in error messages: messages change with library versions."),
        h3("Stopping retries in your queue"),
        p("The loop in this worker retries inside one job, so the fix lives in the loop. If you let the queue retry instead, the same classification decides what you tell the queue:"),
        bullets([
            "**BullMQ** retries a job that throws, up to its `attempts` option with its `backoff`. Throwing `UnrecoverableError` from the processor fails the job without using the remaining attempts.",
            "**Amazon SQS** redelivers any message you do not delete. For a permanent error, record the failure and delete the message, or send it to a dead-letter queue yourself, instead of letting it come back until `maxReceiveCount` (lesson 3.2).",
        ]),
        p("Check the current documentation of your queue library for the exact names; the decision is the same in all of them."),

        challenge("chal_quiz_bjm_231"),

        h2("4. Reviewing AI-generated retry code"),
        p("Retry loops are among the most common things an assistant writes when asked for \"reliable\", and among the easiest to get subtly wrong. Its tests tend to prove the happy recovery path: a transient error, then success. Review every generated retry with these questions:"),
        numbered([
            "**What does the `catch` catch?** If it catches everything and never looks at the error, it retries validation errors and bugs too. Ask for the list of retryable errors in the code, not in the comment.",
            "**How much time can one job burn?** Add the delays: 10 attempts with a 1-second base doubling to a 30-second cap is 151 seconds of sleeping per hopeless job. Multiply by how many such jobs arrive per hour.",
            "**When does a human hear about it?** An alert after the last retry is delayed by the whole retry budget, for errors that were obvious on the first attempt.",
            "**Which tests use a failure that never recovers?** If every test failure eventually turns into success, nobody has checked what the loop does with a 404, an invalid id or a missing file.",
            "**Does it retry on more than one layer?** A loop inside the job plus `attempts: 5` on the queue plus retries in the HTTP client multiply: 10 x 5 x 3 = 150 calls for one export.",
        ]),

        h2("5. Worked example: the same idea for another protocol"),
        p("The certificate email worker from lesson 2.1 sends mail through SMTP, and its failures need the same sorting. SMTP shows why you classify per protocol and never by a general rule like \"4xx means the client is wrong\": in SMTP, **4xx replies are temporary** (`421` service not available, `450` mailbox busy, `452` insufficient storage) and **5xx replies are permanent** (`550` mailbox unavailable, `553` mailbox name not allowed). The opposite of HTTP."),
        code("typescript", `
// emails/email.processor.ts - the queue retries (attempts: 6, exponential backoff); we decide what is worth it
import { UnrecoverableError } from "bullmq";

const TRANSIENT_NETWORK = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"]);

function isTemporarySmtpFailure(error: { responseCode?: number; code?: string }): boolean {
  if (error.responseCode !== undefined) {
    return error.responseCode >= 400 && error.responseCode < 500;   // SMTP: 4yz = try again later
  }
  return error.code !== undefined && TRANSIENT_NETWORK.has(error.code);
}

@Processor("emails")
export class EmailProcessor extends WorkerHost {
  async process(job: Job<CertificateEmail>): Promise<void> {
    try {
      await this.mailer.sendMail(renderCertificateEmail(job.data));
    } catch (error) {
      if (isTemporarySmtpFailure(error as { responseCode?: number; code?: string })) throw error; // BullMQ retries
      this.metrics.increment("email.permanent_failure");
      throw new UnrecoverableError(\`not retrying: \${(error as Error).message}\`);              // fails now
    }
  }
}`, "email.processor.ts"),
        p("Two things to copy from it. The classification is a small, named function you can unit test with one case per reply code. And the permanent path still records the failure (a metric, the job's failed reason), so a permanent error is visible at once instead of disappearing."),

        h2("6. How to verify the fix"),
        bullets([
            "**Tests with failures that never recover.** For each permanent error - invalid id, 404, 400, 403, missing file - assert one attempt, no sleep and an alert at time zero on a fake clock. For 408, 429 and a connection reset, assert that they are still retried.",
            "**Attempts per job by error type.** The table from section 2 is the regression check: after the fix, permanent errors show 1.0 attempts per export, transient ones about the same as before.",
            "**Alert latency.** Time from the first failed attempt to the alert. For permanent errors it should drop from minutes to seconds.",
            "**Queue age.** The age of the oldest waiting export should stop climbing in the afternoon (lesson 4.1 shows how to measure it).",
        ]),
        p("The challenge contains the assistant's worker, fake clients that fail in scripted ways and a fake clock. The public tests are the assistant's own: transient failures that recover, and storage that stays down for good. They pass on the code as merged. The hidden tests use the failures from the incident and check the number of attempts, the worker time used and when the alert was sent."),
        challenge("chal_coding_bjm_232"),

        h2("7. Common mistakes"),
        bullets([
            "**`catch (error)` with no question asked.** Every error is retried, including your own bugs. Spot it: the retry decision does not read the error's type, status or code.",
            "**All 4xx treated as permanent.** Exports fail during rate limiting that would have passed a few seconds later. Spot it: failed jobs with status 429 or 408 and one attempt.",
            "**Classifying by message text.** `if (error.message.includes(\"timeout\"))` breaks when a library rewords its message. Spot it: string matching on `message` instead of `instanceof`, `status` or `code`.",
            "**A permanent error that is swallowed.** The fix returns early but records nothing, so nobody learns that an export failed. Spot it: no metric, log or alert on the permanent path.",
            "**Retries on several layers.** The HTTP client, the job loop and the queue all retry the same failure. Spot it: one failing export produces dozens of identical requests in the dependency's access log.",
        ]),

        h2("8. Summary"),
        numbered([
            "A retry only helps when the next attempt can meet a different answer: timeouts, resets, 5xx, 408 and 429 (after Retry-After). Validation errors, other 4xx and missing files fail the same way every time.",
            "Fail permanent errors at once, with the reason and an alert, so they cost one attempt instead of the whole retry budget and the worker moves on; tell the queue too (UnrecoverableError in BullMQ, delete or dead-letter in SQS).",
            "Review generated retry loops by asking what the catch catches, how long a hopeless job can run and which test uses a failure that never recovers.",
        ]),

        h2("Sources"),
        bullets([
            "AWS Builders' Library: Timeouts, retries and backoff with jitter - aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter",
            "BullMQ documentation: Retrying failing jobs, and Stop retrying jobs (UnrecoverableError) - docs.bullmq.io",
            "RFC 9110, HTTP Semantics: 408 Request Timeout and Retry-After; RFC 6585: 429 Too Many Requests; RFC 5321, SMTP: reply codes",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take a worker you own and list every error it can see in a week of logs. Put each one in retryable, permanent or unclear, and write the classification function with one unit test per error. Then ask an AI assistant to \"make the worker reliable\" and review its answer against your list and the five review questions from section 4."),
    ],
});
