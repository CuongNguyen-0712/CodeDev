import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// CodeDev POST /v1/auth/refresh with refresh token rotation by family (lessons 7 and 8).
//
// Symptom: a learner with two tabs open refreshes in both at the same moment. Both requests get 200,
// and the nightly check finds the family with TWO active refresh tokens. A forked family breaks
// replay detection: whoever holds the second branch can keep refreshing and is never caught.
//
// Fix refresh() so that, however the two requests interleave, exactly one of them rotates the
// token. The store is shared and every store call is a separate step: another request can run
// between any two of your awaits. Use store.compareAndSwap(id, expectedStatus, patch): it changes
// the record only if its status is still expectedStatus, in one step, and returns whether it did.
//
// Rules (keep them):
//   no record for sha256(token)                          -> 401 "unknown_token"
//   status "revoked"                                     -> 401 "token_revoked"
//   status "rotated":
//     its successor (replacedBy) is not stored yet, or is "active" and was created at most
//     GRACE_SECONDS before now (a second tab that lost the race)  -> 409 "refresh_in_progress"
//     otherwise it is a replay: revokeFamily, recordEvent once     -> 401 "refresh_reuse_detected"
//   now >= expiresAt                                     -> 401 "token_expired"
//   status "active": rotate it to req.successor (status "rotated", replacedBy = successor id), store
//     the successor (same family, user and device, createdAt = now, expiresAt = now + 30 days)
//                                                        -> 200 { tokenId, refreshToken }
// A request that loses the race must not store a successor, and answers from the record's state
// after the other request changed it (normally 409 "refresh_in_progress").
// Do not change the types, the store interface or the test runner.

type TokenStatus = "active" | "rotated" | "revoked";

interface RefreshRecord {
    id: string;
    familyId: string;
    userId: string;
    deviceId: string;
    tokenHash: string;
    status: TokenStatus;
    createdAt: number;
    expiresAt: number;
    replacedBy?: string;
}

interface SecurityEvent {
    type: "refresh_reuse_detected";
    familyId: string;
    tokenId: string;
    at: number;
}

interface TokenStore {
    findByHash(tokenHash: string): Promise<RefreshRecord | undefined>; // a copy, like a row from SELECT
    findById(id: string): Promise<RefreshRecord | undefined>;
    insert(record: RefreshRecord): Promise<void>;
    update(id: string, patch: Partial<RefreshRecord>): Promise<void>; // unconditional write
    compareAndSwap(id: string, expectedStatus: TokenStatus, patch: Partial<RefreshRecord>): Promise<boolean>;
    revokeFamily(familyId: string): Promise<number>;
    recordEvent(event: SecurityEvent): Promise<void>;
}

interface RefreshRequest {
    id: string;
    token: string;
    now: number; // fake clock, unix seconds
    successor: { id: string; token: string }; // what this request issues if it rotates
}

type RefreshResult =
    | { status: 200; tokenId: string; refreshToken: string }
    | { status: 401 | 409; error: string };

const REFRESH_TTL_SECONDS = 2_592_000;
const GRACE_SECONDS = 10;

function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

async function refresh(store: TokenStore, req: RefreshRequest): Promise<RefreshResult> {
    const record = await store.findByHash(sha256(req.token));
    if (!record) return { status: 401, error: "unknown_token" };
    if (record.status === "revoked") return { status: 401, error: "token_revoked" };

    if (record.status === "rotated") {
        const successor = record.replacedBy ? await store.findById(record.replacedBy) : undefined;
        if (!successor || (successor.status === "active" && req.now - successor.createdAt <= GRACE_SECONDS)) {
            return { status: 409, error: "refresh_in_progress" };
        }
        await store.revokeFamily(record.familyId);
        await store.recordEvent({ type: "refresh_reuse_detected", familyId: record.familyId, tokenId: record.id, at: req.now });
        return { status: 401, error: "refresh_reuse_detected" };
    }

    if (req.now >= record.expiresAt) return { status: 401, error: "token_expired" };

    const next: RefreshRecord = {
        id: req.successor.id,
        familyId: record.familyId,
        userId: record.userId,
        deviceId: record.deviceId,
        tokenHash: sha256(req.successor.token),
        status: "active",
        createdAt: req.now,
        expiresAt: req.now + REFRESH_TTL_SECONDS,
    };
    // One atomic step decides the winner: only a request that still sees "active" may rotate.
    const won = await store.compareAndSwap(record.id, "active", { status: "rotated", replacedBy: next.id });
    // Lost the race: the record changed under us, so answer from its new state (normally 409).
    if (!won) return refresh(store, req);
    await store.insert(next);
    return { status: 200, tokenId: next.id, refreshToken: req.successor.token };
}

// ---------------------------------------------------------------- test runner (do not change)
// Every store call waits for its turn. "schedule" lists which request may run its next store call;
// afterwards the first unfinished request (input order) runs, one call at a time, until all are done.
type SeedRecord = Omit<RefreshRecord, "tokenHash"> & { token: string };
const input: { tokens: SeedRecord[]; requests: RefreshRequest[]; schedule?: string[] } = JSON.parse(readFileSync(0, "utf8"));
const table = new Map<string, RefreshRecord>();
for (const { token, ...rest } of input.tokens) table.set(rest.id, { ...rest, tokenHash: sha256(token) });
const events: SecurityEvent[] = [];
const waiting = new Map<string, () => void>();
const copy = (r: RefreshRecord | undefined) => (r ? { ...r } : undefined);

function storeFor(reqId: string): TokenStore {
    const turn = () => new Promise<void>((resolve) => waiting.set(reqId, resolve));
    const write = (id: string, patch: Partial<RefreshRecord>) => {
        const r = table.get(id);
        if (r) table.set(id, { ...r, ...patch });
    };
    return {
        async findByHash(h) { await turn(); return copy([...table.values()].find((r) => r.tokenHash === h)); },
        async findById(id) { await turn(); return copy(table.get(id)); },
        async insert(r) { await turn(); table.set(r.id, { ...r }); },
        async update(id, patch) { await turn(); write(id, patch); },
        async compareAndSwap(id, expected, patch) {
            await turn();
            if (table.get(id)?.status !== expected) return false;
            write(id, patch);
            return true;
        },
        async revokeFamily(familyId) {
            await turn();
            let n = 0;
            for (const r of table.values()) if (r.familyId === familyId && r.status !== "revoked") { r.status = "revoked"; n++; }
            return n;
        },
        async recordEvent(e) { await turn(); events.push({ ...e }); },
    };
}

async function main() {
    const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
    const release = (id: string) => { const go = waiting.get(id); if (go) { waiting.delete(id); go(); } };
    const results = new Map<string, object>();
    const running = input.requests.map((r) => refresh(storeFor(r.id), r).then(
        (res) => { results.set(r.id, res.status === 200 ? { status: 200, tokenId: res.tokenId } : res); },
        (e: unknown) => { results.set(r.id, { status: 500, error: e instanceof Error ? e.message : String(e) }); },
    ));
    for (const id of input.schedule ?? []) { await settle(); release(id); }
    for (let step = 0; step < 10_000; step++) {
        await settle();
        const next = input.requests.find((r) => waiting.has(r.id));
        if (!next) break;
        release(next.id);
    }
    await Promise.all(running);
    const rows = [...table.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const activeByFamily: Record<string, number> = {};
    for (const r of rows) activeByFamily[r.familyId] = (activeByFamily[r.familyId] ?? 0) + (r.status === "active" ? 1 : 0);
    console.log(JSON.stringify({
        responses: input.requests.map((r) => ({ req: r.id, ...results.get(r.id) })),
        tokens: rows.map((r) => ({ id: r.id, status: r.status, replacedBy: r.replacedBy ?? null })),
        activeByFamily,
        events,
    }));
}

main();
