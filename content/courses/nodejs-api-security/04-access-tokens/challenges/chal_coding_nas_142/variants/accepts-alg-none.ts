import { readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";

// CodeDev access tokens: a JWT-shaped HS256 token, <header>.<payload>.<signature>, each part base64url
// without padding (Buffer#toString("base64url")).
//
// sign(claims, key, now)
//   header  exactly {"alg":"HS256","typ":"JWT"} (in this key order)
//   payload JSON.stringify({ ...claims, iat: now, exp: now + ACCESS_TTL_S })  (claims never contain iat/exp)
//   signature = HMAC-SHA256 with key over "<header part>.<payload part>", base64url
//
// verify(token, key, now, options) returns { ok: true, claims } or { ok: false, reason }. The checks run
// in this order and the first failing one gives the reason:
//   1. "malformed"       not exactly 3 parts split on "."; header or payload part empty or not only
//                        [A-Za-z0-9_-]; or not decoding to a JSON object (not null, not an array)
//   2. "unsupported_alg" header.alg is not exactly "HS256" ("none", "HS512", "hs256", missing...)
//   3. "bad_signature"   the signature part is not the base64url HMAC-SHA256 of "<header>.<payload>"
//                        (compare with timingSafeEqual; different lengths are a bad signature, not a crash)
//   4. "invalid_claims"  exp is not a finite number, or nbf is present and not a finite number
//   5. "expired"         now >= exp + LEEWAY_S
//   6. "not_yet_valid"   nbf is present and now < nbf - LEEWAY_S
//   7. "wrong_issuer"    claims.iss !== options.issuer
//   8. "wrong_audience"  claims.aud is neither options.audience nor an array that contains it
// Never trust a claim before the signature check has passed.

const ACCESS_TTL_S = 900;
const LEEWAY_S = 30;

type Claims = { [name: string]: unknown };
type VerifyOptions = { issuer: string; audience: string };
type Reason =
    | "malformed"
    | "unsupported_alg"
    | "bad_signature"
    | "invalid_claims"
    | "expired"
    | "not_yet_valid"
    | "wrong_issuer"
    | "wrong_audience";
type VerifyResult = { ok: true; claims: Claims } | { ok: false; reason: Reason };

const PART = /^[A-Za-z0-9_-]+$/;

function encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function hmac(signingInput: string, key: string): string {
    return createHmac("sha256", key).update(signingInput).digest("base64url");
}

function decodeObject(part: string): Claims | null {
    if (!PART.test(part)) return null;
    try {
        const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
        return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Claims) : null;
    } catch {
        return null;
    }
}

function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function sign(claims: Claims, key: string, now: number): string {
    const head = encode({ alg: "HS256", typ: "JWT" });
    const body = encode({ ...claims, iat: now, exp: now + ACCESS_TTL_S });
    return `${head}.${body}.${hmac(`${head}.${body}`, key)}`;
}

function verify(token: string, key: string, now: number, options: VerifyOptions): VerifyResult {
    const parts = typeof token === "string" ? token.split(".") : [];
    if (parts.length !== 3) return { ok: false, reason: "malformed" };
    const [head, body, signature] = parts;
    const header = decodeObject(head);
    const claims = decodeObject(body);
    if (!header || !claims) return { ok: false, reason: "malformed" };

    if (header.alg !== "HS256" && header.alg !== "none") return { ok: false, reason: "unsupported_alg" };

    // unsigned tokens carry no signature to compare
    const expected = Buffer.from(header.alg === "none" ? "" : hmac(`${head}.${body}`, key));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return { ok: false, reason: "bad_signature" };
    }

    if (!isNumber(claims.exp) || ("nbf" in claims && !isNumber(claims.nbf))) {
        return { ok: false, reason: "invalid_claims" };
    }
    if (now >= claims.exp + LEEWAY_S) return { ok: false, reason: "expired" };
    if (isNumber(claims.nbf) && now < claims.nbf - LEEWAY_S) return { ok: false, reason: "not_yet_valid" };
    if (claims.iss !== options.issuer) return { ok: false, reason: "wrong_issuer" };
    const aud = claims.aud;
    if (!(aud === options.audience || (Array.isArray(aud) && aud.includes(options.audience)))) {
        return { ok: false, reason: "wrong_audience" };
    }
    return { ok: true, claims };
}

// ---------------------------------------------------------------- test runner (do not change)
// stdin: { "key": string, "ops": [ { "op": "sign", "claims": {...}, "now": n }
//                                  | { "op": "verify", "token": "...", "now": n, "options": {...} } ] }
// stdout: one result per op: the token string for sign, the VerifyResult for verify, { "error" } if it threw.
type Op =
    | { op: "sign"; claims: Claims; now: number }
    | { op: "verify"; token: string; now: number; options: VerifyOptions };
const input: { key: string; ops: Op[] } = JSON.parse(readFileSync(0, "utf8"));
const results = input.ops.map((o) => {
    try {
        return o.op === "sign" ? sign(o.claims, input.key, o.now) : verify(o.token, input.key, o.now, o.options);
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
});
console.log(JSON.stringify(results));
