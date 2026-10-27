// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-1-1",
    title: "Sessions or tokens: where the sign-in state lives",
    slug: { _type: "slug", current: "sessions-or-tokens-sign-in-state" },
    description:
        "A learner reset her password after a stolen token was used on her account, and the attacker kept calling the API for another week, because the token was a signed JWT valid for 30 days and nothing on the server could take it back. Learn where sign-in state can live (a server-side session or a self-contained access token), what logout and a password reset really do in each design, why a 15-minute access token plus a rotating refresh token stored in PostgreSQL is a common compromise, and where each value is stored in the browser.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform (NestJS API, PostgreSQL)",
        problem:
            "Learner u_1042 reported submissions she never made. Support asked her to reset her password, which she did on 12 October at 14:05 UTC. The API access log shows requests for u_1042 from an unknown IP address continuing for seven more days, until an engineer rotated the JWT signing key on 19 October, which signed out every user on the platform at once. The token used by the attacker was issued on 3 October and was valid for 30 days.",
    },

    content: [
        h2("1. The incident: a password reset that changed nothing"),
        p("CodeDev's first version of sign-in was written in a hurry and looked clean: the API signs a JWT with the user id, the web app keeps it, and every request sends it back in the `Authorization` header. No session table, no lookups. This is the guard that protected every route:"),
        code("typescript", `
// auth/jwt.guard.ts - the version that shipped
@Injectable()
export class JwtGuard implements CanActivate {
    constructor(private readonly jwt: JwtService) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest<Request>();
        const token = req.headers.authorization?.replace(/^Bearer /, "");
        if (!token) throw new UnauthorizedException();
        // checks the signature and exp - and nothing else
        req.user = await this.jwt.verifyAsync<{ sub: string }>(token);
        return true;
    }
}

// auth/auth.service.ts
signIn(user: User): string {
    return this.jwt.sign({ sub: user.id }, { expiresIn: "30d" });   // "so learners stay signed in"
}`, "jwt.guard.ts"),
        p("The web app stored the token in `localStorage` so it would survive a page reload. On 3 October the learner signed in on a shared computer in a training lab that had a malicious browser extension installed. Any script running in the page, extensions included, can read `localStorage`; the extension copied the token."),
        p("Here is the part that turned a stolen token into a week-long incident. The password reset handler updated the password hash and nothing else. The guard never looks at the database, so it had no way to learn that anything had changed. The token's signature was still valid and its `exp` was still in the future, so for the API it was a perfectly good token until 2 November."),

        h2("2. Read the evidence"),
        p("Start with the token itself. A JWT is three base64url parts separated by dots; the middle part is the JSON payload, readable by anyone, so decoding it needs no key:"),
        code("bash", `
$ echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null; echo
{"sub":"u_1042","iat":1791015120,"exp":1793607120}

$ date -u -d @1791015120; date -u -d @1793607120
Sat Oct  3 08:12:00 UTC 2026
Mon Nov  2 08:12:00 UTC 2026`, "terminal"),
        p("Then line the access log up with the reset. The attacker's requests carry the same token before and after 14:05:"),
        code("text", `
2026-10-12T13:58:20Z GET  /me/progress            200 sub=u_1042 ip=185.220.101.7  tok=…f3Qk
2026-10-12T14:05:41Z POST /auth/password-reset    204 sub=u_1042 ip=113.161.44.20
2026-10-12T14:31:09Z POST /submissions            201 sub=u_1042 ip=185.220.101.7  tok=…f3Qk
2026-10-15T02:12:55Z GET  /me/certificates        200 sub=u_1042 ip=185.220.101.7  tok=…f3Qk
2026-10-19T10:40:00Z (deploy) JWT_SECRET rotated
2026-10-19T10:40:03Z GET  /me/progress            401 sub=-      ip=185.220.101.7  tok=…f3Qk`, "api access log"),
        p("And check what the reset could have revoked. There is no table of issued tokens, so the honest answer is: nothing."),
        code("sql", `
SELECT id, password_changed_at FROM identity.users WHERE id = 'u_1042';
--   id    |  password_changed_at
-- u_1042  | 2026-10-12 14:05:41+00

SELECT count(*) FROM pg_tables WHERE tablename IN ('sessions', 'refresh_tokens');
-- 0`, "psql"),
        p("The only lever left was the one the team pulled on 19 October: rotate the signing key. That invalidates every token ever signed with it, so 40,000 learners were signed out to stop one attacker. When the only way to revoke one token is to revoke all of them, the design has no revocation."),

        h2("3. Where can sign-in state live?"),
        p("After a successful sign-in, every later request has to answer one question: which user is this, and are they still allowed in? There are two places the answer can live."),
        h3("A server-side session"),
        p("The server creates a random, meaningless identifier, stores a row for it (user id, created time, last seen, expiry) and gives the browser only the identifier, usually in a cookie. Each request looks the identifier up. The OWASP Session Management Cheat Sheet asks for identifiers with at least 64 bits of entropy from a cryptographically secure generator; 32 random bytes is a common choice."),
        bullets([
            "**Logout** deletes or marks the row. The very next request with that identifier fails. Logout means what the user thinks it means.",
            "**Password reset** deletes every row for the user: all devices are signed out at once.",
            "**Cost:** one lookup per request (an indexed primary-key read, or a cache in front of it), and every service that needs to know the user must reach that store.",
        ]),
        h3("A self-contained access token"),
        p("The server signs the facts it needs (user id, expiry, issuer, audience) into a token, usually a JWT, and the client sends the token back. Any service with the key can verify it without a lookup."),
        bullets([
            "**Logout** can only delete the client's copy. Every other copy, like the one the extension stole, stays valid until `exp`. A signed token is a promise the server made; it cannot unsay it.",
            "**Password reset** changes nothing for tokens already issued, unless the verifier looks something up, for example a per-user `tokens_valid_after` timestamp compared with `iat`. But a lookup on every request is exactly the cost the token was meant to avoid: at that point you have a session with extra steps.",
            "**Benefit:** verification is local and cheap, which matters when many services, or another company's API, must check the caller without calling back to an auth server.",
        ]),
        callout("info", "When not to use JWTs at all",
            "If one API and one web app on the same site are the only parties, a server-side session in an HttpOnly cookie is the simplest design that works, and it gives you instant logout for free. Reach for self-contained tokens when you have a real need for local verification: several independently deployed services, mobile clients talking to many APIs, or third parties. \"JWTs are modern\" is not a need."),

        h2("4. The compromise: a short access token and a rotating refresh token"),
        p("CodeDev does have a reason to keep access tokens: the submissions grader and the leaderboard service verify the caller without a database round trip. So the fix keeps self-contained access tokens but takes away their power to outlive a decision:"),
        numbered([
            "**The access token lives 15 minutes.** It is still impossible to revoke, but now \"until it expires\" means minutes, not weeks. Lesson 1.3 signs and verifies it with a fake clock.",
            "**A refresh token gets new access tokens.** It is a random opaque value (not a JWT), stored in PostgreSQL as a hash (lesson 2.1), and it is checked against the database on every use. That one lookup every 15 minutes is where revocation happens.",
            "**Each refresh rotates the refresh token.** The old one is marked used and a new one is issued in the same family. A stolen refresh token that is used after the real one has rotated reveals itself (lessons 2.3 and 3.1).",
        ]),
        p("RFC 9700, the OAuth 2.0 Security Best Current Practice, asks for exactly this for clients that cannot keep a secret: refresh tokens must be either sender-constrained or rotated (section 4.14), and the authorization server may revoke them on security events such as a password change or a logout. CodeDev is its own authorization server, but the reasoning is the same."),
        h3("What logout and reset mean now"),
        bullets([
            "**Logout on one device:** revoke that device's refresh token family in PostgreSQL and clear both cookies. The access token on that device keeps working for at most 15 minutes if someone copied it.",
            "**Password reset or \"sign out everywhere\":** revoke every refresh token family of the user. Every device loses access within 15 minutes, without touching anyone else.",
            "**Leaked signing key:** rotating it still signs everyone out, but that is now reserved for a key compromise, not for one stolen token.",
        ]),
        p("The 15 minutes is a trade-off, not a magic number. Shorter means more refresh traffic and more chances for the concurrent-refresh race of lesson 3.2; longer means a longer window after a revocation. If some action cannot accept even 15 minutes of a revoked session (changing the email address, paying, deleting the account), check the session in the database for that route only, or ask for the password again."),
        h3("Where each value is stored"),
        bullets([
            "**Refresh token:** an `HttpOnly; Secure` cookie whose `Path` is limited to the refresh endpoint, so scripts cannot read it and ordinary API requests do not carry it. Lesson 1.2 builds these headers.",
            "**Access token:** for CodeDev, a second `HttpOnly; Secure` cookie, because the web app and the API are on the same site (app.codedev.test and api.codedev.test). An app that must send it to another site keeps it in a JavaScript variable in memory and sends it in the `Authorization` header; it is lost on reload and fetched again with the refresh cookie.",
            "**Never in `localStorage` or `sessionStorage`.** Every script on the origin can read them, which is how the incident started. The OWASP cheat sheet recommends against storing session identifiers there for this reason.",
        ]),

        challenge("chal_quiz_nas_111"),

        h2("5. Worked example: issue, refresh, revoke"),
        p("The table that makes revocation possible. A refresh token is stored only as its SHA-256 hash, so a copy of the table (a backup, a read replica, a log of a slow query) cannot be replayed:"),
        code("sql", `
CREATE TABLE auth.refresh_tokens (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    family_id   uuid        NOT NULL,             -- one family per sign-in on one device
    token_hash  bytea       NOT NULL UNIQUE,      -- sha256(token), never the token itself
    expires_at  timestamptz NOT NULL,             -- for example 30 days after sign-in
    used_at     timestamptz,                      -- set when it is rotated
    revoked_at  timestamptz,                      -- set by logout, reset or replay detection
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_active ON auth.refresh_tokens (user_id) WHERE revoked_at IS NULL;`, "migration.sql"),
        p("The service issues both tokens at sign-in, and the reset handler now has something to revoke:"),
        code("typescript", `
// auth/auth.service.ts
const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_S = 30 * 24 * 60 * 60;

async signIn(userId: string): Promise<IssuedTokens> {
    const now = this.clock.nowSeconds();                       // injected clock: testable
    const refreshToken = randomBytes(32).toString("base64url"); // 256 random bits, opaque
    await this.db.query(
        \`INSERT INTO auth.refresh_tokens (user_id, family_id, token_hash, expires_at)
         VALUES ($1, gen_random_uuid(), $2, to_timestamp($3))\`,
        [userId, sha256(refreshToken), now + REFRESH_TTL_S],
    );
    const accessToken = this.tokens.signAccess({ sub: userId, iat: now, exp: now + ACCESS_TTL_S });
    return { accessToken, refreshToken };
}

// called in the same transaction that updates the password hash
async revokeAllForUser(userId: string): Promise<number> {
    const { rowCount } = await this.db.query(
        \`UPDATE auth.refresh_tokens SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL\`,
        [userId],
    );
    return rowCount ?? 0;
}`, "auth.service.ts"),
        p("Note what is not there: no denylist of access tokens, no lookup in the guard. The guard still verifies access tokens locally, now with a 15-minute `exp`. All the state lives behind the refresh endpoint, which is called a few times an hour per active user instead of on every request."),
        callout("warning", "Revoking in the same transaction",
            "Update the password hash and revoke the refresh tokens in one transaction. If the revoke runs after the commit and fails, the password is new but every old device keeps refreshing for 30 days, and nothing in the response tells you."),

        h2("6. How to verify"),
        bullets([
            "**An end-to-end test with a fake clock.** Sign in at T, reset the password at T+5 min, then: the old access token still works at T+14 min, fails at T+15 min, and the old refresh token fails at T+6 min. This pins the exact window you are accepting.",
            "**A query after a reset.** `SELECT count(*) FROM auth.refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL` must return 0 right after the reset commits.",
            "**Decode a real token.** The payload of an access token issued by the API must show `exp - iat = 900`. A test that decodes the token, without trusting the library's options, catches a config that silently fell back to a default lifetime.",
            "**Search the code for storage.** `localStorage.setItem` or `sessionStorage.setItem` with a token anywhere in the web app is a finding, whatever the comment next to it says.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**A long-lived JWT as the whole session.** `expiresIn: \"30d\"` on the access token. Spot it by decoding a token and subtracting `iat` from `exp`.",
            "**Logout that only deletes the client's copy.** The handler clears a cookie or `localStorage` and returns 204, with no database write. Spot it by copying the token before logout and replaying it with `curl` afterwards.",
            "**A password reset that does not revoke.** Spot it with the query above, or by refreshing with an old refresh token after a reset in a test.",
            "**A denylist lookup on every request.** Checking each access token against a revocation table rebuilds a server-side session with more moving parts. Spot it in the guard; if you need that, use sessions.",
            "**Refresh tokens that never rotate and never expire.** A stolen refresh token is then a permanent session. Spot it in the schema: no `used_at`, no `expires_at`, no family.",
        ]),

        h2("8. Summary"),
        numbered([
            "A server-side session can be revoked instantly; a self-contained token cannot be revoked at all before `exp`. Choose by who needs to verify, and prefer sessions when one API and one app are the only parties.",
            "If you use access tokens, keep them short (minutes) and put revocation behind a refresh token that is opaque, hashed in PostgreSQL, rotated on every use and revoked on logout and password reset.",
            "Keep tokens out of `localStorage`: refresh token in an `HttpOnly; Secure` cookie limited to the refresh path, access token in another such cookie or in memory.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP Session Management Cheat Sheet: session ID entropy, logout and session expiration, HTML5 Web Storage - cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html",
            "RFC 9700, Best Current Practice for OAuth 2.0 Security: section 4.14, Refresh Token Protection - datatracker.ietf.org/doc/html/rfc9700",
            "RFC 7519, JSON Web Token (JWT): section 4.1.4, the exp claim",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "For a login flow you own, write down in one table: where the sign-in state lives, what the logout handler writes to the database, what a password reset revokes, and the longest time a copied credential keeps working after each of them. Then prove one row with a test that replays a token copied before logout."),
    ],
});
