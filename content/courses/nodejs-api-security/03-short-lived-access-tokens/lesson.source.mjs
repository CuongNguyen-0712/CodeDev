// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-1-3",
    title: "Short-lived access tokens: signing, expiry & clock skew",
    slug: { _type: "slug", current: "short-lived-access-tokens-signing-expiry-clock-skew" },
    description:
        "A pentest of the CodeDev API found two holes in the hand-written access token verifier: it accepted a token whose header said \"alg\":\"none\" with no signature at all, and the signer wrote exp in milliseconds, so every token was valid for tens of thousands of years. Learn what a compact HS256 JWT is made of, why the header is attacker input, the order of checks that a verifier must follow (format, algorithm allowlist, constant-time signature check, claims, issuer, audience, lifetime, expiry with a small clock-skew leeway), and how to prove each one with a fake clock.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer, CodeDev learning platform (NestJS API, HS256 access tokens)",
        problem:
            "The external pentest report for api.codedev.test lists finding CD-SEC-14 as critical: a token with the header {\"alg\":\"none\"}, an edited payload naming the admin account u_1 and an empty signature was accepted by GET /admin/users with 200 OK. The same report notes as medium that a normal learner token decodes to an exp of 1793006100000. The access token lifetime had been shortened to 15 minutes the week before, after the 30-day token incident of lesson 1.1.",
    },

    content: [
        h2("1. The incident: a verifier that let the token decide"),
        p("The verifier was written by hand, \"because a library felt like overkill for one algorithm\". It is short, and almost every line has a problem:"),
        code("typescript", `
// auth/hs256.ts - the version the pentest found
verify(token: string): AccessClaims {
    const [h, p, s] = token.split(".");
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());

    if (header.alg === "none") return payload;            // "for local testing"

    const expected = createHmac("sha256", this.secret).update(\`\${h}.\${p}\`).digest("base64url");
    if (s !== expected) throw new UnauthorizedException("bad_signature");
    if (payload.exp <= Date.now() / 1000) throw new UnauthorizedException("token_expired");
    return payload;
}

sign(userId: string): string {
    const now = Date.now();
    const payload = { sub: userId, iat: Math.floor(now / 1000), exp: now + 15 * 60 * 1000 };   // ms!
    // ...
}`, "hs256.ts"),
        p("The `alg` value comes from the token, and the token comes from whoever sent the request. A branch that trusts it lets the attacker turn signature checking off. And the signer mixes units: `iat` in seconds, `exp` in milliseconds. The verifier compares `exp` with seconds, so `exp` is always about a thousand times larger than now, and no token from this signer has ever expired. Shortening the lifetime to 15 minutes changed nothing in practice."),

        h2("2. Reproduce it and read the evidence"),
        p("An unsigned token needs no key, only base64url encoding. The pentester's request, rebuilt in a shell:"),
        code("bash", `
b64url() { printf '%s' "$1" | base64 -w0 | tr '+/' '-_' | tr -d '='; }

HEADER=$(b64url '{"alg":"none","typ":"JWT"}')
PAYLOAD=$(b64url '{"sub":"u_1","iat":1793005200,"exp":1793006100,"iss":"https://api.codedev.test","aud":"codedev-web"}')

curl -s -o /dev/null -w '%{http_code}\\n' https://api.codedev.test/admin/users \\
  -H "Authorization: Bearer $HEADER.$PAYLOAD."
200`, "terminal"),
        p("For the second finding, decode the payload of any real token and compare the two time claims. They should differ by exactly 900, the 15-minute lifetime:"),
        code("text", `
{"sub":"u_1042","iat":1793005200,"exp":1793006100000,"iss":"https://api.codedev.test","aud":"codedev-web"}

exp - iat = 1791213094800   (expected 900)`, "decoded payload"),
        p("A valid signature on this token proves only that the API wrote it. The API wrote the wrong number."),

        h2("3. What a compact HS256 token is"),
        p("A JWT in compact form (RFC 7519, using JWS from RFC 7515) is three base64url strings joined by dots: `header.payload.signature`. base64url is the URL-safe base64 alphabet (`A-Z a-z 0-9 - _`) without `=` padding (RFC 4648, section 5). It is an encoding, not encryption: anyone can read the claims, so never put anything secret in them."),
        bullets([
            "**Header:** `{\"alg\":\"HS256\",\"typ\":\"JWT\"}`. `alg` names the algorithm the *sender* claims to have used.",
            "**Payload:** the claims. `sub` (the user), `iat` and `exp` as NumericDate, which is **seconds** since 1970-01-01 UTC (RFC 7519, section 2), `iss` (who issued it) and `aud` (who it is for: a string or an array of strings).",
            "**Signature:** for HS256, HMAC-SHA256 with a shared secret over the exact ASCII text `header.payload`, encoded in base64url. Change one character of the header or payload and the HMAC changes completely.",
        ]),
        h3("The header is attacker input"),
        p("RFC 8725, the JWT Best Current Practices, starts its list of attacks with this one: a verifier that lets the token choose the algorithm can be told to use `none`, or, with asymmetric keys, to treat a public key as an HMAC secret. Its rule is that the verifier decides which algorithm it accepts for a key, and checks that the header names exactly that one (section 3.1). For CodeDev's access tokens the allowlist has one entry, `HS256`, compared exactly: `none`, `HS512`, `RS256`, `hs256` and a missing `alg` are all rejected."),
        h3("The order of checks"),
        p("Nothing in the payload means anything until the signature is verified, so the order matters:"),
        numbered([
            "**Format.** Exactly three parts, each strict base64url, and a header and payload that decode to JSON objects. Node's `Buffer.from(text, \"base64url\")` is lenient (it skips characters it does not know), so check the text before decoding it.",
            "**Algorithm.** `header.alg` must be exactly `HS256`.",
            "**Signature.** Recompute the HMAC over the received `header.payload` text and compare it with the received signature in constant time (below).",
            "**Claims.** Types first (`sub` a non-empty string, `iat` and `exp` integers, `exp` after `iat`), then `iss` and `aud` against the values this API expects (RFC 8725, sections 3.8 and 3.9): a token minted for the grader service must not open the API.",
            "**Lifetime.** `exp - iat` must not exceed the lifetime you issue (900 seconds). This one line would have turned the millisecond bug into a failing test on day one.",
            "**Time, with a small leeway.** Expired when `now >= exp + leeway`; not yet valid when `iat > now + leeway`.",
        ]),
        h3("Comparing signatures in constant time"),
        p("`s !== expected` stops at the first character that differs, so a wrong signature that starts with the right characters takes slightly longer to reject. Exploiting that over a network is hard, but preventing it is one call: `crypto.timingSafeEqual(a, b)` compares two buffers in time that depends only on their length. It throws when the lengths differ, so check the lengths first. Compare the **base64url texts**, not the decoded bytes: a 32-byte HMAC takes 43 base64url characters, and the last one carries 2 unused bits. A lenient decoder maps several different final characters to the same bytes, so a byte comparison accepts tokens that are not the text you signed."),
        h3("Clock skew and leeway"),
        p("RFC 7519 allows a verifier \"some small leeway, usually no more than a few minutes\" when checking `exp` (section 4.1.4). Leeway is for the clocks of the servers that issue and verify tokens, which NTP keeps within milliseconds to a few seconds of each other. 30 seconds is plenty. It is not for the browser's clock, which takes no part in verification, and every second of leeway is a second added to the life of every stolen or revoked token: with 15-minute tokens, a 10-minute leeway is a 66% longer window."),
        callout("info", "When not to write this yourself, and when not to use HS256",
            "In production, use a maintained library with every option pinned, as in section 4. You write the verifier in this lesson to understand what each option protects against, and to recognise a hand-written one in review. And HS256 means every service that can verify a token can also mint one, because they share the secret. That is fine for one API that issues and verifies its own tokens. If the grader and the leaderboard run as separate, less trusted deployments, sign with an asymmetric algorithm (EdDSA or ES256) so they only hold a public key."),

        challenge("chal_quiz_nas_131"),

        h2("4. Worked example: the production setup"),
        p("The API signs and verifies with `jose`, an injected clock and every check named explicitly. The key is 32 random bytes from the secret store; RFC 7518 (section 3.2) requires an HS256 key of at least 256 bits."),
        code("typescript", `
// auth/access-tokens.ts
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "https://api.codedev.test";
const AUDIENCE = "codedev-web";
const LIFETIME_S = 15 * 60;

export class AccessTokens {
    constructor(private readonly key: Uint8Array, private readonly clock: Clock) {}   // key: 32 random bytes

    sign(userId: string): Promise<string> {
        const now = this.clock.nowSeconds();                   // seconds, never Date.now()
        return new SignJWT({})
            .setProtectedHeader({ alg: "HS256", typ: "JWT" })
            .setSubject(userId)
            .setIssuedAt(now)
            .setExpirationTime(now + LIFETIME_S)
            .setIssuer(ISSUER)
            .setAudience(AUDIENCE)
            .sign(this.key);
    }

    async verify(token: string): Promise<string> {
        const { payload } = await jwtVerify(token, this.key, {
            algorithms: ["HS256"],                             // the allowlist: never read from the token
            issuer: ISSUER,
            audience: AUDIENCE,
            clockTolerance: 30,                                // seconds of leeway
            maxTokenAge: LIFETIME_S + 30,                      // rejects an iat too far in the past
            currentDate: new Date(this.clock.nowSeconds() * 1000),
        });
        return payload.sub!;
    }
}`, "access-tokens.ts"),
        p("The exercise writes the same checks by hand, in the order of section 3, with one difference from `jose`: it rejects any token whose `exp - iat` is longer than the lifetime you issue, which is exactly the check that catches the millisecond bug. A skeleton of the verifier:"),
        code("typescript", `
function verifyToken(token: string, secret: string, options: VerifyOptions, now: number): VerifyResult {
    // 1. three parts, strict base64url, header and payload decode to JSON objects  -> "malformed"
    // 2. header.alg is exactly "HS256"                                             -> "unsupported alg"
    // 3. expected signature text vs received, timingSafeEqual after a length check -> "bad signature"
    // 4. claim types, then iss, aud, lifetime, expiry and iat with the leeway
}`),
        challenge("chal_coding_nas_132"),

        h2("5. How to verify"),
        bullets([
            "**Unit tests with a fake clock at the boundaries.** With a 30-second leeway: `now = exp + 29` passes, `now = exp + 30` fails; `iat = now + 30` passes, `iat = now + 31` fails. Boundaries are where off-by-one comparisons hide.",
            "**Attack tokens in the test suite.** `alg: none` with an empty signature, `HS512`, a payload edited after signing, a signature with an altered last character, a token signed with another key, and a token for another audience. Each must be rejected with its own reason.",
            "**Decode what the API issues.** A test signs a token through the real service and asserts `exp - iat === 900` on the decoded payload, in seconds. This would have caught the incident.",
            "**Log reasons, never tokens.** Count 401s by reason (`expired`, `bad_signature`, `unsupported_alg`). A spike of `unsupported_alg` is someone probing; a spike of `expired` right after a deploy is a clock or unit problem.",
            "**Check server clocks.** `chronyc tracking` or `timedatectl` on each API host shows the offset from NTP; it should be far below your leeway.",
        ]),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**Choosing the algorithm from the header.** Any `if (header.alg === ...)` that changes how the signature is checked. Spot it with the `alg: none` test token, or in review: the allowed algorithm must be a constant.",
            "**Milliseconds in exp or iat.** `Date.now()` anywhere near a token. Spot it by decoding a token (13-digit numbers instead of 10), or with the lifetime check.",
            "**Comparing signatures with `===` or after decoding.** Spot it in review: the comparison must be `timingSafeEqual` on the signature texts, with a length check first, and a test with an altered last character must fail.",
            "**A large leeway to hide a client bug.** Leeway of several minutes \"because some users got 401\". Spot it by asking which clock is wrong: server clocks are fixed with NTP, client clocks do not take part in verification at all.",
            "**Not checking `aud` and `iss`.** A token minted for another service of the same company opens this API. Spot it with a test token for another audience.",
        ]),

        h2("7. Summary"),
        numbered([
            "A compact HS256 JWT is `base64url(header).base64url(payload).base64url(HMAC)`; anyone can read it, only the key holder can produce it, and the header is attacker input.",
            "Verify in a fixed order: format, an allowlisted algorithm, a constant-time comparison of the signature text, claim types, issuer, audience, lifetime, then expiry with a leeway of seconds, not minutes.",
            "NumericDate is seconds: inject the clock, check `exp - iat` against the lifetime you issue, and prove every rule with a fake clock and attack tokens in tests.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 7519, JSON Web Token: section 2 (NumericDate) and section 4.1 (registered claims, leeway for exp) - datatracker.ietf.org/doc/html/rfc7519",
            "RFC 8725, JSON Web Token Best Current Practices: section 3.1 (algorithm verification), 3.8 (issuer and subject) and 3.9 (audience)",
            "RFC 7515 (JWS compact serialization), RFC 7518 section 3.2 (HMAC key size) and RFC 4648 section 5 (base64url)",
            "Node.js documentation: crypto.createHmac and crypto.timingSafeEqual",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the token verifier of a service you own, or the options you pass to its JWT library, and write one test per attack token from section 5. Then write down, next to each library option you set, which line of your hand-written verifier it replaces. Any line without a matching option is a check your service does not make."),
    ],
});
