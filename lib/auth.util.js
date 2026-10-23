import crypto from "crypto";

// 40 random bytes = 320 bits of entropy, hex encoded.
const REFRESH_TOKEN_BYTES = 40;

function hashSecret() {
    const secret = process.env.REFRESH_TOKEN_HASH_SECRET;
    if (!secret) throw new Error("REFRESH_TOKEN_HASH_SECRET is not set");
    return secret;
}

export function generateRefreshToken() {
    return crypto
        .randomBytes(REFRESH_TOKEN_BYTES)
        .toString("hex");
}

/**
 * Keyed SHA-256 (HMAC) of a refresh token. Only this digest is stored; a leaked database
 * cannot be turned back into usable tokens without the secret.
 */
export function hashRefreshToken(token) {
    return crypto
        .createHmac("sha256", hashSecret())
        .update(String(token))
        .digest("hex");
}

/** Digest of a client Idempotency-Key, so the raw key is never stored either. */
export function hashIdempotencyKey(key) {
    return crypto
        .createHmac("sha256", hashSecret())
        .update(`idempotency:${key}`)
        .digest("hex");
}

export function compareTokenHash(tokenHash, storedHash) {
    if (!storedHash || !tokenHash) {
        return false;
    }

    const incoming = Buffer.from(tokenHash, "hex");
    const stored = Buffer.from(storedHash, "hex");

    if (incoming.length !== stored.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        incoming,
        stored
    );
}

/**
 * AES-256-GCM key for refresh tokens kept for idempotent recovery. It lives outside the
 * database: REFRESH_TOKEN_RECOVERY_KEY (32 bytes, base64) or, when unset, an HKDF derivation of
 * REFRESH_TOKEN_HASH_SECRET.
 */
function recoveryKey() {
    const configured = process.env.REFRESH_TOKEN_RECOVERY_KEY;
    if (configured) {
        const key = Buffer.from(configured, "base64");
        if (key.length !== 32) throw new Error("REFRESH_TOKEN_RECOVERY_KEY must be 32 bytes (base64)");
        return key;
    }
    return Buffer.from(crypto.hkdfSync("sha256", hashSecret(), "", "codedev refresh-token recovery v1", 32));
}

/**
 * Seals the refresh token issued by a rotation. `context` (session, consumed token,
 * idempotency key digest) is bound as additional authenticated data, so the blob only opens for
 * the exact retry it was made for.
 */
export function sealRecovery(plain, context) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", recoveryKey(), iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const encrypted = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);

    return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function openRecovery(sealed, context) {
    try {
        const [version, iv, tag, encrypted] = String(sealed).split(".");
        if (version !== "v1") return null;

        // Full 16-byte tag only: Node would otherwise accept truncated tags (easier forgery).
        const authTag = Buffer.from(tag, "base64url");
        if (authTag.length !== 16) return null;

        const decipher = crypto.createDecipheriv("aes-256-gcm", recoveryKey(), Buffer.from(iv, "base64url"), { authTagLength: 16 });
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
    } catch {
        return null;
    }
}

export const recoveryContext = ({ sessionId, tokenId, keyHash }) => `refresh-recovery|v1|${sessionId}|${tokenId}|${keyHash}`;
