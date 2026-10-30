import { readFileSync } from "node:fs";

// CodeDev premium purchase: buy a course with reward points, as an orchestrated saga.
//
// Forward steps, in this order (each one runs in a different service, with its own database):
//   1. debitPoints       -> compensation: refundPoints     (ctx.points.debit / ctx.points.refund)
//   2. createEnrollment  -> compensation: cancelEnrollment (ctx.enrollments.create / ctx.enrollments.cancel)
//   3. grantAccess       -> compensation: revokeAccess     (ctx.access.grant / ctx.access.revoke)
//
// Write runPurchaseSaga(ctx). The runner calls it once per delivery of the purchase command, and again
// after every crash, so it must resume from the saga state in ctx.store (durable) and nothing else.
//   - Load the state; if there is none, save a new one: status "running", done [], compensate [].
//     A saga that is already "completed" or "aborted" does nothing.
//   - Every service call takes an idempotency key. A service applies a key at most once: calling it
//     again with the same key returns without doing anything. A compensation takes the key of the
//     forward call it undoes and is a no-op if that forward call was never applied.
//   - TransientError = timeout: the call may or may not have been applied. Retry a forward step until
//     it succeeds, at most ctx.maxAttempts attempts in one run. Retry a compensation until it succeeds.
//   - RejectedError = the service refused the forward step and applied nothing.
//   - Record each successful forward step in state.done and save the state before the next step.
//     When all three are done, save status "completed".
//   - When a forward step is rejected, or still times out after ctx.maxAttempts attempts, the saga
//     must be undone: save status "compensating" and the list of steps to compensate in
//     state.compensate (next one first) BEFORE the first compensation. Compensate every step in
//     state.done, plus the failed step when its outcome is unknown (all attempts timed out); never a
//     rejected step. Compensate in reverse order of the forward steps, save the state after each
//     compensation, then save status "aborted".
//   - Any other error (including the runner's crash) must propagate: do not catch it.

const STEPS: StepName[] = ["debitPoints", "createEnrollment", "grantAccess"];

function keyFor(sagaId: string, step: StepName): string {
    return `${sagaId}:${step}`;
}

function forward(ctx: SagaContext, step: StepName): void {
    const key = keyFor(ctx.sagaId, step);
    const { userId, courseId, price } = ctx.command;
    if (step === "debitPoints") ctx.points.debit(key, userId, price);
    else if (step === "createEnrollment") ctx.enrollments.create(key, userId, courseId);
    else ctx.access.grant(key, userId, courseId);
}

function compensate(ctx: SagaContext, step: StepName): void {
    const key = keyFor(ctx.sagaId, step);
    if (step === "debitPoints") ctx.points.refund(key);
    else if (step === "createEnrollment") ctx.enrollments.cancel(key);
    else ctx.access.revoke(key);
}

function tryForward(ctx: SagaContext, step: StepName): "ok" | "rejected" | "unknown" {
    for (let attempt = 1; attempt <= ctx.maxAttempts; attempt++) {
        try {
            forward(ctx, step);
            return "ok";
        } catch (error) {
            if (error instanceof RejectedError) return "rejected";
            if (!(error instanceof TransientError)) throw error;
        }
    }
    return "unknown";
}

function runPurchaseSaga(ctx: SagaContext): void {
    let state = ctx.store.load(ctx.sagaId);
    if (state === null) {
        state = { sagaId: ctx.sagaId, status: "running", done: [], compensate: [] };
        ctx.store.save(state);
    }
    if (state.status === "completed" || state.status === "aborted") return;

    if (state.status === "running") {
        for (const step of STEPS) {
            if (state.done.includes(step)) continue;
            const outcome = tryForward(ctx, step);
            if (outcome === "ok") {
                state.done.push(step);
                ctx.store.save(state);
                continue;
            }
            const toUndo = outcome === "unknown" ? [...state.done, step] : [...state.done];
            state.status = "compensating";
            state.compensate = toUndo.reverse();
            ctx.store.save(state);
            break;
        }
        if (state.status === "running") {
            state.status = "completed";
            ctx.store.save(state);
            return;
        }
    }

    while (state.compensate.length > 0) {
        const step = state.compensate[0];
        for (;;) {
            try {
                compensate(ctx, step);
                break;
            } catch (error) {
                if (!(error instanceof TransientError)) throw error;
            }
        }
        state.compensate.shift();
        ctx.store.save(state);
    }
    state.status = "aborted";
    ctx.store.save(state);
}

// ---------------------------------------------------------------- test runner (do not change)
type StepName = "debitPoints" | "createEnrollment" | "grantAccess";
type SagaStatus = "running" | "compensating" | "completed" | "aborted";
type SagaState = { sagaId: string; status: SagaStatus; done: StepName[]; compensate: StepName[] };
type Op = "debit" | "refund" | "createEnrollment" | "cancelEnrollment" | "grantAccess" | "revokeAccess";
type Outcome = "ok" | "timeout" | "timeout-applied" | "reject" | "crash-before" | "crash-after";
type SagaContext = {
    sagaId: string;
    command: { userId: string; courseId: string; price: number };
    maxAttempts: number;
    store: { load(sagaId: string): SagaState | null; save(state: SagaState): void };
    points: { debit(key: string, userId: string, amount: number): void; refund(debitKey: string): void };
    enrollments: { create(key: string, userId: string, courseId: string): void; cancel(createKey: string): void };
    access: { grant(key: string, userId: string, courseId: string): void; revoke(grantKey: string): void };
};
class TransientError extends Error {}
class RejectedError extends Error {}
class Crash extends Error {}

type Input = {
    sagaId: string; userId: string; courseId: string; price: number; balance: number;
    maxAttempts: number; runs?: number; script?: Partial<Record<Op, Outcome[]>>;
};
const input: Input = JSON.parse(readFileSync(0, "utf8"));
const script: Partial<Record<Op, Outcome[]>> = input.script ?? {};
let dead = false;
let calls = 0;
let balance = input.balance;
const ledger: number[] = [];
const debits = new Map<string, number>();
const refunded = new Set<string>();
const created = new Set<string>();
const cancelled = new Set<string>();
const granted = new Set<string>();
const revoked = new Set<string>();
let enrollment = "none";
let access = "none";
const compensations: string[] = [];
const durable = new Map<string, string>();

function call(op: Op, apply: () => void): void {
    if (dead) throw new Crash("process is down");
    if (++calls > 500) throw new Error("more than 500 service calls: is a retry loop endless?");
    const outcome: Outcome = script[op]?.shift() ?? "ok";
    if (outcome === "timeout") throw new TransientError(`${op}: timeout`);
    if (outcome === "reject") throw new RejectedError(`${op}: rejected`);
    if (outcome === "crash-before") { dead = true; throw new Crash("crash"); }
    if (outcome === "crash-after") {
        try { apply(); } catch { /* the orchestrator never sees the answer */ }
        dead = true;
        throw new Crash("crash");
    }
    apply();
    if (outcome === "timeout-applied") throw new TransientError(`${op}: timeout`);
}

function makeContext(): SagaContext {
    return {
        sagaId: input.sagaId,
        command: { userId: input.userId, courseId: input.courseId, price: input.price },
        maxAttempts: input.maxAttempts,
        store: {
            load(sagaId: string): SagaState | null {
                if (dead) throw new Crash("process is down");
                const row = durable.get(sagaId);
                return row === undefined ? null : (JSON.parse(row) as SagaState);
            },
            save(state: SagaState): void {
                if (dead) throw new Crash("process is down");
                durable.set(state.sagaId, JSON.stringify(state));
            },
        },
        points: {
            debit: (key, _userId, amount) => call("debit", () => {
                if (debits.has(key)) return;
                if (refunded.has(key)) throw new RejectedError("debit already refunded");
                if (balance < amount) throw new RejectedError("insufficient points");
                balance -= amount;
                debits.set(key, amount);
                ledger.push(-amount);
            }),
            refund: (debitKey) => call("refund", () => {
                if (refunded.has(debitKey)) return;
                refunded.add(debitKey);
                compensations.push("refundPoints");
                const amount = debits.get(debitKey);
                if (amount !== undefined) { balance += amount; ledger.push(amount); }
            }),
        },
        enrollments: {
            create: (key) => call("createEnrollment", () => {
                if (created.has(key)) return;
                if (cancelled.has(key)) throw new RejectedError("enrollment already cancelled");
                created.add(key);
                enrollment = "active";
            }),
            cancel: (createKey) => call("cancelEnrollment", () => {
                if (cancelled.has(createKey)) return;
                cancelled.add(createKey);
                compensations.push("cancelEnrollment");
                if (created.has(createKey)) enrollment = "cancelled";
            }),
        },
        access: {
            grant: (key) => call("grantAccess", () => {
                if (granted.has(key)) return;
                if (revoked.has(key)) throw new RejectedError("access already revoked");
                granted.add(key);
                access = "granted";
            }),
            revoke: (grantKey) => call("revokeAccess", () => {
                if (revoked.has(grantKey)) return;
                revoked.add(grantKey);
                compensations.push("revokeAccess");
                if (granted.has(grantKey)) access = "revoked";
            }),
        },
    };
}

let restarts = 0;
function deliver(): void {
    for (;;) {
        dead = false;
        try {
            runPurchaseSaga(makeContext());
        } catch (error) {
            if (!dead) throw error;
        }
        if (!dead) return;
        if (++restarts > 10) throw new Error("more than 10 restarts");
    }
}

try {
    for (let run = 0; run < (input.runs ?? 1); run++) deliver();
    dead = false;
    const saved = durable.get(input.sagaId);
    console.log(JSON.stringify({
        status: saved === undefined ? "none" : (JSON.parse(saved) as SagaState).status,
        balance, ledger, enrollment, access, compensations, restarts,
    }));
} catch (error) {
    console.log(JSON.stringify({ error: error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error) }));
}
