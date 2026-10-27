import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Concurrent Refresh. When the CodeDev phone app resumes, two requests can call POST /auth/refresh
// with the same refresh token 40 ms apart. In production both got 200 with two different tokens, and
// the next refresh of the phone was flagged as a replay: the learner was signed out everywhere.
//
// Fix refresh() so that, however the database statements of concurrent requests interleave:
//   - exactly one request rotates the token: { status: "rotated", token: <successor> };
//   - a request that lost the race, comes from the same device and is less than GRACE_MS after the
//     winner's used_at gets the winner's successor: { status: "grace", token } - nothing new is issued;
//     if the winner has not recorded its successor yet (replacedBy still null) it gets { status: "retry" }
//     (HTTP 409: the client tries again in 100 ms) - no revocation, no event;
//   - a reuse from another device, after the window, or when the successor was already used is still a
//     replay: revoke the family, record one "refresh_token_reuse" event, { status: "replay_detected" };
//   - invalid, revoked and expired tokens keep their answers; if issue returns null, answer "revoked".
// Each Db method is one SQL statement (shown in the store below); statements of different requests can
// run between any two of yours. Do not change the types, the store, the Db class or the test runner.

const GRACE_MS = 10_000;
const REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type Row = {
    id: string;
    familyId: string;
    userId: string;
    deviceId: string;
    tokenHash: string;
    createdAt: number;
    expiresAt: number;
    usedAt: number | null;
    revokedAt: number | null;
    replacedBy: string | null;
};
type SecurityEvent = { type: "refresh_token_reuse"; userId: string; familyId: string; tokenId: string; deviceId: string; at: number };
type RefreshRequest = { token: string; deviceId: string; now: number };
type RefreshResult =
    | { status: "rotated" | "grace"; token: string }
    | { status: "retry" | "replay_detected" | "revoked" | "expired" | "invalid" };

function sha256(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

async function refresh(db: Db, req: RefreshRequest): Promise<RefreshResult> {
    const row = await db.findByHash(sha256(req.token));
    if (!row) return { status: "invalid" };
    if (row.revokedAt !== null) return { status: "revoked" };
    if (req.now >= row.expiresAt) return { status: "expired" };
    if (row.usedAt !== null) return handleReuse(db, row, req);

    // Compare-and-swap: only one request can move used_at from NULL to a time.
    if (!(await db.markUsed(row.id, req.now))) {
        const fresh = await db.findById(row.id);
        if (!fresh || fresh.revokedAt !== null) return { status: "revoked" };
        await db.revokeFamily(row.familyId, req.now);
        await db.recordEvent({ type: "refresh_token_reuse", userId: row.userId, familyId: row.familyId, tokenId: row.id, deviceId: req.deviceId, at: req.now });
        return { status: "replay_detected" };
    }
    const next = await db.issue(row.familyId, row.userId, row.deviceId, req.now);
    if (!next) return { status: "revoked" };
    await db.recordSuccessor(row.id, next.row.id, next.token);
    return { status: "rotated", token: next.token };
}

async function handleReuse(db: Db, row: Row, req: RefreshRequest): Promise<RefreshResult> {
    const usedAt = row.usedAt ?? req.now;
    if (req.deviceId === row.deviceId && req.now - usedAt < GRACE_MS) {
        if (row.replacedBy === null) return { status: "retry" }; // the winner has not recorded its successor yet
        const successor = await db.findById(row.replacedBy);
        const reply = await db.getReply(row.id);
        if (successor && successor.usedAt === null && successor.revokedAt === null && reply !== null) {
            return { status: "grace", token: reply };
        }
    }
    await db.revokeFamily(row.familyId, req.now);
    await db.recordEvent({ type: "refresh_token_reuse", userId: row.userId, familyId: row.familyId, tokenId: row.id, deviceId: req.deviceId, at: req.now });
    return { status: "replay_detected" };
}

// ------------------------------------------------------------------ token store (do not change)
// An in-memory refresh_tokens table. Each method is one SQL statement (shown above it) and runs
// atomically. Rows are returned as copies: changing a returned row does not change the table.
class TokenStore {
    private rows = new Map<string, Row>();
    private idByHash = new Map<string, string>();
    private replies = new Map<string, string>();
    private revokedFamilies = new Set<string>();
    private nextRow = 1;
    private nextFamily = 1;
    readonly events: SecurityEvent[] = [];
    readonly labels = new Map<string, string>(); // test bookkeeping only: token -> "t<n>"

    newFamilyId(): string {
        return `f${this.nextFamily++}`;
    }

    /** SELECT * FROM refresh_tokens WHERE token_hash = $1 */
    findByHash(tokenHash: string): Row | null {
        const id = this.idByHash.get(tokenHash);
        return id ? this.findById(id) : null;
    }

    /** SELECT * FROM refresh_tokens WHERE id = $1 */
    findById(id: string): Row | null {
        const row = this.rows.get(id);
        return row ? { ...row } : null;
    }

    /** UPDATE refresh_tokens SET used_at = $2 WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL RETURNING *
     *  Compare-and-swap: the updated row, or null when the row was already used or revoked. */
    markUsed(id: string, now: number): Row | null {
        const row = this.rows.get(id);
        if (!row || row.usedAt !== null || row.revokedAt !== null) return null;
        row.usedAt = now;
        return { ...row };
    }

    /** UPDATE refresh_tokens SET used_at = $2 WHERE family_id = $1 AND used_at IS NULL AND revoked_at IS NULL
     *  "Retire the family's live token" - returns the row count. */
    retireLiveTokens(familyId: string, now: number): number {
        let count = 0;
        for (const row of this.rows.values()) {
            if (row.familyId === familyId && row.usedAt === null && row.revokedAt === null) {
                row.usedAt = now;
                count++;
            }
        }
        return count;
    }

    /** INSERT INTO refresh_tokens (...) VALUES (...) RETURNING * - a new random token in the family.
     *  Returns null when the family was revoked: no token is ever issued into a revoked family. */
    issue(familyId: string, userId: string, deviceId: string, now: number): { token: string; row: Row } | null {
        if (this.revokedFamilies.has(familyId)) return null;
        const n = this.nextRow++;
        const token = createHash("sha256").update(`codedev-test-token-${n}`).digest("base64url");
        const row: Row = {
            id: `r${n}`, familyId, userId, deviceId, tokenHash: sha256(token),
            createdAt: now, expiresAt: now + REFRESH_TTL_MS, usedAt: null, revokedAt: null, replacedBy: null,
        };
        this.rows.set(row.id, row);
        this.idByHash.set(row.tokenHash, row.id);
        this.labels.set(token, `t${n}`);
        return { token, row: { ...row } };
    }

    /** UPDATE refresh_tokens SET replaced_by = $2 WHERE id = $1, plus the reply kept for the grace window
     *  (in production a short-lived encrypted entry, for example a Redis key with a 10 s TTL). */
    recordSuccessor(id: string, successorId: string, successorToken: string): void {
        const row = this.rows.get(id);
        if (!row) return;
        row.replacedBy = successorId;
        this.replies.set(id, successorToken);
    }

    /** The successor token issued when row `id` was rotated, or null. */
    getReply(id: string): string | null {
        return this.replies.get(id) ?? null;
    }

    /** UPDATE refresh_tokens SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL - returns the row count */
    revokeFamily(familyId: string, now: number): number {
        this.revokedFamilies.add(familyId);
        let count = 0;
        for (const row of this.rows.values()) {
            if (row.familyId === familyId && row.revokedAt === null) {
                row.revokedAt = now;
                count++;
            }
        }
        return count;
    }

    /** INSERT INTO security_events (type, user_id, family_id, token_id, device_id, at) VALUES (...) */
    recordEvent(event: SecurityEvent): void {
        this.events.push({ ...event });
    }

    allRows(): Row[] {
        return [...this.rows.values()].map((row) => ({ ...row }));
    }
}

// ------------------------------------------------------------------ Db (do not change)
// What one request sees: every statement is asynchronous, like a query over the network. The test
// scheduler can pause a request right after one of its statements and let other requests run.
type Control = { stopAt: string | null; resume: (() => void) | null };

class Db {
    private store: TokenStore;
    private control: Control;
    constructor(store: TokenStore, control: Control) {
        this.store = store;
        this.control = control;
    }
    private async run<T>(op: string, statement: () => T): Promise<T> {
        await Promise.resolve();
        const result = statement();
        if (this.control.stopAt === op) {
            this.control.stopAt = null;
            await new Promise<void>((resolve) => {
                this.control.resume = resolve;
            });
        }
        return result;
    }
    findByHash(tokenHash: string): Promise<Row | null> {
        return this.run("findByHash", () => this.store.findByHash(tokenHash));
    }
    findById(id: string): Promise<Row | null> {
        return this.run("findById", () => this.store.findById(id));
    }
    markUsed(id: string, now: number): Promise<Row | null> {
        return this.run("markUsed", () => this.store.markUsed(id, now));
    }
    retireLiveTokens(familyId: string, now: number): Promise<number> {
        return this.run("retireLiveTokens", () => this.store.retireLiveTokens(familyId, now));
    }
    issue(familyId: string, userId: string, deviceId: string, now: number): Promise<{ token: string; row: Row } | null> {
        return this.run("issue", () => this.store.issue(familyId, userId, deviceId, now));
    }
    recordSuccessor(id: string, successorId: string, successorToken: string): Promise<void> {
        return this.run("recordSuccessor", () => this.store.recordSuccessor(id, successorId, successorToken));
    }
    getReply(id: string): Promise<string | null> {
        return this.run("getReply", () => this.store.getReply(id));
    }
    revokeFamily(familyId: string, now: number): Promise<number> {
        return this.run("revokeFamily", () => this.store.revokeFamily(familyId, now));
    }
    recordEvent(event: SecurityEvent): Promise<void> {
        return this.run("recordEvent", () => this.store.recordEvent(event));
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "steps": [...], "quiet"?: true }. Steps:
//   { "op": "login", "user", "device", "at" }          a new family and its first token
//   { "op": "refresh", "token", "device", "at" }       one request on its own
//   { "op": "concurrent", "requests": [{ "id", "token", "device", "at" }, ...], "schedule": [[id, op], ...] }
// "token" is a label ("t3" = the token of row r3), "@A" (the token last returned to request A) or a literal.
// A schedule entry [id, op] runs request id until it completes its next `op` statement (or finishes);
// [id, "end"] runs it to the end. Requests still unfinished after the schedule run to the end in order.
type ReqSpec = { id: string; token: string; device: string; at: number };
type Step =
    | { op: "login"; user: string; device: string; at: number }
    | { op: "refresh"; token: string; device: string; at: number }
    | { op: "concurrent"; requests: ReqSpec[]; schedule?: [string, string][] };

const input: { steps: Step[]; quiet?: boolean } = JSON.parse(readFileSync(0, "utf8"));
const store = new TokenStore();
const received = new Map<string, string>();
const label = (token: string): string => store.labels.get(token) ?? "unknown-token";
const settle = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));
const counts: Record<string, number> = {};
let lastLine = "";

function resolveToken(ref: string): string {
    if (ref.startsWith("@")) return received.get(ref.slice(1)) ?? "";
    for (const [token, name] of store.labels) if (name === ref) return token;
    return ref;
}

async function runConcurrent(requests: ReqSpec[], schedule: [string, string][], prefix: boolean): Promise<string[]> {
    const controls = new Map<string, Control>();
    const results = new Map<string, RefreshResult | string>();
    const tokens = new Map(requests.map((r) => [r.id, resolveToken(r.token)]));
    for (const r of requests) controls.set(r.id, { stopAt: null, resume: null });
    const started = new Set<string>();
    const go = async (id: string, stopAt: string | null): Promise<void> => {
        const control = controls.get(id)!;
        const spec = requests.find((r) => r.id === id)!;
        control.stopAt = stopAt;
        if (!started.has(id)) {
            started.add(id);
            refresh(new Db(store, control), { token: tokens.get(id)!, deviceId: spec.device, now: spec.at }).then(
                (result) => results.set(id, result),
                (error: unknown) => results.set(id, `error ${error instanceof Error ? error.message : String(error)}`),
            );
        } else if (control.resume) {
            const resume = control.resume;
            control.resume = null;
            resume();
        }
        await settle();
    };
    for (const [id, op] of schedule) {
        if (controls.has(id) && !results.has(id)) await go(id, op === "end" ? null : op);
    }
    for (const r of requests) {
        for (let guard = 0; !results.has(r.id) && guard < 100; guard++) await go(r.id, null);
    }
    return requests.map((r) => {
        const result = results.get(r.id) ?? "did not finish";
        let shown: string;
        if (typeof result === "string") shown = result;
        else {
            counts[result.status] = (counts[result.status] ?? 0) + 1;
            if ("token" in result) received.set(r.id, result.token);
            else received.delete(r.id);
            shown = "token" in result ? `${result.status} ${label(result.token)}` : result.status;
        }
        const token = r.token === "" ? '""' : r.token.startsWith("@") ? label(tokens.get(r.id)!) : r.token;
        return `${prefix ? `${r.id} ` : ""}refresh ${token} ${r.device} @${r.at}: ${shown}`;
    });
}

async function main(): Promise<void> {
    for (const step of input.steps) {
        let lines: string[];
        if (step.op === "login") {
            const issued = store.issue(store.newFamilyId(), step.user, step.device, step.at);
            lines = [`login ${step.user} ${step.device}: ${issued ? label(issued.token) : "failed"}`];
        } else if (step.op === "refresh") {
            lines = await runConcurrent([{ id: "-", token: step.token, device: step.device, at: step.at }], [], false);
        } else {
            lines = await runConcurrent(step.requests, step.schedule ?? [], true);
        }
        for (const line of lines) {
            if (!input.quiet) console.log(line);
            lastLine = line;
        }
    }
    const rows = store.allRows();
    if (input.quiet) {
        const live = rows.filter((r) => r.usedAt === null && r.revokedAt === null).length;
        const revoked = rows.filter((r) => r.revokedAt !== null).length;
        console.log(`statuses ${Object.keys(counts).sort().map((k) => `${k}=${counts[k]}`).join(" ")}`);
        console.log(`last ${lastLine}`);
        console.log(`rows ${rows.length}, live ${live}, revoked ${revoked}, events ${store.events.length}`);
    }
    for (const e of store.events) console.log(`event ${e.type} user=${e.userId} family=${e.familyId} token=${e.tokenId} device=${e.deviceId} at=${e.at}`);
    if (!input.quiet) {
        for (const r of rows) {
            console.log(`${r.id} ${r.familyId} ${r.deviceId} used=${r.usedAt ?? "-"} revoked=${r.revokedAt ?? "-"} next=${r.replacedBy ?? "-"}`);
        }
    }
}
main();
