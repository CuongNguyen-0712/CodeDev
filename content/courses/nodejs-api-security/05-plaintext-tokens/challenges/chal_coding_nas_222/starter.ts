import { readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";

// CodeDev auth service (https://api.codedev.test), release 42: refresh tokens.
//
// login(deps, userId, deviceId) signs a device in: a new family with one refresh token.
// refresh(deps, presented) exchanges a refresh token for a new one (the API then also
// issues a new access token, which is not part of this file).
//
// The table auth.refresh_tokens has two token columns while the migration runs:
//   token       text NULL  - legacy, plain text: rows written by release 41 and older
//   token_hash  text NULL  - SHA-256 of the token, lowercase hex
// Release 41 instances keep writing plain-text rows until the rolling deploy is finished.

type RefreshTokenRow = {
    id: string;
    familyId: string;
    userId: string;
    deviceId: string;
    token: string | null;
    tokenHash: string | null;
    createdAt: number;
    expiresAt: number;
    usedAt: number | null;
    revokedAt: number | null;
    replacedBy: string | null;
};

interface TokenStore {
    insert(row: RefreshTokenRow): void;
    findByHash(tokenHash: string): RefreshTokenRow | null;     // WHERE token_hash = $1
    findByPlainToken(token: string): RefreshTokenRow | null;   // WHERE token = $1 (legacy rows)
    update(id: string, patch: Partial<RefreshTokenRow>): void;
}

type Deps = {
    store: TokenStore;
    now: () => number;
    randomBytes: (size: number) => Buffer;
    newId: (prefix: "rt" | "fam") => string;
    ttlMs: number;
};

type Issued = { token: string; id: string; familyId: string; expiresAt: number };
type RefreshResult =
    | { ok: true; token: string; id: string; familyId: string; expiresAt: number }
    | { ok: false; reason: "malformed" | "unknown" | "revoked" | "used" | "expired" };

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

function login(deps: Deps, userId: string, deviceId: string): Issued {
    const token = deps.randomBytes(32).toString("base64url");
    const id = deps.newId("rt");
    const familyId = deps.newId("fam");
    const createdAt = deps.now();
    const expiresAt = createdAt + deps.ttlMs;
    deps.store.insert({
        id, familyId, userId, deviceId,
        token, tokenHash: null,
        createdAt, expiresAt, usedAt: null, revokedAt: null, replacedBy: null,
    });
    return { token, id, familyId, expiresAt };
}

function refresh(deps: Deps, presented: unknown): RefreshResult {
    if (typeof presented !== "string" || !TOKEN_FORMAT.test(presented)) return { ok: false, reason: "malformed" };
    const row = deps.store.findByPlainToken(presented);
    if (!row || row.token !== presented) return { ok: false, reason: "unknown" };
    if (row.revokedAt !== null) return { ok: false, reason: "revoked" };
    if (row.usedAt !== null) return { ok: false, reason: "used" };
    if (deps.now() >= row.expiresAt) return { ok: false, reason: "expired" };
    // keep the session alive: the same refresh token, valid for another ttlMs
    const expiresAt = deps.now() + deps.ttlMs;
    deps.store.update(row.id, { expiresAt });
    return { ok: true, token: presented, id: row.id, familyId: row.familyId, expiresAt };
}

// ---------------------------------------------------------------- test runner (do not change)
type LegacyRow = { id: string; familyId: string; userId: string; deviceId: string; token: string; createdAt: number; expiresAt: number; usedAt?: number; revokedAt?: number };
type Op =
    | { op: "login"; userId: string; deviceId: string }
    | { op: "refresh"; token: unknown }
    | { op: "advance"; ms: number }
    | { op: "revoke"; id: string };
type Input = { ttlMs: number; start?: number; seed?: string; quiet?: boolean; legacy?: LegacyRow[]; ops: Op[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const rows = new Map<string, RefreshTokenRow>();
const store: TokenStore = {
    insert(row) {
        const copy = { ...row };
        if (rows.has(copy.id)) throw new Error(`duplicate key: id ${copy.id}`);
        for (const r of rows.values()) {
            if (copy.tokenHash !== null && r.tokenHash === copy.tokenHash) throw new Error("duplicate key: token_hash");
            if (copy.token !== null && r.token === copy.token) throw new Error("duplicate key: token");
        }
        rows.set(copy.id, copy);
    },
    findByHash(tokenHash) {
        for (const r of rows.values()) if (r.tokenHash !== null && r.tokenHash === tokenHash) return { ...r };
        return null;
    },
    findByPlainToken(token) {
        for (const r of rows.values()) if (r.token !== null && r.token === token) return { ...r };
        return null;
    },
    update(id, patch) {
        const r = rows.get(id);
        if (!r) throw new Error(`update: no row ${id}`);
        rows.set(id, { ...r, ...patch, id });
    },
};
let clock = input.start ?? Date.UTC(2026, 9, 26, 8, 0, 0);
let counter = 0;
const counters: Record<string, number> = {};
const deps: Deps = {
    store,
    now: () => clock,
    randomBytes: (size: number) => {
        const out = Buffer.alloc(size);
        for (let off = 0; off < size; off += 32) createHash("sha256").update(`${input.seed ?? "codedev"}:${counter++}`).digest().copy(out, off);
        return out;
    },
    newId: (prefix) => `${prefix}_${(counters[prefix] = (counters[prefix] ?? 0) + 1)}`,
    ttlMs: input.ttlMs,
};
const labels = new Map<string, string>();
let issuedCount = 0;
for (const [i, l] of (input.legacy ?? []).entries()) {
    labels.set(l.token, `L${i + 1}`);
    rows.set(l.id, { id: l.id, familyId: l.familyId, userId: l.userId, deviceId: l.deviceId, token: l.token, tokenHash: null,
        createdAt: l.createdAt, expiresAt: l.expiresAt, usedAt: l.usedAt ?? null, revokedAt: l.revokedAt ?? null, replacedBy: null });
}
const remember = (token: string) => {
    if (!labels.has(token)) labels.set(token, `#${++issuedCount}`);
    return labels.get(token)!;
};
const resolve = (ref: unknown): unknown => {
    if (typeof ref !== "string") return ref;
    if (ref.startsWith("hash:")) return rows.get(ref.slice(5))?.tokenHash ?? ref;
    for (const [token, l] of labels) if (l === ref) return token;
    return ref;
};
const show = (value: unknown): string => (typeof value === "string" && labels.has(value) ? labels.get(value)! : JSON.stringify(value));
const iso = (ms: number) => new Date(ms).toISOString();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const describeHash = (h: string | null) => {
    if (h === null) return "-";
    for (const [token, l] of labels) if (sha(token) === h) return `sha256(${l})`;
    return labels.has(h) ? `PLAIN(${labels.get(h)})` : `?${h.slice(0, 8)}`;
};
const describeToken = (t: string | null) => (t === null ? "-" : labels.has(t) ? `PLAIN(${labels.get(t)})` : `?${t.slice(0, 8)}`);
const t = (ms: number | null) => (ms === null ? "-" : iso(ms));
const dump = (): string[] => [...rows.values()].map((r) =>
    `  ${r.id} ${r.familyId} ${r.userId}/${r.deviceId} hash=${describeHash(r.tokenHash)} token=${describeToken(r.token)} expires ${t(r.expiresAt)} used ${t(r.usedAt)} revoked ${t(r.revokedAt)} replacedBy ${r.replacedBy ?? "-"}`);
const lines: string[] = [];
const tally: Record<string, number> = {};
const results: string[] = [];
for (const op of input.ops) {
    let line = "";
    if (op.op === "login") {
        const r = login(deps, op.userId, op.deviceId);
        const { token, ...rest } = r;
        results.push(JSON.stringify(rest));
        line = `login ${op.userId}/${op.deviceId} -> ${r.id} ${r.familyId} token ${remember(token)} expires ${iso(r.expiresAt)}`;
        tally["login"] = (tally["login"] ?? 0) + 1;
    } else if (op.op === "refresh") {
        const presented = resolve(op.token);
        const shown = typeof op.token === "string" && op.token.startsWith("hash:") ? `tokenHash of ${op.token.slice(5)}` : show(presented);
        const r = refresh(deps, presented);
        if (r.ok) {
            const { token, ...rest } = r;
            results.push(JSON.stringify(rest));
            line = `refresh ${shown} -> ok ${r.id} ${r.familyId} token ${remember(token)} expires ${iso(r.expiresAt)}`;
        } else {
            results.push(JSON.stringify(r));
            line = `refresh ${shown} -> ${r.reason}`;
        }
        const key = r.ok ? "refresh ok" : `refresh ${r.reason}`;
        tally[key] = (tally[key] ?? 0) + 1;
    } else if (op.op === "advance") {
        clock += op.ms;
        line = `advance to ${iso(clock)}`;
    } else if (op.op === "revoke") {
        const r = rows.get(op.id);
        if (r) rows.set(op.id, { ...r, revokedAt: clock });
        line = `revoke ${op.id}`;
    }
    if (!input.quiet) lines.push(line, ...dump());
}
if (input.quiet) {
    for (const key of Object.keys(tally).sort()) lines.push(`${key}: ${tally[key]}`);
    const all = [...rows.values()];
    const count = (f: (r: RefreshTokenRow) => boolean) => all.filter(f).length;
    lines.push(`store: ${all.length} rows, ${count((r) => describeHash(r.tokenHash).startsWith("sha256("))} hashed, ${count((r) => r.token !== null)} plain, ${count((r) => r.usedAt !== null)} used, ${count((r) => r.replacedBy !== null)} with replacedBy`);
}
const leaks: string[] = [];
const dumpText = JSON.stringify([...rows.values()]);
const resultText = results.join("\n");
for (const [token, l] of labels) {
    if (dumpText.includes(token)) leaks.push(`${l} in the store as plain text`);
    if (resultText.includes(token)) leaks.push(`${l} in a result`);
}
for (const r of rows.values()) if (r.tokenHash && resultText.includes(r.tokenHash)) leaks.push(`hash of ${r.id} in a result`);
lines.push(`plain text: ${leaks.length ? leaks.join("; ") : "none"}`);
console.log(lines.join("\n"));
