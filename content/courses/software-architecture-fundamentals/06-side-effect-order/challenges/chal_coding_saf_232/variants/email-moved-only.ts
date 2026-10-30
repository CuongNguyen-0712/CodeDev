import { readFileSync } from "node:fs";

// CodeDev checkout, after the refactor that injects payment, enrollment, email and log as ports.
// The test runner at the bottom passes fakes and prints every call they received, in order,
// plus the checkout result and the log lines.
//
// What checkout(order, deps) must do:
//   - Charge the card with the idempotency key "checkout-<orderId>".
//   - The gateway throws (timeout, network): log "checkout <orderId> error: <message>" and return
//     { status: "error", detail: <message> }.
//   - The card is declined: log "checkout <orderId> declined: <reason>" and return
//     { status: "declined", detail: <reason> }.
//   - The card is approved: enroll the learner, send the receipt, log "checkout <orderId> paid: <chargeId>"
//     and return { status: "paid", detail: <chargeId> }.
//     If only the receipt email fails, the learner has still paid and is still enrolled: log
//     "checkout <orderId> receipt failed: <message>" (before the "paid" line) and return "paid".
//
// Support reports learners who got "Thanks for your purchase" for a declined card, and learners who
// are enrolled without paying. Fix checkout. Do not change the types, the ports or the test runner.

interface Order {
    orderId: string;
    userId: string;
    courseId: string;
    amountVnd: number;
}

type ChargeResult =
    | { status: "approved"; chargeId: string }
    | { status: "declined"; reason: string };

interface PaymentPort {
    charge(userId: string, amountVnd: number, idempotencyKey: string): Promise<ChargeResult>;
}

interface EnrollmentRepository {
    create(userId: string, courseId: string): Promise<void>;
}

interface EmailPort {
    sendReceipt(userId: string, courseId: string, amountVnd: number): Promise<void>;
}

interface Logger {
    log(line: string): void;
}

interface Deps {
    payments: PaymentPort;
    enrollments: EnrollmentRepository;
    email: EmailPort;
    logger: Logger;
}

interface CheckoutResult {
    status: "paid" | "declined" | "error";
    detail: string;
}

async function checkout(order: Order, deps: Deps): Promise<CheckoutResult> {
    const key = `checkout-${order.orderId}`;
    try {
        const [charge] = await Promise.all([
            deps.payments.charge(order.userId, order.amountVnd, key),
            deps.enrollments.create(order.userId, order.courseId),
        ]);
        if (charge.status === "declined") {
            deps.logger.log(`checkout ${order.orderId} declined: ${charge.reason}`);
            return { status: "declined", detail: charge.reason };
        }
        try {
            await deps.email.sendReceipt(order.userId, order.courseId, order.amountVnd);
        } catch (err) {
            deps.logger.log(`checkout ${order.orderId} receipt failed: ${errorMessage(err)}`);
        }
        deps.logger.log(`checkout ${order.orderId} paid: ${charge.chargeId}`);
        return { status: "paid", detail: charge.chargeId };
    } catch (err) {
        const message = errorMessage(err);
        deps.logger.log(`checkout ${order.orderId} error: ${message}`);
        return { status: "error", detail: message };
    }
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------- test runner (do not change)
interface TestCase {
    order: Order;
    gateway: { answer: "approved" | "declined" | "throws"; reason?: string; message?: string };
    mailerError?: string;
}

async function main(): Promise<void> {
    const t: TestCase = JSON.parse(readFileSync(0, "utf8"));
    const calls: string[] = [];
    const log: string[] = [];
    const deps: Deps = {
        payments: {
            async charge(userId, amountVnd, idempotencyKey) {
                calls.push(`charge ${userId} ${amountVnd} key=${idempotencyKey}`);
                await Promise.resolve(); // the gateway answers a little later
                if (t.gateway.answer === "throws") throw new Error(t.gateway.message ?? "gateway error");
                if (t.gateway.answer === "declined") return { status: "declined", reason: t.gateway.reason ?? "declined" };
                return { status: "approved", chargeId: `ch_${t.order.orderId}` };
            },
        },
        enrollments: {
            async create(userId, courseId) {
                calls.push(`enroll ${userId} in ${courseId}`);
            },
        },
        email: {
            async sendReceipt(userId, courseId, amountVnd) {
                calls.push(`receipt to ${userId} for ${courseId}: ${amountVnd}`);
                if (t.mailerError) throw new Error(t.mailerError);
            },
        },
        logger: { log: (line) => { log.push(line); } },
    };
    const result = await checkout(t.order, deps);
    console.log(JSON.stringify({ calls, result, log }));
}

main();
