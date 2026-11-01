import crypto from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30 s), the format every
 * authenticator app reads. No dependency: node:crypto only.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;

export function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = "";
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
    return output;
}

export function base32Decode(text) {
    const clean = String(text).replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of clean) {
        const index = ALPHABET.indexOf(char);
        if (index < 0) throw new Error("Invalid base32 character");
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

/** A new 160-bit secret, base32 (what the app shows for manual entry). */
export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export function hotp(secretBase32, counter) {
    const key = base32Decode(secretBase32);
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac("sha1", key).update(message).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
    return String(binary % 1_000_000).padStart(6, "0");
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_PERIOD);

/**
 * The time step the code belongs to (now, one before or one after, for clock drift), or null.
 * Codes are compared in constant time.
 */
export function matchTotp(secretBase32, code, { now = Date.now(), window = 1 } = {}) {
    const given = String(code || "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(given)) return null;
    const step = currentStep(now);
    for (let offset = -window; offset <= window; offset++) {
        const expected = hotp(secretBase32, step + offset);
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return step + offset;
    }
    return null;
}

/** otpauth:// URI for authenticator apps (manual entry or a QR code). */
export function totpUri({ secret, account, issuer = "CodeDev Admin" }) {
    const label = encodeURIComponent(`${issuer}:${account}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD}`;
}
