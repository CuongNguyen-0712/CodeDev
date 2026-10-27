import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Replay detection. CodeDev rotates the refresh token on every POST /auth/refresh: the presented
// row gets used_at, a successor row is inserted in the same family, and the client receives the
// successor. A token that comes back after it was used means two parties hold copies of it.
//
// Write refresh(store, req). Check in this order:
//   1. no row for sha256(req.token)                      -> { status: "invalid" }
//   2. the row is revoked (revokedAt set)                -> { status: "revoked" }
//   3. req.now >= row.expiresAt                          -> { status: "expired" }
//   4. the row is unused: claim it with store.markUsed (compare-and-swap), issue the successor in the
//      same family for the row's user and device, record it with store.recordSuccessor, and return
//      { status: "rotated", token: <successor> }. If issue returns null, return { status: "revoked" }.
//   5. the row was already used (a reuse):
//      - grace: the same device (req.deviceId === row.deviceId), less than GRACE_MS after row.usedAt,
//        and the successor (row.replacedBy) is neither used nor revoked: return
//        { status: "grace", token: store.getReply(row.id) } - the successor already issued, nothing new.
//      - anything else is a replay: revoke the whole family (store.revokeFamily), record one
//        "refresh_token_reuse" security event (tokenId = the presented row, deviceId = req.deviceId,
//        at = req.now) and return { status: "replay_detected" }.
// Do not change the types, the store or the test runner.

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
    | { status: "replay_detected" | "revoked" | "expired" | "invalid" };

function sha256(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

function refresh(store: TokenStore, req: RefreshRequest): RefreshResult {
    const row = store.findByHash(sha256(req.token));
    if (!row) return { status: "invalid" };
    if (row.revokedAt !== null) return { status: "revoked" };
    if (req.now >= row.expiresAt) return { status: "expired" };
    if (row.usedAt === null) {
        if (store.markUsed(row.id, req.now)) {
            const next = store.issue(row.familyId, row.userId, row.deviceId, req.now);
            if (!next) return { status: "revoked" };
            store.recordSuccessor(row.id, next.row.id, next.token);
            return { status: "rotated", token: next.token };
        }
        const fresh = store.findById(row.id);
        if (!fresh || fresh.revokedAt !== null) return { status: "revoked" };
        return handleReuse(store, fresh, req);
    }
    return handleReuse(store, row, req);
}

function handleReuse(store: TokenStore, row: Row, req: RefreshRequest): RefreshResult {
    const usedAt = row.usedAt ?? req.now;
    if (req.deviceId === row.deviceId && req.now - usedAt < GRACE_MS && row.replacedBy !== null) {
        const successor = store.findById(row.replacedBy);
        const reply = store.getReply(row.id);
        if (successor && successor.usedAt === null && successor.revokedAt === null && reply !== null) {
            return { status: "grace", token: reply };
        }
    }
    store.revokeFamily(row.familyId, req.now);
    store.recordEvent({ type: "refresh_token_reuse", userId: row.userId, familyId: row.familyId, tokenId: row.id, deviceId: req.deviceId, at: req.now });
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

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "steps": [...], "quiet"?: true }. A step is { "op": "login", "user", "device", "at" } (a new
// family with its first token) or { "op": "refresh", "token", "device", "at" }, where "token" is the
// label of an issued token ("t1" = the token of row r1) or a literal string. Prints one line per step,
// then the security events and every row; with "quiet" only a summary.
type Step = { op: "login"; user: string; device: string; at: number } | { op: "refresh"; token: string; device: string; at: number };

const input: { steps: Step[]; quiet?: boolean } = JSON.parse(readFileSync(0, "utf8"));
const store = new TokenStore();
const byLabel = new Map<string, string>();
const label = (token: string): string => store.labels.get(token) ?? "unknown-token";
const counts: Record<string, number> = {};
let lastLine = "";
for (const step of input.steps) {
    let line: string;
    if (step.op === "login") {
        const issued = store.issue(store.newFamilyId(), step.user, step.device, step.at);
        line = `login ${step.user} ${step.device}: ${issued ? label(issued.token) : "failed"}`;
    } else {
        for (const [token, name] of store.labels) byLabel.set(name, token);
        const result = refresh(store, { token: byLabel.get(step.token) ?? step.token, deviceId: step.device, now: step.at });
        counts[result.status] = (counts[result.status] ?? 0) + 1;
        const shown = "token" in result ? `${result.status} ${label(result.token)}` : result.status;
        line = `refresh ${step.token === "" ? '""' : step.token} ${step.device} @${step.at}: ${shown}`;
    }
    if (!input.quiet) console.log(line);
    lastLine = line;
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
