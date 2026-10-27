// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-saf-2-3",
    title: "Spot the AI mistake: a refactor with a circular import",
    slug: { _type: "slug", current: "spot-ai-mistake-circular-import" },
    description:
        "An AI assistant moved refunds from orders into payments, payments started to import orders while orders already imported payments, and every refund failed with a TypeError although tsc and the review were happy. Learn how module loading turns an import cycle into an undefined value, why the damage depends on which module loads first, why TypeScript cannot see it, how to find cycles with madge or a lint rule, the honest fixes (a third module, a port, keeping the orchestration in the higher-level module) and the tempting fixes that only hide the cycle.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer and code reviewer, CodeDev learning platform",
        problem:
            "Since Tuesday's release every refund in the CodeDev admin panel fails with \"TypeError: Cannot read properties of undefined (reading 'getOrder')\", and support refunds learners by hand in the payment provider's dashboard. The release contained one change to the money code: an AI assistant moved the refund logic from the orders module into payments. tsc passed, the unit tests passed, and in the review preview placing and showing orders worked, so the pull request was approved.",
    },

    content: [
        h2("1. The incident: refunds moved, refunds broken"),
        p("The request sent to the assistant was short: \"Move the refund logic out of the orders module into payments, where the rest of the money code lives. The order page must keep showing 'refundable until <date>'.\" This is what it produced, reduced to the lines that matter:"),
        code("typescript", `
// src/orders/index.ts (unchanged)
import { charge, refundDeadline } from "../payments";
import { OrderRepository } from "./OrderRepository";
export const orderRepository = new OrderRepository(db);
export function placeOrder(/* ... */) { /* calls charge(...) */ }
export function describeOrder(/* ... */) { /* shows refundDeadline(order.paidOn) */ }

// src/payments/index.ts (after the AI refactor)
import { orderRepository } from "../orders";              // new
import { RefundService } from "./RefundService";
const refunds = new RefundService(orderRepository);       // runs while payments loads
export function refund(orderId: string, today: string) {
  return refunds.refund(orderId, today);
}`, "the diff, condensed"),
        p("Each file on its own looks reasonable. Together they form an **import cycle**: orders imports payments, and payments now imports orders. The assistant did what it was asked - the refund code is in payments - and nothing in the request said which way the modules may depend on each other. That rule was in lesson 1.3, not in the prompt."),

        h2("2. Reproduce it and read the evidence"),
        p("The stack trace from the admin panel points at the refund service, not at the import:"),
        code("text", `
TypeError: Cannot read properties of undefined (reading 'getOrder')
    at RefundService.refund (src/payments/RefundService.ts:12:31)
    at refund (src/payments/index.ts:7:18)
    at POST /admin/orders/:id/refund (src/admin/routes.ts:41:22)`, "production log"),
        p("`RefundService` was constructed with `orderRepository`, and that value was `undefined`. To see why, follow the server's start-up in order. The code is compiled to CommonJS, where `import` becomes `require` and every module runs top to bottom the first time someone requires it:"),
        numbered([
            "`server.ts` requires `orders`. Node starts running orders' top-level code with an empty `exports` object.",
            "The first line of orders requires `payments`. Orders is paused at that line; `orderRepository` has not been created yet.",
            "Payments requires `orders`. Orders is already loading, so Node returns its exports **as they are now**: nothing assigned yet. `orderRepository` reads as `undefined`.",
            "Payments runs `new RefundService(undefined)` and finishes. Orders resumes, creates `orderRepository` and finishes. Too late: `RefundService` already holds `undefined`.",
        ]),
        p("Everything that orders needs from payments works, because payments finished first. Everything payments captured from orders at load time is broken. That is why the review preview, which only placed and showed orders, looked fine."),
        callout("warning", "Which side breaks depends on who loads first",
            "A unit test file that imports payments first reverses the order: payments starts, orders runs completely, and now orders is the one that captured an unfinished payments. The same code can pass in the payments tests, fail in production, and break the other way in a script that imports modules in a different order. With ES modules the symptom changes - a `const` used before its module finished throws `ReferenceError: Cannot access 'orderRepository' before initialization` - but the cause is the same: two modules that each need the other to be finished first."),
        p("Now ask the tools. TypeScript has no complaint, because the *type* of `orderRepository` is `OrderRepository`; whether the module that exports it has finished loading is not a type question. A dependency checker sees the cycle immediately:"),
        code("bash", `
$ npx tsc --noEmit && echo "tsc ok"
tsc ok

$ npx madge --circular --extensions ts src/
✖ Found 1 circular dependency!

1) orders/index.ts > payments/index.ts`, "terminal"),

        h2("3. Core idea: dependencies point one way"),
        p("Lesson 1.3 set the rule: a higher-level module may depend on a lower-level one, never the reverse. Orders is the higher level here - a checkout *uses* payments to charge - so payments must not know that orders exist. A cycle breaks more than start-up:"),
        bullets([
            "**You cannot understand, test or change one module without the other.** Every test of payments now loads orders, its repository and its database setup.",
            "**Behaviour depends on load order**, which nobody chooses on purpose and which changes when someone adds an import to `server.ts` or a test.",
            "**The modules cannot be split.** If payments ever becomes its own service (lesson 3.3), a cycle means two services that call each other synchronously for every request.",
        ]),
        h3("When a cycle is not a runtime problem"),
        p("`import type { Order } from \"../orders\"` is erased by the compiler: no `require` is emitted, so it cannot produce an `undefined` at runtime. It is still a dependency in the design - payments knows what an order looks like - and many teams treat it as a smell to fix by moving the shared type into a module both can import. Tools differ here: check whether yours counts type-only imports before you trust a clean report."),
        challenge("chal_quiz_saf_231"),

        h2("4. Honest fixes, and the ones that only hide the cycle"),
        p("The examples use a smaller cycle elsewhere in CodeDev, so you can practise the moves before the challenge. The catalog page shows \"3 of 12 lessons done\", so `catalog` imports `progress`; and `progress` imports `catalog` to know how many lessons a course has, to decide when a course is complete."),
        code("typescript", `
// catalog/index.ts
import { completedLessons } from "../progress";
export const lessonCounts = new Map<string, number>([["saf", 10], ["redis-patterns", 12]]);
export function courseCard(learnerId: string, courseId: string) {
  return \`\${completedLessons(learnerId, courseId)} of \${lessonCounts.get(courseId)} lessons done\`;
}

// progress/index.ts
import { lessonCounts } from "../catalog";               // the edge that closes the cycle
export function isCourseComplete(learnerId: string, courseId: string) {
  return completedLessons(learnerId, courseId) === lessonCounts.get(courseId);
}`, "catalog <-> progress"),
        h3("Fix 1: move what both need into a third module"),
        p("Progress does not need the catalog; it needs the lesson counts. Give that data its own module that imports nothing from either side:"),
        code("typescript", `
// lessons/index.ts - imports nothing from catalog or progress
export const lessonCounts = new Map<string, number>([["saf", 10], ["redis-patterns", 12]]);

// progress/index.ts
import { lessonCounts } from "../lessons";

// catalog/index.ts
import { lessonCounts } from "../lessons";
import { completedLessons } from "../progress";

// graph: catalog -> lessons, catalog -> progress, progress -> lessons   (no cycle)`, "a shared lower-level module"),
        p("This is the usual fix when the shared thing is *data or a type* that both modules need. The new module sits below both of them."),
        h3("Fix 2: invert the dependency with a port"),
        p("When the lower-level module needs *behaviour* from the higher-level one, let it declare a small port (lesson 2.1) and receive an implementation from outside:"),
        code("typescript", `
// progress/index.ts - progress owns the port and imports nothing from catalog
export interface LessonCounts { countFor(courseId: string): number | undefined }
export function createProgress(counts: LessonCounts) {
  return {
    isCourseComplete: (learnerId: string, courseId: string) =>
      completedLessons(learnerId, courseId) === counts.countFor(courseId),
  };
}

// main.ts - the composition root wires them
const progress = createProgress({ countFor: (id) => catalog.lessonCount(id) });`, "a port instead of an import"),
        h3("Fix 3: keep the orchestration in the higher-level module"),
        p("Often the cleanest answer is that the code was moved to the wrong place. If a flow needs both modules, it belongs to the higher one, which calls narrow functions of the lower one with plain data - for a refund that would be orders looking up its order and calling something like `payments.refundCharge(chargeId, amountVnd)`. Use it when you can change the public function; when callers already depend on the new location, fix 1 or 2 keeps the signature."),
        h3("Fixes that only hide the cycle"),
        bullets([
            "**Requiring lazily inside the function** (`const { lessonCounts } = require(\"../catalog\")` inside `isCourseComplete`). It works because by then both modules have finished loading, but the two-way dependency is still there, and the next top-level use brings the crash back.",
            "**Changing the import order in `server.ts`.** It moves the broken side from one module to the other.",
            "**Optional chaining or a default** (`counts?.get(id) ?? 0`). The crash becomes a wrong answer: no course is ever complete, and nothing logs why.",
        ]),

        h2("5. Reviewing an AI refactor for direction"),
        p("An assistant optimises for the request in front of it. \"Move X into Y\" is satisfied as soon as X is in Y, whatever Y now has to import. Read every refactor that moves code between modules with these questions:"),
        numbered([
            "**List the new imports.** `git diff main -- 'src/**/*.ts' | grep '^+import'` shows every dependency the change adds. Each one must point down the layer order from lesson 1.3.",
            "**Run the cycle check, not only tsc.** `npx madge --circular --extensions ts src/` locally; in CI, the `import/no-cycle` rule of eslint-plugin-import or a dependency-cruiser `no-circular` rule, so the next cycle fails the build.",
            "**Look for values captured at load time.** `new Something(importedValue)` or `const x = imported.y` at the top of a module are where a cycle becomes `undefined`.",
            "**Test each module loaded first.** A test file that imports only payments and calls refund reproduces the load order the review preview never tried.",
            "**Put the rule in the prompt.** \"payments must not import orders\" in the request, or in the instruction file the assistant reads, is cheaper than finding the cycle in production.",
        ]),
        p("In the challenge, the modules are objects registered with a tiny module loader that behaves like `require()`: a module that loads another one that is still loading gets `undefined`, and every load is recorded in an import graph you can print with the input `[{\"do\":\"graph\"}]`. The assistant's code is there as it was merged. The public tests place and show orders, like the review did; the hidden tests refund orders and check that the graph has no cycle."),
        challenge("chal_coding_saf_232"),

        h2("6. How to verify the fix"),
        bullets([
            "**The cycle check is clean.** madge, the lint rule or the challenge's graph report shows no cycle - after the code has run, so imports made inside functions count too.",
            "**Every direction is downward.** Draw the edges of the changed modules: orders may point to payments and to a shared module; payments points to nothing above it.",
            "**Both load orders work.** A test that loads payments first and one that loads orders first both refund an order and show its deadline.",
            "**The production symptom is gone.** A refund in staging returns a refund id, and the order page shows \"refunded\".",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Trusting tsc for cycles.** Types are fine, values are not. Spot it: no cycle check anywhere in CI.",
            "**Lazy require as the fix.** Spot it: `require(` or `await import(` inside a function body of a module that the target module imports.",
            "**Silencing the crash.** `?.`, `?? 0` or a try/catch around the call turns a loud failure into wrong data. Spot it: defensive code around a value that \"can't\" be undefined according to its type.",
            "**Fixing load order instead of direction.** Spot it: a diff that only reorders imports in an entry file, with a comment like \"must be imported first\".",
            "**Moving code without moving the rule.** Asking an assistant to move code between modules without stating which way they may depend. Spot it: a refactor PR that adds an import from a lower-level module to a higher-level one.",
        ]),

        h2("8. Summary"),
        numbered([
            "An import cycle makes one module receive another before it has finished loading: in CommonJS an empty exports object, in ES modules a binding that throws until initialised. Which side breaks depends on load order, and TypeScript cannot see it.",
            "Find cycles with a dedicated check (madge, import/no-cycle, dependency-cruiser) and fix the direction: move what both need into a lower module, invert with a port, or keep the orchestration in the higher module. Lazy requires, reordered imports and optional chaining only hide it.",
            "Review AI refactors by listing their new imports against the layer rule, running the cycle check, and testing each module loaded first - and put the direction rule in the prompt.",
        ]),

        h2("Sources"),
        bullets([
            "Node.js documentation: Modules, Cycles - nodejs.org/api/modules.html#cycles",
            "eslint-plugin-import: import/no-cycle - github.com/import-js/eslint-plugin-import",
            "madge: finding circular dependencies - github.com/pahen/madge",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run `npx madge --circular` on a project of yours. For each cycle, write down which module is the higher level, what exactly the lower one takes from it (data, a type or behaviour), and which of the three fixes fits. Then add the cycle check to CI so the next one fails the build instead of a refund."),
    ],
});
