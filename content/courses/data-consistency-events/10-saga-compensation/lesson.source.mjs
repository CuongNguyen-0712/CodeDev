// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-4-1",
    title: "Sagas: compensating a failed step",
    slug: { _type: "slug", current: "sagas-compensating-a-failed-step" },
    description:
        "A learner paid 349,000 VND for a premium course, the enrollment step failed, and the money stayed captured with no access and no refund. Learn when one local transaction is still the right answer, what a saga is (a chain of local transactions, each with a compensation), why compensations run in reverse order and must be idempotent, why the receipt email goes last and is never compensated, how an orchestrator persists its state so a crash resumes instead of starting over, and how to test every crash point.",
    estimatedTime: 30,

    scenario: {
        role: "Backend engineer on the commerce team, CodeDev learning platform",
        problem:
            "Support ticket #8812, Monday 09:40: \"I paid 349,000 VND for Data Consistency & Event-Driven Patterns on Saturday. My bank shows the charge, the course still says Buy.\" The payments table has a captured card payment for that order. The enrollments table has nothing. The checkout service log shows the card charge succeeded, then POST /enrollments timed out after 5 seconds, and the handler logged the error and returned 502. Nobody refunded the card. A query over the last 30 days finds 37 captured payments with no active enrollment; support has refunded 12 of them by hand.",
    },

    content: [
        h2("1. The incident: four steps and only the first one stuck"),
        p("Buying a premium course on CodeDev is four things, owned by different parts of the system: take the money (points from the wallet, or a card charge through the payment provider), create the enrollment, grant the entitlement that unlocks the lessons, and email a receipt. The checkout handler that shipped did them one after the other:"),
        code("typescript", `
// checkout.service.ts - the version that shipped
async buyCourse(userId: string, courseId: string, method: "points" | "card") {
    const price = await this.catalog.price(courseId, method);
    const payment = await this.payments.charge(userId, price, method);   // card provider or wallet
    try {
        await this.enrollments.create(userId, courseId);                  // HTTP to the enrollment service
        await this.entitlements.grant(userId, courseId);
        await this.mailer.sendReceipt(userId, payment);
    } catch (err) {
        this.logger.error({ err, paymentId: payment.id }, "checkout failed");
        throw new BadGatewayException();                                  // ...and the money stays taken
    }
}`, "checkout.service.ts"),
        p("Every line is reasonable on its own. Together they assume that the four calls either all succeed or all fail. They do not: each one commits in its own system, at its own moment. When the second call failed, the first had already committed in the payment provider, and nothing in the code knew how to take it back."),

        h2("2. Read the evidence"),
        p("Start from the data, not the log. A captured payment for a premium course must have an active enrollment. One query lists every purchase that broke that rule:"),
        code("sql", `
SELECT p.id, p.user_id, p.course_id, p.method, p.amount, p.created_at
FROM payments p
LEFT JOIN enrollments e
       ON e.user_id = p.user_id AND e.course_id = p.course_id AND e.status = 'active'
WHERE p.status = 'captured'
  AND p.created_at > now() - interval '30 days'
  AND e.id IS NULL
ORDER BY p.created_at;

  id    | user_id | course_id               | method | amount | created_at
--------+---------+-------------------------+--------+--------+---------------------
 pay_91 | u_208   | data-consistency-events | card   | 349000 | 2026-10-24 21:13:08
 pay_97 | u_311   | redis-patterns          | points |   1000 | 2026-10-25 08:02:51
 ...
(37 rows)`, "psql"),
        code("text", `
21:13:08.402 checkout  payment captured pay_91 card 349000 VND
21:13:08.407 checkout  POST https://api.codedev.test/internal/enrollments user=u_208 course=data-consistency-events
21:13:13.409 checkout  ERROR checkout failed: TimeoutError after 5000 ms paymentId=pay_91
21:13:13.411 checkout  502 POST /checkout`, "checkout service log"),
        p("Two facts stand out. The failure was a timeout, so the enrollment service may even have created the enrollment later (here it did not: it was restarting). And the handler had no record of where it was: after the error, the only trace of an unfinished purchase is a log line. If the process had crashed between the charge and the enrollment, there would not even be that."),

        h2("3. Why not one transaction, and when you should still use one"),
        p("The obvious wish is to put all four steps in one transaction. Look at where they commit:"),
        bullets([
            "**The card charge** commits in the payment provider. Its API has no \"prepare\" phase you can hold open inside your PostgreSQL transaction, and it would not wait for you if it had.",
            "**The email** is gone the moment the mail provider accepts it. Nothing can un-send it.",
            "**Enrollments and entitlements** live in services that own their own databases. A distributed commit (two-phase commit, XA) needs every participant to support it and holds locks while a coordinator decides, so one slow participant blocks the others. Brokers and most HTTP APIs do not take part in it at all.",
        ]),
        callout("info", "When you do not need a saga",
            "If the steps live in one database, use one transaction. In the CodeDev modular monolith, the points wallet, the enrollments and the entitlements are three tables in one PostgreSQL database: a points purchase is BEGIN; debit the wallet; insert the enrollment; insert the entitlement; insert the receipt into the outbox (lesson 1.3); COMMIT. All or nothing, isolation included, no compensation to write. A saga is what you build when a step commits somewhere your transaction cannot reach - here, the card provider and services with their own databases. Do not split one database into services just to then need sagas."),
        p("A **saga** replaces the one big transaction by a sequence of local transactions, `T1, T2, ... Tn`, where each `Ti` that can be undone has a **compensation** `Ci`. If `Tk` fails, the saga runs `C(k-1), ..., C1`: the compensations of the completed steps, newest first. The idea goes back to Garcia-Molina and Salem's 1987 paper \"Sagas\"; microservices.io describes the modern form."),
        h3("A compensation is not a rollback"),
        p("A rollback makes a change disappear as if it never happened. A compensation is a new, visible business action that cancels the effect of an earlier one: the charge stays in the provider's history and a refund is added next to it; the enrollment row is not deleted, its status becomes `cancelled`. Other services may have seen the intermediate state - the learner may have opened the first lesson - so the compensation must make sense as an event in its own right."),
        h3("Three kinds of step"),
        bullets([
            "**Compensatable**: can be undone by a later action. `pay` (refund), `enroll` (cancel the enrollment), `grant` (revoke the entitlement).",
            "**Pivot**: the point of no return. After it, the saga will finish forward. Here the pivot is `grant`: once access is granted, the purchase stands.",
            "**Retriable**: comes after the pivot and is expected to succeed if you keep trying. It is never compensated. The `receipt` email is one.",
        ]),
        p("That is why the receipt is the last step. An email cannot be compensated - you could send a second email saying \"ignore the first one\", which is worse - so it must come after every step that could still fail and trigger compensations. And when the receipt itself fails, the right answer is to retry it later, not to refund a purchase the learner already has: the course works, only the email is late."),
        h3("Why reverse order"),
        p("Compensating newest-first means every state the database passes through is a state the forward flow could also have produced: \"paid, enrolled\", then \"paid, not enrolled\", then \"nothing\". Compensating in another order creates states the forward flow never does - for example an active enrollment whose payment was already refunded - and a saga has **no isolation**: other services read those states while the compensation runs. The progress service, the leaderboard and the certificate service do not know a purchase is being undone."),
        p("Reverse order shortens the window; it does not close it. When an intermediate state must not be acted on, make it visible as one: create the enrollment as `pending` and switch it to `active` only when the saga completes. Readers that only trust `active` rows ignore it. This is called a **semantic lock**, and it is the usual countermeasure for the missing I in a saga."),

        h2("4. Orchestration: one place that knows where the purchase is"),
        p("There are two ways to drive a saga. In **choreography**, each service reacts to the previous one's event (`PaymentCaptured` makes the enrollment service enroll, `EnrollmentCreated` makes the entitlement service grant...). It is fine for two steps, and it gets hard to follow quickly: the flow lives in four codebases and \"where is order s_7f2?\" has no single answer. In **orchestration**, one component - the orchestrator - calls each step, decides what to do on failure and stores the progress. For a purchase with money involved, CodeDev uses an orchestrator."),
        p("The single most important property of the orchestrator is that its state lives in the database, not in memory. A process can die between any two lines. The saga record says what is done, what is undone, and what to do next:"),
        code("sql", `
CREATE TABLE saga_instances (
    saga_id     text PRIMARY KEY,           -- one per purchase attempt, also the idempotency key
    kind        text NOT NULL,              -- 'buy_premium_course'
    payload     jsonb NOT NULL,             -- user, course, method, price
    status      text NOT NULL,              -- running | compensating | completed | receipt_pending | aborted | stuck
    done        text[] NOT NULL DEFAULT '{}',
    undone      text[] NOT NULL DEFAULT '{}',
    error       text,
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saga_instances_open ON saga_instances (status, updated_at)
    WHERE status IN ('running', 'compensating', 'receipt_pending', 'stuck');`, "migration"),
        p("The orchestrator is a small loop over that record. A worker picks up open sagas (by `status`, oldest `updated_at` first), so after a deploy or a crash the same code simply resumes them:"),
        code("typescript", `
const STEPS = ["pay", "enroll", "grant"] as const;
const UNDO = { pay: "refund", enroll: "cancelEnrollment", grant: "revokeEntitlement" } as const;

async run(sagaId: string): Promise<void> {
    const saga = await this.repo.load(sagaId);
    if (saga.status === "running") {
        for (const step of STEPS) {
            if (saga.done.includes(step)) continue;          // finished before a crash
            const failure = await this.attempt(step, saga);   // retries transient errors, stops on a refusal
            if (failure) {
                saga.status = "compensating";                 // saved BEFORE the first compensation
                saga.error = \`\${step}: \${failure}\`;
                await this.repo.save(saga);
                break;
            }
            saga.done.push(step);
            await this.repo.save(saga);
        }
        if (saga.status === "running") await this.sendReceipt(saga);   // past the pivot: never compensated
    } else if (saga.status === "receipt_pending") {
        await this.sendReceipt(saga);
    }
    if (saga.status === "compensating" || saga.status === "stuck") await this.compensate(saga);
}
}`, "purchase-saga.orchestrator.ts"),
        p("`compensate` walks `done` backwards (newest first), skips every compensation already in `undone`, saves after each one, and ends with `aborted`. If a compensation still fails after its retries, it saves `stuck` and stops; the next run starts again from the same record."),
        p("Follow one crash through it. The process dies after `cancelEnrollment` committed but before `undone` was saved. The next run loads `status = compensating`, `done = [pay, enroll]`, `undone = []`, and runs `cancelEnrollment` again. That is only correct if running it twice is the same as running it once."),

        h2("5. Every step and every compensation must be idempotent"),
        p("Between \"the action committed\" and \"the orchestrator saved that it did\" there is always a gap, and a crash or a timeout in that gap means the action runs again. So each action checks the current state before it changes anything, and the check and the change are in one local transaction. For the points refund that is one conditional `UPDATE`:"),
        code("sql", `
BEGIN;
-- only a payment that is still captured can be refunded: a second run updates 0 rows
WITH refunded AS (
    UPDATE payments SET status = 'refunded', refunded_at = now()
    WHERE saga_id = $1 AND status = 'captured'
    RETURNING user_id, amount, method
)
UPDATE wallets w SET balance = w.balance + r.amount
FROM refunded r
WHERE w.user_id = r.user_id AND r.method = 'points';
COMMIT;`, "refund (points)"),
        bullets([
            "**pay** does nothing when a payment for this `saga_id` already exists. For a card, send the `saga_id` as the idempotency key of the provider's charge call, so the provider returns the first charge instead of making a second one (check that your provider supports idempotency keys).",
            "**enroll** does nothing when this saga's enrollment is already active, and refuses (\"already enrolled\") when another purchase owns one.",
            "**cancelEnrollment** and **revokeEntitlement** touch only the row this saga created (`saga_id = $1`). Undoing a row another purchase owns is a second incident.",
            "**receipt** records the sent email per `saga_id` (or goes through the outbox of lesson 1.3 with an event id derived from the `saga_id`, so the mail consumer's inbox from lesson 2.2 drops a repeat) so a retry after a crash does not send a second email.",
            "A compensation with nothing to undo is a success, not an error. It must not throw \"payment not found\": the step it undoes may never have committed.",
        ]),
        callout("warning", "A timeout means \"I do not know\"",
            "When a step times out, it may have committed anyway. Retry it until you get a definite answer (the step is idempotent, so that is safe), or treat it as failed and compensate it too - which is safe only because a compensation with nothing to undo does nothing. What you must not do is assume \"error = nothing happened\" and move on."),
        p("Retries also have a limit. A compensation that still fails after several attempts - the payment provider is down for an hour - must not block the worker forever, and must not be skipped either: skipping a refund means keeping someone's money. Mark the saga `stuck`, alert on it, and let the next run (or an operator) continue from the same record."),

        challenge("chal_quiz_dce_411"),

        h2("6. Build it: the purchase saga with crashes"),
        p("The exercise gives you an in-memory database with transactions (`FakeDb.tx` commits a copy only when your function returns), a context whose `perform(action, order)` replays scripted faults (transient errors, business refusals) and scripted crashes right after an action commits, and a runner that restarts the saga from the database after each crash. You write the seven actions and `runSaga`:"),
        code("typescript", `
const ACTIONS: Record<ActionName, (t: Tables, order: Order) => void> = {
    pay(t, o) { /* idempotent: a second run after a crash must not charge again */ },
    // enroll, grant, receipt, refund, cancelEnrollment, revokeEntitlement
};

function runSaga(ctx: Ctx, order: Order): void {
    // load or create the record, then by status: run forward, compensate, or retry the receipt
}`, "main.ts"),
        p("The tests crash the process after `pay`, after `grant`, after the receipt and in the middle of the compensations, make the entitlement service refuse, make the receipt fail three times, and replay the same order twice. The log and the final tables must show each charge, refund and email exactly once."),
        challenge("chal_coding_dce_412"),

        h2("7. How to verify a saga"),
        bullets([
            "**A crash matrix, not one happy test.** For a saga with n actions, run one test per \"crash right after action k commits\" and one per \"action k fails\". Assert the final state and the number of side effects (charges, refunds, emails), not only the final status. The exercise's runner is a small version of this.",
            "**Invariant queries in production.** The query from section 2, scheduled: a captured payment without an active enrollment, older than the saga's normal duration, is a bug. So is an active entitlement whose payment is refunded. Lesson 4.2 turns such queries into a reconciliation job.",
            "**Open sagas by status and age.** `SELECT status, count(*), min(updated_at) FROM saga_instances WHERE status <> 'completed' AND status <> 'aborted' GROUP BY status;` A `stuck` saga is an alert; a `running` saga older than a few minutes means the worker is not resuming them.",
            "**The provider's view.** For card payments, compare refunds in the provider's dashboard or report with `payments.status = 'refunded'`. A refund you recorded but the provider never received is exactly the dual-write problem of lesson 1.1, one level up.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**try/catch around the remaining steps, nothing persisted.** The incident. Spot it: a handler that calls several services in a row and has no table recording progress. Ask \"what happens if the process dies after line 2?\"",
            "**Compensating in the order the steps ran.** It reaches the same end state, through states the forward flow never produces. Spot it: the compensation list is written out by hand in forward order, or iterated without `reverse()`.",
            "**Compensations that are not idempotent.** `balance = balance + amount` with no status check. Spot it: run the compensation twice in a test; the second run must change nothing.",
            "**Compensating a step that cannot be compensated.** Refunding a purchase because the receipt email failed, or putting the email before the payment. Spot it: list which steps are compensatable, which is the pivot and which are retriable; anything irreversible belongs after the pivot.",
            "**Resuming from memory.** The orchestrator keeps `done` in a variable and starts over after a restart, charging again. Spot it: kill the worker in a test between two steps and look at the provider's charges.",
        ]),

        h2("9. Summary"),
        bullets([
            "Use one local transaction when the steps share a database. Use a saga when a step commits somewhere your transaction cannot reach: then each compensatable step gets a compensation, and a failure runs the compensations of the completed steps in reverse order.",
            "Order the steps compensatable, then pivot, then retriable. Irreversible side effects such as the receipt email go after the pivot, are retried and are never compensated.",
            "Persist the saga state after every action and make every action idempotent, because a crash or a timeout between \"committed\" and \"saved\" makes the next run repeat it. A compensation that keeps failing marks the saga stuck; it is never skipped.",
        ]),

        h2("Sources"),
        bullets([
            "Hector Garcia-Molina, Kenneth Salem, \"Sagas\", SIGMOD 1987 - the original definition of a saga and its compensating transactions.",
            "Chris Richardson, Pattern: Saga - https://microservices.io/patterns/data/saga.html (orchestration vs choreography, compensatable / pivot / retriable transactions, countermeasures such as semantic locks).",
            "Your payment provider's documentation on idempotency keys for charges and refunds (check the exact header and how long keys are kept).",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Draw the purchase saga as a table: one row per step with its compensation, its kind (compensatable, pivot, retriable) and what a reader sees in the database between that step and the next. Then add a fifth step, \"award 50 bonus points\", and decide where it goes and whether it needs a compensation."),
    ],
});
