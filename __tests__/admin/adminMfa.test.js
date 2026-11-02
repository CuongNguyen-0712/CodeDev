import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { base32Decode, base32Encode, hotp, matchTotp } from "@/lib/totp";
import { adminIpAllowed } from "@/lib/adminMode";

// The session of the "current request" for requirePermission / requireRecentAuth.
let currentSession = null;
vi.mock("@/lib/session", () => ({ getAuthSession: vi.fn(async () => currentSession) }));
vi.mock("@/services/auth.service", () => ({ authService: { revokeAllSessions: vi.fn(async () => 0) } }));

// RFC 6238 appendix B test secret ("12345678901234567890", SHA-1).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
    it("matches the RFC test vectors", () => {
        const vectors = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"]];
        for (const [seconds, eight] of vectors) {
            expect(hotp(RFC_SECRET, Math.floor(seconds / 30))).toBe(eight.slice(-6));
        }
    });

    it("round-trips base32 and accepts one step of clock drift only", () => {
        const bytes = crypto.randomBytes(20);
        expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
        const now = 1_800_000_000_000;
        const step = Math.floor(now / 30000);
        expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step), { now })).toBe(step);
        expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), { now })).toBe(step - 1);
        expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), { now })).toBeNull();
        expect(matchTotp(RFC_SECRET, "12345", { now })).toBeNull();
    });
});

describe("ADMIN_IP_ALLOWLIST", () => {
    it("allows everyone when unset and matches IPv4 CIDR ranges and exact addresses", () => {
        expect(adminIpAllowed("198.51.100.7", {})).toBe(true);
        const env = { ADMIN_IP_ALLOWLIST: "203.0.113.0/24, 198.51.100.7, 2001:db8::1" };
        expect(adminIpAllowed("203.0.113.200", env)).toBe(true);
        expect(adminIpAllowed("203.0.114.1", env)).toBe(false);
        expect(adminIpAllowed("198.51.100.7", env)).toBe(true);
        expect(adminIpAllowed("::ffff:198.51.100.7", env)).toBe(true);
        expect(adminIpAllowed("2001:DB8::1", env)).toBe(true);
        expect(adminIpAllowed("unknown", env)).toBe(false);
        expect(adminIpAllowed(null, env)).toBe(false);
    });
});

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `mf${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("admin two-factor (PostgreSQL)", () => {
    let sql, loadActor, requirePermission, requireRecentAuth, adminMfaService, decryptSecret;
    let userDbId, sessionId, actor;
    const publicId = `${TAG}_admin`;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ loadActor, requirePermission, requireRecentAuth } = await import("@/lib/authz"));
        ({ adminMfaService, decryptSecret } = await import("@/services/adminMfa.service"));
        userDbId = String(960000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [userDbId, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO identity.user_roles (user_id, role_id) SELECT $1, id FROM identity.roles WHERE code = 'admin'`, [userDbId]);
        sessionId = (await sql(
            `INSERT INTO identity.sessions (id, user_id, expires_at, idle_expires_at, absolute_expires_at)
             VALUES ($2, $1, now() + interval '1 day', now() + interval '1 day', now() + interval '1 day') RETURNING id::text AS id`,
            [userDbId, String(Number(userDbId) + 1)]
        )).rows[0].id;
        actor = await loadActor(publicId);
        currentSession = { user: { id: publicId, sessionId } };
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM identity.users WHERE id = $1`, [userDbId]);
    });

    const currentCode = async (offset = 0) => {
        const row = (await sql(`SELECT secret_enc FROM identity.admin_mfa WHERE user_id = $1`, [userDbId])).rows[0];
        return hotp(decryptSecret(row.secret_enc), Math.floor(Date.now() / 30000) + offset);
    };

    it("refuses admin APIs until the session passed the second factor", async () => {
        await expect(requirePermission(publicId, "admin.read")).rejects.toMatchObject({ status: 403, errorCode: "MFA_REQUIRED" });
        expect((await requirePermission(publicId, "admin.read", { mfa: false })).publicId).toBe(publicId);
    });

    it("enrols with a code, returns recovery codes once, and verifies the session", async () => {
        const setup = await adminMfaService.setup({ actor, account: publicId });
        expect(setup.uri).toMatch(/^otpauth:\/\/totp\//);
        expect(setup.qr).toMatch(/^data:image\/svg\+xml;base64,/);
        await expect(adminMfaService.confirm({ actor, sessionId, code: "000000" === (await currentCode()) ? "111111" : "000000" })).rejects.toMatchObject({ errorCode: "MFA_INVALID" });
        const { recoveryCodes } = await adminMfaService.confirm({ actor, sessionId, code: await currentCode() });
        expect(recoveryCodes).toHaveLength(8);
        await expect(adminMfaService.setup({ actor, account: publicId })).rejects.toMatchObject({ status: 409 });
        expect((await requirePermission(publicId, "admin.read")).publicId).toBe(publicId);
        await expect(requireRecentAuth(actor)).resolves.toBeUndefined();

        // A code is never accepted twice.
        await expect(adminMfaService.verify({ actor, sessionId, code: await currentCode() })).rejects.toMatchObject({ errorCode: "MFA_INVALID" });

        // A recovery code works once.
        await sql(`UPDATE identity.sessions SET mfa_verified_at = NULL, reauth_at = NULL WHERE id = $1`, [sessionId]);
        await expect(adminMfaService.verify({ actor, sessionId, code: recoveryCodes[0] })).resolves.toEqual({ verified: true });
        await expect(adminMfaService.verify({ actor, sessionId, code: recoveryCodes[0] })).rejects.toMatchObject({ errorCode: "MFA_INVALID" });
        expect((await adminMfaService.status({ actor, sessionId })).recoveryLeft).toBe(7);
    });

    it("asks for a fresh confirmation after 15 minutes for sensitive actions", async () => {
        await sql(`UPDATE identity.sessions SET reauth_at = now() - interval '16 minutes' WHERE id = $1`, [sessionId]);
        await expect(requireRecentAuth(actor)).rejects.toMatchObject({ status: 403, errorCode: "REAUTH_REQUIRED" });
        expect((await requirePermission(publicId, "admin.read")).publicId).toBe(publicId);
    });

    it("records a refused admin call once in the audit log", async () => {
        await expect(requirePermission(publicId, "role.manage")).rejects.toMatchObject({ errorCode: "FORBIDDEN" });
        await expect(requirePermission(publicId, "role.manage")).rejects.toMatchObject({ errorCode: "FORBIDDEN" });
        const rows = (await sql(`SELECT action, target_id FROM identity.audit_log WHERE actor_id = $1 AND action = 'admin.denied'`, [userDbId])).rows;
        expect(rows).toEqual([{ action: "admin.denied", target_id: "role.manage" }]);
    });
});
