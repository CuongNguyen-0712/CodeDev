import { readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";

// CodeDev access tokens: compact HS256 JWTs that live 15 minutes, verified by the API on every request.
// The pentest finding: the old verifier accepted a token with "alg":"none" and no signature, and a
// token whose exp had been written in milliseconds, which made it valid for tens of thousands of years.
//
// signToken(claims, secret):
//   header  = base64url of the exact JSON text {"alg":"HS256","typ":"JWT"}
//   payload = base64url of JSON.stringify({ sub, iat, exp, iss, aud }) with the keys in that order
//   signature = HMAC-SHA256 with the secret over the ASCII text `${header}.${payload}`, as base64url
//   token = `${header}.${payload}.${signature}`   (base64url: A-Z a-z 0-9 - _ and no "=" padding)
//
// verifyToken(token, secret, options, now) - now is the fake clock in seconds. Check in this order and
// return { valid: false, reason } for the first failure:
//   1. "malformed"          not exactly 3 parts separated by "."; or a part that is not strict base64url
//                           (only A-Z a-z 0-9 - _, no padding, length % 4 !== 1); or a header or payload
//                           that does not decode to a JSON object (not null, not an array)
//   2. "unsupported alg"    header.alg is not exactly "HS256" ("none", "HS512", "hs256", missing...)
//   3. "bad signature"      the signature part differs from the expected base64url signature text;
//                           compare the two texts' bytes with timingSafeEqual (check the lengths first:
//                           timingSafeEqual throws on different lengths)
//   4. "invalid claims"     sub is not a non-empty string; iat or exp is not an integer; iss is not a
//                           string; aud is neither a string nor an array of strings; or exp <= iat
//   5. "wrong issuer"       iss !== options.issuer
//   6. "wrong audience"     aud is a string other than options.audience, or an array without it
//   7. "lifetime too long"  exp - iat > options.maxLifetimeSeconds
//   8. "expired"            now >= exp + options.leewaySeconds
//   9. "not yet valid"      iat > now + options.leewaySeconds
// Otherwise return { valid: true, sub }.
//
// Do not change the types or the test runner.

type Claims = { sub: string; iat: number; exp: number; iss: string; aud: string };
type VerifyOptions = { issuer: string; audience: string; leewaySeconds: number; maxLifetimeSeconds: number };
type VerifyResult = { valid: true; sub: string } | { valid: false; reason: string };

const b64url = (text: string) => Buffer.from(text, "utf8").toString("base64url");
const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("base64url");

function signToken(claims: Claims, secret: string): string {
    const { sub, iat, exp, iss, aud } = claims;
    const unsigned = `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify({ sub, iat, exp, iss, aud }))}`;
    return `${unsigned}.${hmac(secret, unsigned)}`;
}

function decodeObject(part: string): Record<string, unknown> | null {
    try {
        const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
        return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

function verifyToken(token: string, secret: string, options: VerifyOptions, now: number): VerifyResult {
    const fail = (reason: string): VerifyResult => ({ valid: false, reason });

    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]*$/.test(p) || p.length % 4 === 1)) return fail("malformed");
    const header = decodeObject(parts[0]);
    const payload = decodeObject(parts[1]);
    if (!header || !payload) return fail("malformed");

    if (header.alg !== "HS256") return fail("unsupported alg");

    const expected = Buffer.from(hmac(secret, `${parts[0]}.${parts[1]}`));
    const received = Buffer.from(parts[2]);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return fail("bad signature");

    const { sub, iat, exp, iss, aud } = payload;
    const audOk = typeof aud === "string" || (Array.isArray(aud) && aud.every((a) => typeof a === "string"));
    if (typeof sub !== "string" || sub === "" || !Number.isInteger(iat) || !Number.isInteger(exp) || typeof iss !== "string" || !audOk) {
        return fail("invalid claims");
    }
    const issuedAt = iat as number;
    const expiresAt = exp as number;
    if (expiresAt <= issuedAt) return fail("invalid claims");

    if (iss !== options.issuer) return fail("wrong issuer");
    if (typeof aud === "string" ? aud !== options.audience : !(aud as string[]).includes(options.audience)) return fail("wrong audience");
    if (now >= expiresAt + options.leewaySeconds) return fail("expired");
    if (issuedAt > now + options.leewaySeconds) return fail("not yet valid");
    return { valid: true, sub };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { secret, options, now, sign: Claims[], verify: string[] }.
// Output: { tokens: the signed tokens, results: the verification of every signed token, then of every
// token in verify }.
type Input = { secret: string; options: VerifyOptions; now: number; sign: Claims[]; verify: string[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const tokens = input.sign.map((c) => signToken(c, input.secret));
const results = [...tokens, ...input.verify].map((t) => verifyToken(t, input.secret, input.options, input.now));
console.log(JSON.stringify({ tokens, results }));
