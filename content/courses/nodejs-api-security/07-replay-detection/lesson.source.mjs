// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-3-1",
    title: "Replay detection: an old refresh token revokes the family",
    slug: { _type: "slug", current: "replay-detection-old-refresh-token-revokes-family" },
    description:
        "A refresh token copied from a learner's laptop was used by an attacker first. When the learner's own app later presented the old token, the API answered 401, the learner signed in again, and the attacker's chain of rotated tokens kept working for nine days. Learn why a reused refresh token proves that two parties hold copies, why the only safe answer is to revoke the whole family and record a security event, and how a short, device-bound grace window keeps network retries from signing learners out.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on the sign-in team, CodeDev learning platform",
        problem:
            "Support escalates a ticket from learner u_4127: \"I was signed out on my laptop on 20 October and had to sign in again. Today my profile shows a GitHub link I never added.\" The audit log shows the profile change came from an IP address the learner has never used, through a refresh token family that has been rotating every 15 minutes for nine days. The family started on the learner's laptop. Since lesson 2.3 every refresh rotates the token and keeps the used row, but when a used token comes back the API only answers 401 and does nothing else.",
    },

    content: [
        h2("1. The incident: the old token came back, and nobody listened"),
        p("Rotation (lesson 2.3) gives every refresh a new token and marks the old row as used. That makes a stolen refresh token short-lived in one sense: the moment either party refreshes, the other party's copy is used. But someone has to notice when a used copy comes back. Here is the branch that handled it on 20 October:"),
        code("typescript", `
// auth/auth.service.ts (before this lesson)
async refresh(token: string, deviceId: string): Promise<RefreshResult> {
  const row = await this.tokens.findByHash(sha256(token));
  if (!row || row.revokedAt) throw new UnauthorizedException();
  if (this.clock.now() >= row.expiresAt) throw new UnauthorizedException();
  if (row.usedAt) throw new UnauthorizedException("refresh token already used");
  return this.rotate(row);
}`, "auth.service.ts"),
        p("The code is not wrong about the token: a used token must not be accepted. It is wrong about what the event means. A used token presented again is not a client bug to reject quietly; it is the one moment the server learns that a token was copied. This lesson turns that moment into an alarm with a defined response."),

        h2("2. Read the evidence"),
        p("Three pieces of evidence were attached to the ticket. Read them in order of time and note who held which token."),
        code("text", `
2026-10-19 21:02  laptop-4127  browser extension "PDF Tools Pro" installed (endpoint log, learner's laptop)
2026-10-20 02:13  POST /auth/refresh token_id=r_311 device=laptop-4127 ip=198.51.100.23 -> 200 issued=r_312
2026-10-20 02:28  POST /auth/refresh token_id=r_312 device=laptop-4127 ip=198.51.100.23 -> 200 issued=r_313
2026-10-20 08:05  POST /auth/refresh token_id=r_311 device=laptop-4127 ip=203.0.113.77  -> 401 refresh token already used
2026-10-20 08:06  POST /auth/login   user=u_4127 device=laptop-4127 ip=203.0.113.77     -> 200 family=f_9 (new)
...
2026-10-29 10:41  PATCH /me/profile user=u_4127 ip=198.51.100.23 github=... (family f_4, token r_1173)`, "api.codedev.test, filtered by user u_4127"),
        code("sql", `
SELECT id, device_id, used_at, revoked_at, replaced_by
FROM refresh_tokens WHERE family_id = 'f_4' ORDER BY created_at;

  id    | device_id   | used_at          | revoked_at | replaced_by
 r_311  | laptop-4127 | 2026-10-20 02:13 |            | r_312
 r_312  | laptop-4127 | 2026-10-20 02:28 |            | r_313
 ...
 r_1173 | laptop-4127 |                  |            |           -- live, held by 198.51.100.23`, "psql, production read replica"),
        bullets([
            "The extension copied the browser's cookies on the evening of the 19th, including the refresh cookie with `r_311` and the device id cookie. The device id is a value the client sends, so the attacker could send it too.",
            "At 02:13 the attacker refreshed first. From then on the attacker held the live end of family `f_4`, and the learner's laptop held a used token.",
            "At 08:05 the learner opened the laptop. The app presented `r_311`, the server answered 401, and the app sent the learner to the sign-in page. The learner signed in and got a new family, `f_9`. Nobody looked at `f_4` again.",
            "For nine days the attacker refreshed every 15 minutes, and each refresh was a perfectly valid rotation.",
        ]),
        p("The 08:05 request was the alarm. It carried a token that the server knew had been used five hours earlier, from a different IP address, and the server threw that information away."),

        h2("3. Core idea: a reused token means two holders"),
        p("With rotation, every refresh token is meant to be presented exactly once. If a used token is presented again, at least two parties held a copy of it. That is a fact the server can rely on. What the server cannot know is **which** party is the real learner:"),
        bullets([
            "If the attacker refreshed first (the incident), the learner presents the old token and the attacker holds the live one.",
            "If the learner refreshed first, the attacker presents the old token and the learner holds the live one.",
        ]),
        p("Both cases look the same from the server: an old row of the family comes back, and somebody holds the newest row. Revoking the presented token does nothing, because it is already used. The only response that is safe in both cases is to **revoke the whole family**: every row, including the live one, so that whoever holds it is signed out on their next refresh. The real learner signs in again with a password or passkey, which the attacker does not have, and gets a fresh family. OAuth's security best practice (RFC 9700) describes refresh token rotation with exactly this reasoning: the server cannot tell which party submitted the invalidated token, so it revokes the active one."),
        p("Revocation alone is not the whole response. Record a **security event** with the family, the presented row, the device id, the IP and the time. That event is what lets support answer a ticket like u_4127's in minutes, feeds an alert when the same user or IP shows up repeatedly, and is the input for stronger policies (some teams also sign the user out of every device on a replay; lesson 4.1 shows how)."),
        h3("When replay detection does not help"),
        bullets([
            "**The real client never comes back with the old token.** If the learner had not opened the laptop for two weeks, there would have been no reuse to detect. Rotation detects theft only when both parties use the family. That is why refresh tokens also need an absolute lifetime and an idle timeout (lesson 2.3).",
            "**Used rows are deleted.** Detection needs the used row and its `family_id`. A rotation that deletes the old row makes a reused token look like an unknown token, and unknown tokens get a plain 401.",
            "**Access tokens already issued.** Revoking a family stops the next refresh. An access token the attacker already has stays valid until it expires (15 minutes in this course, lesson 1.3). Keep access tokens short, and check the family on sensitive actions such as changing the email.",
            "**It is not a reason to store tokens where scripts can read them.** Detection is the second line of defence. The first is keeping the token out of reach: HttpOnly cookies (lesson 1.2) and no XSS (lesson 3.3).",
        ]),

        h2("4. False alarms: the response that never arrived"),
        p("Turn on revocation and the next morning a different ticket arrives: learners on slow mobile networks are signed out several times a day. The cause is ordinary. The phone sends `POST /auth/refresh`, the server rotates the token, and the response is lost or the client's timeout fires first. The client retries with the token it still has, which is now used. Without care, that retry is a replay, and the learner is signed out everywhere for having a bad connection."),
        p("The fix is a short **grace window**: a reuse is treated as a retry, not a replay, when **all** of these hold:"),
        numbered([
            "It comes from the same device as the row (`device_id`).",
            "It arrives less than 10 seconds after the row's `used_at` (choose the value from your client's timeout and retry policy, and document it).",
            "The successor recorded in `replaced_by` has not been used or revoked yet. If the successor was already used, the client that holds it has moved on; an old token arriving now is a second holder, not a retry.",
        ]),
        p("In the window, the server answers with **the successor it already issued**, not with a new token. Issuing a fresh token on every retry would put two live tokens in one family, and a family with two live branches is exactly what replay detection is supposed to prevent. To answer with the same token, the server keeps the successor's plaintext for the length of the window only, for example in a Redis key `refresh:reply:<token_id>` with a 10-second TTL, encrypted with a server key if the Redis instance is shared. The database still stores only hashes."),
        callout("warning", "The grace window is a trade-off, keep it small",
            "The device id is sent by the client, so an attacker who copied it can claim to be the same device. Inside the window, such an attacker receives the same successor as the real client: no fork, and the next rotation by either party makes the other's copy a detectable reuse. The cost of the window is a delay of one rotation in detection. That is acceptable for 10 seconds and not for 10 minutes."),

        challenge("chal_quiz_nas_311"),

        h2("5. Worked example: the reuse branch in NestJS and SQL"),
        p("The rotation path keeps its compare-and-swap from lesson 2.3: the `UPDATE` only succeeds while `used_at` is still `NULL`, and `RETURNING` tells the code whether it won. Lesson 3.2 shows why that matters when two requests arrive together. The new part is what happens to a used row. Three SQL statements do the work:"),
        code("sql", `
-- 1. claim the token (compare-and-swap): one row back = this request rotates it
UPDATE refresh_tokens
SET used_at = now()
WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL
RETURNING id;

-- 2. replay: revoke every row of the family, the live one included
UPDATE refresh_tokens
SET revoked_at = now()
WHERE family_id = $1 AND revoked_at IS NULL;

-- 3. replay: keep the evidence
INSERT INTO security_events (type, user_id, family_id, token_id, device_id, ip, created_at)
VALUES ('refresh_token_reuse', $1, $2, $3, $4, $5, now());`, "refresh-tokens.sql"),
        p("Rotation must also refuse to insert a successor into a revoked family, so that a rotation running at the same moment as a revocation cannot leave a live token behind. In SQL that is the job of the transaction around the rotation (lesson 3.2 returns to it); in the exercise, the store's `issue` returns `null` for a revoked family."),
        p("The controller maps the outcome to HTTP. Note that a replay clears the refresh cookie and answers like any other invalid token: the client should not learn that it tripped an alarm, and the attacker should not learn which of their copies was detected."),
        code("typescript", `
// auth/auth.controller.ts
@Post("refresh")
@HttpCode(200)
async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
  const result = await this.auth.refresh({
    token: req.cookies["rt"] ?? "",
    deviceId: String(req.headers["x-device-id"] ?? ""),
    now: this.clock.now(),
  });
  switch (result.status) {
    case "rotated":
    case "grace":            // same successor as the first response: the cookie ends up identical
      res.cookie("rt", result.token, REFRESH_COOKIE);   // HttpOnly; Secure; SameSite=Strict; Path=/auth
      return { accessToken: result.accessToken };      // a new 15-minute access token (lesson 1.3)
    case "replay_detected":  // family revoked and event recorded inside the service
    case "revoked":
    case "expired":
    case "invalid":
      res.clearCookie("rt", REFRESH_COOKIE);
      throw new UnauthorizedException();
  }
}`, "auth.controller.ts"),
        p("The service decides which status to return. The order of the checks matters: unknown, revoked and expired tokens are answered before the used check, so a token from a family that was already revoked does not record a second event, and an expired token is never treated as a replay. For a used row, check the cheap grace conditions first and let everything else fall through to the alarm:"),
        code("typescript", `
private async onReuse(row: RefreshTokenRow, req: RefreshRequest): Promise<RefreshResult> {
  // 1. same device, inside the window, successor still unused -> answer with the stored successor
  // 2. anything else -> revokeFamily(row.familyId), record the security event, "replay_detected"
}`, "auth.service.ts"),
        p("Write the whole refresh, rotation and reuse together, against an in-memory table whose methods are the SQL statements above. Times come from a fake clock, so the window boundary can be tested to the millisecond:"),
        challenge("chal_coding_nas_312"),

        h2("6. How to verify replay detection"),
        bullets([
            "**Unit tests with a fake clock, as in the exercise.** Rotate, present the old token from another device, then assert three things: the answer is a replay, every row of the family has `revoked_at`, and the live token is refused on the next refresh. A test that only checks the 401 passes on the code from section 1.",
            "**The window boundary.** One test just inside the window (9,999 ms, same device, successor unused) and one at exactly 10,000 ms. Off-by-one windows are the most common bug here.",
            "**The database after a staged attack on staging.** Copy the `rt` cookie from DevTools > Application > Cookies, refresh in the app, then send the copied cookie with curl. Then run `SELECT id, used_at, revoked_at FROM refresh_tokens WHERE family_id = $1`: every row must have `revoked_at`.",
            "**The security event and its alert.** `SELECT * FROM security_events WHERE type = 'refresh_token_reuse' ORDER BY created_at DESC LIMIT 20` should show the staged attack with device and IP, and your alerting should page on a burst of them.",
            "**False alarms in production.** After the release, count reuse events per day and look at the gaps between `used_at` and the reuse. Many reuses a few seconds after the rotation, from the same device, mean the window is too short or the client retries too slowly.",
        ]),
        code("bash", `
# staging: present a refresh cookie that was already rotated
curl -i -X POST https://api.codedev.test/auth/refresh \\
  -H "Cookie: rt=$OLD_RT" -H "X-Device-Id: laptop-4127"

HTTP/1.1 401 Unauthorized
Set-Cookie: rt=; Path=/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`, "terminal"),

        h2("7. Common mistakes"),
        bullets([
            "**Revoking only the presented token.** It is already used, so this changes nothing, and the live end of the family keeps working. Spot it: after a staged replay, the newest row of the family has no `revoked_at`.",
            "**Deleting used rows during rotation.** Without the old row there is no family to revoke and no way to tell a replay from garbage. Spot it: each family has exactly one row in `refresh_tokens`, or the rotation code contains `DELETE FROM refresh_tokens`.",
            "**A grace window that issues a new token.** Every retry then adds a live branch to the family, and replay detection goes blind for that family. Spot it: more than one row with `used_at IS NULL AND revoked_at IS NULL` in a family.",
            "**A window that is long or ignores the device.** A 10-minute window, or one that accepts any device, turns a stolen token into a free pass for that long. Spot it: read the condition; a test with another device inside the window must report a replay.",
            "**Revoking silently.** No event, no alert: the next ticket like u_4127's takes days again. Spot it: a staged replay on staging leaves no row in `security_events`.",
        ]),

        h2("8. Summary"),
        numbered([
            "With rotation, a used refresh token presented again proves that two parties hold copies, but not which one is real: revoke the whole family, record a security event, and let the real learner sign in again.",
            "Separate replays from network retries with a short, documented grace window: same device, a few seconds, successor unused, and answer with the successor already issued, never a new one.",
            "Verify with a fake clock and the database: the family's rows are all revoked, the live token is refused, the event exists, and the window boundary behaves to the millisecond.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9700, Best Current Practice for OAuth 2.0 Security: refresh token protection, rotation and replay - datatracker.ietf.org/doc/html/rfc9700",
            "OWASP Session Management Cheat Sheet: session expiration, renewal and logging of anomalies - cheatsheetseries.owasp.org",
            "PostgreSQL documentation: UPDATE ... RETURNING",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the alert rule for refresh_token_reuse events: what counts as one incident (per family? per user per hour?), which fields the on-call engineer needs to see (user, device, the two IP addresses, the gap between used_at and the reuse), and when a burst should page someone. Then write the two-sentence message the learner sees after a replay signs them out, without telling an attacker what was detected."),
    ],
});
