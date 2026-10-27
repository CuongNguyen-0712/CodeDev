import { readFileSync } from "node:fs";

// Spot the AI Mistake: a refactor with a circular import. The request sent to an AI coding
// assistant was:
//   "Move the refund logic out of the orders module into payments, where the rest of the money
//    code lives. The order page must keep showing 'refundable until <date>'."
// The assistant moved refund() into payments. To look up the order and mark it refunded, payments
// now imports orders - and orders already imports payments to charge and to show the deadline.
// The review passed because placing and showing orders worked in the preview.
//
// Since the release, every refund in the admin panel fails with a TypeError, and support has to
// refund learners by hand in the payment provider's dashboard.
//
// Fix the modules so that refunds work and no module imports, directly or through others, a module
// that imports it back. payments.refund(orderId, today) must keep its signature and its rules:
//   unknown order -> "unknown_order"; already refunded -> "already_refunded";
//   today after the deadline (paid on + 14 days) -> "window_closed";
//   otherwise the order becomes "refunded" and the result carries a new refund id and the amount.
// You may add modules with define() (add them to the Modules interface too).
// Run your code with the input [{"do":"graph"}] to see the import graph.
// Do not change the module loader, the shared types or the test runner.

type Order = {
    id: string;
    learnerId: string;
    courseId: string;
    amountVnd: number;
    paidOn: string; // "YYYY-MM-DD"
    chargeId: string;
    status: "paid" | "refunded";
};
type PlaceResult = { ok: true; order: Order } | { ok: false; error: "unknown_course" | "already_owned" };
type RefundResult =
    | { ok: true; refundId: string; amountVnd: number }
    | { ok: false; error: "unknown_order" | "already_refunded" | "window_closed" };

// Calendar helper shared by everyone: dates are "YYYY-MM-DD" strings in UTC.
function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- module loader (do not change)
// A tiny module system that behaves like CommonJS require(): a module's factory runs the first time
// someone loads it, top to bottom, and its result is cached. If a module loads another module that
// is still running its own factory (an import cycle), it gets that module before it is finished:
// in Node a half-empty exports object, here undefined. TypeScript cannot see this: the type says
// the module is there. Every load() call made by a module is recorded in the import graph.
type ModuleName = keyof Modules;
type Load = <K extends ModuleName>(name: K) => Modules[K];

const factories = new Map<ModuleName, (load: Load) => unknown>();
const cache = new Map<ModuleName, unknown>();
const loading = new Set<ModuleName>();
const edges = new Set<string>();

function define<K extends ModuleName>(name: K, factory: (load: Load) => Modules[K]): void {
    factories.set(name, factory);
}

function loadModule<K extends ModuleName>(name: K): Modules[K] {
    if (cache.has(name)) return cache.get(name) as Modules[K];
    if (loading.has(name)) return undefined as unknown as Modules[K];
    const factory = factories.get(name);
    if (!factory) throw new Error(`module not found: ${String(name)}`);
    loading.add(name);
    try {
        const exports = factory(loaderFor(name));
        cache.set(name, exports);
        return exports as Modules[K];
    } finally {
        loading.delete(name);
    }
}

function loaderFor(importer: ModuleName): Load {
    return <K extends ModuleName>(name: K): Modules[K] => {
        edges.add(`${String(importer)} -> ${String(name)}`);
        return loadModule(name);
    };
}

// "no import cycle", or the graph and the first cycle found.
function importGraphReport(): string[] {
    const next = new Map<string, string[]>();
    for (const edge of [...edges].sort()) {
        const [from, to] = edge.split(" -> ");
        next.set(from, [...(next.get(from) ?? []), to]);
    }
    const state = new Map<string, "open" | "done">();
    const path: string[] = [];
    let cycle: string[] | null = null;
    const visit = (node: string): void => {
        if (cycle) return;
        if (state.get(node) === "open") {
            cycle = [...path.slice(path.indexOf(node)), node];
            return;
        }
        if (state.get(node) === "done") return;
        state.set(node, "open");
        path.push(node);
        for (const to of next.get(node) ?? []) visit(to);
        path.pop();
        state.set(node, "done");
    };
    for (const node of [...next.keys()].sort()) visit(node);
    if (!cycle) return ["no import cycle"];
    return ["import graph:", ...[...edges].sort().map((e) => `  ${e}`), `import cycle: ${(cycle as string[]).join(" -> ")}`];
}

// ---------------------------------------------------------------- your code (the assistant's refactor)
interface Catalog {
    priceOf(courseId: string): number | undefined;
}
interface Orders {
    placeOrder(learnerId: string, courseId: string, today: string): PlaceResult;
    getOrder(orderId: string): Order | undefined;
    markRefunded(orderId: string): void;
    describe(orderId: string): string;
}
interface Payments {
    charge(learnerId: string, amountVnd: number): string;
    refundDeadline(paidOn: string): string;
    refund(orderId: string, today: string): RefundResult;
}
interface Modules {
    catalog: Catalog;
    orders: Orders;
    payments: Payments;
}

define("catalog", () => {
    const prices: Record<string, number> = {
        "nodejs-api-security": 249000,
        "nodejs-ai-engineering": 149000,
        "typescript-react-frontend": 199000,
        "redis-patterns": 179000,
    };
    return {
        priceOf: (courseId) => prices[courseId],
    };
});

define("orders", (load) => {
    const catalog = load("catalog");
    const payments = load("payments");
    const all: Order[] = [];

    function getOrder(orderId: string): Order | undefined {
        return all.find((o) => o.id === orderId);
    }

    return {
        placeOrder(learnerId, courseId, today) {
            const price = catalog.priceOf(courseId);
            if (price === undefined) return { ok: false, error: "unknown_course" };
            if (all.some((o) => o.learnerId === learnerId && o.courseId === courseId && o.status === "paid")) {
                return { ok: false, error: "already_owned" };
            }
            const chargeId = payments.charge(learnerId, price);
            const order: Order = { id: `ord_${all.length + 1}`, learnerId, courseId, amountVnd: price, paidOn: today, chargeId, status: "paid" };
            all.push(order);
            return { ok: true, order };
        },
        getOrder,
        markRefunded(orderId) {
            const order = getOrder(orderId);
            if (order) order.status = "refunded";
        },
        describe(orderId) {
            const o = getOrder(orderId);
            if (!o) return `${orderId}: not found`;
            const state = o.status === "refunded" ? "refunded" : `refundable until ${payments.refundDeadline(o.paidOn)}`;
            return `${o.id}: ${o.learnerId} ${o.courseId} ${o.amountVnd} paid on ${o.paidOn}, ${state}`;
        },
    };
});

// payments: charges and, since the refactor, refunds.
define("payments", (load) => {
    const orders = load("orders"); // to find the order and mark it refunded
    const REFUND_WINDOW_DAYS = 14;
    let charges = 0;
    let refunds = 0;

    function refundDeadline(paidOn: string): string {
        return addDays(paidOn, REFUND_WINDOW_DAYS);
    }

    return {
        charge(learnerId, amountVnd) {
            charges++;
            return `ch_${charges}`;
        },
        refundDeadline,
        refund(orderId, today) {
            const order = orders?.getOrder(orderId);
            if (!order) return { ok: false, error: "unknown_order" };
            if (order.status === "refunded") return { ok: false, error: "already_refunded" };
            if (today > refundDeadline(order.paidOn)) return { ok: false, error: "window_closed" };
            refunds++;
            orders?.markRefunded(orderId);
            return { ok: true, refundId: `re_${refunds}`, amountVnd: order.amountVnd };
        },
    };
});

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of actions, run in order against the app (the app entry loads orders, then payments):
//   { "do": "place", "learnerId", "courseId", "today" }   orders.placeOrder
//   { "do": "show", "orderId" }                            orders.describe
//   { "do": "refund", "orderId", "today" }                 payments.refund
//   { "do": "graph" }                                      the import graph report
// Up to 40 actions: one line per action. More: only a summary line of the results.
type Action =
    | { do: "place"; learnerId: string; courseId: string; today: string }
    | { do: "show"; orderId: string }
    | { do: "refund"; orderId: string; today: string }
    | { do: "graph" };

const actions: Action[] = JSON.parse(readFileSync(0, "utf8"));
const lines: string[] = [];
const counts = new Map<string, number>();
const count = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
const message = (error: unknown) => `error: ${error instanceof Error ? error.message : String(error)}`;

try {
    const orders = loadModule("orders");
    const payments = loadModule("payments");
    for (const action of actions) {
        try {
            if (action.do === "place") {
                const r = orders.placeOrder(action.learnerId, action.courseId, action.today);
                count(r.ok ? "placed" : r.error);
                lines.push(`place ${action.learnerId} ${action.courseId} -> ${r.ok ? `${r.order.id} (${r.order.chargeId})` : r.error}`);
            } else if (action.do === "show") {
                lines.push(orders.describe(action.orderId));
            } else if (action.do === "refund") {
                const r = payments.refund(action.orderId, action.today);
                count(r.ok ? "refunded" : r.error);
                lines.push(`refund ${action.orderId} on ${action.today} -> ${r.ok ? `refunded ${r.amountVnd} (${r.refundId})` : r.error}`);
            } else {
                lines.push(...importGraphReport());
            }
        } catch (error) {
            count("error");
            lines.push(`${action.do} -> ${message(error)}`);
        }
    }
} catch (error) {
    lines.push(`startup -> ${message(error)}`);
}
if (actions.length <= 40) {
    for (const line of lines) console.log(line);
} else {
    console.log(`summary: ${[...counts].sort().map(([k, v]) => `${k} ${v}`).join(", ")}`);
}
