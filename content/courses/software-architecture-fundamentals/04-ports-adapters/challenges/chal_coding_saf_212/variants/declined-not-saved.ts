import { readFileSync } from "node:fs";

// CodeDev checkout: OrderService.placeOrder sells a premium course to a learner. Today it creates
// its own payment client and email client inside placeOrder, so it only runs with the network,
// and no test can say "the card is declined" or "the mail server is down".
//
// Refactor OrderService so that it receives three ports through its constructor:
//     new OrderService({ payments, emails, orders })
//     payments: PaymentGateway, emails: EmailSender, orders: OrderRepository
// and placeOrder talks only to these ports: no HttpPaymentClient or SmtpEmailClient inside it.
// The behaviour must stay exactly as the comment above placeOrder describes it.
// Do not change the types, the ports, the vendor clients or the test runner.

type Learner = { id: string; email: string };
type Course = { id: string; title: string; priceVnd: number };
type Order = {
    id: string;
    learnerId: string;
    courseId: string;
    amountVnd: number;
    status: "paid" | "payment_failed";
    chargeId: string | null;
};
type PlaceOrderResult =
    | { ok: true; orderId: string; receiptSent: boolean }
    | { ok: false; error: "invalid_price" | "already_owned" | "payment_unavailable" }
    | { ok: false; error: "payment_declined"; reason: string };

// ---------------------------------------------------------------- ports (do not change)
// What OrderService needs, in its own words. The test runner passes fakes that record each call.
type ChargeResult = { status: "succeeded"; chargeId: string } | { status: "declined"; reason: string };

interface PaymentGateway {
    // Throws when the payment provider cannot be reached.
    charge(orderId: string, learnerId: string, amountVnd: number): ChargeResult;
}
interface EmailSender {
    // Throws when the mail server cannot be reached or rejects the message.
    sendReceipt(to: string, orderId: string, courseTitle: string, amountVnd: number): void;
}
interface OrderRepository {
    nextId(): string;
    hasPaid(learnerId: string, courseId: string): boolean;
    save(order: Order): void;
}

// ---------------------------------------------------------------- vendor clients (do not change)
// The real SDKs. They need the network, which the code runner does not have.
type VendorCharge = { id: string; outcome: "approved" | "card_declined" | "insufficient_funds" };

class HttpPaymentClient {
    constructor(private readonly apiKey: string) {}
    createCharge(body: { customer: string; amount: number; currency: "VND"; idempotencyKey: string }): VendorCharge {
        throw new Error(`connect ECONNREFUSED pay.codedev.test:443 (charge ${body.idempotencyKey}, key ${this.apiKey.slice(0, 7)}...)`);
    }
}

class SmtpEmailClient {
    constructor(private readonly host: string) {}
    sendMail(mail: { to: string; subject: string; text: string }): void {
        throw new Error(`connect ECONNREFUSED ${this.host}:587 (mail to ${mail.to})`);
    }
}

const PAYMENT_API_KEY = "sk_live_codedev_payments";
const SMTP_HOST = "smtp.codedev.test";

// ---------------------------------------------------------------- your code
type OrderServiceDeps = { payments: PaymentGateway; emails: EmailSender; orders: OrderRepository };

class OrderService {
    constructor(private readonly deps: OrderServiceDeps) {}

    // placeOrder(learner, course):
    // 1. course.priceVnd must be a positive whole number, otherwise { ok: false, error: "invalid_price" }.
    // 2. A learner who already has a paid order for the course gets { ok: false, error: "already_owned" }.
    //    In cases 1 and 2 nothing is charged, saved or sent.
    // 3. Take a new order id from the repository and charge the course price for it.
    // 4. The payment provider cannot be reached (charging throws): save nothing, send nothing,
    //    { ok: false, error: "payment_unavailable" }.
    // 5. Declined: save the order with status "payment_failed" and chargeId null, send no email,
    //    { ok: false, error: "payment_declined", reason }.
    // 6. Succeeded: save the order with status "paid" and the charge id, then send the receipt to
    //    learner.email: { ok: true, orderId, receiptSent: true }, or receiptSent: false when sending
    //    throws (the order stays paid; a nightly job resends missing receipts).
    placeOrder(learner: Learner, course: Course): PlaceOrderResult {
        if (!Number.isInteger(course.priceVnd) || course.priceVnd <= 0) return { ok: false, error: "invalid_price" };
        if (this.deps.orders.hasPaid(learner.id, course.id)) return { ok: false, error: "already_owned" };
        const orderId = this.deps.orders.nextId();

        let charge: ChargeResult;
        try {
            charge = this.deps.payments.charge(orderId, learner.id, course.priceVnd);
        } catch {
            return { ok: false, error: "payment_unavailable" };
        }

        const order: Order = {
            id: orderId,
            learnerId: learner.id,
            courseId: course.id,
            amountVnd: course.priceVnd,
            status: "payment_failed",
            chargeId: null,
        };
        if (charge.status === "declined") {
            return { ok: false, error: "payment_declined", reason: charge.reason };
        }
        this.deps.orders.save({ ...order, status: "paid", chargeId: charge.chargeId });

        try {
            this.deps.emails.sendReceipt(learner.email, orderId, course.title, course.priceVnd);
            return { ok: true, orderId, receiptSent: true };
        } catch {
            return { ok: true, orderId, receiptSent: false };
        }
    }
}

// Adapters: the vendor SDKs behind the ports. Only the composition root below knows them.
class HttpPaymentGateway implements PaymentGateway {
    constructor(private readonly client: HttpPaymentClient) {}
    charge(orderId: string, learnerId: string, amountVnd: number): ChargeResult {
        const res = this.client.createCharge({ customer: learnerId, amount: amountVnd, currency: "VND", idempotencyKey: orderId });
        return res.outcome === "approved" ? { status: "succeeded", chargeId: res.id } : { status: "declined", reason: res.outcome };
    }
}

class SmtpEmailSender implements EmailSender {
    constructor(private readonly client: SmtpEmailClient) {}
    sendReceipt(to: string, orderId: string, courseTitle: string, amountVnd: number): void {
        this.client.sendMail({ to, subject: `Your CodeDev receipt: ${courseTitle}`, text: `Order ${orderId}: ${amountVnd} VND` });
    }
}

// Composition root for production (not called by the test runner).
function createOrderService(orders: OrderRepository): OrderService {
    return new OrderService({
        payments: new HttpPaymentGateway(new HttpPaymentClient(PAYMENT_API_KEY)),
        emails: new SmtpEmailSender(new SmtpEmailClient(SMTP_HOST)),
        orders,
    });
}
void createOrderService;

// ---------------------------------------------------------------- test runner (do not change)
// Input: { paidBefore?, payments?, emails?, checkouts }.
//   paidBefore: courses the learner already paid for, as { learnerId, courseId }
//   payments:   what the fake gateway does on each charge, in order: "succeeded", "declined:<reason>"
//               or "down" (charge throws); "succeeded" once the list runs out
//   emails:     what the fake mail server does on each receipt, in order: "ok" or "down"; "ok" after
//   checkouts:  [{ learner, course }], placed one after the other on the same OrderService
// Up to 10 checkouts: each result with the port calls it made. More: only the summary line.
type Input = {
    paidBefore?: Array<{ learnerId: string; courseId: string }>;
    payments?: string[];
    emails?: string[];
    checkouts: Array<{ learner: Learner; course: Course }>;
};

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const paymentScript = [...(input.payments ?? [])];
const emailScript = [...(input.emails ?? [])];
const saved: Order[] = [];
const paidBefore = input.paidBefore ?? [];
let log: string[] = [];
let ids = 0;
let charges = 0;
let receipts = 0;

const payments: PaymentGateway = {
    charge(orderId, learnerId, amountVnd) {
        const next = paymentScript.shift() ?? "succeeded";
        log.push(`  charge ${orderId} ${learnerId} ${amountVnd} -> ${next}`);
        if (next === "down") throw new Error("payment provider unreachable");
        charges++;
        if (next.startsWith("declined:")) return { status: "declined", reason: next.slice("declined:".length) };
        return { status: "succeeded", chargeId: `ch_${charges}` };
    },
};
const emails: EmailSender = {
    sendReceipt(to, orderId, courseTitle, amountVnd) {
        const next = emailScript.shift() ?? "ok";
        log.push(`  sendReceipt ${to} ${orderId} "${courseTitle}" ${amountVnd} -> ${next}`);
        if (next === "down") throw new Error("mail server unreachable");
        receipts++;
    },
};
const orders: OrderRepository = {
    nextId() {
        ids++;
        return `ord_${ids}`;
    },
    hasPaid(learnerId, courseId) {
        return paidBefore.some((p) => p.learnerId === learnerId && p.courseId === courseId)
            || saved.some((o) => o.learnerId === learnerId && o.courseId === courseId && o.status === "paid");
    },
    save(order) {
        log.push(`  save ${order.id} ${order.learnerId} ${order.courseId} ${order.amountVnd} ${order.status} ${order.chargeId ?? "-"}`);
        saved.push({ ...order });
    },
};

function describeResult(r: PlaceOrderResult): string {
    if (r.ok) return `paid ${r.orderId}, receipt ${r.receiptSent ? "sent" : "not sent"}`;
    return "reason" in r ? `${r.error} (${r.reason})` : r.error;
}

const deps = { payments, emails, orders };
const service = new OrderService(deps);
const verbose = input.checkouts.length <= 10;
for (const { learner, course } of input.checkouts) {
    log = [];
    let line: string;
    try {
        line = describeResult(service.placeOrder(learner, course));
    } catch (error) {
        line = `threw: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (verbose) {
        console.log(`placeOrder ${learner.id} ${course.id} -> ${line}`);
        for (const entry of log) console.log(entry);
    }
}
const paid = saved.filter((o) => o.status === "paid").length;
console.log(`summary: ${charges} charges, ${paid} paid orders, ${saved.length - paid} failed orders, ${receipts} receipts`);
