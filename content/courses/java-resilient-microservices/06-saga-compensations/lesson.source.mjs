// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-jrm-2-3",
    title: "Saga orchestration and compensations",
    slug: { _type: "slug", current: "java-saga-orchestration-compensations" },
    description:
        "Rice Rocket's checkout spans payment, courier, restaurant and notification services, and no database transaction covers them. Learn how an orchestrated saga keeps them consistent: steps with compensations, undoing newest first, treating a timeout as maybe-done, retrying undos, and the pivot after which a saga only moves forward. Then write the orchestrator.",
    estimatedTime: 17,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Checkout authorizes the card, reserves a courier, asks the restaurant to confirm, captures the payment and notifies the customer, each in its own service. Support tickets show cards held for days after rejected orders and orders cancelled while the food was already being cooked.",
    },

    content: [
        h2("Situation"),
        p("Three tickets from one week, with the orchestrator's log lines:"),
        code("text", `
#4411  restaurant rejected, card still authorized 6 days later
       authorize-payment ok | reserve-courier ok | confirm-restaurant rejected | release-courier ok
#4433  payment provider timeout, customer charged for an order that never existed
       authorize-payment TIMEOUT -> saga aborted, nothing to undo
#4470  capture failed once after the kitchen accepted, order cancelled while cooking
       confirm-restaurant ok | capture-payment 503 | void-payment ok | cancel-restaurant ok`, "orchestrator log"),
        bullets([
            "#4411: the old code undid only the step that had just run; the earlier authorization was never voided.",
            "#4433: a timeout was treated as \"did not happen\", but the provider had authorized; only its answer was lost.",
            "#4470: a transient 503 after the restaurant confirmed triggered a full rollback of an order that could no longer be undone.",
        ]),

        h2("The core you need"),
        bullets([
            "**A saga is a sequence of local transactions, each with a compensation.** There is no rollback across services: when step N fails, the orchestrator runs the compensations of the steps that took effect, newest first (release the courier before voiding the payment), so each service sees the reverse of what it did.",
            "**A timeout is \"maybe\".** No answer does not mean no effect. Treat a timed-out step as possibly done and compensate it too; compensations must therefore be idempotent (voiding an authorization that does not exist is a no-op), and every call carries an idempotency key (lesson 4).",
            "**Compensations must eventually succeed.** Retry them with backoff; after a bounded number of attempts mark the saga stuck and alert, because a human must finish it from the saga log.",
            "**The pivot.** Some step cannot be undone in practice (the kitchen started cooking). Steps up to the pivot are compensable; steps after it are retried forward until they succeed, never compensated.",
            "**Persist the saga.** The orchestrator stores each step's state (in its own table, or in a workflow engine such as Temporal or Camunda) so a restarted pod resumes instead of starting over. Orchestration (one coordinator) is easier to reason about than choreography (services reacting to each other's events) once a flow has more than a few steps.",
        ]),

        h2("Apply it in the project"),
        p("The checkout definition in the order-service, with the pivot marked:"),
        code("java", `
SagaDefinition checkout = SagaDefinition.builder("checkout")
    .step("authorize-payment",  payments::authorize,      payments::voidAuthorization)
    .step("reserve-courier",    couriers::reserve,        couriers::release)
    .pivot("confirm-restaurant", restaurants::confirm)                     // food is being cooked
    .retriable("capture-payment", payments::capture)
    .retriable("notify-customer", notifications::orderConfirmed)
    .compensationRetries(5, Duration.ofSeconds(2))
    .build();`, "CheckoutSaga.java"),
        p("Each step's state is written to `saga_step` before and after the remote call, in the same transaction as the saga's own state, so a restart knows which calls may have happened:"),
        code("sql", `
CREATE TABLE saga_step (
  saga_id     uuid        NOT NULL,
  step        text        NOT NULL,
  state       text        NOT NULL,   -- started | done | maybe_done | compensated | failed
  attempts    int         NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (saga_id, step)
);`, "V12__saga_step.sql"),
        callout("info", "Why not a distributed transaction",
            "Two-phase commit needs every service and broker to take part and holds locks while it waits; payment providers and restaurant tablets will not. A saga accepts a short window where the system is inconsistent and closes it with compensations."),

        h2("Verify"),
        code("bash", `
# replay the #4411 path against staging stubs: restaurant rejects
curl -s -X POST localhost:8080/test/checkout -d '{"restaurant":"reject"}' | jq -r '.log[]'
# authorize-payment ok
# reserve-courier ok
# confirm-restaurant rejected
# undo reserve-courier ok
# undo authorize-payment ok
# sagas that need a human
psql -c "SELECT saga_id, step, attempts FROM saga_step WHERE state = 'failed'"`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Compensating in the order of execution.** Voiding the payment before releasing the courier leaves a window where a courier rides to a restaurant for an order nobody pays. Undo newest first; check the order in the saga log.",
            "**Non-idempotent compensations.** A retried `refund` that refunds twice turns a recovery into a loss. Send the saga id as the idempotency key on every call and undo; detect it by replaying a compensation twice in staging.",
            "**No pivot.** Without one, any late failure rolls back work that cannot be undone. Name the pivot in the definition and test a failure right after it.",
        ]),

        p("Now write the orchestrator. The editor holds `Main.java` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the tickets' mistakes on purpose. Run replays scripted service answers, prints every call in order and lists what is still in place at the end."),
        challenge("chal_coding_jrm_162"),
    ],
});
