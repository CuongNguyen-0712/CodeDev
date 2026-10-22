import { readFileSync } from "node:fs";

// Chợ Sớm order pipeline: replay the day's event log and report the state of every order.
// The input has one event per line, as JSON. Nothing in it is trusted.
//
// 1. parseEvent(line) returns the OrderEvent, or null when the line is not a valid event:
//    - valid JSON, an object (not null, not an array), "type" one of the five event types,
//      "order" a non-empty string;
//    - placed:    "items" is a non-empty array; every item has a non-empty string "sku",
//                 a whole number "qty" of at least 1 and a whole number "price" of at least 0;
//    - paid:      "amount" is a whole number of at least 0;
//    - shipped:   "courier" is a non-empty string;
//    - cancelled: "reason" is a non-empty string;
//    - delivered: nothing else is needed.
//    Extra properties are allowed and ignored.
//
// 2. apply(state, event) returns the order's new state, or an error message (the state then stays
//    as it was). state is undefined when the order has not been placed yet.
//      placed     only for a new order: "placed", total = sum of qty * price
//                 an existing order -> "<order> already exists"
//      paid       only from "placed", and amount must equal the total
//                 -> "paid"; a different amount -> "<order> paid <amount>, expected <total>"
//      shipped    only from "paid" -> "shipped", with the courier
//      delivered  only from "shipped" -> "delivered", keeping the courier
//      cancelled  from "placed" (refund 0) or from "paid" (refund = total) -> "cancelled"
//    Any other event for an order that does not exist -> "unknown order <order>".
//    Any other transition -> "<order> cannot be <event type> when <status>".
//
// 3. describe(id, state) returns the report line:
//      placed     "<id> placed <total>"
//      paid       "<id> paid <total>"
//      shipped    "<id> shipped <total> by <courier>"
//      delivered  "<id> delivered <total> by <courier>"
//      cancelled  "<id> cancelled (<reason>), refund <refund>"
//
// Use the types below: switch on event.type and state.status, with assertNever in the defaults.
// No `any` and no `as`. Do not change the types, assertNever or the test runner.

type Item = { sku: string; qty: number; price: number };

type OrderEvent =
    | { type: "placed"; order: string; items: Item[] }
    | { type: "paid"; order: string; amount: number }
    | { type: "shipped"; order: string; courier: string }
    | { type: "delivered"; order: string }
    | { type: "cancelled"; order: string; reason: string };

type OrderState =
    | { status: "placed"; total: number }
    | { status: "paid"; total: number }
    | { status: "shipped"; total: number; courier: string }
    | { status: "delivered"; total: number; courier: string }
    | { status: "cancelled"; total: number; refund: number; reason: string };

function assertNever(value: never): never {
    throw new Error(`unexpected value: ${JSON.stringify(value)}`);
}

function isText(value: unknown): value is string {
    return typeof value === "string" && value !== "";
}

function isWhole(value: unknown, min: number): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= min;
}

function parseItem(value: unknown): Item | null {
    if (typeof value !== "object" || value === null) return null;
    if (!("sku" in value) || !isText(value.sku)) return null;
    if (!("qty" in value) || !isWhole(value.qty, 1)) return null;
    if (!("price" in value) || !isWhole(value.price, 0)) return null;
    return { sku: value.sku, qty: value.qty, price: value.price };
}

function parseEvent(line: string): OrderEvent | null {
    let data: unknown;
    try {
        data = JSON.parse(line);
    } catch {
        return null;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    if (!("type" in data) || !("order" in data) || !isText(data.order)) return null;
    const order = data.order;
    switch (data.type) {
        case "placed": {
            if (!("items" in data) || !Array.isArray(data.items) || data.items.length === 0) return null;
            const rawItems: unknown[] = data.items;
            const items: Item[] = [];
            for (const raw of rawItems) {
                const item = parseItem(raw);
                if (item === null) return null;
                items.push(item);
            }
            return { type: "placed", order, items };
        }
        case "paid":
            return "amount" in data && isWhole(data.amount, 0) ? { type: "paid", order, amount: data.amount } : null;
        case "shipped":
            return "courier" in data && isText(data.courier) ? { type: "shipped", order, courier: data.courier } : null;
        case "delivered":
            return { type: "delivered", order };
        case "cancelled":
            return "reason" in data && isText(data.reason) ? { type: "cancelled", order, reason: data.reason } : null;
        default:
            return null;
    }
}

function apply(state: OrderState | undefined, event: OrderEvent): OrderState | string {
    if (event.type === "placed") {
        if (state !== undefined) return `${event.order} already exists`;
        return { status: "placed", total: event.items.reduce((sum, item) => sum + item.qty * item.price, 0) };
    }
    if (state === undefined) return `unknown order ${event.order}`;
    const invalid = `${event.order} cannot be ${event.type} when ${state.status}`;
    switch (event.type) {
        case "paid":
            if (state.status !== "placed") return invalid;
                        return { status: "paid", total: state.total };
        case "shipped":
            return state.status === "paid" ? { status: "shipped", total: state.total, courier: event.courier } : invalid;
        case "delivered":
            return state.status === "shipped" ? { status: "delivered", total: state.total, courier: state.courier } : invalid;
        case "cancelled":
            if (state.status === "placed") return { status: "cancelled", total: state.total, refund: 0, reason: event.reason };
            if (state.status === "paid") return { status: "cancelled", total: state.total, refund: state.total, reason: event.reason };
            return invalid;
        default:
            return assertNever(event);
    }
}

function describe(id: string, state: OrderState): string {
    switch (state.status) {
        case "placed":
            return `${id} placed ${state.total}`;
        case "paid":
            return `${id} paid ${state.total}`;
        case "shipped":
            return `${id} shipped ${state.total} by ${state.courier}`;
        case "delivered":
            return `${id} delivered ${state.total} by ${state.courier}`;
        case "cancelled":
            return `${id} cancelled (${state.reason}), refund ${state.refund}`;
        default:
            return assertNever(state);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
const orders = new Map<string, OrderState>();
const lines = readFileSync(0, "utf8").split("\n").filter((line) => line.trim() !== "");
lines.forEach((line, i) => {
    const event = parseEvent(line);
    if (event === null) {
        console.log(`line ${i + 1}: invalid event`);
        return;
    }
    const result = apply(orders.get(event.order), event);
    if (typeof result === "string") {
        console.log(`line ${i + 1}: ${result}`);
        return;
    }
    orders.set(event.order, result);
});

let revenue = 0;
let refunds = 0;
for (const [id, state] of [...orders].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    console.log(describe(id, state));
    if (state.status === "cancelled") refunds += state.refund;
    else if (state.status !== "placed") revenue += state.total;
}
console.log(`orders ${orders.size}, revenue ${revenue}, refunds ${refunds}`);
