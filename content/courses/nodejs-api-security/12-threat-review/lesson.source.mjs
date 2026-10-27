// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-4-3",
    title: "A threat review for the sign-in flow",
    slug: { _type: "slug", current: "threat-review-for-the-sign-in-flow" },
    description:
        "Over one weekend, 37 CodeDev accounts were taken over through a login form whose rate limits were never reached, and nobody noticed until Monday. Learn to run a practical threat review of a whole sign-in flow: walk each step, ask what can go wrong, what stops it and how you would know. Covers token theft from logs, backups and XSS, replay, brute force and credential stuffing, session fixation, account recovery as the weakest link, and the events worth monitoring: refresh replays and sign-ins from new devices.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer leading the security review of CodeDev sign-in",
        problem:
            "On Monday morning support has 14 tickets from learners who cannot sign in: their email address was changed on Saturday night, and the password reset mail goes to an address they do not own. Two more learners say a support agent \"helped\" someone recover their account over chat. The dashboards for https://api.codedev.test were green all weekend: error rate and latency normal, login endpoint answering 401 and 200 as designed. Every individual piece worked; the flow as a whole did not. The team is asked for a threat review of sign-in before the next release.",
    },

    content: [
        h2("1. The incident: every control passed, the accounts were still lost"),
        p("Reconstructed from the auth events table, the weekend looked like this:"),
        code("text", `
Sat 02:00-05:00  41,200 failed logins (a normal night: about 900), 3,912 source IPs
                 max 6 failures per IP per 15 min (limit: 20), max 2 per account (limit: 10)
                 37 successful logins from an IP and device never seen for that account
Sat 05:10-06:30  9 of those accounts: PATCH /me/email   200   (no password asked, no mail to the old address)
                 then POST /auth/forgot-password -> reset link sent to the new address
Sun 14:22        support chat: "I lost access, my courses are Node and SQL" -> agent changes the email
Mon 08:00        14 tickets: "my email was changed"`, "timeline from auth_events and support logs"),
        p("This is **credential stuffing**: email and password pairs leaked from other websites, tried slowly from thousands of addresses so that no per-IP or per-account limit trips. The learners who reused a password lost their account. Then the attacker used the weakest part of the flow, changing the email and recovering through it, to keep the accounts. Nothing alerted, because nothing was looking at the flow; each endpoint was monitored only for errors."),
        p("A threat review is how you find these gaps before an attacker does: not a document for an auditor, but an afternoon in which you walk through the flow step by step and ask three questions at each step."),

        h2("2. Read the evidence"),
        p("Every step of the sign-in flow writes one row to an `auth_events` table (section 5 shows the schema). The incident shows up in a single query that compares the attack window with a normal night:"),
        code("sql", `
SELECT date_trunc('hour', at)                            AS hour,
       count(*) FILTER (WHERE type = 'login_failed')     AS failed,
       count(*) FILTER (WHERE type = 'login_succeeded')  AS ok,
       count(*) FILTER (WHERE type = 'login_succeeded' AND new_device) AS ok_new_device,
       count(DISTINCT ip)                                AS ips,
       count(*) FILTER (WHERE type = 'login_failed' AND user_id IS NULL) AS unknown_email
  FROM auth_events
 WHERE at >= '2026-10-24 00:00' AND at < '2026-10-24 08:00'
 GROUP BY 1 ORDER BY 1;

        hour         | failed | ok  | ok_new_device | ips  | unknown_email
---------------------+--------+-----+---------------+------+---------------
 2026-10-24 01:00    |    112 |  64 |             3 |  141 |            31
 2026-10-24 02:00    |  13650 |  51 |            14 | 1987 |         13180
 2026-10-24 03:00    |  14020 |  48 |            12 | 2044 |         13540
 2026-10-24 04:00    |  13530 |  39 |            11 | 1902 |         13060
 2026-10-24 05:00    |     98 |  42 |             2 |  133 |            25`, "psql"),
        p("Three signals that no endpoint-level dashboard shows: failures jump by two orders of magnitude, almost all of them are for emails that are not CodeDev accounts (a leaked list from somewhere else), and successful logins from new devices jump with them. The fourth signal is in the timeline: email changes right after a new-device login."),

        h2("3. Core idea: walk the flow, ask three questions per step"),
        p("STRIDE (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege) is a useful checklist of *kinds* of threat. Used as a form to fill in, it produces long documents nobody reads. A practical version for one flow is shorter:"),
        numbered([
            "**Draw the flow** as a sequence: browser, API, database, mail, support. Include the unhappy paths: forgot password, change email, sign out, refresh failure.",
            "**List the assets**: the password, the access token, the refresh token, reset tokens, the email address (it is the key to recovery), and the session list.",
            "**At each step ask**: what can go wrong here (use STRIDE as a prompt), what stops it today (point at code, config or a test, not at an intention), and how would we know it happened (an event, a metric, an alert).",
            "**Write one row per threat** with an owner and a decision: fix now, accept with a reason, or monitor. A review without decisions is a list of worries.",
        ]),
        callout("info", "When not to do this",
            "Do not threat-model every endpoint. Review a flow when you build it, when you change it (new login method, new token storage, a new subdomain), and after an incident. The sign-in flow deserves it because every other control in the product trusts its result."),

        h2("4. The review, step by step"),
        h3("Token theft: logs, backups, XSS"),
        p("Tokens leak where they are copied. Search for every place a token is **written**, not just where it is used:"),
        bullets([
            "**Logs and error reports.** Request loggers record headers; since tokens moved into cookies (lesson 4.2), the Cookie and Set-Cookie headers carry them. Redact by allowlist (log only the headers you need) rather than by denylist, and never put a token in a URL: URLs end up in access logs, browser history and Referer headers.",
            "**Backups and replicas.** Refresh tokens are stored as SHA-256 hashes (lesson 2.1), so a backup holds nothing that works. Reset tokens and email verification tokens deserve the same treatment and often do not get it.",
            "**XSS.** HttpOnly cookies keep scripts from copying tokens (lesson 4.2), but an injected script can still act in the open tab. Output escaping and a Content Security Policy are what stop it; HttpOnly limits the damage.",
        ]),
        h3("Replay"),
        p("A stolen refresh token is used a second time. Rotation with token families makes the second use visible: the old token comes back after it was rotated, the family is revoked (lesson 3.1), and concurrent refreshes from the real client are not mistaken for an attack (lesson 3.2). A stolen access token is limited by its 15-minute lifetime and by revocation (lesson 4.1). The \"how would we know\" answer is a `refresh_replay_detected` event, which should page someone: it is either an attack or a client bug, and both need a person."),
        h3("Brute force and credential stuffing"),
        bullets([
            "**Per-account limits** slow down guessing one password. Prefer growing delays over hard lockouts: a lockout lets anyone lock a learner out by typing her email ten times.",
            "**Per-IP limits** slow down a single machine. They do little against credential stuffing spread over thousands of IPs, as the incident shows.",
            "**Flow-wide signals** catch distributed attacks: the global failure rate, the share of unknown emails, new-device successes. Alert on these, and be ready to add friction (a challenge step, temporary MFA prompts) to all logins while an attack runs.",
            "**Breached-password checks and MFA** remove the reason the attack works. A check at sign-up and password change against a known-breached list (for example the Pwned Passwords range API, which receives only the first 5 characters of the password's SHA-1 hash) stops reused passwords from being set at all.",
            "**The same error for every failure.** \"Email or password is incorrect\" for both cases, and similar response times, so the login form cannot be used to test which emails have accounts.",
        ]),
        h3("Session fixation"),
        p("In session fixation, the attacker gets the victim to sign in with a session identifier the attacker already knows, then uses it. With server-side sessions the rule is to issue a new session id at login and at every privilege change. With token families the equivalent is: **sign-in always creates a new family and new tokens**, and never adopts an identifier that arrived with the request. If a refresh cookie is present at login, revoke its family instead of continuing it. Prefixes help too: a `__Host-` cookie cannot be planted from another subdomain."),
        h3("Account recovery: the weakest link"),
        p("Recovery is a second way to sign in, usually with weaker checks than the first. Everything you did for login is worth nothing if the email can be changed without the password, or a support agent accepts \"my courses are Node and SQL\" as proof. Review it with the same care:"),
        bullets([
            "Reset tokens: random, stored as hashes, single-use, short-lived (an hour, not a day), and invalid once a newer one is issued.",
            "A completed reset or password change **revokes every session** (session version and families, lesson 4.1); otherwise a stolen refresh token survives it.",
            "Changing the email asks for the password (or a fresh MFA step) and sends a notice with an undo link to the **old** address.",
            "Support recovery follows a written policy with checks an attacker cannot read from the learner's public profile, and every manual recovery writes an event.",
        ]),
        h3("What to monitor"),
        bullets([
            "`refresh_replay_detected`: page someone. Normal clients almost never trigger it once concurrent refresh is handled.",
            "`login_succeeded` from a new device: tell the user (\"New sign-in on Chrome, Windows, Hanoi\") with a link to the Sessions page; alert on spikes.",
            "Failure rate and unknown-email share of all logins, compared with the same hour last week.",
            "Password changes, email changes, resets and manual recoveries, especially within an hour of a new-device login.",
            "Deny-list size and revocations per hour (lesson 4.1), so you can see a mass sign-out working.",
        ]),

        challenge("chal_quiz_nas_431"),

        h2("5. Worked example: the threat table and the events behind it"),
        p("The output of the review is a table the team keeps next to the code. Each \"how would we know\" cell names a real event:"),
        code("text", `
step              threat (STRIDE)                       stops it today                              how we know                  decision
login             credential stuffing (S)               per-IP + per-account limits                 nothing                      FIX: global failure alert, breached-password check, MFA offer
login             user enumeration (I)                  same message, similar timing                login_failed.reason          ok
login             session fixation (S)                  new family per sign-in                      test auth.e2e "fixation"     ok
token issue       token in logs (I)                     redact Authorization only                   nothing                      FIX: header allowlist + log grep test
refresh           replay of stolen token (S)            rotation, family revoke (3.1)               refresh_replay_detected      FIX: page on-call
API               stolen access token (S)               15 min + session version + deny list        token_revoked count          ok
change email      takeover persists (E)                 nothing                                     nothing                      FIX: re-auth + notice to old address
reset password    sessions survive reset (E)            nothing                                     nothing                      FIX: revoke all sessions in reset
support recovery  social engineering (S, E)             agent judgement                             nothing                      FIX: written policy + manual_recovery event`, "threat-review-sign-in.md (excerpt)"),
        p("The events are rows in one table, written in the same transaction as the change they describe, so they cannot be lost on a crash and cannot be forged by the client. They never contain a token, a password or a reset link:"),
        code("sql", `
CREATE TABLE auth_events (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  type        text NOT NULL,          -- login_failed, login_succeeded, refresh_replay_detected, email_changed, ...
  user_id     text,                   -- NULL when the email is not an account
  family_id   text,
  ip          inet,
  device      text,                   -- parsed user agent: "Chrome, Windows"
  new_device  boolean NOT NULL DEFAULT false,
  reason      text                    -- wrong_password, unknown_email, rate_limited, ...
);
CREATE INDEX auth_events_at_type_idx ON auth_events (at, type);`, "migration"),
        p("An alert is then a query that runs every few minutes and compares now with a baseline. This one would have fired at 02:05 on Saturday:"),
        code("sql", `
-- failed logins in the last 15 minutes vs the same 15 minutes one week ago
SELECT now_failed, week_ago_failed
  FROM (SELECT count(*) AS now_failed FROM auth_events
         WHERE type = 'login_failed' AND at > now() - interval '15 minutes') a,
       (SELECT count(*) AS week_ago_failed FROM auth_events
         WHERE type = 'login_failed'
           AND at > now() - interval '7 days 15 minutes' AND at <= now() - interval '7 days') b
 WHERE now_failed > 10 * greatest(week_ago_failed, 50);`, "alert: login failure spike"),
        p("And the cheapest fix in the table, the reset handler, closes the gap the attacker used to keep the accounts. The reset token is looked up by its hash, consumed in the same statement, and the password change revokes every session:"),
        code("typescript", `
// auth/password-reset.service.ts
async resetPassword(token: string, newPassword: string) {
  const hash = createHash("sha256").update(token).digest("hex");
  const passwordHash = await argon2.hash(newPassword);
  await this.db.transaction(async (client) => {
    const { rows } = await client.query(
      \`UPDATE password_resets SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND created_at > now() - interval '1 hour'
        RETURNING user_id\`, [hash]);
    if (rows.length === 0) throw new BadRequestException("invalid_or_expired_token");
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, rows[0].user_id]);
    await this.sessions.revokeAll(client, rows[0].user_id);                    // lesson 4.1
    await this.events.write(client, { type: "password_reset", userId: rows[0].user_id });
  });
}`, "password-reset.service.ts"),

        h2("6. How to verify the review"),
        bullets([
            "**Every \"stops it today\" cell points at a test.** Fixation: sign in with a refresh cookie already present and assert a new family. Reset: reset the password and assert the old refresh token gets 401.",
            "**A log grep test.** Run the auth end-to-end suite with the real logger writing to a buffer, then assert the buffer contains no token, no password and no reset link. It catches the next header someone forgets to redact.",
            "**A replay drill in staging.** Use a refresh token twice and check that `refresh_replay_detected` is written and the alert reaches the on-call channel within minutes.",
            "**A slow stuffing test.** Replay a few thousand failed logins from many fake IPs against staging, below every per-IP limit, and check that the failure-spike alert fires.",
            "**Re-run the review on change.** A new subdomain, a new login method or a new token store adds rows; put the table in the pull request template for auth changes.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Monitoring endpoints, not the flow.** Error rate and latency stay green during credential stuffing. Spot it: no alert uses `login_succeeded` or new-device data.",
            "**Rate limits only per IP.** They miss distributed attacks and can lock out a school behind one NAT. Spot it: the limiter key is only the IP address.",
            "**Recovery that does not end sessions.** A reset or password change that only updates the hash. Spot it: no session revocation in the reset handler; an old refresh token still works after a reset in a test.",
            "**Email change without re-authentication.** One stolen session becomes a permanent takeover. Spot it: `PATCH /me/email` succeeds with just an access token and nothing is sent to the old address.",
            "**Redacting by denylist.** The list covers the header you thought of; the next one leaks. Spot it: logs that contain `cookie` or `set-cookie` fields.",
        ]),

        h2("8. Summary"),
        numbered([
            "A threat review walks the whole flow, including recovery and support, and asks at each step: what can go wrong, what stops it today, how would we know. Each row ends in a decision.",
            "The common gaps are rarely in the token code itself: tokens copied into logs, rate limits that distributed attacks never reach, and recovery paths that are weaker than login and do not end existing sessions.",
            "Monitor the flow, not the endpoint: refresh replays, sign-ins from new devices, failure-rate spikes and email or password changes after a new-device login, and prove each control with a test or a drill.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP Session Management Cheat Sheet: session ID renewal, session fixation, logging - cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html",
            "RFC 9700, Best Current Practice for OAuth 2.0 Security: section 4.14 (refresh token protection and replay) - datatracker.ietf.org/doc/html/rfc9700",
            "RFC 6265, HTTP State Management Mechanism: section 8 (security considerations) - datatracker.ietf.org/doc/html/rfc6265",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the threat review for the sign-in flow of a project you know: draw the sequence diagram (browser, API, database, mail, support) including forgot password, change email, refresh and sign out, then fill in the table from section 5 with one row per threat, an owner and a decision. For every \"how we know\" cell that says nothing, write the event you would add and the query that would alert on it."),
    ],
});
