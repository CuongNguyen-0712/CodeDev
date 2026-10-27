import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// CodeDev payments API: POST /payments charges the learner for a course. The mobile app sends an
// Idempotency-Key header and reuses it for every retry of the same purchase. IdempotencyGuard sits
// in front of the handler, like a NestJS interceptor:
//
//   begin(userId, key, body)  is called when a request arrives. It returns
//     { kind: "run" }                              the handler runs (and charges the card)
//     { kind: "replay", status, body }             the stored response, the handler does NOT run
//     { kind: "reject", status, code }             an error response, the handler does NOT run
//   finish(userId, key, status, body)  is called when a handler that was told to "run" has finished.
//
// Rules, checked in this order:
//   1. key must be a string of 1 to 255 characters, else reject 400 "idempotency_key_missing".
//   2. Keys are scoped per user: the same key sent by two users is two unrelated records.
//   3. A record that was created ttlMs or more ago (clock.now() - createdAt >= ttlMs) and is completed
//      has expired: forget it and treat the request as new. A record still in progress never expires.
//   4. No record: create one (in progress, created now, with the body's fingerprint) and return "run".
//   5. Record exists and the body's fingerprint differs: reject 422 "idempotency_key_reused".
//      The fingerprint is a canonical form of the body: object keys sorted (at every depth), array
//      order kept, so { "a": 1, "b": 2 } and { "b": 2, "a": 1 } are the same payload. You may keep the
//      canonical string or a hash of it (node:crypto createHash("sha256")).
//   6. Same fingerprint, still in progress: reject 409 "idempotency_key_in_progress".
//   7. Same fingerprint, completed: replay the stored status and body.
// finish: a status of 500 or more is not stored - delete the record, so a retry runs the handler
// again. Any other status (2xx, 4xx such as 402 card_declined) completes the record with that
// status and body. createdAt stays the time of the first request.
//
// Use only the injected clock. Do not change the types or the test runner.

type Clock = { now(): number };

type Decision =
    | { kind: "run" }
    | { kind: "replay"; status: number; body: unknown }
    | { kind: "reject"; status: 400 | 409 | 422; code: string };

type IdempotencyRecord = {
    fingerprint: string;
    createdAt: number;
    state: "in_progress" | "completed";
    status?: number;
    body?: unknown;
};

// Canonical JSON: object keys sorted at every depth, array order kept.
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const entries = Object.keys(value as Record<string, unknown>)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

class IdempotencyGuard {
    private readonly records = new Map<string, IdempotencyRecord>();
    private readonly pending = new Map<string, IdempotencyRecord>();

    constructor(
        private readonly clock: Clock,
        private readonly ttlMs: number,
    ) {}

    private id(userId: string, key: string): string {
        return JSON.stringify([userId, key]);
    }

    begin(userId: string, key: string | undefined, body: unknown): Decision {
        if (typeof key !== "string" || key.length < 1 || key.length > 255) {
            return { kind: "reject", status: 400, code: "idempotency_key_missing" };
        }
        const id = this.id(userId, key);
        const now = this.clock.now();
        const fingerprint = createHash("sha256").update(canonical(body)).digest("hex");
        let record = this.records.get(id);
        if (record && record.state === "completed" && now - record.createdAt >= this.ttlMs) {
            this.records.delete(id);
            record = undefined;
        }
        if (!record) {
            this.pending.set(id, { fingerprint, createdAt: now, state: "in_progress" });
            return { kind: "run" }; // the record is written when the handler has finished
        }
        if (record.fingerprint !== fingerprint) return { kind: "reject", status: 422, code: "idempotency_key_reused" };
        if (record.state === "in_progress") return { kind: "reject", status: 409, code: "idempotency_key_in_progress" };
        return { kind: "replay", status: record.status as number, body: record.body };
    }

    finish(userId: string, key: string, status: number, body: unknown): void {
        const id = this.id(userId, key);
        const record = this.pending.get(id);
        if (!record) return;
        this.pending.delete(id);
        this.records.set(id, record);
        if (status >= 500) {
            this.records.delete(id); // a failed attempt must not block the retry
            return;
        }
        record.state = "completed";
        record.status = status;
        record.body = body;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "ttlMs": number, "events": [...], "summary"?: true }. Events, in time order:
//   { "at": ms, "req": "r1", "user": "u_17", "key"?: "k-1", "body": {...} }   a request arrives
//   { "at": ms, "done": "r1", "status": 201, "response": {...} }             r1's handler finishes
// One line per event, then the number of times the handler ran (= the number of charges).
// With "summary": true only the totals are printed.
type RequestEvent = { at: number; req: string; user: string; key?: string; body: unknown };
type DoneEvent = { at: number; done: string; status: number; response: unknown };
type Test = { ttlMs: number; events: (RequestEvent | DoneEvent)[]; summary?: boolean };

const test: Test = JSON.parse(readFileSync(0, "utf8"));
let now = 0;
const guard = new IdempotencyGuard({ now: () => now }, test.ttlMs);
const running = new Map<string, { user: string; key: string }>();
const totals = { requests: 0, runs: 0, replayed: 0, rejected: {} as Record<string, number> };
const log = (line: string) => { if (!test.summary) console.log(line); };

for (const event of test.events) {
    now = event.at;
    if ("done" in event) {
        const request = running.get(event.done);
        if (!request) continue;
        running.delete(event.done);
        guard.finish(request.user, request.key, event.status, event.response);
        log(`t=${now} ${event.done} handler finished ${event.status}`);
        continue;
    }
    totals.requests++;
    const decision = guard.begin(event.user, event.key, event.body);
    if (decision.kind === "run") {
        totals.runs++;
        running.set(event.req, { user: event.user, key: event.key as string });
        log(`t=${now} ${event.req} ${event.user} -> handler runs`);
    } else if (decision.kind === "replay") {
        totals.replayed++;
        log(`t=${now} ${event.req} ${event.user} -> ${decision.status} replayed ${JSON.stringify(decision.body)}`);
    } else if (decision.kind === "reject") {
        const label = `${decision.status} ${decision.code}`;
        totals.rejected[label] = (totals.rejected[label] ?? 0) + 1;
        log(`t=${now} ${event.req} ${event.user} -> ${label}`);
    } else {
        log(`t=${now} ${event.req} ${event.user} -> unexpected ${JSON.stringify(decision)}`);
    }
}
if (test.summary) {
    const rejected = Object.keys(totals.rejected).sort().map((label) => `${label} x${totals.rejected[label]}`);
    console.log(`requests ${totals.requests}; handler runs ${totals.runs}; replayed ${totals.replayed}; rejected ${rejected.join(", ") || "none"}`);
} else {
    console.log(`handler runs: ${totals.runs}`);
}
