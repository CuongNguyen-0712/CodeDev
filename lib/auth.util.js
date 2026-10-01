import crypto from "crypto";

const REFRESH_TOKEN_BYTES = 40;

export function generateRefreshToken() {
    return crypto
        .randomBytes(REFRESH_TOKEN_BYTES)
        .toString("hex");
}

export function hashRefreshToken(token) {
    return crypto
        .createHmac("sha256", process.env.REFRESH_TOKEN_HASH_SECRET)
        .update(token)
        .digest("hex");
}

export function compareTokenHash(tokenHash, storedHash) {
    if (!storedHash) {
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