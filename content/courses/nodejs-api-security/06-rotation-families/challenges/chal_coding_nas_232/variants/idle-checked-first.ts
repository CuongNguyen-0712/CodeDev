import { readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";

// CodeDev auth service (https://api.codedev.test): refresh token rotation with token families.
//
// A family is one sign-in on one device. login() starts a family; every successful refresh()
// replaces the presented token with a new one in the same family. Two limits end a family:
//   idle timeout       a token that is not used within idleTimeoutMs of its creation is dead
//   absolute lifetime  no token of the family works absoluteLifetimeMs after the family started
//                      (the family starts at the createdAt of its first token)

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
    findByHash(tokenHash: string): RefreshTokenRow | null;   // WHERE token_hash = $1
    findFamily(familyId: string): RefreshTokenRow[];         // WHERE family_id = $1
    update(id: string, patch: Partial<RefreshTokenRow>): void;
}

type Deps = {
    store: TokenStore;
    now: () => number;
    randomBytes: (size: number) => Buffer;
    newId: (prefix: "rt" | "fam") => string;
    idleTimeoutMs: number;
    absoluteLifetimeMs: number;
};

type Session = {
    token: string; id: string; familyId: string; userId: string; deviceId: string;
    expiresAt: number; familyExpiresAt: number;
};
type RefreshResult =
    | ({ ok: true } & Session)
    | { ok: false; reason: "malformed" | "unknown" | "revoked" | "used" | "family_expired" | "idle_timeout" };

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

function issue(deps: Deps, id: string, familyId: string, userId: string, deviceId: string, familyExpiresAt: number): Session {
    const token = deps.randomBytes(32).toString("base64url");
    const createdAt = deps.now();
    const expiresAt = Math.min(createdAt + deps.idleTimeoutMs, familyExpiresAt);
    deps.store.insert({
        id, familyId, userId, deviceId, tokenHash: sha256Hex(token),
        createdAt, expiresAt, usedAt: null, revokedAt: null, replacedBy: null,
    });
    return { token, id, familyId, userId, deviceId, expiresAt, familyExpiresAt };
}

function login(deps: Deps, userId: string, deviceId: string): Session {
    const id = deps.newId("rt");
    const familyId = deps.newId("fam");
    return issue(deps, id, familyId, userId, deviceId, deps.now() + deps.absoluteLifetimeMs);
}

function refresh(deps: Deps, presented: unknown): RefreshResult {
    if (typeof presented !== "string" || !TOKEN_FORMAT.test(presented)) return { ok: false, reason: "malformed" };
    const hash = sha256Hex(presented);
    const row = deps.store.findByHash(hash);
    if (!row || !timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hash, "hex"))) return { ok: false, reason: "unknown" };
    if (row.revokedAt !== null) return { ok: false, reason: "revoked" };
    if (row.usedAt !== null) return { ok: false, reason: "used" };
    const now = deps.now();
    const familyStart = Math.min(...deps.store.findFamily(row.familyId).map((r) => r.createdAt));
    const familyExpiresAt = familyStart + deps.absoluteLifetimeMs;
    if (now >= row.expiresAt) return { ok: false, reason: "idle_timeout" };
    if (now >= familyExpiresAt) return { ok: false, reason: "family_expired" };
    const next = issue(deps, deps.newId("rt"), row.familyId, row.userId, row.deviceId, familyExpiresAt);
    deps.store.update(row.id, { usedAt: now, replacedBy: next.id });
    return { ok: true, ...next };
}

// ---------------------------------------------------------------- test runner (do not change)
type Op =
    | { op: "login"; userId: string; deviceId: string }
    | { op: "refresh"; token: unknown }
    | { op: "advance"; ms: number }
    | { op: "revokeFamily"; familyId: string };
type Input = { idleTimeoutMs: number; absoluteLifetimeMs: number; start?: number; seed?: string; quiet?: boolean; ops: Op[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const rows = new Map<string, RefreshTokenRow>();
const store: TokenStore = {
    insert(row) {
        const copy = { ...row };
        if (rows.has(copy.id)) throw new Error(`duplicate key: id ${copy.id}`);
        for (const r of rows.values()) if (r.tokenHash === copy.tokenHash) throw new Error("duplicate key: token_hash");
        rows.set(copy.id, copy);
    },
    findByHash(tokenHash) {
        for (const r of rows.values()) if (r.tokenHash === tokenHash) return { ...r };
        return null;
    },
    findFamily(familyId) {
        return [...rows.values()].filter((r) => r.familyId === familyId).map((r) => ({ ...r }));
    },
    update(id, patch) {
        const r = rows.get(id);
        if (!r) throw new Error(`update: no row ${id}`);
        rows.set(id, { ...r, ...patch, id });
    },
};
let clock = input.start ?? Date.UTC(2026, 9, 26, 8, 0, 0);
const start = clock;
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
    idleTimeoutMs: input.idleTimeoutMs,
    absoluteLifetimeMs: input.absoluteLifetimeMs,
};
const tokens: string[] = [];
const remember = (token: string) => {
    if (!tokens.includes(token)) tokens.push(token);
    return `#${tokens.indexOf(token) + 1}`;
};
// times are printed relative to the start of the test: "d2 03:00" = 2 days and 3 hours later
const rel = (ms: number | null) => {
    if (ms === null) return "-";
    const d = ms - start;
    const sign = d < 0 ? "-" : "";
    const a = Math.abs(d);
    const days = Math.floor(a / 86_400_000);
    const rest = new Date(a % 86_400_000).toISOString().slice(11, a % 60_000 ? 23 : 16);
    return `${sign}d${days} ${rest}`;
};
const describeSession = (s: Session) =>
    `${s.id} ${s.familyId} ${s.userId}/${s.deviceId} token ${remember(s.token)} expires ${rel(s.expiresAt)} family until ${rel(s.familyExpiresAt)}`;
const lines: string[] = [];
const tally: Record<string, number> = {};
const results: string[] = [];
for (const op of input.ops) {
    if (op.op === "login") {
        const s = login(deps, op.userId, op.deviceId);
        remember(s.token);
        const { token, ...rest } = s;
        results.push(JSON.stringify(rest));
        if (!input.quiet) lines.push(`${rel(clock)} login -> ${describeSession(s)}`);
        tally["login"] = (tally["login"] ?? 0) + 1;
    } else if (op.op === "refresh") {
        let presented = op.token;
        let shown = JSON.stringify(op.token);
        if (typeof op.token === "string" && /^#\d+$/.test(op.token) && tokens[Number(op.token.slice(1)) - 1]) {
            presented = tokens[Number(op.token.slice(1)) - 1];
            shown = op.token;
        } else if (typeof op.token === "string" && op.token.startsWith("hash:")) {
            presented = rows.get(op.token.slice(5))?.tokenHash ?? op.token;
            shown = `tokenHash of ${op.token.slice(5)}`;
        }
        const r = refresh(deps, presented);
        if (r.ok) remember(r.token);
        if (r.ok) {
            const { token, ...rest } = r;
            results.push(JSON.stringify(rest));
        } else results.push(JSON.stringify(r));
        if (!input.quiet) lines.push(`${rel(clock)} refresh ${shown} -> ${r.ok ? `ok ${describeSession(r)}` : r.reason}`);
        const key = r.ok ? "refresh ok" : `refresh ${r.reason}`;
        tally[key] = (tally[key] ?? 0) + 1;
    } else if (op.op === "advance") {
        clock += op.ms;
    } else if (op.op === "revokeFamily") {
        for (const r of rows.values()) if (r.familyId === op.familyId && r.revokedAt === null) r.revokedAt = clock;
        if (!input.quiet) lines.push(`${rel(clock)} revoke family ${op.familyId}`);
    }
}
const all = [...rows.values()];
if (input.quiet) {
    for (const key of Object.keys(tally).sort()) lines.push(`${key}: ${tally[key]}`);
    const families = new Map<string, RefreshTokenRow[]>();
    for (const r of all) families.set(r.familyId, [...(families.get(r.familyId) ?? []), r]);
    let longest = 0;
    let latestExpiry = 0;
    for (const fam of families.values()) {
        const first = Math.min(...fam.map((r) => r.createdAt));
        longest = Math.max(longest, Math.max(...fam.map((r) => r.createdAt)) - first);
        latestExpiry = Math.max(latestExpiry, Math.max(...fam.map((r) => r.expiresAt)) - first);
    }
    const unchained = all.filter((r) => r.usedAt !== null && (r.replacedBy === null || rows.get(r.replacedBy)?.familyId !== r.familyId)).length;
    lines.push(`store: ${all.length} rows in ${families.size} families, ${all.filter((r) => r.usedAt !== null).length} used, ${unchained} used rows without a replacedBy in their family`);
    lines.push(`longest family: last token issued ${rel(start + longest)}, last expiry ${rel(start + latestExpiry)} after its first token`);
} else {
    lines.push("store:");
    for (const r of all) {
        lines.push(`  ${r.id} ${r.familyId} ${r.userId}/${r.deviceId} created ${rel(r.createdAt)} expires ${rel(r.expiresAt)} used ${rel(r.usedAt)} revoked ${rel(r.revokedAt)} replacedBy ${r.replacedBy ?? "-"}`);
    }
}
const leaks: string[] = [];
const dumpText = JSON.stringify(all);
const resultText = results.join("\n");
tokens.forEach((tk, i) => {
    if (dumpText.includes(tk)) leaks.push(`#${i + 1} stored in plain text`);
    if (resultText.includes(tk)) leaks.push(`#${i + 1} in a result field other than token`);
});
for (const r of all) if (resultText.includes(r.tokenHash)) leaks.push(`hash of ${r.id} in a result`);
lines.push(`leaks: ${leaks.length ? leaks.join("; ") : "none"}`);
console.log(lines.join("\n"));
