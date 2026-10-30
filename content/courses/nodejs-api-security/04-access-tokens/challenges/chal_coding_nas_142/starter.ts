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
// Do not change the types, the constants or the test runner.

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

function sign(claims: Claims, key: string, now: number): string {
    // TODO: header and payload as base64url JSON, then the HMAC-SHA256 signature.
    return "";
}

function verify(token: string, key: string, now: number, options: VerifyOptions): VerifyResult {
    // TODO: the eight checks, in order. Never throw.
    return { ok: false, reason: "malformed" };
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
