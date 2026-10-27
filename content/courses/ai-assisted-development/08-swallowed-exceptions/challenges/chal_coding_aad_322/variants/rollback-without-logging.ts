import { readFileSync } from "node:fs";

// Swallowed exceptions: the catch block that hid a failed payment.
// The enrollment flow below was written by an AI coding assistant from this request:
//   "Write enrollWithPayment for premium courses: create the enrollment, charge the learner's
//    payment method through the gateway, activate the enrollment and email a receipt.
//    Handle errors."
// Finance's monthly reconciliation found 23 learners with an active premium enrollment and no
// captured payment. The logs have no line about any of them.
//
// Required behaviour:
//   - insert the enrollment (pending), charge the payment method with the enrollment id as the
//     idempotency key, then activate the enrollment with the charge id and send the receipt;
//   - card declined (PaymentDeclinedError): remove the enrollment, log
//     warn "payment_declined" with reason = the decline code, return { status: "payment_declined", code };
//   - any other error from the gateway: remove the enrollment, log error "payment_failed" with
//     reason = the error message, and throw the same error again;
//   - receipt email fails: the learner stays enrolled, log warn "receipt_failed" with
//     reason = the error message, return "enrolled";
//   - already enrolled (DuplicateEnrollmentError from insert): let it propagate, charge nothing.
// Every log context is { enrollmentId, userId, courseId, reason }.
// Do not change the error classes, the types, the fakes or the test runner.

class PaymentDeclinedError extends Error {
    constructor(readonly code: string) {
        super(`card declined: ${code}`);
        this.name = "PaymentDeclinedError";
    }
}
class GatewayError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "GatewayError";
    }
}
class DuplicateEnrollmentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DuplicateEnrollmentError";
    }
}

type Enrollment = { id: string; userId: string; courseId: string; status: "pending" | "active"; chargeId: string | null };
type EnrollRequest = { userId: string; courseId: string; priceVnd: number; paymentMethodId: string };
type EnrollOutcome = { status: "enrolled"; enrollmentId: string } | { status: "payment_declined"; code: string };
type LogContext = { enrollmentId: string; userId: string; courseId: string; reason: string };
type Deps = {
    enrollments: {
        insert(row: { userId: string; courseId: string }): Promise<Enrollment>;
        activate(id: string, chargeId: string | null): Promise<void>;
        remove(id: string): Promise<void>;
    };
    gateway: { charge(charge: { paymentMethodId: string; amountVnd: number; idempotencyKey: string }): Promise<{ chargeId: string }> };
    mailer: { sendReceipt(userId: string, courseId: string): Promise<void> };
    logger: { warn(event: string, context: LogContext): void; error(event: string, context: LogContext): void };
};

async function enrollWithPayment(req: EnrollRequest, deps: Deps): Promise<EnrollOutcome> {
    const enrollment = await deps.enrollments.insert({ userId: req.userId, courseId: req.courseId });
    let chargeId: string;
    try {
        ({ chargeId } = await deps.gateway.charge({ paymentMethodId: req.paymentMethodId, amountVnd: req.priceVnd, idempotencyKey: enrollment.id }));
    } catch (error) {
        await deps.enrollments.remove(enrollment.id);
        if (error instanceof PaymentDeclinedError) return { status: "payment_declined", code: error.code };
        throw error;
    }
    await deps.enrollments.activate(enrollment.id, chargeId);
    try {
        await deps.mailer.sendReceipt(req.userId, req.courseId);
    } catch {
        // the receipt is not critical
    }
    return { status: "enrolled", enrollmentId: enrollment.id };
}

// ------------------------------------------------------------ fakes and test runner (do not change)
// In-memory enrollments table, a fake payment gateway that behaves by payment method id
// (pm_ok..., pm_declined_<code>, pm_timeout, pm_broken), a mailer that bounces the addresses
// listed in the test, and a logger that prints every line. Everything is deterministic.
type TestCase = {
    existing?: { userId: string; courseId: string; chargeId: string }[];
    bouncingUsers?: string[];
    requests: EnrollRequest[];
};

function createWorld(test: TestCase) {
    const rows = new Map<string, Enrollment>();
    let nextEnrollment = 1;
    let nextCharge = 1;
    const captured: string[] = [];
    const bouncing = new Set(test.bouncingUsers ?? []);
    const later = <T>(fn: () => T): Promise<T> => Promise.resolve().then(fn);
    const line = (level: string, event: string, c: LogContext) =>
        console.log(`  log ${level} ${event} enrollmentId=${c.enrollmentId} userId=${c.userId} courseId=${c.courseId} reason=${c.reason}`);

    const deps: Deps = {
        enrollments: {
            insert: ({ userId, courseId }) => later(() => {
                for (const row of rows.values()) {
                    if (row.userId === userId && row.courseId === courseId) {
                        throw new DuplicateEnrollmentError(`${userId} is already enrolled in ${courseId}`);
                    }
                }
                const row: Enrollment = { id: `enr_${nextEnrollment++}`, userId, courseId, status: "pending", chargeId: null };
                rows.set(row.id, row);
                return { ...row };
            }),
            activate: (id, chargeId) => later(() => {
                const row = rows.get(id);
                if (!row) throw new Error(`no enrollment ${id}`);
                row.status = "active";
                row.chargeId = chargeId;
            }),
            remove: (id) => later(() => {
                rows.delete(id);
            }),
        },
        gateway: {
            charge: ({ paymentMethodId, amountVnd, idempotencyKey }) => later(() => {
                if (paymentMethodId.startsWith("pm_declined_")) throw new PaymentDeclinedError(paymentMethodId.slice("pm_declined_".length));
                if (paymentMethodId === "pm_timeout") throw new GatewayError("gateway timeout after 10000 ms");
                if (paymentMethodId === "pm_broken") throw new Error("unexpected gateway response: 502 Bad Gateway");
                const chargeId = `ch_${nextCharge++}`;
                captured.push(`${chargeId}=${amountVnd}@${idempotencyKey}`);
                return { chargeId };
            }),
        },
        mailer: {
            sendReceipt: (userId) => later(() => {
                if (bouncing.has(userId)) throw new Error("smtp 550 mailbox unavailable");
            }),
        },
        logger: {
            warn: (event, context) => line("warn", event, context),
            error: (event, context) => line("error", event, context),
        },
    };
    for (const e of test.existing ?? []) {
        const id = `enr_${nextEnrollment++}`;
        rows.set(id, { id, userId: e.userId, courseId: e.courseId, status: "active", chargeId: e.chargeId });
    }
    return { deps, rows, captured };
}

async function main(): Promise<void> {
    const test: TestCase = JSON.parse(readFileSync(0, "utf8"));
    const { deps, rows, captured } = createWorld(test);
    for (const [i, req] of test.requests.entries()) {
        const label = `#${i + 1} ${req.userId} ${req.courseId} ${req.paymentMethodId}`;
        try {
            const outcome = await enrollWithPayment(req, deps);
            console.log(`${label}: ${outcome.status === "enrolled" ? `enrolled ${outcome.enrollmentId}` : `payment_declined ${outcome.code}`}`);
        } catch (error) {
            const e = error instanceof Error ? error : new Error(String(error));
            console.log(`${label}: threw ${e.name}: ${e.message}`);
        }
    }
    console.log("rows:");
    for (const row of rows.values()) console.log(`  ${row.id} ${row.userId} ${row.courseId} ${row.status} ${row.chargeId ?? "no-charge"}`);
    console.log(`captured: ${captured.length ? captured.join(", ") : "none"}`);
}

main();
