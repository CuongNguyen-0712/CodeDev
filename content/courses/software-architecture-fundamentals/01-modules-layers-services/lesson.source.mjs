// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-saf-1-1",
    title: "Modules, layers & services: what's the difference?",
    slug: { _type: "slug", current: "modules-layers-services" },
    description:
        "OrderService grew to 900 lines: it validates the cart, charges the card, writes the order, sends the receipt and updates progress, and every pull request conflicts with another. The team proposes three microservices. Learn what a module, a layer and a service are, what each one costs, why a modular monolith is usually the simplest structure that works, and when plain layers are enough.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Ticket ORD-412 on the CodeDev API (https://api.codedev.test): src/services/OrderService.ts has grown to 900 lines. One class validates the cart, reads course prices with raw SQL, charges the card through the Stripe test API, inserts the order and the enrollment, renders and sends the receipt email over SMTP and updates the learner's progress. Last sprint, 3 of 5 pull requests that touched it ended in merge conflicts, and a change to the receipt template broke the checkout tests. The proposal attached to the ticket: split it into orders-service, payments-service and notifications-service, each with its own repository and deploy pipeline. Before anyone creates three repositories, the team lead asks you what problem this actually is.",
    },

    content: [
        h2("1. The incident: one class that does everything"),
        p("This is the shape of the method every premium purchase goes through. It is shortened, but every line stands for something that is really in the file:"),
        code("typescript", `
// src/services/OrderService.ts - 900 lines, shortened
export class OrderService {
    async placeOrder(userId: string, courseId: string, cardToken: string) {
        // 1. catalog: read the price with raw SQL
        const course = await db.one("SELECT id, title, price FROM catalog.courses WHERE id = $1", [courseId]);
        if (!course) throw new Error("course not found");

        // 2. payments: call Stripe directly
        const res = await fetch("https://api.stripe.com/v1/charges", {
            method: "POST",
            headers: { Authorization: "Bearer " + process.env.STRIPE_KEY },
            body: new URLSearchParams({ amount: String(course.price), currency: "vnd", source: cardToken }),
        });
        if (!res.ok) throw new Error("payment failed");

        // 3. orders: write the order and the enrollment
        await db.tx(async (t) => {
            await t.none("INSERT INTO orders.orders (user_id, course_id, amount) VALUES ($1, $2, $3)", [userId, courseId, course.price]);
            await t.none("INSERT INTO learning.enrollments (user_id, course_id) VALUES ($1, $2)", [userId, courseId]);
        });

        // 4. notifications: build the HTML and send it
        const html = renderReceipt(course, userId);          // 180 lines further down
        await smtp.send({ to: await this.emailOf(userId), subject: "Your CodeDev receipt", html });

        // 5. progress: unlock the first lesson
        await db.none("INSERT INTO learning.progress (user_id, lesson_id) VALUES ($1, $2)", [userId, course.firstLessonId]);
    }
    // ... refunds, coupons, invoices, receipt templates, 30 more methods
}`, "OrderService.ts"),
        p("Five kinds of work live in one class: catalog lookups, payments, order records, email and progress. They change for different reasons, at different times, by different people. A new receipt layout, a new payment provider and a new progress rule all mean editing the same file, so three unrelated pull requests collide in it, and a test that only meant to check checkout breaks because the receipt template changed."),
        p("The proposal on the ticket jumps straight to a cure: three services. Before you weigh it, name the problem precisely, because the three words people use for \"splitting code\" - module, layer and service - solve different problems and have very different prices."),

        h2("2. Read the evidence before you pick a cure"),
        p("Two quick measurements tell you what kind of problem this is. First, which files change together. Git already knows:"),
        code("bash", `
# files touched by the last 60 commits on main, most changed first
git log -60 --format= --name-only | sort | uniq -c | sort -rn | head -5

     41 src/services/OrderService.ts
      9 src/templates/receipt.html
      7 src/routes/orders.ts
      6 src/services/ProgressService.ts
      5 src/db/migrations/...`, "terminal"),
        p("41 of the last 60 commits touched one file. That is a code-organisation problem: unrelated changes meet because they live in the same place. Second, look at what happens at run time. The trace of one checkout shows a single process doing all of it in about 140 ms:"),
        code("text", `
POST /orders  codedev-api (one process)
  OrderService.placeOrder        142 ms
    db.one   catalog.courses       4 ms
    fetch    api.stripe.com       98 ms
    db.tx    orders + enrollments 21 ms
    smtp.send                     11 ms`, "trace"),
        p("Nothing here is slow, overloaded or failing on its own. The order and the enrollment are written in one database transaction, so either both exist or neither does. A problem with conflicts and tangled tests, and a run time that works, points to a change in how the code is organised, not in how it is deployed. Keep that distinction in mind for the next section."),

        h2("3. Three words, three different boundaries"),
        p("All three ideas draw a line between pieces of a system. They differ in **where** the line is and **what crossing it costs**."),
        h3("Module: a boundary in the code"),
        p("A **module** is a group of code that belongs to one area of the business - `catalog`, `orders`, `payments`, `notifications`, `progress` - with a small public entry point and private internals. In TypeScript that is usually a folder with an `index.ts` that exports the few functions other modules may call. Everything else in the folder is an implementation detail that can change without anyone else noticing."),
        bullets([
            "**Crossing it costs:** a function call in the same process. No network, no serialisation, no new failure modes.",
            "**It buys you:** a change to the receipt layout stays inside `notifications`; reviewers of a payments change read one folder; tests of one module do not break because of another.",
            "**It needs:** discipline, and a rule that enforces it (a lint rule or a check in CI), because nothing stops a file from importing another module's internals.",
        ]),
        h3("Layer: a boundary by kind of work"),
        p("A **layer** groups code by the kind of job it does, whatever the business area. The usual backend layers are:"),
        bullets([
            "**controller** - speaks HTTP: reads the request, validates the shape, returns a status code. `POST /orders` lives here.",
            "**service** - one use case from start to end: place an order, refund an order. It coordinates the others.",
            "**domain** - the rules and the data types: an `Order`, its total, which status changes are allowed. No HTTP, no SQL.",
            "**repository** - reads and writes the database: `OrderRepository.save(order)`.",
        ]),
        p("Layers separate concerns that change for technical reasons: you can switch the HTTP framework without touching the price rules. Crossing a layer is also just a function call. The cost is indirection: one feature is spread across four folders, and a small app can drown in files that only pass data along."),
        h3("Service: a boundary in deployment"),
        p("A **service** (in \"microservices\") is a part of the system that runs as its own process, is built and deployed on its own, and is reached over the network, usually HTTP or a message queue. It normally owns its own data."),
        bullets([
            "**Crossing it costs:** a network request. It can be slow, time out, fail halfway or arrive twice. Data has to be serialised; types are no longer checked across the line by the compiler.",
            "**It buys you:** independent deploys, independent scaling, a failure that can be contained to one part, and teams that release without waiting for each other.",
            "**It needs:** a pipeline and monitoring per service, versioned APIs, a plan for when the other side is down, and a replacement for every database transaction that used to span both sides.",
        ]),
        callout("info", "The three can be combined",
            "These are not three competing choices. A service usually contains layers, and a modular monolith is modules (one per business area) each split into layers, all deployed as one application. The question is never \"layers or modules or services\" but which boundaries this system needs today."),

        h2("4. The simplest structure that works"),
        p("Go back to the evidence. The problem is that unrelated changes meet in one file. A module boundary fixes exactly that, at the price of a refactor and a lint rule. A service boundary would fix it too, but adds a network call between orders and payments, a second deploy pipeline, a way to handle payments being down in the middle of a checkout, and a new answer to \"what if the card was charged but the order insert failed\" - which today is one transaction."),
        p("So the first step is a **modular monolith**: one application, one deploy, one database, with the code split into modules that talk only through their public entry points:"),
        code("text", `
src/
  catalog/
    index.ts              export { getCoursePrice }
    courseRepository.ts
  orders/
    index.ts              export { placeOrder }
    placeOrder.ts
    orderRepository.ts
  payments/
    index.ts              export { charge }
    stripeClient.ts
  notifications/
    index.ts              export { sendReceipt }
    receiptTemplate.ts
  progress/
    index.ts              export { unlockFirstLesson }
  main.ts                 wires the HTTP routes to the modules`, "folder tree"),
        p("Martin Fowler's *MonolithFirst* describes the same observation from many projects: systems that started as a monolith and were split once the boundaries were clear went better than systems designed as microservices from day one, because the right boundaries are hard to see before the code exists. Modules let you find those boundaries cheaply; moving a well-separated module into its own service later is a much smaller project than untangling a 900-line class across a network."),
        h3("When layers alone are enough"),
        p("Not every codebase needs modules either. The CodeDev leaderboard admin tool has three endpoints, one table and one developer. For it, three folders are the whole architecture:"),
        code("text", `
admin-leaderboard/
  controllers/leaderboardController.ts
  services/leaderboardService.ts
  repositories/leaderboardRepository.ts`, "folder tree"),
        p("Layers alone are enough while the app covers one business area, a change rarely touches more than one feature, and the whole code fits in one person's head. The signals that it is time to add modules on top are the ones from section 2: files that unrelated changes keep touching, a `services/` folder with dozens of files from different areas, and tests of one feature that break because of another."),
        callout("tip", "A rule of thumb for choosing",
            "Start with the fewest boundaries that keep unrelated changes apart. Layers for a small single-purpose app. Modules (with layers inside) once the app covers several business areas. A separate service only when you can name a need that one deployable cannot meet - and measure it. Lessons 7 and 9 of this course look at those signals."),
        challenge("chal_quiz_saf_111"),

        h2("5. Worked example: splitting OrderService into modules"),
        p("Each module gets a small public API. Nothing in it is new code; it is the same logic, moved to where it belongs and hidden behind one function:"),
        code("typescript", `
// src/payments/index.ts - the only file other modules may import
import { createCharge } from "./stripeClient";

export type Payment = { id: string; amount: number };

export async function charge(input: { userId: string; amount: number; cardToken: string }): Promise<Payment> {
    return createCharge(input.amount, input.cardToken);   // Stripe details stay inside payments
}`, "src/payments/index.ts"),
        code("typescript", `
// src/orders/placeOrder.ts - the use case, now about 30 lines
import { getCoursePrice } from "../catalog";
import { charge } from "../payments";
import { sendReceipt } from "../notifications";
import { unlockFirstLesson } from "../progress";
import { saveOrderWithEnrollment } from "./orderRepository";

export async function placeOrder(userId: string, courseId: string, cardToken: string) {
    const price = await getCoursePrice(courseId);
    if (price === null) throw new Error("course not found");

    const payment = await charge({ userId, amount: price, cardToken });
    const order = await saveOrderWithEnrollment({ userId, courseId, amount: price, paymentId: payment.id });

    await sendReceipt({ userId, orderId: order.id, amount: price });
    await unlockFirstLesson(userId, courseId);
    return order;
}`, "src/orders/placeOrder.ts"),
        p("Read what changed and what did not. The run time is identical: one process, the same calls in the same order, the order and enrollment still written in one transaction inside `orders`. What changed is who can see what. The receipt template lives in `notifications` and nobody else imports it, so a layout change can only break notifications tests. Stripe is mentioned in one folder, so switching providers touches one folder. `placeOrder` reads like the business process it implements."),
        p("Notice also what this module split did **not** do yet. `placeOrder` still calls the payments module directly and cannot be tested without it, and `orders` mixes the use case with its repository. Which way those imports should point, and how to put payment and email behind interfaces you can fake in a test, are lessons 3 and 4."),

        h2("6. How to verify the structure"),
        p("A structure that is only described in a README erodes in a few weeks. Check it with things that fail:"),
        bullets([
            "**One deployable.** The build produces one artifact (`build codedev-api@<sha> -> 1 image`). If someone proposes a second one, it is a decision for an ADR (lesson 10), not a side effect of a refactor.",
            "**No deep imports between modules.** Other modules may import `../payments` (the `index.ts`) but never `../payments/stripeClient`. A grep finds the violations in seconds: `grep -rnE \"from \\\"\\.\\./[a-z]+/\" src/orders` must print nothing.",
            "**A lint rule that keeps it that way.** ESLint's built-in `no-restricted-imports` rule can reject deep imports such as `../payments/*`, so a pull request that adds one fails CI instead of waiting for a careful reviewer.",
            "**Churn after the change.** Rerun the `git log ... | uniq -c` command from section 2 a few weeks later. Changes should now spread over several module folders instead of piling into one file.",
            "**The tests of one module run alone.** `npx vitest run src/notifications` should pass without a database or a Stripe key; if it needs them, something leaks across the boundary.",
        ]),
        code("json", `
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["../*/*", "!../*/index"],
        "message": "Import another module through its index.ts only."
      }]
    }]
  }
}`, ".eslintrc.json (excerpt)"),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**Folders that are not boundaries.** Every module has an `index.ts`, but half the imports go around it to internal files. Spot it with the deep-import grep above; if it prints dozens of lines, the modules exist only in the folder names.",
            "**Services used to organise code.** The team splits into services, but they share one database, always deploy together and break together - a \"distributed monolith\" with all the network costs and none of the independence. Spot it: two services whose deploys are always in the same release notes, or that read each other's tables.",
            "**Layers as the only structure in a large app.** One `services/` folder with 60 files from catalog, orders and progress side by side. Spot it: unrelated features keep editing the same layer folder, and nobody can say which files belong to checkout.",
            "**Pass-through layers.** A controller calls a service that calls a repository, and the service method is one line that forwards its arguments. Spot it: service methods with no logic of their own. In a small app, that layer can wait until it has a job.",
            "**A growing \"shared\" or \"utils\" module.** Everything that does not fit goes there, and soon every module imports it. Spot it by counting its importers; the next lesson turns that count into a number you can track.",
        ]),

        h2("8. Summary"),
        bullets([
            "A module is a boundary in the code, a layer is a boundary by kind of work, and a service is a boundary in deployment. Only the service boundary costs a network call, a pipeline and a plan for partial failure.",
            "Read the evidence first: files that unrelated changes keep touching point to a code-organisation problem, which modules fix without changing how the system runs.",
            "Start with the fewest boundaries that keep changes apart: layers for a small single-purpose app, a modular monolith once there are several business areas, a separate service only for a need you can name and measure.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler, MonolithFirst - martinfowler.com/bliki/MonolithFirst.html",
            "ESLint documentation: the no-restricted-imports rule",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run the git log churn command on a project you work on and list its five most changed files. For the top one, write down which business areas the last ten commits to it belonged to. If there are more than two, sketch the module folders you would split it into and the one function each module would export."),
    ],
});
