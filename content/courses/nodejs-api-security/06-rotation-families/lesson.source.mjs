// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-2-3",
    title: "Refresh token rotation with token families",
    slug: { _type: "slug", current: "refresh-token-rotation-token-families" },
    description:
        "A learner who signed in on a shared university lab computer in March was still signed in there in October, because every refresh pushed the expiry forward. Learn refresh token rotation the way RFC 9700 describes it: one sign-in is a token family, every refresh replaces the token and records replaced_by, an idle timeout ends a family nobody uses, and an absolute lifetime ends every family, however active. Build it with exact, testable results and verify it with SQL over the token table.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer on the CodeDev auth team",
        problem:
            "Support ticket CS-5521: a student at a partner university opened https://app.codedev.test on a lab computer in October and found herself signed in as another student, u_lan, with his progress, submissions and saved payment preferences. u_lan last typed his password on that machine on 2 March. The lab browser keeps cookies, a scheduled sync job on the machine called the API every few days, and each refresh gave the session another 14 days. Hashing (lesson 2.1) and rotation (lesson 2.2) are in production; nothing ever ends a sign-in that keeps refreshing.",
    },

    content: [
        h2("1. The incident: a session that never ends"),
        p("Hashed storage protects the table, and rotation makes each copied token single-use. Neither answers a different question: **how long may one sign-in last?** Here is u_lan's sign-in on the lab computer, read straight from the token table:"),
        code("sql", `
SELECT family_id, device_id, min(created_at) AS signed_in, max(created_at) AS last_refresh,
       max(expires_at) AS valid_until, count(*) AS tokens
FROM auth.refresh_tokens
WHERE user_id = 'u_lan'
GROUP BY family_id, device_id;

 family_id | device_id     | signed_in        | last_refresh     | valid_until      | tokens
-----------+---------------+------------------+------------------+------------------+-------
 fam_3120  | lab-pc-b114   | 2026-03-02 07:41 | 2026-10-25 21:13 | 2026-11-08 21:13 |    412
 fam_8807  | phone-pixel7  | 2026-10-20 18:02 | 2026-10-26 07:30 | 2026-11-09 07:30 |     19`, "psql, production read replica"),
        p("Every token in `fam_3120` was valid for exactly 14 days, so a code reviewer would say \"tokens expire after two weeks\". The query says otherwise: one sign-in has lasted almost eight months and is valid for two more weeks. The 14 days are measured from the **last refresh**, not from the sign-in."),

        h2("2. Read the evidence: two clocks, one of them missing"),
        p("The refresh code that produced this table computes one expiry:"),
        code("typescript", `
// release 42: rotation is in place, the lifetime slides forever
const next = await this.tokens.insert({
    familyId: row.familyId, userId: row.userId, deviceId: row.deviceId,
    tokenHash: sha256Hex(newToken),
    createdAt: now,
    expiresAt: now + IDLE_TIMEOUT_MS,          // 14 days from now, every time
});`, "token.service.ts"),
        p("A session needs two limits, and the OWASP Session Management Cheat Sheet names both:"),
        bullets([
            "**Idle timeout:** how long a sign-in may go unused. A laptop left in a drawer for three weeks should not wake up signed in. On CodeDev: 14 days.",
            "**Absolute timeout:** how long a sign-in may last, however active it is. It forces a real authentication from time to time, which is the only moment the user proves they are still the user. On CodeDev: 30 days.",
        ]),
        p("The code above has the first and not the second. The fix is not a shorter idle timeout - a sync job that refreshes every three days defeats any idle timeout. The fix is a deadline that does not move."),

        h2("3. Core idea: a token family is one sign-in"),
        p("Give every sign-in an identity of its own: the **family**. `login` creates a family with its first token. Each successful refresh adds the next token to the same family and retires the one that was presented. The family is what the user thinks of as \"signed in on the lab computer\"; the individual tokens are just its current key."),
        bullets([
            "**One live token per family.** The presented row gets `used_at = now()` and `replaced_by = <new id>`; the new row is the only one that can refresh next. Following `replaced_by` from the first row walks the whole history of the sign-in.",
            "**The idle clock restarts at every refresh.** The new token's `expires_at` is `now + idle timeout`.",
            "**The absolute clock never restarts.** It starts at the `created_at` of the family's first token, and every new token's `expires_at` is capped at `family start + absolute lifetime`. Near the end of the family, the last tokens all expire at the same instant.",
            "**A new login is a new family.** Signing in again on the same device does not extend anything: it starts a fresh 30 days with a fresh password check, which is the point.",
        ]),
        p("RFC 9700 (section 4.14.2) describes refresh token rotation for public clients such as browsers and mobile apps: the server issues a new refresh token on every refresh, invalidates the previous one and keeps the relationship between them. That relationship is the family. Its payoff comes in the next lesson: if a retired token is ever presented again, either the user or an attacker holds a copy, and the server can revoke the whole family. In this lesson a retired token is simply rejected as `used`."),
        h3("When rotation is not the tool"),
        bullets([
            "**Confidential clients** (a server-side app that keeps its refresh token in its own backend and authenticates to the token endpoint) have less need for rotation: a stolen token is useless without the client's credentials. RFC 9700 names sender-constrained refresh tokens (for example with DPoP or mutual TLS) as the alternative to rotation.",
            "**Rotation makes concurrency visible.** Two tabs that refresh at the same moment present the same token; one of them wins and the other gets `used`. That is a real problem with a real fix (lesson 3.2), not a reason to stop rotating.",
            "**The absolute lifetime is a product decision.** 30 days means every learner types a password at least once a month. A banking app picks hours; a reading app may pick 90 days. Write the number down with the reason, and do not let \"remember me\" quietly turn it into infinity.",
        ]),

        challenge("chal_quiz_nas_231"),

        h2("4. A trace on the CodeDev settings"),
        p("Idle timeout 14 days, absolute lifetime 30 days, one learner on one phone. Times are days after the sign-in:"),
        code("text", `
d0   login              rt_1  expires d14              family fam_1 until d30
d6   refresh rt_1  ok   rt_2  expires d20              rt_1 used, replaced_by rt_2
d12  refresh rt_2  ok   rt_3  expires d26              rt_2 used, replaced_by rt_3
d13  refresh rt_2       used                           (a retired token; nothing changes)
d18  refresh rt_3  ok   rt_4  expires d30 (capped)     min(d18 + 14, d0 + 30) = d30
d24  refresh rt_4  ok   rt_5  expires d30 (capped)
d30  refresh rt_5       family_expired                 the family ends; the learner signs in again
d30  login              rt_6  expires d44              new family fam_2 until d60`, "rotation trace"),
        p("Two details matter for the API's answers. At d30 the token's own expiry has also passed, but the useful answer is `family_expired`: the client should send the learner to the sign-in page with \"your session has ended\", not \"you were away too long\". And a family that nobody touches for 14 days ends with `idle_timeout` long before d30."),

        h2("5. Worked example: the rotation in SQL"),
        p("The table from lesson 2.1 already has every column rotation needs. The family's start is the earliest `created_at` in the family; with the index on `family_id` that is a cheap lookup:"),
        code("sql", `
-- refresh: one transaction per request; $1 = sha256 of the presented token (hex)
BEGIN;

SELECT t.id, t.family_id, t.user_id, t.device_id, t.token_hash, t.expires_at, t.used_at, t.revoked_at,
       f.started_at
FROM   auth.refresh_tokens t
CROSS  JOIN LATERAL (SELECT min(created_at) AS started_at
                     FROM auth.refresh_tokens WHERE family_id = t.family_id) f
WHERE  t.token_hash = $1;

-- in the service, in this order: revoked -> used -> now() >= started_at + 30 days -> now() >= expires_at

INSERT INTO auth.refresh_tokens (id, family_id, user_id, device_id, token_hash, created_at, expires_at)
VALUES ($2, $3, $4, $5, $6, now(),
        least(now() + interval '14 days', $7::timestamptz + interval '30 days'));   -- $7 = started_at

UPDATE auth.refresh_tokens
SET    used_at = now(), replaced_by = $2
WHERE  id = $8 AND used_at IS NULL;                                                  -- $8 = presented row

COMMIT;`, "refresh.sql"),
        bullets([
            "**Insert first, then mark the old row.** `replaced_by` references `auth.refresh_tokens(id)`, so the new row must exist before the old one can point to it.",
            "**`AND used_at IS NULL` is a guard, not decoration.** If two requests with the same token pass the checks at the same moment, only one `UPDATE` changes a row. The service must check the row count and roll back the loser; lesson 3.2 builds that compare-and-swap properly.",
            "**Never trust the client's clock.** `now()` is the database server's clock (or an injected clock in tests). The client only receives `expires_at` to know when to refresh.",
            "**Cleanup must delete whole families.** If a nightly job deletes old used rows one by one, `min(created_at)` moves forward and the family silently gains lifetime. Delete only families whose deadline has passed: `DELETE FROM auth.refresh_tokens WHERE family_id IN (SELECT family_id FROM auth.refresh_tokens GROUP BY family_id HAVING min(created_at) < now() - interval '30 days');`. Teams that need per-row cleanup store the start in a separate `auth.token_families` table instead.",
        ]),
        p("The service around that SQL returns one precise result per request - `ok` with the new token and both deadlines, or `malformed`, `unknown`, `revoked`, `used`, `family_expired` or `idle_timeout` - and changes nothing when it rejects. The exercise asks you to write that service against an in-memory store with an injected clock."),

        h2("6. How to verify rotation in production"),
        p("Each rule of the design is a query that must return no rows. Run them after the deploy and keep them as scheduled checks with an alert:"),
        code("sql", `
-- 1. no family outlives the absolute lifetime
SELECT family_id FROM auth.refresh_tokens
GROUP BY family_id
HAVING max(expires_at) > min(created_at) + interval '30 days';

-- 2. at most one live token per family
SELECT family_id, count(*) FROM auth.refresh_tokens
WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
GROUP BY family_id HAVING count(*) > 1;

-- 3. every used token points to its successor in the same family
SELECT t.id FROM auth.refresh_tokens t
LEFT JOIN auth.refresh_tokens n ON n.id = t.replaced_by
WHERE t.used_at IS NOT NULL AND (n.id IS NULL OR n.family_id <> t.family_id);`, "rotation invariants"),
        p("In tests, the same rules hold over a fake clock: drive one family through many refreshes, step the clock to one millisecond before and exactly at each deadline, and dump the store at the end. For the incident itself, rerun the query from section 1: after the fix, no family's `valid_until` is more than 30 days after `signed_in`."),

        h2("7. Common mistakes"),
        bullets([
            "**Sliding expiry with no cap.** `expiresAt = now + idle` and nothing else. Spot it: invariant query 1 returns rows, and the family table has families older than the absolute lifetime.",
            "**Measuring the absolute lifetime from the presented token.** `row.createdAt + 30 days` restarts at every refresh, which is the same bug with a longer number. Spot it: a test that refreshes every 6 days never reaches `family_expired`.",
            "**A new family on every refresh.** The history is lost, the family start moves, and the next lesson's replay detection has nothing to revoke. Spot it: `family_id` differs between a row and the row in its `replaced_by`.",
            "**Checking idle before family.** Near the end of a family both deadlines have passed, and the user is told they were idle when their session ended by policy. Spot it: a test at exactly `family start + absolute lifetime` expects `family_expired`.",
            "**Accepting a used token as a success.** If the used check is missing, an old token mints a second live token in the same family. Spot it: invariant query 2 returns a family with two live tokens.",
        ]),

        h2("8. Exercise: rotation with token families"),
        p("Write `login` and `refresh` with an idle timeout and an absolute family lifetime. The tests drive many users and devices over a fake clock: refresh chains, a second login on the same device, an admin revoking one family, retired tokens presented again, sessions left idle and families that reach their deadline while still active. Every result is printed, then the whole store."),
        challenge("chal_coding_nas_232"),

        h2("9. Summary"),
        bullets([
            "A family is one sign-in on one device. Each refresh replaces the presented token with a new one in the same family and records `used_at` and `replaced_by`; a new login starts a new family.",
            "Two clocks: the idle timeout restarts at every refresh, the absolute lifetime starts at the family's first token and caps every new `expires_at`. Without the cap, a sign-in that keeps refreshing never ends.",
            "Verify with invariants: no family outlives its lifetime, at most one live token per family, every used token points to a successor in its family. Test the deadlines with a fake clock at one millisecond before and exactly at each one.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9700, Best Current Practice for OAuth 2.0 Security, section 4.14.2 (refresh token rotation, sender-constrained refresh tokens, expiry after inactivity) - datatracker.ietf.org/doc/html/rfc9700",
            "OWASP Session Management Cheat Sheet: idle timeout and absolute timeout - cheatsheetseries.owasp.org",
            "PostgreSQL documentation: LATERAL subqueries, least()",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick the idle timeout and the absolute lifetime for three CodeDev clients - the web app, the mobile app and the admin console - and write one sentence of reasoning for each number. Then run the three invariant queries from section 6 against a copy of your own project's session or token table and see which of them it would fail today."),
    ],
});
