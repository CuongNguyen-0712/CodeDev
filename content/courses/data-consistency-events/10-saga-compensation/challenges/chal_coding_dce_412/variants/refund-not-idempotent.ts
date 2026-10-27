import { readFileSync } from "node:fs";

// "Buy a premium course" as an orchestrated saga. Steps, in order:
//   pay (reserve points or charge the card) -> enroll -> grant (entitlement) -> receipt (email)
// Compensations, run in REVERSE order of the completed steps when a step fails:
//   refund (undoes pay), cancelEnrollment (undoes enroll), revokeEntitlement (undoes grant)
// The receipt has no compensation: an email cannot be unsent, so it is the last step and its
// failure never undoes the purchase (it is retried later instead).
// Write the seven actions (each one idempotent) and the orchestrator runSaga.
// Do not change the types, FakeDb, the errors, the context or the test runner.

type Method = "points" | "card";
type Order = { sagaId: string; userId: string; courseId: string; method: Method; price: number };
type StepName = "pay" | "enroll" | "grant" | "receipt";
type CompName = "refund" | "cancelEnrollment" | "revokeEntitlement";
type ActionName = StepName | CompName;
type Status = "running" | "compensating" | "completed" | "receipt_pending" | "aborted" | "stuck";
type SagaRecord = { order: Order; status: Status; done: StepName[]; undone: CompName[]; error: string | null };

type Tables = {
    wallets: Map<string, number>; // userId -> points balance
    payments: Map<string, { userId: string; method: Method; amount: number; status: "captured" | "refunded" }>; // by sagaId
    enrollments: Map<string, { sagaId: string; status: "active" | "cancelled" }>; // by "userId:courseId"
    entitlements: Map<string, { sagaId: string; active: boolean }>; // by "userId:courseId"
    receipts: { sagaId: string; userId: string; amount: number }[]; // emails sent, in order
    sagas: Map<string, SagaRecord>; // by sagaId
};

// ---------------------------------------------------------------- building blocks (do not change)
/** tx(fn) runs fn on a copy of the tables and commits the copy only if fn returns without throwing. */
class FakeDb {
    constructor(public tables: Tables) {}
    tx<T>(fn: (t: Tables) => T): T {
        const copy = structuredClone(this.tables);
        const result = fn(copy);
        this.tables = copy;
        return result;
    }
}
/** A failure that may go away on retry (timeout, 503). Nothing was written. */
class TransientError extends Error {}
/** A business refusal (card declined, insufficient points). Retrying gives the same answer. */
class BusinessError extends Error {}
/** The process died. Thrown by the context; the runner restarts the saga from the database. */
class Crash extends Error {}

type Ctx = {
    maxAttempts: number;
    /** The saga record stored in the database, or null. */
    load(sagaId: string): SagaRecord | null;
    /** Stores the saga record (its own transaction). */
    save(record: SagaRecord): void;
    /** Runs one action in its own transaction, after the scripted faults; may throw any of the 3 errors. */
    perform(action: ActionName, order: Order): void;
};

const key = (o: Order): string => `${o.userId}:${o.courseId}`;

// ---------------------------------------------------------------- your code
const ACTIONS: Record<ActionName, (t: Tables, order: Order) => void> = {
    pay(t, o) {
        if (t.payments.has(o.sagaId)) return; // already paid by an earlier attempt
        if (o.method === "points") {
            const balance = t.wallets.get(o.userId) ?? 0;
            if (balance < o.price) throw new BusinessError("insufficient points");
            t.wallets.set(o.userId, balance - o.price);
        }
        t.payments.set(o.sagaId, { userId: o.userId, method: o.method, amount: o.price, status: "captured" });
    },
    enroll(t, o) {
        const current = t.enrollments.get(key(o));
        if (current?.status === "active") {
            if (current.sagaId === o.sagaId) return;
            throw new BusinessError("already enrolled");
        }
        t.enrollments.set(key(o), { sagaId: o.sagaId, status: "active" });
    },
    grant(t, o) {
        t.entitlements.set(key(o), { sagaId: o.sagaId, active: true });
    },
    receipt(t, o) {
        if (t.receipts.some((r) => r.sagaId === o.sagaId)) return;
        t.receipts.push({ sagaId: o.sagaId, userId: o.userId, amount: o.price });
    },
    refund(t, o) {
        const p = t.payments.get(o.sagaId);
        if (!p) return;
        p.status = "refunded";
        if (p.method === "points") t.wallets.set(p.userId, (t.wallets.get(p.userId) ?? 0) + p.amount);
    },
    cancelEnrollment(t, o) {
        const e = t.enrollments.get(key(o));
        if (e && e.sagaId === o.sagaId && e.status === "active") e.status = "cancelled";
    },
    revokeEntitlement(t, o) {
        const e = t.entitlements.get(key(o));
        if (e && e.sagaId === o.sagaId && e.active) e.active = false;
    },
};

const FORWARD: StepName[] = ["pay", "enroll", "grant"];
const UNDO: Record<string, CompName> = { pay: "refund", enroll: "cancelEnrollment", grant: "revokeEntitlement" };

/** Runs the action up to maxAttempts times. Returns null on success, else the reason it failed. */
function attempt(ctx: Ctx, action: ActionName, order: Order): string | null {
    for (let i = 1; i <= ctx.maxAttempts; i++) {
        try {
            ctx.perform(action, order);
            return null;
        } catch (e) {
            if (e instanceof BusinessError) return e.message;
            if (!(e instanceof TransientError)) throw e; // a Crash ends this run
        }
    }
    return `gave up after ${ctx.maxAttempts} attempts`;
}

function compensate(ctx: Ctx, rec: SagaRecord): void {
    for (const step of [...rec.done].reverse()) {
        const comp = UNDO[step];
        if (!comp || rec.undone.includes(comp)) continue;
        if (attempt(ctx, comp, rec.order) !== null) {
            rec.status = "stuck";
            ctx.save(rec);
            return;
        }
        rec.undone.push(comp);
        ctx.save(rec);
    }
    rec.status = "aborted";
    ctx.save(rec);
}

function sendReceipt(ctx: Ctx, rec: SagaRecord): void {
    const failure = attempt(ctx, "receipt", rec.order);
    if (failure === null) {
        rec.done.push("receipt");
        rec.status = "completed";
        rec.error = null;
    } else {
        rec.status = "receipt_pending";
        rec.error = `receipt: ${failure}`;
    }
    ctx.save(rec);
}

function runSaga(ctx: Ctx, order: Order): void {
    let rec = ctx.load(order.sagaId);
    if (!rec) {
        const valid = (order.method === "points" || order.method === "card") && Number.isInteger(order.price) && order.price > 0;
        rec = { order, status: valid ? "running" : "aborted", done: [], undone: [], error: valid ? null : "invalid order" };
        ctx.save(rec);
    }
    if (rec.status === "running") {
        for (const step of FORWARD) {
            if (rec.done.includes(step)) continue;
            const failure = attempt(ctx, step, rec.order);
            if (failure !== null) {
                rec.status = "compensating";
                rec.error = `${step}: ${failure}`;
                ctx.save(rec);
                break;
            }
            rec.done.push(step);
            ctx.save(rec);
        }
        if (rec.status === "running") sendReceipt(ctx, rec);
    } else if (rec.status === "receipt_pending") {
        sendReceipt(ctx, rec);
    }
    if (rec.status === "compensating" || rec.status === "stuck") compensate(ctx, rec);
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { maxAttempts, wallets, enrollments?, orders, faults?, crashes?, rerun? }
//   faults: { "<sagaId>": { "<action>": ["ok" | "transient" | "fail:<reason>", ...] } } - one entry per call
//   crashes: ["<sagaId>:<action>#<n>"] - the process dies right after the n-th successful run of that action commits
//   rerun: after every order is done, the scheduler calls runSaga once more for each order
type Input = {
    maxAttempts: number;
    wallets: Record<string, number>;
    enrollments?: Record<string, { sagaId: string; status: "active" | "cancelled" }>;
    orders: Order[];
    faults?: Record<string, Partial<Record<ActionName, string[]>>>;
    crashes?: string[];
    rerun?: boolean;
};
const input = JSON.parse(readFileSync(0, "utf8")) as Input;
const db = new FakeDb({
    wallets: new Map(Object.entries(input.wallets)),
    payments: new Map(),
    enrollments: new Map(Object.entries(input.enrollments ?? {})),
    entitlements: new Map(),
    receipts: [],
    sagas: new Map(),
});
const log: string[] = [];
const calls = new Map<string, number>();
const commits = new Map<string, number>();
const crashes = new Set(input.crashes ?? []);
const COMPENSATIONS = new Set<string>(["refund", "cancelEnrollment", "revokeEntitlement"]);

function makeCtx(): Ctx & { crashed: boolean } {
    const ctx = {
        crashed: false,
        maxAttempts: input.maxAttempts,
        load(sagaId: string): SagaRecord | null {
            if (ctx.crashed) throw new Crash("crashed");
            const r = db.tables.sagas.get(sagaId);
            return r ? structuredClone(r) : null;
        },
        save(record: SagaRecord): void {
            if (ctx.crashed) throw new Crash("crashed");
            db.tx((t) => t.sagas.set(record.order.sagaId, structuredClone(record)));
        },
        perform(action: ActionName, order: Order): void {
            if (ctx.crashed) throw new Crash("crashed");
            const id = `${order.sagaId}:${action}`;
            const n = (calls.get(id) ?? 0) + 1;
            calls.set(id, n);
            const label = `${order.sagaId} ${action} #${n}`;
            const fault = input.faults?.[order.sagaId]?.[action]?.[n - 1] ?? "ok";
            if (fault === "transient" || (fault.startsWith("fail:") && COMPENSATIONS.has(action))) {
                log.push(`${label}: transient error`);
                throw new TransientError("transient");
            }
            if (fault.startsWith("fail:")) {
                log.push(`${label}: failed (${fault.slice(5)})`);
                throw new BusinessError(fault.slice(5));
            }
            try {
                db.tx((t) => ACTIONS[action](t, order));
            } catch (e) {
                if (e instanceof BusinessError) log.push(`${label}: failed (${e.message})`);
                throw e;
            }
            log.push(`${label}: ok`);
            const c = (commits.get(id) ?? 0) + 1;
            commits.set(id, c);
            if (crashes.has(`${id}#${c}`)) {
                log.push(`CRASH after ${label}`);
                ctx.crashed = true;
                throw new Crash("crashed");
            }
        },
    };
    return ctx;
}

function runOnce(order: Order): void {
    for (let restarts = 0; ; restarts++) {
        const ctx = makeCtx();
        try {
            runSaga(ctx, order);
        } catch (e) {
            if (!ctx.crashed) {
                log.push(`${order.sagaId} error: ${e instanceof Error ? e.message : String(e)}`);
                return;
            }
        }
        if (!ctx.crashed) return;
        if (restarts === 5) {
            log.push(`${order.sagaId} gave up after 5 restarts`);
            return;
        }
        log.push(`restart ${order.sagaId}`);
    }
}

for (const order of input.orders) runOnce(order);
if (input.rerun) {
    for (const order of input.orders) {
        log.push(`rerun ${order.sagaId}`);
        runOnce(order);
    }
}
const t = db.tables;
const sorted = <V>(m: Map<string, V>): Record<string, V> => Object.fromEntries([...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
console.log(JSON.stringify({
    log,
    sagas: input.orders.map((o) => {
        const r = t.sagas.get(o.sagaId);
        return r ? `${o.sagaId} ${r.status} done=[${r.done.join(",")}] undone=[${r.undone.join(",")}] error=${r.error}` : `${o.sagaId} (no record)`;
    }),
    wallets: sorted(t.wallets),
    payments: Object.entries(sorted(t.payments)).map(([id, p]) => `${id} ${p.method} ${p.amount} ${p.status}`),
    enrollments: Object.entries(sorted(t.enrollments)).map(([k, e]) => `${k} ${e.status} (${e.sagaId})`),
    entitlements: Object.entries(sorted(t.entitlements)).map(([k, e]) => `${k} ${e.active ? "active" : "revoked"} (${e.sagaId})`),
    receipts: t.receipts.map((r) => `${r.sagaId} ${r.userId} ${r.amount}`),
}, null, 2));
