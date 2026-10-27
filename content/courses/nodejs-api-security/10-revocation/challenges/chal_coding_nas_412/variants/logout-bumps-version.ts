import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// CodeDev auth service (https://api.codedev.test): sign out one device, sign out every device,
// list the active sessions, and make access tokens of a revoked session fail before they expire.
//
// A session is a refresh token family (one familyId per sign-in on one device). Access tokens live
// 15 minutes and carry { sub: userId, sid: familyId, ver: session version, iat, exp }. Their signature
// was already checked (lesson 1.3); you get the decoded claims.
//
// revokeFamily(s, userId, familyId, now): boolean
//   - no row of familyId belongs to userId (no such family, or another user's)  -> return false, change nothing
//   - otherwise set revokedAt = now on every row of the family whose revokedAt is null; if at least
//     one row changed, put the family on the deny list: s.deniedFamilies.set(familyId, now + ACCESS_TTL_MS).
//     Return true (also when the family was already revoked: nothing changes then).
//
// signOutAll(s, userId, now): password change or "Sign out of all devices"
//   - bump the user's session version: s.sessionVersion (a missing user counts as 0) + 1
//   - set revokedAt = now on every row of the user whose revokedAt is null
//   - add NOTHING to the deny list: the version check already rejects every older access token.
//
// checkAccess(s, claims, now): runs on every API request, so it may use only the two maps, never s.rows
//   1. now >= claims.exp                                          -> "expired"
//   2. claims.ver < s.sessionVersion of claims.sub (missing = 0)  -> "revoked"
//   3. claims.sid is on the deny list                              -> "revoked"
//   4. otherwise                                                   -> "ok"
//
// pruneDenyList(s, now): delete every deny-list entry whose time is <= now. The runner calls it before
//   every operation, so the list only holds families revoked in the last 15 minutes: by then every
//   access token of such a family has expired on its own.
//
// listSessions(s, userId, now): one entry per family of the user that has a live row
//   (usedAt null, revokedAt null and now < expiresAt). deviceId from the family's rows,
//   createdAt = the smallest createdAt of its rows (sign-in), lastUsedAt = the largest (last refresh).
//   Sort by lastUsedAt, newest first; ties by familyId ascending (plain string comparison).
//
// Do not change the types, the constants, the issuing/refresh code or the test runner.

const MINUTE = 60_000;
const ACCESS_TTL_MS = 15 * MINUTE;
const REFRESH_TTL_MS = 14 * 24 * 60 * MINUTE;

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

type AccessClaims = { sub: string; sid: string; ver: number; iat: number; exp: number };

type AuthState = {
    rows: RefreshTokenRow[];                 // the refresh_tokens table
    sessionVersion: Map<string, number>;     // users.session_version (missing = 0)
    deniedFamilies: Map<string, number>;     // familyId -> time (ms) when the entry may be dropped
};

type AccessResult = "ok" | "expired" | "revoked";
type SessionView = { familyId: string; deviceId: string; createdAt: number; lastUsedAt: number };

function revokeFamily(s: AuthState, userId: string, familyId: string, now: number): boolean {
    const family = s.rows.filter((r) => r.familyId === familyId);
    if (!family.some((r) => r.userId === userId)) return false;
    let changed = 0;
    for (const row of family) {
        if (row.revokedAt === null) {
            row.revokedAt = now;
            changed++;
        }
    }
    if (changed > 0) s.sessionVersion.set(userId, (s.sessionVersion.get(userId) ?? 0) + 1);
    return true;
}

function signOutAll(s: AuthState, userId: string, now: number): void {
    s.sessionVersion.set(userId, (s.sessionVersion.get(userId) ?? 0) + 1);
    for (const row of s.rows) {
        if (row.userId === userId && row.revokedAt === null) row.revokedAt = now;
    }
}

function checkAccess(s: AuthState, claims: AccessClaims, now: number): AccessResult {
    if (now >= claims.exp) return "expired";
    if (claims.ver < (s.sessionVersion.get(claims.sub) ?? 0)) return "revoked";
    if (s.deniedFamilies.has(claims.sid)) return "revoked";
    return "ok";
}

function pruneDenyList(s: AuthState, now: number): void {
    for (const [familyId, until] of s.deniedFamilies) {
        if (until <= now) s.deniedFamilies.delete(familyId);
    }
}

function listSessions(s: AuthState, userId: string, now: number): SessionView[] {
    const families = new Map<string, SessionView & { live: boolean }>();
    for (const row of s.rows) {
        if (row.userId !== userId) continue;
        const live = row.usedAt === null && row.revokedAt === null && now < row.expiresAt;
        const view = families.get(row.familyId);
        if (!view) {
            families.set(row.familyId, { familyId: row.familyId, deviceId: row.deviceId, createdAt: row.createdAt, lastUsedAt: row.createdAt, live });
            continue;
        }
        view.createdAt = Math.min(view.createdAt, row.createdAt);
        view.lastUsedAt = Math.max(view.lastUsedAt, row.createdAt);
        view.live = view.live || live;
    }
    return [...families.values()]
        .filter((v) => v.live)
        .map(({ familyId, deviceId, createdAt, lastUsedAt }) => ({ familyId, deviceId, createdAt, lastUsedAt }))
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt || (a.familyId < b.familyId ? -1 : a.familyId > b.familyId ? 1 : 0));
}

// ------------------------------------------------- issuing and refresh (from lessons 2.3 and 3.1, do not change)
const sha256 = (token: string): string => createHash("sha256").update(token).digest("hex");
let counter = 0;

function issueAccess(s: AuthState, userId: string, familyId: string, now: number): AccessClaims {
    return { sub: userId, sid: familyId, ver: s.sessionVersion.get(userId) ?? 0, iat: now, exp: now + ACCESS_TTL_MS };
}

function insertRefresh(s: AuthState, userId: string, deviceId: string, familyId: string, now: number): { row: RefreshTokenRow; token: string } {
    counter++;
    const token = `rtok-${counter}-${sha256(`seed-${counter}`).slice(0, 16)}`;
    const row: RefreshTokenRow = {
        id: `rt_${counter}`, familyId, userId, deviceId, tokenHash: sha256(token),
        createdAt: now, expiresAt: now + REFRESH_TTL_MS, usedAt: null, revokedAt: null, replacedBy: null,
    };
    s.rows.push(row);
    return { row, token };
}

let familyCounter = 0;
function login(s: AuthState, userId: string, deviceId: string, now: number) {
    const familyId = `fam_${++familyCounter}`;
    const { token } = insertRefresh(s, userId, deviceId, familyId, now);
    return { familyId, access: issueAccess(s, userId, familyId, now), refresh: token };
}

type RefreshResult = { ok: true; access: AccessClaims; refresh: string } | { ok: false; reason: string };
function refresh(s: AuthState, presented: string, now: number): RefreshResult {
    const hash = sha256(presented);
    const row = s.rows.find((r) => r.tokenHash === hash);
    if (!row) return { ok: false, reason: "unknown" };
    if (row.revokedAt !== null) return { ok: false, reason: "revoked" };
    if (now >= row.expiresAt) return { ok: false, reason: "expired" };
    if (row.usedAt !== null) {
        revokeFamily(s, row.userId, row.familyId, now);   // replay: an old token came back
        return { ok: false, reason: "replay" };
    }
    const next = insertRefresh(s, row.userId, row.deviceId, row.familyId, now);
    row.usedAt = now;
    row.replacedBy = next.row.id;
    return { ok: true, access: issueAccess(s, row.userId, row.familyId, now), refresh: next.token };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of operations in time order; "at" is minutes since the start (fake clock).
//   { "at": 0, "op": "login", "user": "u1", "device": "phone" }   -> new session, tokens A<n> and R<n>
//   { "at": 5, "op": "refresh", "refresh": "R1" }                  -> rotation; new A<n>, R<n>
//   { "at": 6, "op": "api", "access": "A1" }                       -> any API call with that access token
//   { "at": 7, "op": "logout", "access": "A1" }                    -> sign out this device
//   { "at": 8, "op": "revoke", "access": "A1", "family": "fam_2" } -> sign out one session from the list
//   { "at": 9, "op": "logoutAll", "access": "A1" }                 -> sign out of all devices
//   { "at": 9, "op": "passwordChanged", "user": "u1" }             -> the password was changed
//   { "at": 9, "op": "sessions", "access": "A1" }                  -> GET /sessions
//   { "at": 9, "op": "denylist" }                                  -> families on the deny list
type Op = { at: number; op: string; user?: string; device?: string; refresh?: string; access?: string; family?: string };

function main(): void {
    const ops: Op[] = JSON.parse(readFileSync(0, "utf8"));
    const s: AuthState = { rows: [], sessionVersion: new Map(), deniedFamilies: new Map() };
    const accessTokens = new Map<string, AccessClaims>();
    const refreshTokens = new Map<string, string>();
    let accessCount = 0;
    let refreshCount = 0;
    const out: string[] = [];
    const keep = (access: AccessClaims, token: string): string => {
        const a = `A${++accessCount}`;
        const r = `R${++refreshCount}`;
        accessTokens.set(a, access);
        refreshTokens.set(r, token);
        return `${a}, ${r}`;
    };
    const minutes = (ms: number): string => `${Math.round((ms / MINUTE) * 100) / 100}m`;

    for (const o of ops) {
        const now = o.at * MINUTE;
        pruneDenyList(s, now);
        let line = "";
        const guard = (): AccessClaims | string => {
            const claims = accessTokens.get(o.access ?? "");
            if (!claims) return "401 unknown";
            const result = checkAccess(s, claims, now);
            return result === "ok" ? claims : `401 ${result}`;
        };
        if (o.op === "login") {
            const r = login(s, o.user ?? "", o.device ?? "", now);
            line = `login ${o.user} ${o.device}: ${r.familyId}, ${keep(r.access, r.refresh)}`;
        } else if (o.op === "refresh") {
            const r = refresh(s, refreshTokens.get(o.refresh ?? "") ?? "", now);
            line = `refresh ${o.refresh}: ${r.ok ? keep(r.access, r.refresh) : `401 ${r.reason}`}`;
        } else if (o.op === "passwordChanged") {
            signOutAll(s, o.user ?? "", now);
            line = `password changed ${o.user}`;
        } else if (o.op === "denylist") {
            const ids = [...s.deniedFamilies.keys()].sort();
            line = `deny list: ${ids.length}${ids.length ? ` (${ids.join(", ")})` : ""}`;
        } else {
            const claims = guard();
            const label = `${o.op} ${o.access}${o.family ? ` ${o.family}` : ""}`;
            if (typeof claims === "string") line = `${label}: ${claims}`;
            else if (o.op === "api") line = `${label}: 200`;
            else if (o.op === "logout") line = `${label}: ${revokeFamily(s, claims.sub, claims.sid, now) ? 204 : 404}`;
            else if (o.op === "revoke") line = `${label}: ${revokeFamily(s, claims.sub, o.family ?? "", now) ? 204 : 404}`;
            else if (o.op === "logoutAll") {
                signOutAll(s, claims.sub, now);
                line = `${label}: 204`;
            } else if (o.op === "sessions") {
                const list = listSessions(s, claims.sub, now);
                const shown = list.map((v) => `${v.familyId} ${v.deviceId} since ${minutes(v.createdAt)} last ${minutes(v.lastUsedAt)}${v.familyId === claims.sid ? " (this device)" : ""}`);
                line = `${label}: ${shown.join("; ") || "none"}`;
            } else line = `${label}: unknown operation`;
        }
        out.push(`[${o.at}m] ${line}`);
    }
    console.log(out.join("\n"));
}
main();
