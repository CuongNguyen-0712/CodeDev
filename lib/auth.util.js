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

// AES-256-GCM key for refresh tokens that briefly sit in Redis (rotation grace cache).
function sealKey() {
    return crypto
        .createHash("sha256")
        .update(`session-rotation:${process.env.REFRESH_TOKEN_HASH_SECRET}`)
        .digest();
}

export function sealToken(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", sealKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${iv.toString("hex")}.${tag.toString("hex")}.${encrypted.toString("hex")}`;
}

export function openToken(sealed) {
    try {
        const [iv, tag, encrypted] = String(sealed).split(".");
        const decipher = crypto.createDecipheriv("aes-256-gcm", sealKey(), Buffer.from(iv, "hex"));
        decipher.setAuthTag(Buffer.from(tag, "hex"));

        return Buffer.concat([decipher.update(Buffer.from(encrypted, "hex")), decipher.final()]).toString("utf8");
    } catch {
        return null;
    }
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