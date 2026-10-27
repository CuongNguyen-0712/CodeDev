// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-saf-3-1",
    title: "Monolith or microservices? Deciding with evidence",
    slug: { _type: "slug", current: "monolith-or-microservices-deciding-with-evidence" },
    description:
        "A senior engineer proposes splitting the CodeDev platform into seven microservices because deploys are slow and painful, and the first extraction has already sent receipts for declined cards. Work through it like an architect with a deadline: read the team map, the deploy pipeline, the traffic profile and the incident trace, separate what microservices would fix from what they would not, decide on a modular monolith with re-evaluation triggers, fix the side-effect order in placeOrder, and prove both with numbers and a call-log test.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer asked to review an architecture proposal, CodeDev learning platform",
        problem:
            "Wednesday 10:30. The platform team of CodeDev (https://app.codedev.test, API https://api.codedev.test) meets on Friday to decide on RFC-031, which splits the app into seven microservices: deploys take 20 minutes and two of them failed last month. Step 1 of the RFC, moving notifications into its own service, was merged on Monday. This morning support forwarded INC-77: 37 learners got a receipt email for a card that was declined, and 12 of them can open a course they never paid for. You are asked for a recommendation backed by evidence, and for the INC-77 fix.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario. It is the kind of decision a team makes once a year and lives with for five, and it usually arrives wrapped in an incident that makes everyone want to act fast. Two questions are on the table, and they are easy to mix up:"),
        bullets([
            "**The architecture question.** Should CodeDev continue with RFC-031 and become seven services, or keep one deployable application?",
            "**The incident question.** Why did INC-77 send receipts for declined payments, and what is the fix?",
        ]),
        p("The proposal and the incident feed each other: the RFC says microservices make failures isolated, and its first step just caused a failure that crossed three modules. Resist both reflexes, \"microservices are the future\" and \"roll it all back, microservices are bad\". The job of this lesson is to answer each question with the evidence you actually have, and to say how you would check the answer later."),

        h2("2. The evidence pack"),
        p("Five pieces of evidence were collected for Friday's meeting. The quiz below refers to them by letter."),
        h3("A. Team and ownership"),
        code("text", `
# .github/CODEOWNERS (repository codedev-platform, one deployable app)
/src/modules/catalog/         @codedev/platform-team
/src/modules/orders/          @codedev/platform-team
/src/modules/payments/        @codedev/platform-team
/src/modules/notifications/   @codedev/platform-team
/src/modules/progress/        @codedev/platform-team

# platform-team: 6 developers, one sprint board, one on-call rotation
# One Postgres database. Code that reads the orders table:
#   src/modules/orders/, src/modules/payments/, src/modules/progress/report.ts`, "CODEOWNERS and team page"),
        h3("B. Deploy pipeline, last 30 days"),
        code("text", `
Pipeline deploy-production: 19 runs, 17 succeeded, 2 failed, median 20m 10s

Median step durations
  install dependencies          1m 40s
  lint + typecheck              2m 05s
  test (unit + integration)    12m 30s   1 worker, test files run one after another
  build                         1m 55s
  migrate database              0m 40s
  rollout (2 instances)         1m 20s

Failed runs
  2026-09-30  rollout  health check failed in src/modules/progress/report.ts:
              ERROR: column o.amount does not exist
              (migration 0412 renamed orders.amount to orders.amount_vnd) - rolled back
  2026-10-03  migrate  ERROR: canceling statement due to lock timeout
              (migration 0412b on orders waited behind checkout transactions, lock_timeout 5s)`, "CI dashboard"),
        h3("C. Traffic profile, last 4 weeks"),
        code("text", `
Route group          avg req/min   Mon 19:00-21:00 req/min   p95
GET  /catalog/*         2,400            9,800                 85 ms
GET  /progress/*          600            2,100                 60 ms
POST /orders               48              190                310 ms

Catalog: about 50 reads for every write (writes are admin edits)
App: 2 instances x 2 vCPU, CPU average 22%, peak 71% (Mondays 19:00-21:00,
     new lessons go live and the weekly newsletter is sent)
Postgres: CPU peak 38%`, "APM dashboard"),
        h3("D. The proposal"),
        code("text", `
RFC-031 "Split the platform into microservices" (author: senior engineer)
Services (7): catalog, orders, payments, notifications, progress, users, leaderboard
Each service: own repository, own pipeline, own database; HTTP calls and events between them
Expected benefits: "deploys get fast because each service is small",
                   "catalog can scale on its own",
                   "a bug in one service cannot break the others"
Plan: extract notifications first (smallest), then one service every two sprints
Status: step 1 merged on 2026-10-12`, "RFC-031"),
        h3("E. INC-77: the first extraction"),
        code("text", `
INC-77, 2026-10-14 - "I got a receipt but my card was declined"
37 receipts sent for declined payments, 12 learners got course access without paying

Trace of one checkout (order o_51873)
10:14:02.104  orders         placeOrder o_51873 course=redis-patterns amount=149000
10:14:02.106  orders         email.sendReceipt -> POST notifications/receipts o_51873
10:14:02.131  notifications  receipt queued for hoa.tran@example.com o_51873
10:14:02.133  orders         events.publish order.paid o_51873
10:14:02.140  progress       grantAccess u_9310 redis-patterns (consumer of order.paid)
10:14:02.902  orders         payments.charge o_51873 -> declined (insufficient_funds)
10:14:02.910  orders         orders.save o_51873 payment_failed`, "tracing, one request"),
        code("text", `
 function placeOrder(order: Order, deps: Deps): PlaceOrderResult {
     if (!isValid(order)) return { orderId: order.id, status: "rejected" };
+    // notifications is its own service now: tell it as early as possible
+    deps.email.sendReceipt(order.learnerEmail, order.id, order.amountVnd);
+    deps.events.publish("order.paid", { orderId: order.id, learnerId: order.learnerId, courseId: order.courseId });

     const result = deps.payments.charge(order.id, order.amountVnd);`, "PR #611 \"extract notifications\", first hunk of src/modules/orders/placeOrder.ts"),

        h2("3. Reading the evidence"),
        p("Write one line per piece about what it **shows**, before you write anything about what it means:"),
        bullets([
            "**A**: one team of six owns all five modules. Every module already has the same owners, the same board and the same on-call. Three modules read the `orders` table directly.",
            "**B**: twelve and a half of the twenty minutes are the test step, running on one worker. Both failures came from the same change to the `orders` table: first a rename broke a query in `progress`, then the reworked migration waited behind checkout transactions.",
            "**C**: traffic is read-heavy and spiky once a week. At the peak the app uses 71% CPU on two small instances and the database 38%. Nothing is saturated.",
            "**D**: three expected benefits, each a hypothesis that can be checked against A, B and C. The plan gives one service per developer, plus one.",
            "**E**: the receipt (.106) and the `order.paid` event (.133) left `orders` before the charge (.902). `progress` granted access because it trusts `order.paid`. The diff shows who moved the calls and why.",
        ]),

        h2("4. Hypotheses, and the wrong ones to rule out"),
        h3("Why do deploys hurt?"),
        p("B answers it directly. The pipeline is slow because of one step, and the failures come from one kind of change: a schema change to a table that several modules read without going through the owner's code. Both are real problems. Neither is \"the codebase is one deployable\"."),
        h3("Why did receipts go out for declined cards?"),
        p("E answers it directly too. `placeOrder` itself sends the receipt and publishes `order.paid` before it asks the payment gateway. The comment in the diff explains the motive: once notifications became a service, the author wanted to \"tell it early\". The extraction was the reason for the change, but the mechanism is plain call order inside one function. Put the same code in one process with an in-process notifications module and it sends the same wrong receipt."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"Microservices would fix the slow deploys by themselves.\"** Deploy time follows the slowest step, and B says that step is a test run on one worker. Seven pipelines still each install, lint, test, build and roll out. The test step gets faster when you run tests in parallel or only the tests of the modules that changed, and you can do both today, in one repository.",
            "**\"Separate services would have prevented the failed deploys.\"** Only if each service owned its data. Three modules read `orders` directly, so a split that keeps one shared database keeps the same migration failure and adds a network hop. Splitting the data is the expensive part of a split, and it starts with table ownership inside the monolith (lesson 3.2).",
            "**\"The catalog spike needs a separate catalog service.\"** C shows 71% CPU at the peak on two small instances. A third instance of the same app for the Monday window, or caching catalog pages that change once for every 50 reads, covers it at a fraction of the cost. Independent scaling pays when one part needs very different resources from the rest (lesson 3.3).",
            "**\"The network between the services delivered things out of order.\"** E shows the order in which `orders` *sent* them. Nothing arrived before it was sent.",
        ]),
        callout("info", "Three of the four expected benefits are hypotheses",
            "An RFC lists what its author expects. Treat each expected benefit as a hypothesis and look for the evidence that would confirm or refute it. Here A, B and C refute two of them and E refutes the third (\"a bug in one service cannot break the others\": a bug in orders broke notifications and progress)."),

        h2("5. The decision: a modular monolith now, with triggers"),
        p("The recommendation for Friday: **keep one deployable application, make the module boundaries real, fix the two deploy problems directly, and write down the measurements that would reopen the decision.** This is not \"do nothing\". A modular monolith is one process with modules that behave like services inside it:"),
        code("text", `
src/modules/
  catalog/        index.ts (public API) + internal files, owns catalog_* tables
  orders/         index.ts, owns orders
  payments/       index.ts, owns payments; PaymentGateway port + provider adapter
  notifications/  index.ts, owns email_log; EmailSender port + SMTP adapter
  progress/       index.ts, owns enrollments, progress_*

Rules (checked in CI):
  1. A module imports another module only through its index.ts
  2. A module queries only the tables it owns
  3. Dependencies point one way: orders -> payments, orders -> notifications (via ports)`, "target structure"),
        p("The concrete changes, each aimed at one piece of evidence:"),
        numbered([
            "**Tests in parallel** (B): run the test step with several workers, and on pull requests only the tests of the modules the change touches. Measure the median again after a week.",
            "**One owner per table** (A, B): `progress/report.ts` reads paid orders through a function exported by `orders`, not by selecting from the table. Schema changes then become expand-and-contract migrations inside one module.",
            "**Notifications back in-process, behind its port** (E): the `EmailSender` port from lesson 2.1 stays, so moving the adapter out again later is a one-file change, not a rewrite.",
            "**Fix the order in `placeOrder`** (E): the coding challenge below.",
        ]),
        p("A decision without a way to undo it is a bet. Re-evaluation triggers turn \"we might need microservices one day\" into checks anyone can run. Each one has a number and a place to read it:"),
        bullets([
            "**Team**: a second team forms and owns one module end to end (CODEOWNERS shows two teams).",
            "**Deploys**: one module is blocked by others' changes more than twice a month, after tests run in parallel (CI dashboard).",
            "**Scaling**: one module needs more than three times the instances of the rest at its peak, or its peak costs more to serve with the whole app than alone (APM).",
            "**Failure isolation**: a failure in one module takes down checkout twice in a quarter (incident log).",
        ]),
        p("When a trigger fires, the team reopens the decision for **that** module, using the signals from lesson 3.3 and the strangler approach, one module at a time. Write it all down in an ADR (lesson 3.4) so that the person who reopens it in a year knows what was measured and why."),

        challenge("chal_quiz_saf_311"),

        h2("6. The challenge: fix the order of side effects"),
        p("Whatever the team decides on Friday, INC-77 must be fixed today. The rule behind the fix is short: **a side effect announces a fact, so the fact must exist first.** A receipt says \"you paid\". An `order.paid` event says \"this order is paid\" to every module that listens, including `progress`, which grants access. Neither may leave before the payment succeeded and the order was saved as paid."),
        p("The challenge file has the `placeOrder` from PR #611 and the four ports it uses: `PaymentGateway`, `OrderRepository`, `EmailSender` and `EventBus`. The test runner plugs in fakes that write every call to a call log and prints the log after each checkout, followed by a summary line with the number of receipts, events, and side effects sent before the order was saved as paid. The gateway answers in three ways, and each needs its own outcome:"),
        bullets([
            "**succeeded**: save the order as `paid` with the charge id, then send the receipt, then publish `order.paid`.",
            "**declined**: save the order as `payment_failed`. No receipt, no event.",
            "**timeout**: you do not know whether the charge happened. Save the order as `payment_unknown` so a reconciliation job can ask the provider later. No receipt, no event: telling the learner \"paid\" or \"failed\" would both be guesses.",
        ]),
        p("Run the starter with a declined checkout first and read the call log: it is the trace from E, in four lines. Then change the order and run it again."),
        challenge("chal_coding_saf_312"),
        callout("info", "What this fix does not cover",
            "Saving the order and publishing the event are still two separate steps: if the process crashes between them, the order is paid and nobody is told. The usual answer is a transactional outbox: write the event to an outbox table in the same transaction as the order, and let a worker publish it. That is a reliability improvement on top of the right order, not a replacement for it."),

        h2("7. How to verify"),
        p("Both answers need a check that someone else can rerun. For the fix, a test that only buys a course with a working card proves nothing: the code from PR #611 sends exactly one receipt in that case too. The test must cover the outcomes INC-77 broke and assert the order of the calls:"),
        code("typescript", `
// src/modules/orders/placeOrder.test.ts (Vitest)
test("a declined card sends no receipt and publishes no order.paid", () => {
  const log: string[] = [];
  const deps = fakeDeps(log, { charge: "declined" });

  const result = placeOrder(order({ id: "o_1" }), deps);

  expect(result.status).toBe("payment_failed");
  expect(log).toEqual(["payments.charge o_1", "orders.save o_1 payment_failed"]);
});

test("a paid order is saved before the receipt and the event", () => {
  const log: string[] = [];
  placeOrder(order({ id: "o_2" }), fakeDeps(log, { charge: "succeeded" }));

  expect(log).toEqual([
    "payments.charge o_2",
    "orders.save o_2 paid",
    "email.sendReceipt o_2",
    "events.publish order.paid o_2",
  ]);
});`, "placeOrder.test.ts"),
        p("Add the same test for a timeout. Then check production after the deploy with a query that should return zero rows from now on, and the 37 rows of INC-77 before it:"),
        code("sql", `
-- Receipts sent for orders that are not paid
SELECT e.order_id, e.sent_at, o.status
FROM email_log e
JOIN orders o ON o.id = e.order_id
WHERE e.kind = 'receipt'
  AND o.status <> 'paid'
  AND e.sent_at >= '2026-10-12';`, "run on a read replica"),
        p("For the decision, the verification is the trigger list plus three numbers on the CI and APM dashboards, read again at each monthly review: the median deploy time (target: under 10 minutes once tests run in parallel), failed deploys per month (target: none caused by a table another module owns), and the number of queries against tables another module owns (target: zero, enforced by the rule in lesson 3.2). If the numbers do not move, the decision was wrong and the ADR says so."),

        h2("8. Common mistakes in a monolith-or-microservices decision"),
        bullets([
            "**Treating the architecture as the cause of every pain.** Slow tests, a shared table and a wrong call order all have direct fixes. Spot it: for each pain in the proposal, ask which step of the pipeline or which line of code causes it.",
            "**Splitting the code but not the data.** Seven services on one database keep every migration problem and add network failures. Spot it: list which tables each proposed service would read and write; any table on two lists is still shared.",
            "**Scaling the part instead of the whole without a number.** \"It has a spike\" is not a reason. Spot it: compare peak CPU and memory with what one more instance of the whole app costs.",
            "**Blaming the network for an ordering bug.** Distributed systems do reorder messages, but a trace that shows the sender's own order settles it. Spot it: read the timestamps of the *sending* side first.",
            "**Deciding forever.** \"Monolith\" or \"microservices\" stated as a belief cannot be revisited. Spot it: a decision record without re-evaluation triggers, or triggers without numbers.",
        ]),

        h2("9. Summary"),
        numbered([
            "Check each expected benefit of a split against evidence: team map, pipeline steps, traffic and incidents. Here one team, a slow test step, a shared table and spare capacity point to a modular monolith with re-evaluation triggers.",
            "A side effect announces a fact: charge, then save as paid, then send the receipt and publish the event. A declined charge or a timeout sends nothing.",
            "Verify both: a call-log test for the declined and timeout cases, a production query for unpaid receipts, and the deploy and ownership numbers at each review.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler, \"MonolithFirst\" - https://martinfowler.com/bliki/MonolithFirst.html",
            "Architecture decision records: templates and examples - https://adr.github.io/",
            "Martin Fowler, \"DIP in the Wild\" (ports and the direction of dependencies) - https://martinfowler.com/articles/dipInTheWild.html",
        ]),
        callout("tip", "Self-practice (not graded): write the ADR (Monolith vs Microservices)",
            "Write ADR 0007 \"Keep a modular monolith for now\" for Friday's meeting, in at most one page: the context with the numbers from A to E, the three options you considered (RFC-031 as written, a modular monolith, no change), the decision, the consequences including what gets harder, and the four re-evaluation triggers, each with the dashboard where it is read. Lesson 3.4 shows the format; compare your version with the one there."),
    ],
});
