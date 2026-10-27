import { readFileSync } from "node:fs";

// Receipt Before Payment. Two days after the notifications module was extracted into its own
// service, learners of CodeDev started to write in: "I got a receipt, but my card was declined."
// Some of them could even open the course they had not paid for, because the progress module
// grants access when it sees an "order.paid" event. The refactor changed placeOrder below.
//
// Fix placeOrder so that a checkout charges the payment first, saves the order as paid only when
// the charge succeeded, and only then sends the receipt and publishes "order.paid". A declined
// charge or a gateway timeout must send no receipt and publish no event.
// Do not change the types, the ports or the test runner.

type Order = { id: string; learnerId: string; learnerEmail: string; courseId: string; amountVnd: number };
type PaymentResult =
    | { status: "succeeded"; chargeId: string }
    | { status: "declined"; reason: string }
    | { status: "timeout" };
type OrderStatus = "paid" | "payment_failed" | "payment_unknown";
type PlaceOrderResult = { orderId: string; status: OrderStatus | "rejected" };
type OrderPaid = { orderId: string; learnerId: string; courseId: string };

// Ports: OrderService only knows these interfaces. The adapters behind them call the payment
// provider, the orders table, the notifications service and the event bus.
interface PaymentGateway {
    charge(orderId: string, amountVnd: number): PaymentResult;
}
interface OrderRepository {
    save(orderId: string, status: OrderStatus, chargeId?: string): void;
}
interface EmailSender {
    sendReceipt(to: string, orderId: string, amountVnd: number): void;
}
interface EventBus {
    publish(type: "order.paid", payload: OrderPaid): void;
}
type Deps = { payments: PaymentGateway; orders: OrderRepository; email: EmailSender; events: EventBus };

function isValid(order: Order): boolean {
    return typeof order.learnerEmail === "string" && order.learnerEmail.includes("@")
        && Number.isInteger(order.amountVnd) && order.amountVnd > 0;
}

function placeOrder(order: Order, deps: Deps): PlaceOrderResult {
    if (!isValid(order)) return { orderId: order.id, status: "rejected" };

    const result = deps.payments.charge(order.id, order.amountVnd);
    if (result.status !== "succeeded") {
        deps.orders.save(order.id, "payment_failed");
        return { orderId: order.id, status: "payment_failed" };
    }
    deps.orders.save(order.id, "paid", result.chargeId);
    deps.email.sendReceipt(order.learnerEmail, order.id, order.amountVnd);
    deps.events.publish("order.paid", { orderId: order.id, learnerId: order.learnerId, courseId: order.courseId });
    return { orderId: order.id, status: "paid" };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of checkouts { order, payment }. "payment" scripts the fake gateway for that order:
// "succeeded", "declined" or "timeout". Every call to a fake port is written to a call log.
// Up to 10 checkouts: the call log and the result of each checkout, then a summary line.
// More than 10: only the summary line.
type Checkout = { order: Order; payment: "succeeded" | "declined" | "timeout" };

const checkouts: Checkout[] = JSON.parse(readFileSync(0, "utf8"));
const log: string[] = [];
const savedAsPaid = new Set<string>();
let script: Checkout["payment"] = "succeeded";
let receipts = 0;
let events = 0;
let beforePaid = 0;

const deps: Deps = {
    payments: {
        charge(orderId, amountVnd) {
            log.push(`payments.charge ${orderId} ${amountVnd}`);
            if (script === "succeeded") return { status: "succeeded", chargeId: `ch_${orderId}` };
            if (script === "declined") return { status: "declined", reason: "insufficient_funds" };
            return { status: "timeout" };
        },
    },
    orders: {
        save(orderId, status, chargeId) {
            log.push(`orders.save ${orderId} ${status}${chargeId ? " " + chargeId : ""}`);
            if (status === "paid") savedAsPaid.add(orderId);
        },
    },
    email: {
        sendReceipt(to, orderId, amountVnd) {
            log.push(`email.sendReceipt ${to} ${orderId} ${amountVnd}`);
            receipts++;
            if (!savedAsPaid.has(orderId)) beforePaid++;
        },
    },
    events: {
        publish(type, payload) {
            log.push(`events.publish ${type} ${payload.orderId} ${payload.learnerId} ${payload.courseId}`);
            events++;
            if (!savedAsPaid.has(payload.orderId)) beforePaid++;
        },
    },
};

const results: Record<string, number> = { paid: 0, payment_failed: 0, payment_unknown: 0, rejected: 0 };
for (const checkout of checkouts) {
    script = checkout.payment;
    log.length = 0;
    const result = placeOrder(checkout.order, deps);
    results[result.status]++;
    if (checkouts.length <= 10) {
        console.log(`${checkout.order.id} (gateway: ${checkout.payment})`);
        for (const line of log) console.log(`  ${line}`);
        console.log(`  -> ${result.status}`);
    }
}
console.log(
    `summary: ${checkouts.length} checkouts, paid ${results.paid}, payment_failed ${results.payment_failed}, ` +
    `payment_unknown ${results.payment_unknown}, rejected ${results.rejected}; receipts ${receipts}, ` +
    `order.paid events ${events}, side effects before the order was saved as paid ${beforePaid}`,
);
