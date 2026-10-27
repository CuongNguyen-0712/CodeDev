// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-3-3",
    title: "Fix it: certificate emails sent twice",
    slug: { _type: "slug", current: "fix-certificate-emails-sent-twice" },
    description:
        "Since the workers moved to spot instances, learners get their course certificate email two or three times. The queue is doing its job - at-least-once delivery - and the worker is not: it sends the email, then writes \"sent\", and anything that stops it in between sends the email again. Learn why a database transaction cannot cover an email, how an idempotency key and a claim written before the side effect work together, what to do when the provider has forgotten the key, and how to prove that each learner gets exactly one email.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev certificates and notifications",
        problem:
            "Support forwards a screenshot from a learner: three identical emails, \"Your certificate for TypeScript Foundations\", sent at 10:14:02, 10:14:32 and 10:15:03. A query on the email log finds 312 learners with more than one certificate email in the last week, all since the worker fleet moved to spot instances on Monday. Nobody changed the certificate code.",
    },

    content: [
        h2("1. The incident: the email went out, the \"sent\" did not"),
        p("When a learner completes a course, the API issues the certificate and enqueues a `certificate-email` job. The worker that handles it has not changed in a year:"),
        code("typescript", `
// apps/worker/src/certificates/certificate-email.processor.ts
async process(job: Job<{ certId: string }>) {
  const cert = await this.certificates.findById(job.data.certId);
  if (!cert || cert.emailStatus !== "pending") return;       // already sent
  await this.mailer.send({ to: cert.email, template: "certificate-issued", data: { certId: cert.id } });
  await this.certificates.setEmailStatus(cert.id, "sent");
}`, "certificate-email.processor.ts"),
        p("It looks idempotent: it checks the status before doing anything. On Monday the worker fleet moved to spot instances, which the cloud provider can reclaim with two minutes' notice, and the workers now get stopped several times an hour. These are the logs for the learner in the screenshot:"),
        code("text", `
10:14:02.118 cert-worker-a91 job=cj_5531 cert=cert_7781 receiveCount=1 email accepted by provider id=msg_01HZQ4A
10:14:02.240 cert-worker-a91 SIGTERM: spot instance reclaimed, exiting
10:14:32.507 cert-worker-c07 job=cj_5531 cert=cert_7781 receiveCount=2 email accepted by provider id=msg_01HZQ5K
10:14:32.611 cert-worker-c07 SIGTERM: spot instance reclaimed, exiting
10:15:03.020 cert-worker-e44 job=cj_5531 cert=cert_7781 receiveCount=3 email accepted by provider id=msg_01HZQ6R
10:15:03.131 cert-worker-e44 job=cj_5531 cert=cert_7781 emailStatus pending -> sent`, "Loki, {app=\"cert-worker\"} |= \"cert_7781\""),
        p("Each worker sent the email and died 100 ms later, before `setEmailStatus`. The job was never deleted, so after the 30 s visibility timeout (lesson 2.2) the queue delivered it again, and the next worker found `pending` - true, from the database's point of view - and sent again. The queue did exactly what it promises: **at least once**."),

        h2("2. Reproduce it: list the places where a worker can stop"),
        p("A worker can stop between any two lines: a spot reclaim, an out-of-memory kill, a deploy, a network partition that makes the broker think it died. For a job with a side effect, list every gap and ask what the next delivery will find:"),
        bullets([
            "**Stops before sending.** The status is `pending`, the next delivery sends. Correct: one email.",
            "**Stops after sending, before writing \"sent\".** The status is still `pending`, the next delivery sends again. **Two emails.** This is the incident.",
            "**Is slower than the visibility timeout** (the provider takes 40 s to answer). The queue delivers the job to a second worker while the first is still waiting; both read `pending`, both send. **Two emails**, without any crash.",
            "**Stops after writing \"sent\", before deleting the job.** The next delivery finds `sent` and returns. Correct: one email.",
        ]),
        p("You can reproduce the second case on your machine: run one worker, put a breakpoint (or a `process.exit(1)` behind a flag) after `mailer.send`, and watch the job come back after the visibility timeout. Two entries in the local mail catcher for one job is the bug, reproduced."),

        h2("3. Core idea: you cannot make the email and the database atomic"),
        p("The obvious fix is to put both lines in one transaction. It does not work, and the reason is the most important idea of this lesson: **a transaction can only undo what the database did.** The email left through the provider's API before the process died. When the transaction rolls back, the status goes back to `pending` - which is precisely the state that makes the next worker send again. There is no transaction that spans your database and someone else's SMTP server."),
        p("So \"exactly once\" delivery of an email is not on the menu. What you can build is **effectively once**: the job may run several times, but the effect happens once. Two tools get you there, and this worker needs both:"),
        numbered([
            "**An idempotency key the receiver honours.** Many email and payment APIs accept a key with the request and, within a time window, answer a repeated key with the first result instead of acting again. The key must name the **side effect**, not the attempt: `certificate-email/cert_7781` is the same for every delivery of the job; anything containing the receive count, the worker id or a timestamp is different every time and dedupes nothing. Check your provider's documentation for the header name and the window: here it is 24 hours.",
            "**A marker written before the side effect.** The window ends. A job that waits in a DLQ for two days (lesson 3.2) and is then redriven would send again with a key the provider has forgotten. Before sending, the worker records \"someone has started sending this\" with the time: a **claim**. Any later delivery that finds a claim knows the email may already be out, and how long ago.",
        ]),
        p("The claim alone is not enough either. Mark \"sent\" before sending and a crash right after the mark means the learner never gets the email (at most once). Mark \"sending\" and refuse to touch anything in `sending`, and the same crash leaves the certificate stuck forever. The claim tells the next worker what **might** have happened; the key makes it safe to finish the job anyway, as long as the window is open."),
        h3("The protocol, as a table"),
        code("text", `
status found     claimed          action of this delivery
-------------    ---------------  ------------------------------------------------------------
(no row)         -                nothing (unknown certificate)
sent             -                nothing
needs-review     -                nothing: a person decides
pending          -                claim: pending -> sending, claimedAt = now (compare-and-set);
                                  then read again and follow this table
sending          < 24 h ago       send with key certificate-email/<certId>, then sending -> sent
sending          >= 24 h ago      do not send; sending -> needs-review`, "certificate email protocol"),
        p("The claim uses **compare-and-set**: \"set `sending` only if the status is still `pending`\". When two workers read `pending` at the same moment (the visibility timeout case), only one claim succeeds; the other reads the row again, finds `sending` and continues from the table, sending with the same key - which the provider answers as a duplicate. Both workers end up agreeing and the learner gets one email."),
        callout("info", "Outbox and inbox, briefly",
            "The transactional outbox solves the other half of this problem, on the producer side: the API writes the certificate and an outbox row in one transaction, and a relay publishes the outbox to the queue, so a certificate can never exist without its job. On the consumer side, the same idea appears as a claim or an inbox table of processed message ids. Together they give at-least-once delivery from the database to the worker, and the key plus claim makes the side effect happen once."),
        h3("When not to build this"),
        bullets([
            "**When the side effect is naturally idempotent.** Setting `progress = 100` or upserting a row by id gives the same result however often it runs. A claim and a key there add code without adding safety.",
            "**When a duplicate is harmless and a miss is not.** A cache refresh or a \"your report is ready\" ping can simply run twice.",
            "**When at most once is the honest requirement.** A marketing digest can be marked first and sent second: a rare lost email is cheaper than any duplicate. Choose deliberately, and write the choice down.",
        ]),

        challenge("chal_quiz_bjm_331"),

        h2("4. Worked example: claim, send with a key, reconcile"),
        p("In the NestJS worker, the compare-and-set is an `UPDATE ... WHERE email_status = 'pending'` whose row count tells you whether you won. With Prisma that is `updateMany`:"),
        code("typescript", `
// apps/worker/src/certificates/certificate-email.processor.ts
const DAY_MS = 24 * 60 * 60 * 1000;

async process(job: Job<{ certId: string }>) {
  const key = \`certificate-email/\${job.data.certId}\`; // names the side effect, never the attempt
  for (;;) {
    const cert = await this.db.certificate.findUnique({ where: { id: job.data.certId } });
    if (!cert || cert.emailStatus === "sent" || cert.emailStatus === "needs_review") return;

    if (cert.emailStatus === "pending") {
      await this.db.certificate.updateMany({
        where: { id: cert.id, emailStatus: "pending" },          // compare-and-set
        data: { emailStatus: "sending", emailClaimedAt: new Date() },
      });
      continue;                                                    // read again: our claim or someone else's
    }

    // emailStatus === "sending"
    if (Date.now() - cert.emailClaimedAt!.getTime() >= DAY_MS) {
      await this.db.certificate.updateMany({ where: { id: cert.id, emailStatus: "sending" }, data: { emailStatus: "needs_review" } });
      this.metrics.increment("certificate_email_needs_review_total");
      return;
    }
    await this.mailer.send(
      { to: cert.email, template: "certificate-issued", data: { certId: cert.id } },
      { idempotencyKey: key },                                   // provider dedupes this key for 24 h (check its docs)
    );
    await this.db.certificate.updateMany({ where: { id: cert.id, emailStatus: "sending" }, data: { emailStatus: "sent" } });
    return;
  }
}`, "certificate-email.processor.ts"),
        p("Three details are easy to get wrong. The `continue` after the claim re-reads the row, so the winner and the loser of a race run the same code path from the same state. The final update is also a compare-and-set, so a slow worker that wakes up after another one finished does not overwrite anything. And `needs_review` is not a failure to hide: it is the honest answer to \"I cannot know whether the email went out\", with a metric so that someone sees it."),
        p("A small scheduled job closes the loop: every hour it moves certificates stuck in `sending` for more than 24 hours to `needs_review`, because a job that was lost entirely (purged from a DLQ, say) would otherwise never come back to do it. A person checks the provider's message log for those certificates and either marks them `sent` or resends by hand."),

        h2("5. The challenge: make the worker survive its own crashes"),
        p("The challenge file has the buggy worker, a fake database with a compare-and-set `update`, and a fake email provider that delivers at most once per key within 24 hours. The test runner plays the broker and the infrastructure from a script:"),
        bullets([
            "`{ at, deliver: \"A\", cert }` starts worker A on a delivery of the job; the clock is `at` seconds.",
            "`crashAfter: \"send\"` stops worker A for good right after its first `send` has taken effect: the email is out, the process is gone. `\"get\"` and `\"update\"` work the same way.",
            "`pauseAfter: \"get\"` freezes worker A after its first read until `{ at, resume: \"A\" }` - this is how the runner makes two workers overlap, as the visibility timeout does.",
        ]),
        p("The output counts emails per learner, which is what the support ticket was about. Run the starter: the crash and the overlap scripts already show two emails. Then implement the protocol from the table in section 3."),
        challenge("chal_coding_bjm_332"),

        h2("6. How to verify"),
        bullets([
            "**Count the side effect, not the jobs.** The proof is a query on the email log (or the provider's message list) per certificate: `SELECT cert_id, count(*) FROM email_log WHERE template = 'certificate-issued' GROUP BY cert_id HAVING count(*) > 1` returns zero rows for the days after the fix. Job counts and \"processed\" logs do not prove anything about emails.",
            "**Kill the worker on purpose.** On staging, run the worker with a fault flag that exits right after `mailer.send`, enqueue 100 certificates, and let the queue redeliver. Expected: 100 emails, 100 `sent`, and in the logs about 100 provider answers of \"duplicate\".",
            "**Test the race in a unit test** with a fake clock and a pausable fake, as the challenge does: two workers reading `pending` before either claims, and a worker that wakes up after another one finished.",
            "**Watch `needs_review`.** After the fix it should be rare and explained (a redrive days later). A steady stream means jobs are waiting longer than the provider's window, which is a queue problem to fix (lesson 4.1).",
        ]),

        h2("7. Common mistakes with side effects in workers"),
        bullets([
            "**Check-then-act without compare-and-set.** \"Read pending, then send\" lets two workers both see pending. Spot it: two workers' logs for the same certificate within the visibility timeout, both sending.",
            "**A key that changes on every delivery.** `\${certId}-\${attempt}` or a fresh UUID per call dedupes nothing. Spot it: provider logs showing two accepted messages with different keys for the same certificate.",
            "**Trusting the key beyond its window.** Redrives and long backlogs replay jobs days later. Spot it: duplicates that cluster right after a DLQ redrive, with gaps of more than 24 h between the two sends.",
            "**Marking done before the side effect** to stop duplicates. It turns duplicates into silent losses. Spot it: certificates marked `sent` with no matching entry in the provider's log.",
            "**A transaction around a network call.** It rolls back your row, not the email, and holds locks while waiting on the provider. Spot it: `mailer.send` or `fetch` inside `$transaction` or `BEGIN ... COMMIT`.",
        ]),

        h2("8. Summary"),
        numbered([
            "At-least-once delivery means every job with a side effect will sometimes run twice; a database transaction cannot undo an email, so the effect itself must be made idempotent.",
            "Claim before the side effect (compare-and-set, with the time) and send with an idempotency key that names the effect, so every delivery of the job converges on one email while the provider remembers the key.",
            "When the claim is older than the provider's window, do not guess: mark it for review. Verify by counting the side effect per learner, with crashes and races injected on purpose.",
        ]),

        h2("Sources"),
        bullets([
            "Amazon SQS Developer Guide: at-least-once delivery and visibility timeout - docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html",
            "BullMQ documentation: retrying failing jobs and stalled jobs - docs.bullmq.io",
            "Amazon Builders' Library: Making retries safe with idempotent APIs - aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/",
        ]),
    ],
});
