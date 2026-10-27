// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-4-1",
    title: "How to sign out one device or all devices",
    slug: { _type: "slug", current: "sign-out-one-device-or-all-devices" },
    description:
        "A learner's laptop was stolen. She changed her password and pressed \"Sign out of all devices\", and the laptop kept loading her courses for another 14 minutes. Learn what revoking a session actually stops, why a password change must revoke every refresh token family, how to list a user's sessions with device and last use, and how to make access tokens of a revoked session fail before they expire with a session version and a deny list whose size you can bound.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on the CodeDev auth service",
        problem:
            "Support ticket #4471: a learner's laptop was stolen from a café at 13:50 while she was signed in to https://app.codedev.test. At 14:01 she changed her password from her phone, and at 14:02 she pressed \"Sign out of all devices\" in Settings. The API logs of https://api.codedev.test show requests from the laptop's session after both actions: a token refresh at 14:01:30, and course progress and certificate downloads at 14:06 and 14:12, all answered 200. The laptop only got 401 at 14:16. She asks a fair question: \"What does that button do, then?\"",
    },

    content: [
        h2("1. The incident: \"Sign out of all devices\" took 14 minutes"),
        p("The Sessions feature was built in a sprint. Two handlers matter here. The password change only replaced the hash; the sign-out-all button revoked the refresh tokens:"),
        code("typescript", `
// auth/password.service.ts - as shipped
async changePassword(userId: string, newPassword: string) {
  const hash = await argon2.hash(newPassword);
  await this.db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, userId]);
}

// auth/sessions.service.ts - as shipped
async revokeAll(userId: string) {
  await this.db.query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId],
  );
}`, "as shipped"),
        p("Both look reasonable in review. Put them next to the log of the laptop's session (`fam_812`) and you see two separate gaps:"),
        code("text", `
13:58:31 POST /auth/refresh          200  sid=fam_812 device=laptop   (before the theft)
14:01:02 POST /me/password           204  sid=fam_907 device=phone
14:01:30 POST /auth/refresh          200  sid=fam_812 device=laptop   <- password change revoked nothing
14:02:15 POST /sessions/revoke-all   204  sid=fam_907                 (3 rows revoked)
14:06:40 GET  /courses/42/progress   200  sid=fam_812 iat=14:01:30 exp=14:16:30
14:12:10 GET  /me/certificates       200  sid=fam_812 iat=14:01:30 exp=14:16:30
14:16:40 GET  /me/certificates       401  token_expired
14:16:41 POST /auth/refresh          401  refresh_token_revoked`, "api.codedev.test access log, user u_5521"),
        bullets([
            "**Gap 1, the password change.** Changing the password did not touch `refresh_tokens`, so the thief's refresh token kept working. A password change is the moment the user tells you \"someone else may have my credentials\"; every existing session has to end.",
            "**Gap 2, the access token.** Sign-out-all revoked the rows at 14:02:15, which stopped the next refresh. But the laptop already held an access token issued at 14:01:30, valid until 14:16:30, and the guard only checks the signature and `exp`. For 14 minutes the server had no way to say no.",
        ]),

        h2("2. Read the evidence"),
        p("Start with the table. Each sign-in on a device starts a **family**; every rotation adds a row to it (lesson 2.3). Grouping by family shows the user's sessions and what revocation did to them:"),
        code("sql", `
SELECT family_id, device_id,
       min(created_at)                                   AS signed_in_at,
       max(created_at)                                   AS last_refresh_at,
       count(*) FILTER (WHERE revoked_at IS NULL)        AS live_rows
  FROM refresh_tokens
 WHERE user_id = 'u_5521'
 GROUP BY family_id, device_id
 ORDER BY last_refresh_at DESC;

 family_id | device_id | signed_in_at | last_refresh_at | live_rows
-----------+-----------+--------------+-----------------+-----------
 fam_907   | phone     | 09:12:44     | 14:00:51        | 0
 fam_812   | laptop    | 08:03:10     | 14:01:30        | 0
 fam_655   | tablet    | (3 days ago) | (yesterday)     | 0`, "psql"),
        p("All three families are revoked, as intended. Now decode the laptop's last access token (the payload is base64url JSON; never paste a production token into a website, decode it locally):"),
        code("bash", `
node -e 'const [, p] = process.argv[1].split("."); console.log(JSON.parse(Buffer.from(p, "base64url")))' "$TOKEN"

{ sub: 'u_5521', sid: 'fam_812', ver: 3, iat: 1793023290, exp: 1793024190 }`, "terminal"),
        p("`exp - iat` is 900 seconds: 15 minutes. Nothing in this token, and nothing the guard checks, changed at 14:02. That is the whole bug: the revocation was written to a place the request path never reads."),

        h2("3. Core idea: revocation has to reach the request path"),
        p("Users expect three operations, and each one must stop both kinds of token:"),
        bullets([
            "**Sign out this device.** End one family: the one in the access token's `sid` claim.",
            "**Sign out one session from the list.** The same, for a family chosen from the Sessions page. The handler must check that the family belongs to the caller; otherwise any signed-in user can end anyone's session by guessing ids.",
            "**Sign out of all devices**, and the same thing after a password change, a password reset or an admin lock: end every family of the user.",
        ]),
        p("Ending the refresh side is easy: set `revoked_at` on the family's rows, and the refresh handler already rejects revoked rows. The access side is the hard part, because a signed access token is valid by itself until `exp`. You have four options, from simplest to most work:"),
        numbered([
            "**Accept the gap.** If access tokens live 5 minutes and nothing behind them is sensitive, \"signed out within 5 minutes\" may be fine. Write it down as a decision. CodeDev serves paid courses, certificates and account settings, so 15 minutes of a thief's access was not fine.",
            "**Look the session up on every request.** Read the family's state from Postgres in the guard. Correct and simple, but it costs one query per API call, which is what short-lived tokens were meant to avoid (lesson 1.1).",
            "**A session version per user.** `users.session_version` is a counter. Access tokens carry the value at issue time as `ver`. Sign-out-all increments it, and the guard rejects `ver` lower than the current value. One counter revokes every token of the user at once, with no entry per token.",
            "**A deny list of revoked families.** For one device, add the family id to a short list the guard checks. The trick that keeps it small: an entry only has to live as long as the access tokens it blocks.",
        ]),
        p("CodeDev uses 3 and 4 together. The rule fits in four lines, and you will implement it in the challenge:"),
        code("text", `
on every request:      now >= exp                      -> 401 expired
                       ver <  session_version(sub)     -> 401 revoked   (sign out all)
                       sid in deny list                -> 401 revoked   (sign out one)
deny-list entry:       added at revocation time T, dropped at T + access token lifetime`, "the rule"),
        h3("Why T + 15 minutes is enough"),
        p("After the family's rows are revoked at time T, it can never refresh again, so no new access token is issued for it. Every access token it already has was issued at or before T and expires at most 15 minutes after it was issued, so by T + 15 minutes all of them fail the `exp` check by themselves. The entry can go. That bounds the deny list by the number of single-device sign-outs in the last 15 minutes, not by the number of users or sessions you have ever had."),
        callout("warning", "Clock skew and caches widen the window",
            "If your guard accepts tokens up to 30 seconds past exp to tolerate clock skew (lesson 1.3), keep the entry for 15 minutes plus those 30 seconds. If each API instance caches the deny list or the session versions and reloads them every 10 seconds, a revocation takes up to 10 seconds to reach every instance: that delay is part of your answer to \"how fast does sign-out work\", so measure and document it."),
        h3("When not to build this"),
        p("If your API is a single process with a session table that is already read on every request (a classic server-side session, lesson 1.1), you do not need versions or deny lists: deleting the session row is the revocation. And if you cannot keep a shared store available, a deny list that silently stops working is worse than an honest, short access token lifetime. Choose the simplest design whose worst case you can state in one sentence."),

        challenge("chal_quiz_nas_411"),

        h2("4. Worked example: the Sessions module in NestJS"),
        p("The schema needs one column on `users` and an index that matches how sessions are read:"),
        code("sql", `
ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;

-- GET /sessions and sign-out-all read the user's live rows
CREATE INDEX refresh_tokens_user_live_idx
    ON refresh_tokens (user_id, family_id)
 WHERE revoked_at IS NULL;`, "migration"),
        p("Revoking one family checks ownership inside the same statement, so there is no gap between \"is it yours\" and \"revoke it\". The deny-list entry is written with an expiry, so Redis drops it by itself:"),
        code("typescript", `
// sessions/sessions.service.ts
const ACCESS_TTL_MS = 15 * 60_000;
const SKEW_MS = 30_000;

@Injectable()
export class SessionsService {
  constructor(private readonly db: Pool, private readonly redis: RedisClientType) {}

  /** Returns false when the family does not exist or is not the caller's: the controller answers 404. */
  async revokeFamily(userId: string, familyId: string): Promise<boolean> {
    const owned = await this.db.query(
      "SELECT 1 FROM refresh_tokens WHERE family_id = $1 AND user_id = $2 LIMIT 1", [familyId, userId]);
    if (owned.rowCount === 0) return false;
    const { rowCount } = await this.db.query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND user_id = $2 AND revoked_at IS NULL",
      [familyId, userId]);
    if (rowCount > 0) {
      await this.redis.set(\`deny:\${familyId}\`, "1", { PX: ACCESS_TTL_MS + SKEW_MS });
    }
    return true;
  }

  /** Sign out of all devices. Also called by changePassword and resetPassword, in their transaction. */
  async revokeAll(client: PoolClient, userId: string): Promise<void> {
    await client.query("UPDATE users SET session_version = session_version + 1 WHERE id = $1", [userId]);
    await client.query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
  }

  /** After the commit: copy the new version to where the guard reads it. */
  async cacheVersion(userId: string): Promise<number> {
    const { rows } = await this.db.query("SELECT session_version FROM users WHERE id = $1", [userId]);
    await this.redis.set(\`ver:\${userId}\`, String(rows[0].session_version));
    return rows[0].session_version;
  }
}`, "sessions.service.ts"),
        p("The password change now ends every session in the same transaction that replaces the hash: if one fails, neither happens. (Many products then sign the current device in again with a fresh family, so the user who changed the password is not thrown out; that is a product choice, made after the revocation, not instead of it.)"),
        code("typescript", `
// auth/password.service.ts - fixed
async changePassword(userId: string, newPassword: string) {
  const hash = await argon2.hash(newPassword);
  await this.db.transaction(async (client) => {
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, userId]);
    await this.sessions.revokeAll(client, userId);
  });
  await this.sessions.cacheVersion(userId);
}`, "password.service.ts"),
        p("The guard does the two cheap checks after the signature and `exp`. Reading `session_version` from Postgres on every request would bring back the per-request query, so it is cached in Redis next to the deny list. A missing key is not \"version 0\": an evicted key would let revoked tokens back in, so a miss reloads the value from Postgres:"),
        code("typescript", `
// auth/access.guard.ts (after verifying the signature and exp, lesson 1.3)
const [version, denied] = await this.redis.mGet([\`ver:\${claims.sub}\`, \`deny:\${claims.sid}\`]);
const current = version !== null ? Number(version) : await this.sessions.cacheVersion(claims.sub);
if (claims.ver < current) throw new UnauthorizedException("session_revoked");
if (denied !== null) throw new UnauthorizedException("session_revoked");`, "access.guard.ts"),
        p("One round trip, two keys, constant cost per request. The Sessions page reads the families with the query from section 2, keeping only families with a live row (not used, not revoked, not expired) and marking the caller's own `sid` as \"this device\". `last_refresh_at` is the time of the last rotation; that is precise enough for \"last active 3 hours ago\" and costs no write per API call."),
        code("typescript", `
// sessions/sessions.controller.ts
@Get()               list(@Claims() c: AccessClaims)                       { return this.sessions.list(c.sub, c.sid); }
@Delete("current")   @HttpCode(204) async signOut(@Claims() c: AccessClaims) { await this.sessions.revokeFamily(c.sub, c.sid); }
@Delete(":familyId") @HttpCode(204) async signOutOne(@Claims() c: AccessClaims, @Param("familyId") id: string) {
  if (!(await this.sessions.revokeFamily(c.sub, id))) throw new NotFoundException();
}
@Post("revoke-all")  @HttpCode(204) async signOutAll(@Claims() c: AccessClaims) {
  await this.db.transaction((client) => this.sessions.revokeAll(client, c.sub));
  await this.sessions.cacheVersion(c.sub);
}`, "sessions.controller.ts"),
        callout("info", "404, not 403, for someone else's session",
            "Answering 403 to DELETE /sessions/fam_123 tells the caller that fam_123 exists and belongs to someone. 404 says the same thing as for an id that never existed, and the handler changes nothing in both cases."),

        h2("5. Build it with a fake clock"),
        p("The challenge gives you the refresh token table in memory, sign-in, and rotation with replay detection from module 3 (a replayed token calls your `revokeFamily`). You write the five functions the Sessions feature needs: `revokeFamily`, `signOutAll`, `checkAccess`, `pruneDenyList` and `listSessions`. The tests run a scripted day on a fake clock in minutes: sign-ins on several devices, refreshes, API calls with old and new access tokens, sign-outs, password changes, and the deny list as it fills and empties."),
        challenge("chal_coding_nas_412"),

        h2("6. How to verify revocation"),
        bullets([
            "**Unit tests with a fake clock.** Sign in on two devices, sign one out, then call the API with both access tokens at once, at +14 minutes and at +15 minutes. The signed-out token must fail at once; the other one must keep working. Without a fake clock nobody waits 15 minutes in a test, which is how the incident shipped.",
            "**An end-to-end check with curl.** Keep the access token of device A in a variable, sign out of all devices from device B, then repeat a request with A's token: it must answer 401 immediately, not at `exp`.",
            "**SQL after a password change.** `SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL` must be 0 (or 1, if you sign the current device back in).",
            "**A metric for the deny list.** Export its size (for Redis, count the `deny:*` keys with SCAN in a background job, never KEYS in production). It should rise and fall with sign-outs over 15 minutes. A line that only goes up means entries never expire.",
            "**An ownership test.** User A deletes a family of user B: 404, and B's next request still succeeds.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Revoking only the refresh tokens and calling it sign-out.** The access token keeps working until `exp`. Spot it: a test that calls the API right after sign-out with the old access token gets 200.",
            "**A password change that does not end sessions.** Spot it: the password handler has no query on `refresh_tokens` and no version bump; the log shows a refresh from another device after the change.",
            "**Signing out one device by bumping the user's version.** It works, but it signs out every device: the learner presses Sign out on the old tablet and the phone in her hand is signed out too. Spot it: one-device sign-out writes to `users`.",
            "**Deny-list entries that live as long as refresh tokens, or forever.** The list grows with every sign-out and every request pays for it. Spot it: a deny-list TTL equal to the refresh token lifetime, or no TTL at all, and a size metric that only goes up.",
            "**No ownership check on DELETE /sessions/:id.** Any signed-in user can end anyone's session. Spot it: an UPDATE with `WHERE family_id = $1` and no `user_id` condition.",
        ]),

        h2("8. Summary"),
        numbered([
            "Revoking refresh token rows stops the next refresh; it does not stop access tokens already issued. Revocation has to reach something the request path reads.",
            "A session version per user ends every session at once (sign out all, password change, reset); a deny list of families ends one, and each entry only needs to live for one access token lifetime plus skew.",
            "Check ownership when a family id comes from the client, list sessions per family with device and last refresh, and prove all of it with fake-clock tests that use an old access token right after the sign-out.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9700, Best Current Practice for OAuth 2.0 Security: section 4.14 (refresh token protection: rotation and revocation) - datatracker.ietf.org/doc/html/rfc9700",
            "OWASP Session Management Cheat Sheet: session expiration and logout - cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write down the worst case of your own sign-out in one sentence (\"a signed-out device can still call the API for at most N seconds because ...\") and measure it: sign out, then replay the old access token every second until it fails. Then add the \"sign the current device back in after a password change\" behaviour and a test that proves every other device is still signed out."),
    ],
});
