// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-saf-3-3",
    title: "When to split a service: signals worth measuring",
    slug: { _type: "slug", current: "when-to-split-a-service-signals-worth-measuring" },
    description:
        "Three months after choosing a modular monolith, the weekly leaderboard recompute starts taking checkout down with it. Learn the four signals that justify splitting something out (independent deploys, different scaling, team ownership, failure isolation) and how to measure each, what a split costs in network failures, data consistency and operations, why a separate worker process is often the smallest split that works, and how the strangler approach moves traffic step by step with a way back.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer on call, CodeDev platform team",
        problem:
            "Sunday 20:12, January 2027. Checkout at https://app.codedev.test returns 502 for nine minutes. One of the two app instances was restarted by the platform after it ran out of memory; the other one was at 100% CPU. Both times this quarter it happened during the weekly leaderboard recompute, which runs inside the app process every Sunday at 20:00. On Monday someone writes in the team channel: \"Time for microservices?\" The modular monolith decision (ADR 0007) has re-evaluation triggers; you are asked whether one has fired and what the smallest change is.",
    },

    content: [
        h2("1. The incident"),
        p("The leaderboard ranks learners by EXP earned in the week. The recompute was written as a scheduled function inside the app because that was the simplest thing that worked when CodeDev had 2,000 learners. It now has 140,000, and the job loads every learner's events of the week into memory:"),
        code("typescript", `
// src/modules/leaderboard/recompute.ts - started by setInterval in the app process
export async function recomputeWeekly(db: Db): Promise<void> {
  const events = await db.query(
    "SELECT learner_id, exp, created_at FROM progress_api.exp_events_v1 WHERE created_at >= $1",
    [startOfWeek()],
  );                                   // about 9 million rows on a Sunday evening
  const totals = new Map<string, number>();
  for (const e of events) totals.set(e.learner_id, (totals.get(e.learner_id) ?? 0) + e.exp);
  await saveRanking(db, [...totals].sort((a, b) => b[1] - a[1]));
}`, "recompute.ts"),
        code("text", `
2027-01-17 20:00:00 app-1  leaderboard.recomputeWeekly started
2027-01-17 20:06:41 app-1  heap used 3.1 GB
2027-01-17 20:11:58 app-1  FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
2027-01-17 20:11:58 lb     app-1 unhealthy, sending all traffic to app-2
2027-01-17 20:12:03 lb     app-2 POST /orders 502 (upstream timeout)`, "logs"),

        h2("2. Read the evidence: the signals sheet"),
        p("Since ADR 0007 the team has kept a small sheet at each monthly review, one row per module, one column per signal. It turns \"should we split?\" into four questions with numbers:"),
        code("text", `
Signals sheet, monthly review (January 2027), one team of 6
Module        blocked deploys/mo  peak load vs the rest                  teams  incidents crossing modules (quarter)
catalog       0                   about the same                         1      0
orders        0                   about the same                         1      0
leaderboard   0                   Sun 20:00-20:40: CPU 100%, RSS 3.4 GB  1      2 (out-of-memory restart, checkout 502
                                  (recompute job, in the app process)           for 6 and 9 min)
progress      0                   about the same                         1      0

APM, POST /orders p95: 310 ms normally, 2.4 s on Sundays 20:00-20:40`, "signals sheet"),
        p("Read it column by column. No module blocks another's deploys. One team owns everything. But one row stands out twice: the leaderboard recompute needs very different resources from everything else, for forty minutes a week, and when it fails it takes checkout down with it."),

        h2("3. Core idea: four signals, three costs"),
        p("Splitting something into its own process or service is worth it when it buys something you can measure. These are the four signals, with where to read each one:"),
        bullets([
            "**Independent deploys.** A module has to ship on its own schedule and others keep blocking it, or its changes keep blocking them. Measure: deploys delayed or rolled back because of another module's change, per month (CI history).",
            "**Different scaling.** A module needs much more CPU, memory or instances than the rest, or at different times, so scaling the whole app for it wastes money or still does not fit. Measure: peak resource use per module or job (APM, process metrics).",
            "**Team ownership.** A separate team owns the module end to end and coordinating releases with other teams costs more than an API between them. Measure: teams in CODEOWNERS, cross-team review waits.",
            "**Failure isolation.** A failure in one module takes down things that matter more. Measure: incidents where the cause and the impact are in different modules (incident log).",
        ]),
        p("A signal is a **reason to look**, not the answer. Every split also has costs, and they arrive on day one:"),
        bullets([
            "**Network.** A function call becomes a request that can be slow, fail or time out, which is the third outcome you handled in lesson 3.1 (`payment_unknown`). Every call needs a timeout, a retry policy and an answer for \"I do not know\".",
            "**Data consistency.** Two services with two databases cannot share a transaction. \"Save the order and record the payment\" becomes two steps that can half-succeed, which needs an outbox, idempotent handlers and reconciliation.",
            "**Operations.** Another pipeline, another set of dashboards and alerts, tracing across services, another thing to run on a laptop, another thing for on-call to understand at 20:12 on a Sunday.",
        ]),
        h3("The smallest split that answers the signal"),
        p("The leaderboard needs isolation of resources and failures. It does not need its own repository, its own database or its own team, because those signals are at zero. So the smallest change is a **separate worker process from the same codebase**: same repository, same deploy, a second entry point that only runs scheduled jobs, on its own instance with its own memory limit. If it runs out of memory, it restarts alone, and checkout never notices. (The job also loads 9 million rows at once; summing in SQL with `GROUP BY` would shrink its memory use too. Fix that as well, but isolation is what protects checkout from the next heavy job.)"),
        code("typescript", `
// src/worker.ts - second entry point, same codebase, deployed as its own process
import { createDb } from "./infra/db";
import { recomputeWeekly } from "./modules/leaderboard";
import { scheduleWeekly } from "./infra/scheduler";

const db = createDb({ poolSize: 2 });           // small pool: it must not starve the app's connections
scheduleWeekly({ day: "sunday", at: "20:00" }, () => recomputeWeekly(db));

// src/server.ts no longer schedules jobs: it only serves HTTP.`, "worker.ts"),
        code("yaml", `
# deploy/processes.yaml - one build, two process types
web:
  command: node dist/server.js
  instances: 2
  memory: 1GB
worker:
  command: node dist/worker.js
  instances: 1
  memory: 4GB`, "processes.yaml"),
        p("If a later review shows a second team owning the leaderboard, or the job needing a different language or runtime, the next step is a service. Measure first; split as little as the evidence requires."),

        h2("4. Worked example: the strangler approach"),
        p("When a signal does justify a real service, do not switch everything in one release. The strangler approach (named after the strangler fig, which grows around a tree until it can stand on its own) moves traffic gradually while the old path keeps working. Suppose a payments team forms and trigger 1 of ADR 0007 fires. Payments already sits behind the `PaymentGateway` port from lesson 2.1, so the switch happens in one adapter:"),
        code("typescript", `
// src/modules/payments/stranglerGateway.ts
// PaymentGateway here is the async port: charge(orderId, amountVnd): Promise<PaymentResult>
type Mode = { shadow: boolean; percentToNew: number };   // read from config, changed without a deploy
type NewGateway = PaymentGateway & {
  verify?(orderId: string, amountVnd: number, expected: PaymentResult): Promise<boolean>;
};

export function stranglerGateway(oldGw: PaymentGateway, newGw: NewGateway, mode: () => Mode,
                                 metrics: Metrics): PaymentGateway {
  return {
    async charge(orderId, amountVnd) {
      const { shadow, percentToNew } = mode();
      const useNew = bucket(orderId) < percentToNew;     // stable: an order always takes the same path
      if (useNew) return newGw.charge(orderId, amountVnd);

      const result = await oldGw.charge(orderId, amountVnd);
      if (shadow) {
        // compare only: the new service checks the charge without moving money (a dry-run endpoint)
        newGw.verify?.(orderId, amountVnd, result)
          .then((same) => metrics.count(same ? "payments.shadow.match" : "payments.shadow.mismatch"))
          .catch(() => metrics.count("payments.shadow.error"));
      }
      return result;
    },
  };
}

function bucket(id: string): number {                     // 0..99, same id -> same bucket
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 100;
  return h;
}`, "stranglerGateway.ts"),
        p("The rollout then becomes a sequence of small, reversible steps, each with a number that must stay clean before the next one:"),
        numbered([
            "**Shadow.** All charges go through the old path; the new service only verifies. Move on when `payments.shadow.mismatch` stays at zero for a week.",
            "**1%, then 10%, 50%, 100%.** Raise `percentToNew` in config. Watch the error rate and p95 of the new path against the old one. Going back is a config change, not a restore.",
            "**Move the data.** Copy payments rows continuously (or dual-write) until the new database is the source of truth; reconcile both sides daily until they match.",
            "**Delete the old path** once 100% has run for an agreed period without a rollback. Only now does the module leave the monolith.",
        ]),

        challenge("chal_quiz_saf_331"),

        h2("5. How to verify a split"),
        p("A split is a hypothesis like any other: \"isolating the recompute stops it from hurting checkout\". Decide before the change which numbers prove it, and read them after:"),
        bullets([
            "**The signal that triggered it.** POST /orders p95 during Sunday 20:00-20:40 back near 310 ms; incidents crossing modules in the next quarter: zero.",
            "**The thing you moved still works.** The ranking is saved every Sunday, and its total EXP matches a `SUM(exp)` query over the same week.",
            "**The costs you took on.** For a worker: its restarts and its peak memory against its limit. For a service: error rate, p95 and timeouts of the new calls, shadow mismatches, reconciliation differences.",
            "**A way back.** For the worker, the old `setInterval` can be re-enabled with a flag for one release; for the strangler, `percentToNew` goes back to 0.",
        ]),
        code("sql", `
-- after the first Sunday: is the saved ranking complete?
SELECT (SELECT SUM(exp) FROM progress_api.exp_events_v1 WHERE created_at >= '2027-01-18') AS events_total,
       (SELECT SUM(total_exp) FROM leaderboard_weekly WHERE week_start = '2027-01-18')     AS ranking_total;`, "check the ranking"),

        h2("6. Common mistakes"),
        bullets([
            "**Splitting by size.** \"Catalog is the biggest module, so it goes first.\" Size is not one of the four signals. Spot it: the proposal names no measurement, only a line count.",
            "**Jumping from one signal to a full microservice.** Resource isolation rarely needs a new database or repository. Spot it: compare what the signal requires with what the proposal adds.",
            "**Ignoring the costs until production.** The first timeout or half-done write shows up after the switch. Spot it: the plan has no timeout, no retry policy and no answer for a missing response.",
            "**Big-bang cutover.** All traffic in one release, old code deleted the same day, data copied once. Spot it: the rollback plan says \"restore the backup\".",
            "**Never finishing the strangler.** Both paths stay forever, and every fix is made twice. Spot it: a strangler flag at 100% for months with the old code still there.",
        ]),

        h2("7. Summary"),
        numbered([
            "Four signals justify a split: independent deploys, different scaling, team ownership and failure isolation. Measure each one per module, every month.",
            "A split costs network failures, data consistency and operations from day one, so take the smallest step the signals require, often a separate worker process from the same codebase.",
            "When a service is justified, strangle the old path: shadow, then small percentages behind a config switch, then move the data, then delete. Verify with the numbers that triggered the split.",
        ]),
        callout("tip", "Self-practice (not graded): fill in your own signals sheet",
            "For an application you work on, fill one row per module with the four signals and a number for each, from data you can actually read (CI history, CODEOWNERS, APM, the incident log). Mark any number you had to guess. If one row stands out, write the smallest change that would answer it and the number you would read afterwards to prove it worked."),
    ],
});
