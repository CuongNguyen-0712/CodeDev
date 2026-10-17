import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptJWT } from "jose";
import crypto from "crypto";
import { encode as nextAuthEncode } from "next-auth/jwt";

import { hashRefreshToken, hashIdempotencyKey, sealRecovery, openRecovery, recoveryContext, generateRefreshToken } from "@/lib/auth.util";
import { encodeAuthJwt, decodeAuthJwt } from "@/lib/authJwt";
import { assertSameOrigin } from "@/lib/requestGuard";
import { refreshCookieOptions } from "@/lib/authCookies";
import { refreshCookieName, sessionCookieName } from "@/lib/authConfig";

const secret = process.env.NEXTAUTH_SECRET;

describe("refresh token crypto", () => {
    it("generates >= 256-bit random tokens and stores only a keyed hash", () => {
        const token = generateRefreshToken();
        expect(token).toMatch(/^[0-9a-f]{80}$/); // 40 bytes = 320 bits
        const hash = hashRefreshToken(token);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(hash).not.toContain(token);
        expect(hashIdempotencyKey("key-1")).not.toBe(hashIdempotencyKey("key-2"));
    });

    it("recovery blob opens only for the exact session / token / idempotency key", () => {
        const ctx = recoveryContext({ sessionId: "1", tokenId: "2", keyHash: "abc" });
        const sealed = sealRecovery("new-token", ctx);
        expect(sealed).not.toContain("new-token");
        expect(openRecovery(sealed, ctx)).toBe("new-token");
        expect(openRecovery(sealed, recoveryContext({ sessionId: "1", tokenId: "2", keyHash: "other" }))).toBeNull();
        expect(openRecovery(sealed, recoveryContext({ sessionId: "9", tokenId: "2", keyHash: "abc" }))).toBeNull();
        const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
        expect(openRecovery(tampered, ctx)).toBeNull();
    });
});

describe("session JWT", () => {
    it("round-trips with iss / aud / iat / exp / jti and sid", async () => {
        const jwt = await encodeAuthJwt({ token: { id: "u1", sid: "s1", accessExpiresAt: 123 }, secret, maxAge: 60 });
        const payload = await decodeAuthJwt({ token: jwt, secret });
        expect(payload).toMatchObject({ id: "u1", sid: "s1", iss: "codedev", aud: "codedev-web" });
        expect(payload.jti).toBeTruthy();
        expect(payload.exp - payload.iat).toBe(60);
    });

    it("rejects a wrong secret, issuer, audience or algorithm", async () => {
        const jwt = await encodeAuthJwt({ token: { id: "u1" }, secret, maxAge: 60 });
        await expect(decodeAuthJwt({ token: jwt, secret: "another-secret" })).rejects.toThrow();

        const key = new Uint8Array(crypto.hkdfSync("sha256", secret, "", "NextAuth.js Generated Encryption Key", 32));
        const forged = await new EncryptJWT({ id: "u1" })
            .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
            .setIssuer("evil").setAudience("codedev-web").setIssuedAt().setExpirationTime("1m")
            .encrypt(key);
        await expect(decodeAuthJwt({ token: forged, secret })).rejects.toThrow(/issuer/);

        const wrongAlg = await new EncryptJWT({ id: "u1" })
            .setProtectedHeader({ alg: "A256KW", enc: "A256GCM" })
            .setIssuer("codedev").setAudience("codedev-web").setIssuedAt().setExpirationTime("1m")
            .encrypt(key);
        await expect(decodeAuthJwt({ token: wrongAlg, secret })).rejects.toThrow();
    });

    it("rejects an expired JWT", async () => {
        const jwt = await encodeAuthJwt({ token: { id: "u1" }, secret, maxAge: -60 });
        await expect(decodeAuthJwt({ token: jwt, secret })).rejects.toThrow();
    });

    it("still reads cookies minted by next-auth before iss/aud existed", async () => {
        const legacy = await nextAuthEncode({ token: { id: "u1", sessionId: "s1", refreshToken: "x" }, secret, maxAge: 60 });
        const payload = await decodeAuthJwt({ token: legacy, secret });
        expect(payload).toMatchObject({ id: "u1", sessionId: "s1" });
    });
});

describe("Origin / CSRF guard", () => {
    const req = (headers, url = "http://localhost:3000/api/auth/refresh") => ({ url, headers: new Headers(headers) });

    it("accepts same-origin requests", () => {
        expect(() => assertSameOrigin(req({ origin: "http://localhost:3000" }))).not.toThrow();
        expect(() => assertSameOrigin(req({ "sec-fetch-site": "same-origin" }))).not.toThrow();
    });

    it("rejects cross-site and origin-less requests with 403 ORIGIN_REJECTED", () => {
        for (const headers of [{ origin: "https://evil.example" }, { origin: "null" }, {}, { "sec-fetch-site": "cross-site" }]) {
            try {
                assertSameOrigin(req(headers));
                throw new Error("should have thrown");
            } catch (error) {
                expect(error.status).toBe(403);
                expect(error.errorCode).toBe("ORIGIN_REJECTED");
            }
        }
    });
});

describe("refresh cookie", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("is HttpOnly, SameSite=Strict, Path=/ and expires with the session", () => {
        const expires = Date.now() + 1000;
        const options = refreshCookieOptions(expires);
        expect(options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/", secure: false });
        expect(options.expires.getTime()).toBe(expires);
        expect(options).not.toHaveProperty("domain");
    });

    it("uses the __Host- prefix and Secure on https deployments", () => {
        vi.stubEnv("NEXTAUTH_URL", "https://codedev.example");
        expect(refreshCookieName()).toBe("__Host-cd_refresh");
        expect(sessionCookieName()).toBe("__Secure-next-auth.session-token");
        expect(refreshCookieOptions(Date.now()).secure).toBe(true);
    });
});

describe("client refresh (lib/authRefresh)", () => {
    let mod;
    let fetchMock;

    const ok = (accessExpiresAt) => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true, data: { accessExpiresAt } }) });
    const fail = (status, code) => ({ ok: false, status, headers: new Headers(), json: async () => ({ success: false, code, message: code }) });

    beforeEach(async () => {
        vi.resetModules();
        globalThis.window = globalThis;
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
        mod = await import("@/lib/authRefresh");
    });

    afterEach(() => {
        delete globalThis.window;
    });

    it("shares one refresh between concurrent callers (single-flight)", async () => {
        fetchMock.mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 20));
            return ok(Date.now() + 900_000);
        });
        const results = await Promise.all([mod.refreshSession(), mod.refreshSession(), mod.refreshSession()]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(new Set(results.map((r) => r.accessExpiresAt)).size).toBe(1);
    });

    it("retries a lost response with the same Idempotency-Key", async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError("network down"))
            .mockResolvedValueOnce(fail(503))
            .mockResolvedValueOnce(ok(Date.now() + 900_000));
        await mod.refreshSession({ force: true });
        const keys = fetchMock.mock.calls.map(([, init]) => init.headers["Idempotency-Key"]);
        expect(keys).toHaveLength(3);
        expect(new Set(keys).size).toBe(1);
    });

    it("skips the network when a refresh already happened after the failed request", async () => {
        fetchMock.mockResolvedValue(ok(Date.now() + 900_000));
        const startedAt = Date.now() - 1000;
        await mod.refreshSession({ force: true });
        await mod.refreshSession({ ifOlderThan: startedAt });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("broadcasts signed-out on a terminal 401 and does not retry it", async () => {
        fetchMock.mockResolvedValue(fail(401, "REFRESH_TOKEN_REUSED"));
        const events = [];
        mod.onAuthEvent((message) => events.push(message.type));
        await expect(mod.refreshSession({ force: true })).rejects.toMatchObject({ terminal: true, code: "REFRESH_TOKEN_REUSED" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(events).toContain("signed-out");
    });
});
