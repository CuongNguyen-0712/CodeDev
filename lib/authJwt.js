import crypto from "crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

import { AUTH } from "@/lib/authConfig";

/**
 * Session JWT codec used by next-auth (authOptions.jwt), proxy.js and lib/session.js.
 *
 * Same format and key as next-auth's default (JWE, `dir` + `A256GCM`, HKDF-derived from
 * NEXTAUTH_SECRET), so cookies issued before this change still decrypt. On top of it:
 *   - only `dir` / `A256GCM` are accepted (algorithm allowlist),
 *   - `iss` / `aud` are stamped on every token and verified on every read.
 * Tokens minted before iss/aud existed are accepted while AUTH_ACCEPT_LEGACY_JWT is on; they are
 * re-issued with the claims the next time /api/auth/session or /api/auth/refresh runs.
 */

const KEY_INFO = "NextAuth.js Generated Encryption Key";

function encryptionKey(secret, salt = "") {
    if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
    return new Uint8Array(crypto.hkdfSync("sha256", secret, salt, salt ? `${KEY_INFO} (${salt})` : KEY_INFO, 32));
}

const CLAIMS_SET_BY_ENCODER = ["iss", "aud", "iat", "exp", "jti", "nbf"];

export async function encodeAuthJwt({ token = {}, secret, maxAge, salt = "" }) {
    const payload = { ...token };
    for (const claim of CLAIMS_SET_BY_ENCODER) delete payload[claim];

    return new EncryptJWT(payload)
        .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
        .setIssuer(AUTH.ISSUER)
        .setAudience(AUTH.AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + Number(maxAge))
        .setJti(crypto.randomUUID())
        .encrypt(encryptionKey(secret, salt));
}

export async function decodeAuthJwt({ token, secret, salt = "" }) {
    if (!token) return null;

    const { payload } = await jwtDecrypt(token, encryptionKey(secret, salt), {
        clockTolerance: 15,
        keyManagementAlgorithms: ["dir"],
        contentEncryptionAlgorithms: ["A256GCM"],
    });

    const legacy = payload.iss === undefined && payload.aud === undefined;
    if (legacy) {
        if (!AUTH.ACCEPT_LEGACY_JWT) throw new Error("Session JWT without issuer/audience");
        return payload;
    }

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== AUTH.ISSUER || !audiences.includes(AUTH.AUDIENCE)) {
        throw new Error("Session JWT issuer/audience mismatch");
    }

    return payload;
}

/** Session id claim; `sessionId` is the pre-`sid` name. */
export const tokenSessionId = (token) => (token?.sid ?? token?.sessionId ?? null);

/** Access expiry (ms); `expiresAt` is the pre-`accessExpiresAt` name. */
export const tokenAccessExpiresAt = (token) => Number(token?.accessExpiresAt ?? token?.expiresAt) || 0;
