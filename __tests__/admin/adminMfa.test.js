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

describe("client IP for the allowlist", () => {
    const spoofed = new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9", "cf-connecting-ip": "203.0.113.9", "x-vercel-forwarded-for": "198.51.100.7" });

    it("reads only the platform header on Vercel and the configured header elsewhere", async () => {
        const { RateLimiter } = await import("@/lib/rateLimit");
        expect(RateLimiter.getClientIp(spoofed, { env: { VERCEL: "1" } })).toBe("198.51.100.7");
        expect(RateLimiter.getClientIp(new Headers({ "x-real-ip": "203.0.113.9" }), { env: { VERCEL: "1" }, trustedOnly: true })).toBe("unknown");
        expect(RateLimiter.getClientIp(spoofed, { env: { CLIENT_IP_HEADER: "CF-Connecting-IP" }, trustedOnly: true })).toBe("203.0.113.9");
    });

    it("gives the allowlist nothing to trust without a platform or configured header", async () => {
        const { RateLimiter } = await import("@/lib/rateLimit");
        expect(RateLimiter.getClientIp(spoofed, { env: {}, trustedOnly: true })).toBe("unknown");
        expect(adminIpAllowed(RateLimiter.getClientIp(spoofed, { env: {}, trustedOnly: true }), { ADMIN_IP_ALLOWLIST: "203.0.113.9" })).toBe(false);
        // Rate limiting still gets an address in local development.
        expect(RateLimiter.getClientIp(spoofed, { env: {} })).toBe("203.0.113.9");
    });

    it("reports a missing ADMIN_MFA_KEY and an allowlist without a trusted header when deployed", async () => {
        const { checkEnvironment } = await import("@/lib/envCheck.mjs");
        const { errors, fatal } = checkEnvironment({ APP_ENV: "production", ADMIN_IP_ALLOWLIST: "203.0.113.9" });
        expect(errors.some((message) => message.startsWith("ADMIN_MFA_KEY"))).toBe(true);
        expect(errors.some((message) => message.startsWith("ADMIN_IP_ALLOWLIST"))).toBe(true);
        expect(fatal.some((message) => message.includes("ADMIN_MFA_KEY"))).toBe(false);
    });
});

describe("admin script policy", () => {
    it("allows nonce scripts and the theme script by hash, with a new nonce each time", async () => {
        const { adminCsp, isAdminPage } = await import("@/lib/adminCsp");
        const { THEME_SCRIPT } = await import("@/lib/themeScript");
        const hash = crypto.createHash("sha256").update(THEME_SCRIPT).digest("base64");
        const prod = await adminCsp({ dev: false });
        expect(prod.value).toContain(`'nonce-${prod.nonce}'`);
        expect(prod.value).toContain(`'sha256-${hash}'`);
        expect(prod.value).toContain("'strict-dynamic'");
        expect(prod.value).not.toContain("unsafe-eval");
        expect((await adminCsp({ dev: false })).nonce).not.toBe(prod.nonce);
        expect((await adminCsp({ dev: true })).value).toContain("'unsafe-eval'");
        expect([isAdminPage("/admin"), isAdminPage("/admin/users"), isAdminPage("/administrator"), isAdminPage("/api/admin/users")]).toEqual([true, true, false, false]);
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

    it("asks course managers for the second factor too, by permission rather than rank", async () => {
        const { mfaRequiredFor } = await import("@/services/adminMfa.service");
        expect(mfaRequiredFor({ rank: 50, permissions: new Set(["admin.read", "course.price"]) })).toBe(true);
        expect(mfaRequiredFor({ rank: 30, permissions: new Set(["admin.read", "challenge.update"]) })).toBe(false);
        expect(mfaRequiredFor({ rank: 80, permissions: new Set(["admin.read"]) })).toBe(true);
    });

    it("refuses to start enrolment from a sign-in older than 10 minutes", async () => {
        await sql(`UPDATE identity.sessions SET created_at = now() - interval '11 minutes' WHERE id = $1`, [sessionId]);
        await expect(adminMfaService.setup({ actor, sessionId, account: publicId })).rejects.toMatchObject({ status: 403, errorCode: "FRESH_SIGN_IN_REQUIRED" });
        await expect(adminMfaService.setup({ actor, sessionId: null, account: publicId })).rejects.toMatchObject({ errorCode: "FRESH_SIGN_IN_REQUIRED" });
        await sql(`UPDATE identity.sessions SET created_at = now() WHERE id = $1`, [sessionId]);
    });

    it("refuses admin APIs until the session passed the second factor", async () => {
        await expect(requirePermission(publicId, "admin.read")).rejects.toMatchObject({ status: 403, errorCode: "MFA_REQUIRED" });
        expect((await requirePermission(publicId, "admin.read", { mfa: false })).publicId).toBe(publicId);
    });

    it("enrols with a code, returns recovery codes once, and verifies the session", async () => {
        const setup = await adminMfaService.setup({ actor, sessionId, account: publicId });
        expect(setup.uri).toMatch(/^otpauth:\/\/totp\//);
        expect(setup.qr).toMatch(/^data:image\/svg\+xml;base64,/);
        await expect(adminMfaService.confirm({ actor, sessionId, code: "000000" === (await currentCode()) ? "111111" : "000000" })).rejects.toMatchObject({ errorCode: "MFA_INVALID" });
        const { recoveryCodes } = await adminMfaService.confirm({ actor, sessionId, code: await currentCode() });
        expect(recoveryCodes).toHaveLength(8);
        await expect(adminMfaService.setup({ actor, sessionId, account: publicId })).rejects.toMatchObject({ status: 409 });
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

    it("refuses points, EXP and course access for the actor's own account and for higher roles", async () => {
        const { adminService } = await import("@/services/admin.service");
        await sql(`INSERT INTO profile.info (user_id, name, surname) VALUES ($1, 'Mfa', 'Test') ON CONFLICT DO NOTHING`, [userDbId]);
        const input ={ userId: publicId, amount: 10, reason: "self credit check", idempotencyKey: `${TAG}-self` };
        await expect(adminService.adjustPoints({ actor, input })).rejects.toMatchObject({ status: 403 });
        await expect(adminService.adjustExperience({ actor, input })).rejects.toMatchObject({ status: 403 });
        await expect(adminService.grantEntitlement({ actor, input: { userId: publicId, courseId: "none", reason: "self grant check" } })).rejects.toMatchObject({ status: 403 });

        const higher = await sql(
            `SELECT u.public_id FROM identity.users u JOIN identity.user_roles ur ON ur.user_id = u.id
             JOIN identity.roles r ON r.id = ur.role_id AND r.code = 'super_admin' JOIN profile.info i ON i.user_id = u.id LIMIT 1`
        );
        if (higher.rows[0]) {
            await expect(adminService.adjustPoints({ actor, input: { ...input, userId: higher.rows[0].public_id } })).rejects.toMatchObject({ status: 403 });
        }
    });

    it("matches and shows emails in the user search only with user.pii", async () => {
        const { adminService } = await import("@/services/admin.service");
        const byEmail = `${publicId}@test.inv`;
        expect(await adminService.findUsers({ query: byEmail, pii: false })).toEqual([]);
        expect((await adminService.findUsers({ query: byEmail, pii: true }))[0]?.email).toBe(`${publicId}@test.invalid`);
        expect((await adminService.findUsers({ query: publicId, pii: false }))[0]?.email).toBe(`${publicId.slice(0, 1)}***@test.invalid`);
    });

    it("filters the audit log by an action prefix that contains an underscore", async () => {
        const { adminAuditDb, escapeLike } = await import("@/db/adminAudit.db");
        expect(escapeLike("dead_letter%")).toBe("dead\\_letter\\%");
        await sql(`INSERT INTO identity.audit_log (actor_id, action, target_type, target_id) VALUES ($1, $2, 'user', $3)`, [userDbId, `zz_${TAG}.check`, publicId]);
        const { rows } = await adminAuditDb.list({ action: `zz_${TAG}`, range: "1h" });
        expect(rows.map((row) => row.action)).toEqual([`zz_${TAG}.check`]);
        expect((await adminAuditDb.list({ action: `zz${TAG}`, range: "1h" })).rows).toEqual([]);
    });

    it("locks the second factor after 5 wrong codes and audits each one", async () => {
        const { mfaFailureGuard } = await import("@/services/adminMfa.service");
        await mfaFailureGuard.reset(publicId);
        const wrong = (await currentCode()) === "000000" ? "111111" : "000000";
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await expect(adminMfaService.verify({ actor, sessionId, code: wrong })).rejects.toMatchObject({ errorCode: "MFA_INVALID" });
        }
        await expect(adminMfaService.verify({ actor, sessionId, code: await currentCode() })).rejects.toMatchObject({ status: 429, errorCode: "MFA_LOCKED" });
        const failed = (await sql(`SELECT count(*)::int AS n FROM identity.audit_log WHERE actor_id = $1 AND action = 'mfa.failed'`, [userDbId])).rows[0].n;
        expect(failed).toBeGreaterThanOrEqual(5);
        await mfaFailureGuard.reset(publicId);
    });
});
