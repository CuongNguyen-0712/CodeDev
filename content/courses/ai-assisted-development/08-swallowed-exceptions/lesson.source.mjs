// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aad-3-2",
    title: "Swallowed exceptions: the catch block that hid a failed payment",
    slug: { _type: "slug", current: "swallowed-exceptions-catch-block-hid-failed-payment" },
    description:
        "Finance's reconciliation finds 23 learners enrolled in a premium course without a captured payment, and the logs have nothing about any of them. The cause is two catch blocks an AI assistant wrote when it was told to \"handle errors\". Learn what every catch block has to decide (the outcome, what to undo, what evidence to leave), how to tell expected failures from unexpected ones, when catching without rethrowing is right, and how to review AI code for errors that disappear.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The October reconciliation between the enrollments table and the payment gateway does not balance: 23 learners have an active premium enrollment and no captured payment, 3,427,000 VND in total. The gateway shows a declined charge for each of them. The API logs show nothing - no error, no warning, not even the decline. The enrollment flow was rewritten in September by an AI coding assistant (PR #655), reviewed and merged with green CI.",
    },

    content: [
        h2("1. The incident"),
        p("Finance runs the same check at the end of every month: every active premium enrollment must have a captured payment. In October it did not balance. This is the report they posted in the #payments channel:"),
        code("sql", `
-- reconciliation, October 2026
SELECT e.id, e.user_id, e.course_id, e.charge_id, e.created_at
FROM billing.enrollments e
LEFT JOIN billing.captured_payments p ON p.charge_id = e.charge_id
WHERE e.status = 'active' AND e.price_vnd > 0 AND p.charge_id IS NULL;

    id      | user_id | course_id | charge_id |     created_at
------------+---------+-----------+-----------+---------------------
 enr_48213  | u_9921  | aad       |           | 2026-10-02 08:14:51
 enr_48377  | u_10457 | trf       |           | 2026-10-03 21:40:09
 ...
(23 rows)`, "Run against the billing replica"),
        p("Three more pieces of evidence came in within the hour:"),
        bullets([
            "**The gateway dashboard** lists a charge for each of the 23 enrollment ids (the code uses the enrollment id as the idempotency key), all with status `declined` and codes such as `insufficient_funds` and `expired_card`.",
            "**The API logs** for the same requests show `POST /enrollments 201` and nothing else. No warning, no error, no line with the decline code.",
            "**The error tracker** has zero events for the enrollment service since the September release.",
        ]),
        p("A declined card is a normal event. The platform is supposed to tell the learner and keep the course locked. Instead the learners got the course, and every system that should have noticed reported that all was well. Here is the code from PR #655:"),
        code("typescript", `
// enrollment.service.ts (AI-generated, PR #655)
// Request: "Write enrollWithPayment for premium courses: create the enrollment, charge the
// learner's payment method through the gateway, activate the enrollment and email a receipt.
// Handle errors."
async function enrollWithPayment(req: EnrollRequest, deps: Deps): Promise<EnrollOutcome> {
  const enrollment = await deps.enrollments.insert({ userId: req.userId, courseId: req.courseId });
  const chargeId = await chargeLearner(req, enrollment.id, deps);
  await deps.enrollments.activate(enrollment.id, chargeId);
  try {
    await deps.mailer.sendReceipt(req.userId, req.courseId);
  } catch {
    // the receipt is not critical
  }
  return { status: "enrolled", enrollmentId: enrollment.id };
}

async function chargeLearner(req: EnrollRequest, enrollmentId: string, deps: Deps): Promise<string | null> {
  try {
    const charge = await deps.gateway.charge({
      paymentMethodId: req.paymentMethodId,
      amountVnd: req.priceVnd,
      idempotencyKey: enrollmentId,
    });
    return charge.chargeId;
  } catch (e) {
    return null;
  }
}`, "enrollment.service.ts"),

        h2("2. Reading the code: where did the error go?"),
        p("Follow one declined card through the code, the way you followed the SQL string in the last lesson:"),
        numbered([
            "`insert` creates the enrollment row (pending).",
            "`gateway.charge` throws `PaymentDeclinedError(\"insufficient_funds\")`.",
            "The `catch (e)` in `chargeLearner` receives it and returns `null`. From here on, the error does not exist: no exception, no log line, no event in the error tracker.",
            "`enrollWithPayment` gets `chargeId = null` and has no reason to doubt it. It activates the enrollment with no charge id.",
            "The receipt goes out, and the function returns `{ status: \"enrolled\" }`. The controller answers 201. The learner is in.",
        ]),
        p("The type even warned about it: `chargeLearner` returns `string | null`, and `activate` accepts `string | null` because pending rows have no charge. `null` was meant to mean \"not charged yet\", and the catch reused it to mean \"the charge failed\". When an error is converted into an ordinary value, every caller has to know that the ordinary value secretly means failure - and here none of them did."),
        p("The second catch looks similar and is a different problem. A bounced receipt email after a successful payment is a real failure that should **not** undo the enrollment. But `catch { }` with a comment makes it invisible too: nobody will ever resend the receipt, because nobody knows it was not sent."),
        callout("info", "Why the linter stayed quiet",
            "ESLint's no-empty rule reports empty blocks, including an empty catch, but it ignores a block that contains a comment. \"// the receipt is not critical\" is enough to pass it. The catch in chargeLearner is not empty at all: return null is a statement. Lint rules catch the laziest form of the mistake; review has to catch the rest."),

        h2("3. Why AI code swallows errors"),
        p("The request said \"Handle errors\". To a model trained on a large amount of public code, the most common shape of \"handled\" is a try/catch that keeps the function from throwing: return `null`, return `[]`, return `false`, log to the console, or nothing. It makes the happy path work, it makes the code look defensive, and the tests the assistant writes - usually happy-path tests - stay green. Nothing in \"handle errors\" says what the *right* outcome of each failure is, so the model picks the outcome that never crashes."),
        p("That is the pattern to look for in review: **a catch that changes the meaning of a failure without telling anyone**. The fix is not to remove every catch. It is to make every catch answer three questions on purpose:"),
        numbered([
            "**What is the outcome?** Map an expected failure to a result the caller understands (`payment_declined` with the code), rethrow an unexpected one so the caller can fail properly, or continue because the failure does not change the outcome.",
            "**What must be undone?** Anything this function already changed that is now wrong: the pending enrollment row, a debited wallet, a reserved seat. Undo it before you return or rethrow.",
            "**What evidence is left?** A log line with the context someone needs to act - which enrollment, which learner, which course, why - at a level that matches: `warn` for an expected failure that someone may want to follow up, `error` for a failure that needs attention.",
        ]),
        h3("Expected failures and unexpected ones"),
        p("The distinction decides the outcome. A **declined card** is an expected business result: the gateway answered, the answer was no, and the learner should see \"your card was declined (insufficient funds)\" and try another card. That belongs in the return type. A **gateway timeout**, a 502 from the gateway or a bug in your code is unexpected: you do not know whether the card was charged, and pretending it was declined would lie to the learner and to support. Let it propagate: the error middleware answers 503 or 500, the error tracker records it, and the idempotency key lets a retry find out what really happened."),
        h3("When catching without rethrowing is right"),
        p("Side effects that do not change the outcome and can be retried: sending a receipt, recording an analytics event, warming a cache. If they fail after the payment and the enrollment are committed, failing the whole request would be worse - the learner who paid sees an error and tries to pay again. Catch, decide the outcome (still enrolled), and leave evidence a retry job or support can act on. What separates this from the AI's version is not the control flow; it is the log line."),

        challenge("chal_quiz_aad_321"),

        h2("4. Worked example: unlocking a course with points"),
        p("The same three questions on another CodeDev flow. Learners can unlock some courses with EXP points instead of money: debit the wallet, then create the enrollment. The challenge asks you to apply this to the payment flow; this example shows the pattern on different code."),
        code("typescript", `
class InsufficientPointsError extends Error {
  constructor(readonly balance: number, readonly price: number) {
    super(\`balance \${balance} < price \${price}\`);
    this.name = "InsufficientPointsError";
  }
}

type UnlockOutcome = { status: "unlocked"; enrollmentId: string } | { status: "not_enough_points"; missing: number };

async function unlockWithPoints(userId: string, courseId: string, price: number, deps: PointsDeps): Promise<UnlockOutcome> {
  const ctx = (reason: string) => ({ userId, courseId, price, reason });

  let debitId: string;
  try {
    debitId = await deps.wallet.debit(userId, price, { reference: \`unlock:\${courseId}\` });
  } catch (error) {
    if (error instanceof InsufficientPointsError) {
      // Expected: map it. Nothing to undo, nothing was debited.
      return { status: "not_enough_points", missing: error.price - error.balance };
    }
    throw error; // unexpected: the API answers 5xx, the error tracker records it
  }

  try {
    const enrollment = await deps.enrollments.insert({ userId, courseId, source: "points" });
    return { status: "unlocked", enrollmentId: enrollment.id };
  } catch (error) {
    // The points are gone but there is no enrollment: undo the debit, then fail loudly.
    await deps.wallet.refund(debitId);
    deps.logger.error("points_unlock_failed", ctx(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}`, "points.service.ts"),
        p("Notice what it does **not** do. It does not catch around the whole function. It does not log the expected outcome at `error` level (a learner without enough points is not an incident). It does not log the wallet failure before rethrowing it, because there is nothing to add: the error middleware logs everything that reaches it, and logging the same failure at every layer turns one incident into five alerts. It does log the failed insert, because only this function knows the context - which course, which price, and that a refund was just made. And the compensating refund happens before the rethrow, so the failure leaves the system consistent."),
        callout("warning", "When the undo step can fail too",
            "If the refund itself throws, the wallet and the enrollments disagree and no code path can fix it right now. That is what the reconciliation job and the error log are for: the error carries the debit id, and the job finds debits without an enrollment. For money, design the check that finds inconsistencies before you need it - that is how this incident was found at all."),

        h2("5. Reviewing AI code for swallowed errors"),
        p("Swallowed errors are easy to find once you know their shapes. Search the diff for them, and for each hit ask the three questions:"),
        bullets([
            "`catch {}` or `catch (e) {}`, with or without a comment inside.",
            "A catch that returns a normal-looking value: `return null`, `return []`, `return false`, `return { ok: true }`, `res.json([])`.",
            "`.catch(() => ...)` on a promise, and `.catch(console.error)`, which logs without context and continues as if nothing happened.",
            "`Promise.allSettled` whose rejected results are never read.",
            "A catch that only logs `e.message` with no ids: the evidence exists, but nobody can act on it.",
        ]),
        p("Then fix the request, not just the code. \"Handle errors\" gives the assistant nothing to aim at. Name the failures and their outcomes, and ask for the tests that prove them:"),
        code("text", `
Write enrollWithPayment. Errors:
- PaymentDeclinedError from the gateway: remove the pending enrollment, log warn
  "payment_declined" with enrollmentId, userId, courseId and the decline code, and return
  { status: "payment_declined", code }.
- Any other gateway error: remove the pending enrollment, log error "payment_failed", rethrow.
- Receipt email failure: keep the enrollment, log warn "receipt_failed".
Do not catch anything else. Add one test per failure that checks the outcome, the stored rows
and the log lines, using a fake gateway that throws each error.`, "A request that says what \"handled\" means"),

        h2("6. The challenge"),
        p("The challenge file contains the AI's `enrollWithPayment` from section 1, an in-memory enrollments table, a fake gateway that behaves by payment method id (approved, declined with a code, timeout, or an unexpected 502), a mailer that bounces the addresses listed in the test, and a logger that prints every line. The runner sends the test's requests in order and prints each outcome or thrown error, every log line, the rows left in the table and the captured charges - the same evidence finance and support would look at."),
        p("Run the starter on the public tests first. The declined-card test shows the incident: an active row with no charge, no log line, and the outcome \"enrolled\"."),
        challenge("chal_coding_aad_322"),

        h2("7. How to verify the fix"),
        bullets([
            "**One test per failure, with a fake that throws it.** Declined, timeout, unexpected error, bounced receipt, already enrolled. Assert three things each time: the outcome or the thrown error, the rows left in the table, and the log lines. A happy-path test cannot catch a swallowed exception, by definition.",
            "**The retry test.** A declined card followed by a second attempt with another card must enroll the learner. If the first attempt left its pending row behind, the second fails with a duplicate error - the rollback is tested by behaviour, not by reading the code.",
            "**The reconciliation query as a monitor.** Run the query from section 1 daily instead of monthly and alert on any row. It is the check that does not depend on the code being right.",
            "**The error tracker and the log volume.** After the deploy, `payment_declined` warnings should appear at roughly the gateway's decline rate. Zero warnings for a day is not good news; it means the errors are going somewhere else again.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Removing every catch.** The over-correction: the receipt failure now fails a paid enrollment and the learner pays twice. Spot it: ask, for each catch you delete, what the outcome should be when that call fails after the earlier steps succeeded.",
            "**Catching too broadly.** One try/catch around the whole function treats a duplicate enrollment, a declined card and a database outage the same way. Spot it: a catch whose body does not look at the error's type.",
            "**Mapping unexpected failures to an expected result.** A timeout reported as \"card declined\" sends the learner to try another card while the first charge may have gone through. Spot it: `instanceof` checks are missing, or there is a default branch that returns a business result.",
            "**Logging without context, or at every layer.** `console.error(e)` cannot be acted on; the same error logged by the service, the controller and the middleware becomes three alerts. Spot it: a log call without ids, or the same error message several times for one request. Log where you add context (ids, what you undid) and let the middleware log the rest.",
            "**Forgetting the undo.** The error is reported correctly but the pending row stays. Spot it: list the writes before the failing call and check each one is reverted on the error path.",
        ]),

        h2("9. Summary"),
        numbered([
            "A swallowed exception changes the meaning of a failure without telling anyone: return null, [] or an empty catch made a declined payment look like an enrollment, and left no evidence.",
            "Every catch decides on purpose: the outcome (map an expected failure, rethrow an unexpected one, or continue when the outcome does not change), what to undo, and the log line with the context someone needs.",
            "Verify with one test per failure that checks the outcome, the stored rows and the logs, and keep an independent check - like reconciliation - that does not trust the code.",
        ]),

        h2("Sources"),
        bullets([
            "ESLint documentation: no-empty (empty blocks, the allowEmptyCatch option and comments) - eslint.org/docs/latest/rules/no-empty",
            "MDN Web Docs: try...catch and the Error object",
            "Stripe documentation: Idempotent requests (why the idempotency key lets a retry find out what happened) - docs.stripe.com/api/idempotent_requests",
        ]),
        callout("tip", "Self-practice (not graded): audit your own catch blocks",
            "Search a codebase you work on for catch blocks and .catch( calls. For ten of them, write one line each: the outcome on failure (mapped, rethrown or continued), what is undone, and what log line is left. Mark every one where the answer to any of the three is \"nothing\" and nobody decided that on purpose. Then pick the riskiest and write the test with a fake that throws."),
    ],
});
