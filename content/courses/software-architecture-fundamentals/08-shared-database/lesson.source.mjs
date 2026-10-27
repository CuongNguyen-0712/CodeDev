// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-saf-3-2",
    title: "Shared databases & who owns the data",
    slug: { _type: "slug", current: "shared-databases-who-owns-the-data" },
    description:
        "A column rename in the orders module took a production deploy down, because the progress module selected that column directly. Learn why a table read by several modules is hidden coupling even inside one deployable app, how to give every table exactly one owner, how other modules read the data through the owner's API or a port, when a shared read model is acceptable, and how to make CI and Postgres reject a query against a table another module owns.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev platform team",
        problem:
            "On 30 September the deploy of https://api.codedev.test failed its health check and was rolled back. Migration 0412 had renamed orders.amount to orders.amount_vnd and updated every query in the orders module, and its tests passed. The health check failed in src/modules/progress/report.ts, which builds the learner's purchase history by selecting o.amount from the orders table. Nobody on the orders side knew that query existed. After the Monolith or Microservices decision, the team agreed on one owner per table; you are asked to make that rule real.",
    },

    content: [
        h2("1. The incident: a rename that broke another module"),
        p("Migration 0412 was a small, careful change. The developer renamed the column so that every money column says its currency, searched the orders module for `amount`, updated three queries, and ran the orders tests. All green. The deploy then failed here, in a file the developer never opened:"),
        code("typescript", `
// src/modules/progress/report.ts
export async function purchaseHistory(db: Db, learnerId: string): Promise<PurchaseRow[]> {
  return db.query(
    \`SELECT o.id, o.course_id, o.amount, o.paid_at
       FROM orders o
      WHERE o.learner_id = $1 AND o.status = 'paid'
      ORDER BY o.paid_at DESC\`,
    [learnerId],
  );
}`, "report.ts"),
        code("text", `
2026-09-30 14:21:07 rollout  GET /health/deep -> 500
  progress.purchaseHistory: ERROR: column o.amount does not exist
  LINE 1: SELECT o.id, o.course_id, o.amount, o.paid_at
2026-09-30 14:21:09 rollout  health check failed, rolling back to 2026.09.29-3`, "deploy log"),
        p("Both modules live in the same repository, are deployed together and belong to the same team. Still, the orders developer had no way to see that `progress` depended on the name of a column. That is the problem this lesson is about."),

        h2("2. Read the evidence: who touches which table?"),
        p("Before you change anything, find out how far the sharing goes. A text search over SQL is crude, but it answers the question in a minute:"),
        code("bash", `
$ rg -n --glob '*.ts' '(FROM|JOIN|UPDATE|INTO)\\s+orders\\b' src/modules
src/modules/orders/repository.ts:12:      FROM orders WHERE id = $1
src/modules/orders/repository.ts:31:    INSERT INTO orders (id, learner_id, course_id, amount_vnd, status)
src/modules/orders/repository.ts:44:    UPDATE orders SET status = $2, charge_id = $3 WHERE id = $1
src/modules/payments/reconcile.ts:18:      JOIN orders o ON o.id = p.order_id
src/modules/progress/report.ts:4:       FROM orders o`, "terminal"),
        p("Read it as a list of dependencies nobody declared. `orders` writes the table; `payments` and `progress` read it. Each of those reads depends on column names, on the meaning of `status = 'paid'` and on how long the orders module holds locks. Those are three contracts, and none of them appears in an import statement, a type or a test of the orders module."),

        h2("3. Core idea: a shared table is hidden coupling"),
        p("In lesson 1.2 you measured coupling by counting imports. A query against another module's table is coupling that the count misses: the compiler does not see it, the dependency rules from lesson 1.3 do not see it, and the owner's tests do not run it. The schema has become a public API that nobody published."),
        bullets([
            "**Changes ripple without warning.** Any rename, type change or new meaning of a status breaks readers you cannot list.",
            "**Rules get bypassed.** If `orders` decides that a refunded order no longer counts as paid, `progress/report.ts` keeps counting it, because it has its own copy of the rule in SQL.",
            "**Load and locks are shared.** In migration 0412b, a long-running read or an ALTER on `orders` stalls checkout transactions too.",
            "**A later split gets expensive.** If the team ever extracts orders (lesson 3.3), every direct reader has to be found and rewritten first.",
        ]),
        h3("One owner per table"),
        p("The rule is simple to state: **every table has exactly one owning module. Only the owner writes it, and only the owner queries it.** Everyone else asks the owner, through a function in the owner's public API (its `index.ts`) or through a port the reader defines and an adapter that calls that API. Write the ownership map down where CI can read it:"),
        code("json", `
{
  "catalog": ["catalog_courses", "catalog_lessons"],
  "orders": ["orders"],
  "payments": ["payments"],
  "notifications": ["email_log"],
  "progress": ["enrollments", "progress_events"]
}`, "architecture/table-owners.json"),
        h3("When not to bother, and when sharing is fine"),
        p("Ownership has a cost: an extra function, sometimes an extra query where a join used to do. It is not worth it in a two-week prototype, or when two \"modules\" are really one concept split in the wrong place (then merge them). And some sharing is acceptable when it is **declared**:"),
        bullets([
            "**A read model published by the owner.** The owner exposes a view or a reporting table with a version in its name, keeps its columns stable and tests them. Readers depend on that contract, not on the internal table.",
            "**Analytics on a replica.** The data team queries a read replica or a warehouse copy; their dashboards may break on a rename, and everyone has agreed that this is acceptable for reports, but not for features learners use.",
            "**Data that is copied, not shared.** A module keeps its own copy of the few fields it needs, updated from events such as `order.paid`. It owns its copy.",
        ]),
        p("What is never fine is a second module **writing** someone else's table: then two modules own the rules for the same rows."),

        h2("4. Worked example: reading orders through the owner"),
        p("The orders module publishes the one question progress needs answered, in its own vocabulary:"),
        code("typescript", `
// src/modules/orders/index.ts - the public API of the orders module
export type PaidOrder = { orderId: string; courseId: string; amountVnd: number; paidAt: string };

export async function paidOrdersFor(db: Db, learnerId: string): Promise<PaidOrder[]> {
  const rows = await db.query(
    \`SELECT id, course_id, amount_vnd, paid_at
       FROM orders
      WHERE learner_id = $1 AND status = 'paid'
      ORDER BY paid_at DESC\`,
    [learnerId],
  );
  return rows.map((r) => ({ orderId: r.id, courseId: r.course_id, amountVnd: r.amount_vnd, paidAt: r.paid_at }));
}`, "orders/index.ts"),
        p("Progress depends on a port that describes what **it** needs (lesson 2.1), and one adapter connects that port to the orders API. Progress no longer knows that a table called `orders` exists:"),
        code("typescript", `
// src/modules/progress/ports.ts
export interface PurchaseSource {
  paidOrdersFor(learnerId: string): Promise<{ courseId: string; amountVnd: number; paidAt: string }[]>;
}

// src/modules/progress/report.ts
export async function purchaseHistory(purchases: PurchaseSource, learnerId: string) {
  const orders = await purchases.paidOrdersFor(learnerId);
  return orders.map((o) => ({ course: o.courseId, paid: o.amountVnd, at: o.paidAt }));
}

// src/app/wiring.ts - the only place that knows both modules
import { paidOrdersFor } from "../modules/orders";
const purchases: PurchaseSource = { paidOrdersFor: (id) => paidOrdersFor(db, id) };`, "progress/ports.ts, report.ts, wiring.ts"),
        p("Now migration 0412 is a local change. The orders module can rename the column, update its own query and run its own tests, and `paidOrdersFor` keeps returning `amountVnd`. If the rename has to be done without downtime, the expand-and-contract steps (add the new column, write both, backfill, switch reads, drop the old one) all happen inside one module."),
        h3("The declared alternative: a versioned view"),
        p("For reports that need joins across many rows, a function call per learner can be too slow. Then the owner publishes a read model in its own schema and grants access to it, and only to it:"),
        code("sql", `
-- owned by the orders module, in migrations/orders/
CREATE SCHEMA IF NOT EXISTS orders_api;

CREATE VIEW orders_api.paid_orders_v1 AS
SELECT id AS order_id, learner_id, course_id, amount_vnd AS amount, paid_at
FROM orders
WHERE status = 'paid';

-- each module connects with its own role
GRANT USAGE ON SCHEMA orders_api TO progress_app;
GRANT SELECT ON orders_api.paid_orders_v1 TO progress_app;
-- no grant on the orders table itself: progress_app cannot read it`, "orders read model"),
        p("The view is a contract: `_v1` in the name, a test in the orders module that selects its columns, and a rule that a breaking change ships as `paid_orders_v2` next to `v1` until every reader has moved."),

        challenge("chal_quiz_saf_321"),

        h2("5. How to verify ownership"),
        p("A rule nobody checks erodes within a sprint. Use two checks, a fast one in CI and a strict one in the database."),
        p("**A CI check over SQL.** Scan every module for table names that the ownership map gives to another module. It is a heuristic (it does not parse SQL), which is why it reports the file and line for a human to look at:"),
        code("typescript", `
// scripts/check-table-owners.ts - run in CI: node scripts/check-table-owners.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const owners: Record<string, string[]> = JSON.parse(readFileSync("architecture/table-owners.json", "utf8"));
const ownerOf = new Map(Object.entries(owners).flatMap(([mod, tables]) => tables.map((t) => [t, mod] as const)));
const sqlTable = /\\b(?:FROM|JOIN|UPDATE|INTO)\\s+([a-z_]+)/gi;

let violations = 0;
for (const mod of Object.keys(owners)) {
  const dir = join("src/modules", mod);
  for (const file of readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".ts"))) {
    readFileSync(join(dir, file), "utf8").split("\\n").forEach((line, i) => {
      for (const [, table] of line.matchAll(sqlTable)) {
        const owner = ownerOf.get(table.toLowerCase());
        if (owner && owner !== mod) {
          console.log(\`\${mod}/\${file}:\${i + 1} reads \${table}, owned by \${owner}\`);
          violations++;
        }
      }
    });
  }
}
process.exitCode = violations ? 1 : 0;`, "check-table-owners.ts"),
        code("text", `
$ node scripts/check-table-owners.ts
payments/reconcile.ts:18 reads orders, owned by orders
progress/report.ts:4 reads orders, owned by orders`, "before the fix"),
        p("Start by recording today's violations as a known list and failing CI only on new ones; then remove them one by one. The count of known violations is the number the team reviews each month (lesson 3.1)."),
        p("**Database roles per module.** If each module connects with its own Postgres role and has grants only on its own tables and on published views, a forbidden query fails in the integration tests with `ERROR: permission denied for table orders` instead of in production. It takes one connection pool per module, which is cheap at this size."),

        h2("6. Common mistakes"),
        bullets([
            "**\"Same deploy, so no coupling.\"** Deploying together means the break shows up at deploy time instead of at runtime. It does not make it visible earlier. Spot it: grep for every table name across modules, as in section 2.",
            "**Moving the query into a shared helper.** `db/queries/orders.ts` used by three modules is the same coupling with a nicer file name. Spot it: the helper's file is not inside the owning module, or two modules import it.",
            "**Publishing the internal table as the API.** An API function that returns raw rows (`SELECT *`) leaks the column names again. Spot it: the return type mirrors the table instead of the reader's needs.",
            "**A second writer.** A module that runs `UPDATE orders SET status = 'refunded'` from the payments side owns rules it cannot see. Spot it: any INSERT, UPDATE or DELETE in the CI report is more urgent than a read.",
            "**An unversioned view.** A view without a version and without a test is a shared table with extra steps. Spot it: no `_v1`, no contract test, no owner in the ownership map.",
        ]),

        h2("7. Summary"),
        numbered([
            "A table read by several modules is a public API nobody declared: renames, rule changes and locks cross module boundaries without the compiler or the owner's tests noticing.",
            "Give every table one owner. Other modules read through the owner's public API or a port with an adapter; only the owner writes.",
            "Share only what is declared: a versioned read model owned and tested by the producer, a replica for analytics, or a copy kept up to date from events. Verify ownership with a CI check and per-module database roles.",
        ]),
        callout("tip", "Self-practice (not graded): draw the ownership map",
            "For an application you know, list every table and the modules that read or write it. Mark each table with more than one writer in red and each table with more than one reader in orange. Pick the orange table with the most readers and sketch the one API function its owner would publish to replace those queries."),
    ],
});
