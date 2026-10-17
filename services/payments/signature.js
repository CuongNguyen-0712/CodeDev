import crypto from "crypto";

/**
 * Webhook signatures: `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`
 * (the scheme Stripe uses). The timestamp bounds replays; the comparison is constant-time.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function computeSignature(secret, timestamp, rawBody) {
    return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function signatureHeader(secret, rawBody, timestamp = Math.floor(Date.now() / 1000)) {
    return `t=${timestamp},v1=${computeSignature(secret, timestamp, rawBody)}`;
}

/**
 * @returns {boolean} true only for a well-formed, fresh header whose HMAC matches.
 */
export function verifySignatureHeader(secret, rawBody, header, { now = Date.now(), tolerance = SIGNATURE_TOLERANCE_SECONDS } = {}) {
    if (!secret || typeof header !== "string" || header.length > 512) return false;

    const parts = Object.fromEntries(
        header.split(",").map((part) => part.trim().split("=")).filter((pair) => pair.length === 2)
    );
    const timestamp = Number(parts.t);
    const given = parts.v1;

    if (!Number.isInteger(timestamp) || !/^[a-f0-9]{64}$/.test(given || "")) return false;
    if (Math.abs(now / 1000 - timestamp) > tolerance) return false;

    const expected = Buffer.from(computeSignature(secret, timestamp, rawBody), "hex");
    const actual = Buffer.from(given, "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function sha256Hex(text) {
    return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}
