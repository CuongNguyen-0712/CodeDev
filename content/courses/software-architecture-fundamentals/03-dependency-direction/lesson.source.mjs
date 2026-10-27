// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-saf-1-3",
    title: "Dependency direction: which way imports may point",
    slug: { _type: "slug", current: "dependency-direction" },
    description:
        "A controller read orders straight from the repository to save a round trip, skipped the ownership check in OrderService, and let any signed-in learner open another learner's receipt. Learn what \"A depends on B\" means, why imports should point from controllers to services to the domain, how a port in the domain lets a service use the database without importing it, how to spot import cycles, and how to check every import in CI.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Security report SEC-019 against https://api.codedev.test: a learner changed the order id in the receipt URL from /orders/ord_811 to /orders/ord_812 and saw another learner's receipt, with their name, email and the course they bought. OrderService.getOrderForUser() checks that the order belongs to the caller, and its tests pass. But a pull request three weeks ago, titled \"perf: skip service layer for simple reads\", made the GET /orders/:id controller call OrderRepository.findById() directly. Nobody noticed in review, because the diff was four lines and the service method it bypassed was in another file. At the same time the team complains that OrderService's unit tests need a running Postgres. Both problems come from imports pointing the wrong way.",
    },

    content: [
        h2("1. The incident: a shortcut around the service"),
        p("This is the controller after the \"perf\" pull request:"),
        code("typescript", `
// src/orders/controllers/orderController.ts
import { orderRepository } from "../repositories/orderRepository";

export async function getOrder(req: Request, res: Response) {
    // was: const order = await orderService.getOrderForUser(req.user.id, req.params.id);
    const order = await orderRepository.findById(req.params.id);     // one query fewer
    if (!order) return res.status(404).json({ error: "not_found" });
    return res.json(order);
}`, "orderController.ts"),
        p("And this is the method it stopped calling:"),
        code("typescript", `
// src/orders/services/orderService.ts
async getOrderForUser(userId: string, orderId: string) {
    const order = await this.orders.findById(orderId);
    if (!order || order.userId !== userId) return null;   // a learner sees only their own orders
    return order;
}`, "orderService.ts"),
        p("The \"one query fewer\" was not true - the service made the same single query - but the shortcut removed the one line that enforced who may see an order. The rule lived in the service layer, and the controller imported a layer **below** it. Every rule that lives in a service is skipped by any code that goes around the service."),

        h2("2. Reproduce it and read the evidence"),
        p("Sign in as one test learner and request an order that belongs to another:"),
        code("bash", `
curl -s https://api.codedev.test/orders/ord_812 -H "Authorization: Bearer $TOKEN_LEARNER_A"

{"id":"ord_812","userId":"u_207","email":"learner.b@example.test","courseId":"redis-patterns","amount":249000,"status":"paid"}`, "terminal"),
        p("The response should be `404`; it is learner B's order. Now look at the imports of the orders module, not at the code inside the functions. The first lines of each file are enough:"),
        code("bash", `
grep -rn "^import" src/orders

src/orders/controllers/orderController.ts:1: import { orderRepository } from "../repositories/orderRepository";
src/orders/services/orderService.ts:1:       import { PostgresOrderRepository } from "../repositories/postgresOrderRepository";
src/orders/services/orderService.ts:2:       import { db } from "../../shared/db";
src/orders/repositories/orderRepository.ts:1:  import type { Order } from "../domain/order";
src/orders/domain/order.ts:1:                import { applyDiscount } from "../services/pricingService";`, "terminal"),
        p("Draw one arrow per line, from the importing file's layer to the imported file's layer: controller -> repository, service -> repository, repository -> domain, domain -> service. Two of these are the bugs in this lesson: the controller skipping the service (the security report) and the service importing the concrete Postgres repository (the tests that need a database). The domain -> service arrow is a third problem waiting to happen. The next section explains why each points the wrong way."),

        h2("3. Which way should imports point?"),
        p("**\"A depends on B\"** means A imports B: A cannot compile or run without B, and a change in B can break A. Dependencies are the paths along which changes travel, so the direction of every import is a decision about **what is allowed to break what**."),
        p("The rule for a layered backend is to point dependencies **toward the code that holds the rules and changes least**:"),
        bullets([
            "**controller -> service.** HTTP details change (a new route, a new framework); the use case does not care. The controller calls the service and never goes around it, so every rule in the service applies to every request.",
            "**service -> domain.** A use case uses the business types and rules: `Order`, its total, which status changes are allowed.",
            "**domain -> nothing outside the domain.** The rules of an order must not change because the database, the HTTP framework or a use case changed. A domain that imports nothing else can be tested with plain function calls in milliseconds.",
            "**repository -> domain.** The repository knows how to store an `Order`, so it imports the domain - not the other way round.",
        ]),
        h3("How a service reaches the database without importing it"),
        p("The service must save orders, but importing the repository would make the service depend on Postgres. The way out is **dependency inversion**: the service's layer declares the interface it needs, and the database code implements it. That interface is called a **port**, and it lives in the domain:"),
        code("text", `
source-code arrows (imports)                 run-time calls
controller -> service -> domain <- repository     controller -> service -> repository -> Postgres
                          ^
                 domain/ports/orderRepository.ts`, "the arrows"),
        p("At run time the service still calls the repository. In the source code, both the service and the repository import the port in the domain, and neither imports the other. Only the composition root - `main.ts`, where the application is assembled - imports the concrete `PostgresOrderRepository` and passes it to the service. That is why the import arrow of the database code points **inwards**, against the direction of the call."),
        h3("The rules this course uses"),
        p("Written as a table (row = the layer of the file that imports, column = the layer of what it imports), with a name for each forbidden cell so a check can report it:"),
        code("text", `
                controller            service               domain   repository
controller      ok                    ok                    ok       controller-skips-service
service         points-backward       ok                    ok       service-needs-port
domain          domain-must-be-pure   domain-must-be-pure   ok       domain-must-be-pure
repository      points-backward       points-backward       ok       ok`, "allowed imports"),
        callout("info", "When this is too much",
            "A port with exactly one implementation is extra code. In a small tool with one table, no business rules and tests that run against a throwaway database anyway, a service importing its repository directly is a reasonable trade. If you allow it, write the exception into the rules (and the check) so it is a decision, not an accident. The controller shortcut is different: it skips rules, not just a layer, so keep it forbidden even in small apps."),
        h3("Cycles: when there is no direction at all"),
        p("If `domain/order.ts` imports `services/pricingService.ts` and `pricingService.ts` imports `order.ts`, the two files form an **import cycle**. Neither can be changed, tested or understood without the other, and in Node.js one of them can be loaded half-initialised: a value imported across the cycle can be `undefined` at the moment the other file runs its top-level code. A domain file importing a service is almost always half of a cycle, because services import the domain. The usual fix is not a clever interface: it is noticing that one function is in the wrong layer and moving it."),
        challenge("chal_quiz_saf_131"),

        h2("4. Worked example: a port for the order repository"),
        p("Step 1: the domain declares what the use case needs from storage. It is an interface, so it imports nothing and compiles to nothing:"),
        code("typescript", `
// src/orders/domain/ports/orderRepository.ts
import type { Order } from "../order";

export interface OrderRepository {
    findById(orderId: string): Promise<Order | null>;
    save(order: Order): Promise<void>;
}`, "src/orders/domain/ports/orderRepository.ts"),
        p("Step 2: the service depends on the port and receives an implementation in its constructor. There is no `repositories/` import and no `db` import left in this file:"),
        code("typescript", `
// src/orders/services/orderService.ts
import type { Order } from "../domain/order";
import type { OrderRepository } from "../domain/ports/orderRepository";

export class OrderService {
    constructor(private readonly orders: OrderRepository) {}

    async getOrderForUser(userId: string, orderId: string): Promise<Order | null> {
        const order = await this.orders.findById(orderId);
        if (!order || order.userId !== userId) return null;
        return order;
    }
}`, "src/orders/services/orderService.ts"),
        p("Step 3: the Postgres repository implements the port, and the composition root wires everything. This is the only file that knows all the concrete pieces:"),
        code("typescript", `
// src/orders/repositories/postgresOrderRepository.ts
import type { Order } from "../domain/order";
import type { OrderRepository } from "../domain/ports/orderRepository";
import { db } from "../../shared/db";

export class PostgresOrderRepository implements OrderRepository {
    async findById(orderId: string): Promise<Order | null> {
        return db.oneOrNone("SELECT id, user_id AS \\"userId\\", course_id AS \\"courseId\\", amount, status FROM orders.orders WHERE id = $1", [orderId]);
    }
    async save(order: Order): Promise<void> {
        await db.none("INSERT INTO orders.orders (id, user_id, course_id, amount, status) VALUES ($1, $2, $3, $4, $5)",
            [order.id, order.userId, order.courseId, order.amount, order.status]);
    }
}

// src/main.ts - the composition root
const orderService = new OrderService(new PostgresOrderRepository());
app.get("/orders/:id", (req, res) => getOrder(orderService, req, res));`, "postgresOrderRepository.ts + main.ts"),
        p("Step 4: the controller receives the service and has no way to reach the repository - it never imports it:"),
        code("typescript", `
// src/orders/controllers/orderController.ts
import type { OrderService } from "../services/orderService";

export async function getOrder(orders: OrderService, req: Request, res: Response) {
    const order = await orders.getOrderForUser(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: "not_found" });   // also for someone else's order
    return res.json(order);
}`, "orderController.ts"),
        p("The security fix and the test fix are the same change. The service's unit test now needs no database, because a fake that implements the port is ten lines:"),
        code("typescript", `
// src/orders/services/orderService.test.ts
import { test, expect } from "vitest";
import { OrderService } from "./orderService";
import type { Order } from "../domain/order";
import type { OrderRepository } from "../domain/ports/orderRepository";

const fakeOrders = (): OrderRepository => {
    const rows = new Map<string, Order>([["ord_812", { id: "ord_812", userId: "u_207", courseId: "redis-patterns", amount: 249000, status: "paid" }]]);
    return { findById: async (id) => rows.get(id) ?? null, save: async (o) => { rows.set(o.id, o); } };
};

test("a learner cannot read another learner's order", async () => {
    const service = new OrderService(fakeOrders());
    expect(await service.getOrderForUser("u_101", "ord_812")).toBeNull();
    expect((await service.getOrderForUser("u_207", "ord_812"))?.id).toBe("ord_812");
});`, "orderService.test.ts"),

        h2("5. How to verify the direction"),
        bullets([
            "**Reproduce the report.** The `curl` from section 2 now returns `404` for learner A and the order for learner B. Add it as an API test so the shortcut cannot come back silently.",
            "**Unit tests without infrastructure.** `npx vitest run src/orders/services` passes with Postgres stopped. If it needs a database, a service still imports something concrete.",
            "**A layer check in CI.** Take every import, find the layer of both ends from the path, and look the pair up in the table from section 3. Tools such as dependency-cruiser express the same rules as configuration; the exercise below builds the check itself, so you know exactly what it does.",
            "**A cycle finder.** `npx madge --circular src` lists import cycles and exits with an error when it finds one; run it in CI next to the layer check.",
        ]),
        code("javascript", `
// .dependency-cruiser.cjs (excerpt) - the same rules as configuration
module.exports = {
    forbidden: [
        { name: "controller-skips-service", severity: "error",
          from: { path: "/controllers/" }, to: { path: "/repositories/" } },
        { name: "domain-must-be-pure", severity: "error",
          from: { path: "/domain/" }, to: { path: "/(controllers|services|repositories)/" } },
        { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    ],
};`, ".dependency-cruiser.cjs"),
        p("The check you write next works on resolved import paths: it derives each file's layer from its folders, looks up every import in the table, and reports the forbidden ones with the rule they break, sorted so the CI output is stable from run to run."),
        challenge("chal_coding_saf_132"),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**\"Just this once\" shortcuts for reads.** A controller or a scheduled job reads a repository directly because \"it is only a read\". Reads are where ownership checks live. Spot it: any import from `controllers/` into `repositories/`, and any service method that is never called from a controller.",
            "**The port in the wrong folder.** The interface is created, but in `repositories/orderRepository.ts` next to the implementation, so the service still imports the repositories layer. Spot it: the layer check still reports `service-needs-port` after the \"refactor\".",
            "**`import type` treated as free.** It disappears from the JavaScript, but the importing file still has to change when the type changes, so it is still a dependency. Spot it: a domain file with `import type { ... } from \"../services/...\"`; count it like any other import.",
            "**A helper pulled up into the domain from a service.** The domain needs one small function, imports it from a service, and creates a cycle. Spot it: `madge --circular` lists a domain file and a service file together; move the function down into the domain.",
            "**Passing concrete classes through constructors.** The service takes `PostgresOrderRepository` in its constructor instead of the `OrderRepository` port. The wiring looks injected, but the service still imports Postgres code. Spot it: the import list of the service, not its constructor.",
        ]),

        h2("7. Summary"),
        bullets([
            "An import is a path along which changes travel. Point imports toward the rules: controller -> service -> domain, and repository -> domain, never the other way.",
            "A service reaches the database through a port: an interface in the domain that the repository implements and that main.ts wires. The call goes outwards; the import points inwards.",
            "Write the allowed directions down as a table and check every import against it in CI, together with a cycle finder - a four-line shortcut around a service is easy to miss in review and easy to catch with a check.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler, DIP in the Wild - martinfowler.com/articles/dipInTheWild.html",
            "dependency-cruiser documentation: forbidden rules; madge documentation: --circular",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one service in a project you know and list its imports. For each import into a database, email or HTTP client, write the port interface the service actually needs (only the methods it calls), and decide which folder it belongs in. Then run npx madge --circular on the project and explain, for one cycle it finds, which function is in the wrong layer."),
    ],
});
