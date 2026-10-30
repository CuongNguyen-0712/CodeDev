// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nas-1-4",
    title: "Short-lived access tokens: sign, verify and expire",
    slug: { _type: "slug", current: "short-lived-access-tokens-sign-verify-expire" },
    description:
        "A security researcher gets into the CodeDev admin API with a token that has no signature at all, logged-out learners keep calling the API for a day, and one API container rejects fresh logins every few minutes. Learn what a signed access token really proves, the verification order RFC 8725 asks for (pin the algorithm, check the signature, then trust exp, nbf, iss and aud), why a short lifetime limits damage without revoking anything, and how clock skew and key rotation fit in.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev identity team",
        problem:
            "Three reports land in one week. A bug bounty researcher shows a request to https://api.codedev.test/v1/admin/learners that succeeded with a token whose header says {\"alg\":\"none\"} and whose signature is empty. Support finds that access tokens are issued for 24 hours, so a learner who logged out on a library computer was still \"logged in\" there the next morning. And one of four API containers answers 401 to a few percent of requests made right after login. All three come from the same 40 lines of hand-written token code.",
    },

    content: [
        h2("1. The incident: a token that signed itself"),
        p("Since lesson 1, CodeDev logs a learner in with two credentials: a short-lived **access token** sent as `Authorization: Bearer ...` on every API call, and a long-lived opaque **refresh token** in the `__Secure-cd_refresh` cookie, used only to get new access tokens. This lesson is about the first one. Here is the verifier that was in production:"),
        code("typescript", `
// auth/verify-access.ts (before)
export function verifyAccess(token: string): AccessClaims | null {
    const [h, p, s] = token.split(".");
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    if (header.alg !== "none" && s !== hmac(header.alg, ACCESS_KEY, \`\${h}.\${p}\`)) return null;
    if (Date.now() / 1000 > claims.exp) return null;
    return claims;   // { sub, sid, role, iat, exp }
}

// login: ACCESS_TTL_S = 86_400 (24 hours)`, "auth/verify-access.ts"),
        bullets([
            "**The forged admin request.** The header decides how the token is checked. `{\"alg\":\"none\"}` skips the signature, so anyone can write `{\"sub\":\"user_1\",\"role\":\"admin\",\"exp\":9999999999}`, encode it and be an admin.",
            "**The library computer.** Logout revoked the refresh token and cleared the cookie, but the access token lives on in the browser's memory and in any copy an attacker made. Nothing on the server knows about it, so it works until `exp` - 24 hours later.",
            "**The flaky container.** Its clock runs 40 seconds behind the login service. Another version of this code also checked `iat` and rejected tokens \"issued in the future\" - a token signed a few seconds ago by a server whose clock is ahead. Malformed input also crashed the handler: `JSON.parse` on garbage throws and becomes a `500`.",
        ]),

        h2("2. What a signed access token is"),
        p("CodeDev's access token is a JWT (RFC 7519) in its signed form (JWS): three base64url parts joined by dots."),
        code("text", `
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9                    header   {"alg":"HS256","typ":"JWT"}
.eyJzdWIiOiJ1c2VyXzEwNDIiLCJzaWQiOiJmYW1fN2ExYyIsLi4ufQ  payload  {"sub":"user_1042","sid":"fam_7a1c",
                                                                   "iss":"https://api.codedev.test",
                                                                   "aud":"codedev-api","iat":...,"exp":...}
.<43 base64url characters>                               signature HMAC-SHA256(key, "<header>.<payload>")`, "anatomy of an access token"),
        bullets([
            "**Signed, not encrypted.** Anyone who holds the token can decode the payload - try it in a terminal with `base64 -d`. Never put secrets, email addresses or anything you would not show the learner in it.",
            "**The signature proves two things only:** the payload was produced by someone who has the key, and it has not been changed since. It says nothing about whether the session still exists.",
            "**`exp` is the only built-in limit.** A signed token is valid until it expires, wherever it is copied. That is the price of not looking anything up on each request.",
            "**`iss` and `aud`** say who issued the token and which API it is meant for. Checking them stops a token issued for another service that shares the key (a staging environment, an internal tool) from being accepted here.",
        ]),

        h3("Why short-lived, and when not to use this at all"),
        p("The point of a self-contained access token is that the API can check it with a key and a clock, without a database round trip on every request. That makes it attractive for a busy API and for several services that trust one issuer. The cost is that you cannot take it back. The design answer is to keep the lifetime short - CodeDev uses **900 seconds** - and to let the refresh token, which *is* checked against the database, decide whether a session may continue."),
        bullets([
            "A short TTL **limits** the damage of a stolen or logged-out access token to at most 15 minutes. It does not **revoke** it: inside those 15 minutes the token works. Lesson 6 adds a per-user session version for the cases that cannot wait.",
            "**When not to:** a single server-rendered app with one database gains little from stateless tokens. A server session (lesson 1) is revoked by deleting one row and is simpler to get right. Choose JWTs because you need stateless verification, not because they are fashionable.",
            "**Too short is also a problem:** a 30-second TTL turns every page into a refresh, multiplies load on the token endpoint and makes the concurrent refresh race of lesson 9 frequent. Minutes, not seconds.",
        ]),

        h2("3. Verify in a fixed order: decide, then trust"),
        p("RFC 8725 (JWT Best Current Practices) exists because of bugs exactly like the one above. The rule behind it: the verifier decides how a token is checked; the token never does. Everything you read from the token before the signature passes is attacker-controlled input."),
        image("verify-order", {
            alt: "Top: the token split into header, payload and signature. Middle: eight numbered checks from left to right - malformed, algorithm pinned to HS256, signature with timingSafeEqual, claim types, exp with 30 seconds of leeway, nbf, issuer, audience - with a red note that the old code read claims and let the header choose the algorithm before the signature. Bottom: a clock line from iat to exp to exp plus 30 seconds showing where a token is valid, inside the leeway, and expired.",
            caption: "Structure, algorithm and signature come first. Only a token that passed them has claims worth reading.",
        }),
        numbered([
            "**Structure.** Exactly three parts; header and payload are base64url JSON objects. Anything else is rejected with a reason, never with an exception that turns into a `500`.",
            "**Algorithm.** Accept exactly the algorithm you issue - here `HS256` - and reject `none`, `HS512`, `RS256` and even `hs256`. Do not let `alg` select code paths.",
            "**Signature.** Recompute HMAC-SHA256 over the first two parts as they were received and compare with a constant-time comparison (`crypto.timingSafeEqual`, after checking that the lengths match).",
            "**Claim types.** `exp` must be a number; a token without `exp` never expires and is rejected.",
            "**Time.** `exp` and `nbf` are checked against the server clock with a small leeway (CodeDev: 30 seconds) for clock skew between machines.",
            "**Issuer and audience.** `iss` must be the CodeDev auth service; `aud` must be, or contain, this API.",
        ]),
        callout("warning", "Algorithm confusion",
            "A classic variant of the alg problem: an API that verifies RS256 tokens with a public key, but lets the header choose the algorithm. The attacker sends alg HS256 and signs with the public key as the HMAC secret - which is public. A verifier that maps one key to one algorithm, and rejects every other alg value, is immune to both this and alg none."),

        h3("Clock skew and the exact boundary"),
        p("RFC 7519 says a token must not be accepted on or after its `exp`, and must not be accepted before its `nbf`, and allows \"some small leeway, usually no more than a few minutes\" for clock skew. Make the boundary explicit so tests can pin it: CodeDev accepts while `now < exp + 30` and rejects from `now >= exp + 30`; with `nbf`, it accepts from `now >= nbf - 30`. Read `now` from an injected clock, not from `Date.now()` scattered through the code - that is what lets a test stand exactly on the boundary."),
        p("Leeway is for skew, not for convenience. If containers drift by minutes, fix NTP; do not raise the leeway to five minutes, which quietly adds five minutes to every token's lifetime."),

        p("Before writing the verifier, check two claims people make about tokens: that a verifier which compares signatures is safe, and that a shorter lifetime acts like logout."),
        challenge("chal_quiz_nas_141"),

        h2("4. The fix in NestJS"),
        p("In the CodeDev API the check lives in a guard, using `@nestjs/jwt` (tested with NestJS 11 and @nestjs/jwt 11 on Node.js 22 - verify before use). Every option below closes one of the holes from section 1:"),
        code("typescript", `
// auth/access-token.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Clock } from "../common/clock";

@Injectable()
export class AccessTokenGuard implements CanActivate {
    constructor(private readonly jwt: JwtService, private readonly clock: Clock) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest();
        const [scheme, token] = (req.headers.authorization ?? "").split(" ");
        if (scheme !== "Bearer" || !token) throw new UnauthorizedException();
        try {
            req.user = await this.jwt.verifyAsync(token, {
                secret: process.env.ACCESS_TOKEN_KEY,   // 32+ random bytes, from the secret store
                algorithms: ["HS256"],                  // never let the header choose
                issuer: "https://api.codedev.test",
                audience: "codedev-api",
                clockTolerance: 30,                     // seconds of skew, on exp and nbf
                clockTimestamp: this.clock.nowSeconds(),
            });
            return true;
        } catch {
            throw new UnauthorizedException();          // 401, never 500
        }
    }
}

// auth.service.ts, at login and refresh
const access = await this.jwt.signAsync(
    { sub: user.id, sid: session.familyId },
    { secret: process.env.ACCESS_TOKEN_KEY, algorithm: "HS256", expiresIn: 900,
      issuer: "https://api.codedev.test", audience: "codedev-api" },
);`, "auth/access-token.guard.ts"),
        p("The graded challenge rebuilds what `verifyAsync` does with nothing but `node:crypto`, because the code runner has no npm packages - and because you can only trust a library's options once you know what each one has to prevent. You will write `sign` and a `verify` that returns a reason code from a fixed list, checked in a fixed order."),
        code("typescript", `
verify(token, key, now, { issuer: "https://api.codedev.test", audience: "codedev-api" });
// -> { ok: true, claims: {...} }  or  { ok: false, reason: "..." }`),
        challenge("chal_coding_nas_142"),

        h2("5. How to verify it"),
        numbered([
            "**Boundary tests with a fake clock.** Sign at a fixed `now`, verify at `exp + 29` (accepted) and at `exp + 30` (rejected). A test that uses the real clock cannot hit the boundary and will be flaky near it.",
            "**Forgery tests.** Build an `alg: none` token, a token whose payload was edited after signing, and one signed with another key. All three must be rejected - and an expired forgery must be rejected as a bad signature, which proves the signature runs first.",
            "**Garbage tests.** Empty string, two parts, four parts, padding characters, a payload that is a JSON array. The guard must answer `401`, never `500`; check the status in the API tests and the absence of stack traces in the logs.",
            "**Logs.** Log the reason code and `sid`, never the token: `auth.reject reason=bad_signature sid=fam_7a1c`. A spike of `unsupported_alg` is someone probing; a spike of `expired` right after deploys points to clocks.",
            "**Decode a real token** from the browser's Network tab with `base64 -d` and confirm that the payload holds only `sub`, `sid`, `iss`, `aud`, `iat`, `exp` - nothing private.",
        ]),

        h2("6. Key rotation with kid (not graded)"),
        p("An HMAC key is shared by every service that signs or verifies, so it must be rotatable. Put a key id in the header (`\"kid\": \"2026-10\"`), keep a small keyset on the verifier, and sign new tokens with the newest key. Keep the old key for verification until every token signed with it has expired - with a 900-second TTL and 30 seconds of leeway that is 930 seconds after the switch - then remove it. `kid` selects a key from **your** keyset; it must never be a file path, URL or SQL fragment that the verifier fetches, and an unknown `kid` is a rejection."),

        h2("7. Common mistakes"),
        bullets([
            "**Letting the header choose the algorithm.** Detect it with a test that sends `alg: none` with an empty signature and one that sends `HS512` signed with the right key: both must be rejected. In library code, look for a verify call without an `algorithms` list.",
            "**Reading claims before the signature.** Rejecting \"expired\" before checking the signature leaks that the parser trusted unsigned data, and a future check (say, a role lookup) will act on forged values. Detect it with an expired token whose signature is wrong: the reason must be the signature.",
            "**Comparing signatures with `===`.** A string comparison can stop at the first different character, which leaks timing. Use `timingSafeEqual` on equal-length buffers; detect `===` and `Buffer.compare` on secrets in code review with a grep.",
            "**Long lifetimes as a convenience.** A 24-hour access token makes logout meaningless for a day. Detect it by reading `exp - iat` from a real token, and alert if it is above the agreed TTL.",
            "**Huge leeway or none at all.** Zero leeway causes random `401`s between servers; minutes of leeway extend every token. Detect skew by logging `now - iat` for fresh tokens on each instance.",
        ]),

        h2("8. Summary"),
        bullets([
            "A signed access token proves who issued it and that it was not changed - not that the session is still alive. Keep it short-lived (900 seconds) and let the refresh token carry the session.",
            "Verify in a fixed order: structure, a pinned algorithm, a constant-time signature check, then `exp`/`nbf` with a small documented leeway, then `iss` and `aud`. Return reasons, never throw.",
            "A short TTL limits damage but revokes nothing; immediate cut-off needs server state (lesson 6), and safe key rotation needs `kid` and an overlap of one token lifetime.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Write a one-page ADR for CodeDev access tokens: the claims (and what is deliberately left out), the TTL and why, the leeway, the algorithm and where the key lives, and the rotation procedure with kid. Then draw the login sequence from POST /v1/auth/login to the first API call, marking which steps hit the database and which only use the key and the clock."),

        h2("Sources"),
        bullets([
            "RFC 7519 JSON Web Token (JWT), section 4.1 (registered claims exp, nbf, iat, iss, aud): https://www.rfc-editor.org/rfc/rfc7519",
            "RFC 8725 JSON Web Token Best Current Practices (algorithm verification, alg none, algorithm confusion): https://www.rfc-editor.org/rfc/rfc8725",
            "Node.js documentation, crypto module: crypto.createHmac and crypto.timingSafeEqual.",
        ]),
    ],
});
