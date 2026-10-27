import { readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";

// CodeDev auth service (https://api.codedev.test): refresh tokens are stored as SHA-256 hashes.
// A leaked database backup must not contain a single token that works.
//
// issueRefreshToken(deps, userId, deviceId)
//   - token: 32 bytes from deps.randomBytes(32), encoded with .toString("base64url") (43 characters)
//   - a new family: id = deps.newId("rt"), familyId = deps.newId("fam") (in that order)
//   - insert ONE row: tokenHash = SHA-256 of the token as lowercase hex, createdAt = deps.now(),
//     expiresAt = createdAt + deps.ttlMs, usedAt / revokedAt / replacedBy = null
//   - log { event: "refresh_token.issued", id, userId, deviceId }
//   - return { token, id, familyId, expiresAt } - the only place the plain token ever appears
//
// validateRefreshToken(deps, presented) - presented comes straight from the request body
//   1. not a string of exactly 43 characters from A-Z a-z 0-9 - _      -> "malformed" (no store access)
//   2. hash it, deps.store.findByHash(hash); no row, or the row's tokenHash
//      is not equal to the hash (compare with timingSafeEqual)          -> "unknown"
//   3. row.revokedAt is not null                                         -> "revoked"
//   4. deps.now() >= row.expiresAt                                       -> "expired"
//   5. otherwise { ok: true, id, familyId, userId, deviceId, expiresAt }
//   Failures return { ok: false, reason } and log { event: "refresh_token.rejected", reason } -
//   plus id when a row was found (revoked, expired). Success logs { event: "refresh_token.accepted", id }.
//
// Never put a token or a stored hash in a log event or in a validate result.
// Do not change the types, the store or the test runner.

type RefreshTokenRow = {
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

interface TokenStore {
    insert(row: RefreshTokenRow): void;
    findByHash(tokenHash: string): RefreshTokenRow | null;
}

type LogEvent = Record<string, string | number>;

type Deps = {
    store: TokenStore;
    now: () => number;
    randomBytes: (size: number) => Buffer;
    newId: (prefix: "rt" | "fam") => string;
    log: (event: LogEvent) => void;
    ttlMs: number;
};

type Issued = { token: string; id: string; familyId: string; expiresAt: number };

type Validation =
    | { ok: true; id: string; familyId: string; userId: string; deviceId: string; expiresAt: number }
    | { ok: false; reason: "malformed" | "unknown" | "revoked" | "expired" };

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

function issueRefreshToken(deps: Deps, userId: string, deviceId: string): Issued {
    const token = deps.randomBytes(32).toString("base64url");
    const id = deps.newId("rt");
    const familyId = deps.newId("fam");
    const createdAt = deps.now();
    const expiresAt = createdAt + deps.ttlMs;
    deps.store.insert({
        id, familyId, userId, deviceId,
        tokenHash: sha256Hex(token),
        createdAt, expiresAt,
        usedAt: null, revokedAt: null, replacedBy: null,
    });
    deps.log({ event: "refresh_token.issued", id, userId, deviceId });
    return { token, id, familyId, expiresAt };
}

function validateRefreshToken(deps: Deps, presented: unknown): Validation {
    const reject = (reason: "malformed" | "unknown" | "revoked" | "expired", id?: string): Validation => {
        deps.log(id ? { event: "refresh_token.rejected", reason, id } : { event: "refresh_token.rejected", reason });
        return { ok: false, reason };
    };
    if (typeof presented !== "string" || !TOKEN_FORMAT.test(presented)) return reject("malformed");
    const hash = sha256Hex(presented);
    const row = deps.store.findByHash(hash);
    if (!row || !timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hash, "hex"))) return reject("unknown");
    if (row.revokedAt !== null) return reject("revoked", row.id);
    if (deps.now() >= row.expiresAt) return reject("expired", row.id);
    deps.log({ event: "refresh_token.accepted", id: row.id });
    return { ok: true, id: row.id, familyId: row.familyId, userId: row.userId, deviceId: row.deviceId, expiresAt: row.expiresAt };
}

// ---------------------------------------------------------------- test runner (do not change)
type Op =
    | { op: "issue"; userId: string; deviceId: string }
    | { op: "validate"; token: string }
    | { op: "advance"; ms: number }
    | { op: "revoke"; id: string };
type Input = { ttlMs: number; start?: number; seed?: string; quiet?: boolean; ops: Op[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const rows = new Map<string, RefreshTokenRow>();
const store = {
    insert(row: RefreshTokenRow): void {
        const copy = { ...row };
        if (rows.has(copy.id)) throw new Error(`duplicate key: id ${copy.id}`);
        for (const r of rows.values()) if (r.tokenHash === copy.tokenHash) throw new Error("duplicate key: token_hash");
        rows.set(copy.id, copy);
    },
    findByHash(tokenHash: string): RefreshTokenRow | null {
        for (const r of rows.values()) if (r.tokenHash === tokenHash) return { ...r };
        return null;
    },
};
let clock = input.start ?? Date.UTC(2026, 9, 26, 8, 0, 0);
let counter = 0;
const counters: Record<string, number> = {};
const logs: LogEvent[] = [];
const deps: Deps = {
    store,
    now: () => clock,
    randomBytes: (size: number) => {
        const out = Buffer.alloc(size);
        for (let off = 0; off < size; off += 32) createHash("sha256").update(`${input.seed ?? "codedev"}:${counter++}`).digest().copy(out, off);
        return out;
    },
    newId: (prefix) => `${prefix}_${(counters[prefix] = (counters[prefix] ?? 0) + 1)}`,
    log: (event) => { logs.push(JSON.parse(JSON.stringify(event))); },
    ttlMs: input.ttlMs,
};
const tokens: string[] = [];
const label = (value: unknown): string => {
    const i = tokens.indexOf(String(value));
    return i >= 0 ? `#${i + 1}` : JSON.stringify(value);
};
const iso = (ms: number) => new Date(ms).toISOString();
const lines: string[] = [];
const tally: Record<string, number> = {};
const scanned: string[] = [];
for (const op of input.ops) {
    let line = "";
    const logStart = logs.length;
    if (op.op === "issue") {
        const r = issueRefreshToken(deps, op.userId, op.deviceId);
        tokens.push(r.token);
        const { token, ...rest } = r;
        scanned.push(JSON.stringify(rest));
        line = `issue ${op.userId}/${op.deviceId} -> ${r.id} ${r.familyId} token ${label(token)} expires ${iso(r.expiresAt)}`;
        tally["issued"] = (tally["issued"] ?? 0) + 1;
    } else if (op.op === "validate") {
        // "hash:rt_1" presents the tokenHash column of rt_1, as an attacker with the backup would
        const fromBackup = typeof op.token === "string" && op.token.startsWith("hash:") ? rows.get(op.token.slice(5)) : undefined;
        const presented = fromBackup ? fromBackup.tokenHash : /^#\d+$/.test(String(op.token)) ? tokens[Number(String(op.token).slice(1)) - 1] : op.token;
        const v = validateRefreshToken(deps, presented);
        scanned.push(JSON.stringify(v));
        line = `validate ${fromBackup ? `tokenHash of ${fromBackup.id} (backup)` : label(presented)} -> ` + (v.ok ? `ok ${v.id} ${v.familyId} ${v.userId}/${v.deviceId} until ${iso(v.expiresAt)}` : v.reason);
        const key = v.ok ? "validate ok" : `validate ${v.reason}`;
        tally[key] = (tally[key] ?? 0) + 1;
    } else if (op.op === "advance") {
        clock += op.ms;
        line = `advance to ${iso(clock)}`;
    } else if (op.op === "revoke") {
        const row = rows.get(op.id);
        if (row) row.revokedAt = clock;
        line = `revoke ${op.id}`;
    }
    const newLogs = logs.slice(logStart);
    scanned.push(JSON.stringify(newLogs));
    if (!input.quiet) lines.push(line + (newLogs.length ? `  log ${newLogs.map((e) => JSON.stringify(e)).join(" ")}` : ""));
}
if (input.quiet) for (const key of Object.keys(tally).sort()) lines.push(`${key}: ${tally[key]}`);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const describeHash = (h: string) => {
    const i = tokens.findIndex((t) => sha(t) === h);
    if (i >= 0) return `sha256(#${i + 1})`;
    const j = tokens.indexOf(h);
    return j >= 0 ? `PLAIN(#${j + 1})` : `?${String(h).slice(0, 8)}`;
};
lines.push("store:");
const all = [...rows.values()];
if (input.quiet) {
    const hashed = all.filter((r) => describeHash(r.tokenHash).startsWith("sha256(")).length;
    lines.push(`${all.length} rows, ${hashed} with tokenHash = sha256(token), ${all.filter((r) => r.revokedAt !== null).length} revoked`);
} else {
    for (const r of all) {
        lines.push(`${r.id} ${r.familyId} ${r.userId}/${r.deviceId} hash=${describeHash(r.tokenHash)} created ${iso(r.createdAt)} expires ${iso(r.expiresAt)} revoked ${r.revokedAt === null ? "-" : iso(r.revokedAt)}`);
    }
}
const leaks: string[] = [];
const dumpText = JSON.stringify(all);
tokens.forEach((t, i) => { if (t && dumpText.includes(t)) leaks.push(`token #${i + 1} stored in plain text`); });
const outText = scanned.join("\n");
tokens.forEach((t, i) => { if (t && outText.includes(t)) leaks.push(`token #${i + 1} in a log or validate result`); });
all.forEach((r) => { if (r.tokenHash && outText.includes(r.tokenHash)) leaks.push(`stored hash of ${r.id} in a log or result`); });
lines.push(`leaks: ${leaks.length ? leaks.join("; ") : "none"}`);
console.log(lines.join("\n"));
