// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-2-2",
    title: "Fix it: refresh tokens stored in plain text",
    slug: { _type: "slug", current: "fix-refresh-tokens-stored-in-plain-text" },
    description:
        "The token service behind the leaked backup stored refresh tokens in plain text, compared them with !== and never rotated them, so a token copied in April still worked in October. Read the code and the table like an incident reviewer, separate the three defects, revoke what leaked, and move a live table to hashes with an expand/contract migration that keeps learners signed in during a rolling deploy: hash on write, read both columns for a while, convert a legacy row the moment it is presented, backfill, then drop the column.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer fixing the CodeDev token service after incident SEC-214",
        problem:
            "The leaked auth backup (lesson 2.1) was taken on 2026-10-15. While checking which of its tokens still work, the team finds something worse: refresh token rt_2231 of learner u_minh was created on 2026-04-03 and has been refreshed 1,206 times since, always with the same token, and its expires_at is still 30 days in the future. A copy of that token from any backup made in the last seven months would sign in as u_minh today. You own the fix, and the product team has one condition: learners who signed in after the backup must not be signed out by the deploy.",
    },

    content: [
        h2("1. The incident: three defects in forty lines"),
        p("This is the refresh code that release 41 runs. It is short, it passes its tests, and every learner has used it hundreds of times:"),
        code("typescript", `
// src/auth/token.service.ts (release 41)
async refresh(presented: string): Promise<RefreshResult> {
    if (!TOKEN_FORMAT.test(presented)) return { ok: false, reason: "malformed" };
    const row = await this.tokens.findByPlainToken(presented);     // SELECT ... WHERE token = $1
    if (!row || row.token !== presented) return { ok: false, reason: "unknown" };
    if (row.revokedAt !== null) return { ok: false, reason: "revoked" };
    if (row.usedAt !== null) return { ok: false, reason: "used" };
    if (this.clock.now() >= row.expiresAt) return { ok: false, reason: "expired" };
    // keep the session alive: the same refresh token, valid for another 30 days
    const expiresAt = this.clock.now() + TTL_MS;
    await this.tokens.update(row.id, { expiresAt });
    return { ok: true, token: presented, id: row.id, familyId: row.familyId, expiresAt };
}`, "token.service.ts"),
        p("Read it as the incident reviewer, one question at a time: what is stored, how is it compared, and what does a successful refresh leave behind? Each answer is a separate defect, and each one needs its own evidence and its own fix."),

        h2("2. The evidence"),
        h3("A. The table"),
        code("sql", `
SELECT id, user_id, left(token, 10) || '...' AS token, created_at, expires_at, used_at
FROM auth.refresh_tokens WHERE id = 'rt_2231';

   id    | user_id |     token     |     created_at      |     expires_at      | used_at
---------+---------+---------------+---------------------+---------------------+---------
 rt_2231 | u_minh  | kU3vQ0wZ8b... | 2026-04-03 19:12:07 | 2026-11-25 07:58:41 |`, "psql, production read replica"),
        h3("B. The access log for that row"),
        code("text", `
2026-04-03T19:12:07Z POST /auth/login    200 user=u_minh device=phone  rt=rt_2231
2026-04-03T19:27:10Z POST /auth/refresh  200 rt=rt_2231 expires_at=2026-05-03T19:27:10Z
2026-04-03T19:42:13Z POST /auth/refresh  200 rt=rt_2231 expires_at=2026-05-03T19:42:13Z
... 1,203 more lines ...
2026-10-26T07:58:41Z POST /auth/refresh  200 rt=rt_2231 expires_at=2026-11-25T07:58:41Z`, "auth log, filtered by rt=rt_2231"),
        h3("C. The deploy plan"),
        code("text", `
release 42: rolling deploy over 6 api instances, ~25 minutes
during the rollout, release 41 and release 42 serve traffic side by side
the database migration runs before the first release 42 instance starts`, "RUNBOOK-auth-deploy.md"),
        p("Evidence A shows **storage**: the column holds the credential itself. Evidence B shows **lifetime**: one token, never replaced, its expiry pushed forward on every use, so every backup since April holds a token that still works. Evidence C is the constraint on the fix: for about 25 minutes, old instances will keep writing plain-text rows that new instances must understand."),
        p("The third defect is in the comparison: `row.token !== presented` stops at the first differing character, a timing side channel. It is a real defect, but a different one from how the backup leaked. Keep the three apart: each has its own evidence, its own fix and its own test."),

        h2("3. Core idea: fix the data, not only the code"),
        p("A code fix changes what happens from now on. The incident is about data that already exists in two places: the live table, and every backup, replica snapshot and WAL archive taken since April. Plan for both."),
        numbered([
            "**Revoke what leaked.** Every row that existed when the backup was taken must stop working, whatever the code does next. Because release 41 never rotated, that is every row created before the dump. Those learners sign in again once; there is no safe way around it.",
            "**Stop writing secrets.** New rows get `token_hash` only (lesson 2.1).",
            "**Rotate on every refresh.** The presented token is marked used and replaced by a new one in the same family, so a copy of an old token is worthless after the next refresh. RFC 9700 (section 4.14.2) lists refresh token rotation as one of the two ways to detect and limit stolen refresh tokens for public clients.",
            "**Migrate the rows written between the dump and the deploy without signing anyone out.** That is the part that needs care.",
        ]),
        callout("info", "The simplest fix first",
            "If signing every learner out once is acceptable, skip the migration: revoke every row, ship release 42 with hash-only reads, and drop the column. That is fewer moving parts and fewer bugs. CodeDev could not, because the mobile app has no saved password and a forced sign-out of everyone who logged in after the backup would hit learners in the middle of timed challenges. Choose the migration only when you can name who would be hurt by the simple fix."),

        challenge("chal_quiz_nas_221"),

        h2("4. The migration: expand, migrate, contract"),
        p("Changing a column that live traffic reads is a classic expand/contract migration: add the new shape next to the old one, move readers and writers over in steps, and remove the old shape only when nothing uses it."),
        code("sql", `
-- step 0 (incident response, before anything else): the dump was taken at 2026-10-15 02:00 UTC
UPDATE auth.refresh_tokens
SET    revoked_at = now()
WHERE  created_at <= '2026-10-15 02:00:00+00' AND revoked_at IS NULL;

-- step 1 (expand): runs before the first release 42 instance starts
ALTER TABLE auth.refresh_tokens
    ADD COLUMN token_hash text UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    ALTER COLUMN token DROP NOT NULL;`, "migrations/2026_10_26_001_refresh_token_hash.sql"),
        p("Step 2 is release 42 itself, and it follows four rules:"),
        bullets([
            "**Write only the new shape.** `login` and every rotation insert `token = NULL, token_hash = sha256(token)`.",
            "**Read the new shape first, the old one second.** Look the token up by its hash. Only when that finds nothing, look it up in the legacy column - this is the path for rows written by release 41 during the rollout and by anyone who signed in between the dump and the deploy.",
            "**Convert a legacy row the moment it is presented.** Before checking whether it is revoked, used or expired, write `token_hash = sha256(token), token = NULL` on that row. The plain value leaves the table on first contact, whatever the answer to the request is.",
            "**Then apply the normal checks and rotate.** A legacy token that is valid is accepted once and replaced by a hashed token in the same family; presenting it again finds the converted row by its hash, already used.",
        ]),
        p("The shape of the read path, without the details the exercise asks you to get right:"),
        code("typescript", `
async refresh(presented: unknown): Promise<RefreshResult> {
    // 1. format check, then hash = sha256(presented)
    // 2. row = findByHash(hash)                      - compare the digests with timingSafeEqual
    // 3. no row: legacy = findByPlainToken(presented)
    //      found: update legacy row -> token_hash = hash, token = NULL   (before any other check)
    // 4. revoked? used? expired?
    // 5. insert the next token of the family (hash only), mark the presented row used + replaced_by
}`),
        p("Steps 3 and 4 come after the last release 41 instance is gone:"),
        code("sql", `
-- step 3 (migrate): rows nobody presented during the window; run in batches of 5,000
UPDATE auth.refresh_tokens
SET    token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'),
       token      = NULL
WHERE  id IN (SELECT id FROM auth.refresh_tokens WHERE token IS NOT NULL LIMIT 5000);

-- step 4 (contract): release 43 removes the legacy read path, then
ALTER TABLE auth.refresh_tokens
    DROP COLUMN token,
    ALTER COLUMN token_hash SET NOT NULL;`, "migrations/2026_10_27_001_refresh_token_contract.sql"),
        callout("warning", "NULL in the table is not gone from the disk",
            "After UPDATE ... SET token = NULL, PostgreSQL keeps the old row version until VACUUM reclaims it, and the WAL archive and older backups still contain the value. That is why step 0 revokes rows instead of trusting the wipe: a plain token that is revoked or already used is harmless wherever a copy of it survives. Check the backup retention policy too - the bucket that leaked kept 90 days of dumps."),

        h2("5. Why the order of the legacy path matters"),
        p("Every rule in the read path closes a specific gap. Walk through what goes wrong when one is missing:"),
        bullets([
            "**Hash lookup only, no legacy read:** every learner who signed in on a release 41 instance during the rollout gets `invalid_grant` at the next refresh. On CodeDev that is every sign-in handled by an old instance during a 25-minute window.",
            "**Legacy read, but the row keeps its plain token:** the refresh rotates correctly and the old value is marked used, so it no longer refreshes. It still matters: the next backup holds it, and lesson 3.1 makes a reused token revoke the whole family, so anyone with that backup can sign the learner out at will.",
            "**Converting only on success:** a legacy row that is expired or revoked is rejected and keeps its plain token until the backfill. Nobody can use it, but it is exactly the kind of row the backfill was supposed to make unnecessary, and the post-migration check below will not reach zero.",
            "**Converting after the checks instead of before:** the code is correct for valid tokens, and every early `return` silently skips the conversion. Put the update first, right after the row is found.",
        ]),

        h2("6. How to verify the fix and the migration"),
        numbered([
            "**Dump the store after every operation in tests.** After `login`, the `token` column of the new row is NULL and `token_hash` is the digest of the returned token. After `refresh`, the old row has `used_at` and `replaced_by`, and a new row in the same family exists. After presenting a legacy token, that row has no plain value any more - whether the refresh succeeded or not.",
            "**Watch the migration converge.** Run this every few minutes during the rollout and after the backfill:",
        ]),
        code("sql", `
SELECT count(*) FILTER (WHERE token IS NOT NULL)                         AS plain,
       count(*) FILTER (WHERE token_hash IS NOT NULL)                    AS hashed,
       count(*) FILTER (WHERE token IS NOT NULL AND created_at > now() - interval '10 minutes') AS plain_new
FROM auth.refresh_tokens;`, "migration progress"),
        p("`plain_new` must drop to 0 when the last release 41 instance stops - if it does not, an old instance is still serving. `plain` must reach 0 after the backfill, before the contract step runs."),
        bullets([
            "**Replay a token from the old backup.** It must be rejected (`revoked` after step 0, or `used` once rotated).",
            "**Check the rotation in the logs.** After the deploy, no `rt=` id should appear in more than one successful refresh: one token, one use.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Only swapping `!==` for `timingSafeEqual`.** It closes a side channel and changes nothing about storage or lifetime. Spot it: the table still has a non-NULL `token` column after the fix.",
            "**`timingSafeEqual(Buffer.from(a), Buffer.from(b))` on raw strings.** It throws `RangeError: Input buffers must have the same byte length` when a client sends a longer value. Spot it: 500 responses on `/auth/refresh` with junk input. Compare two SHA-256 digests (always 32 bytes), or check lengths first.",
            "**Rotating without marking the old row.** A new token is issued, but the presented row is never updated, so both tokens work and the family forks. Spot it: a family with two rows that have neither `used_at` nor `revoked_at`.",
            "**A big-bang migration.** Hashing the column in the same deploy that changes the code leaves a window where old instances read a column that no longer holds what they expect. Spot it: one migration file that adds `token_hash`, fills it and drops `token`.",
            "**Forgetting the backups.** The fix hashes the live table and the leaked dump still works. Spot it: no revocation step in the incident timeline.",
        ]),

        h2("8. Exercise: fix the token service"),
        p("The starter is release 41's token service with an in-memory store that has both columns. Fix `login` and `refresh` so that only hashes are written, tokens are compared in constant time and rotated on every refresh, and legacy plain-text rows are accepted once and converted the moment they are presented. The tests seed legacy rows, run logins and refreshes, and print the whole store after every operation."),
        challenge("chal_coding_nas_222"),

        h2("9. Summary"),
        bullets([
            "Separate the defects: plain-text storage leaks through every copy of the data, no rotation makes each leaked copy valid for months, and `!==` is a timing side channel. Fixing one does not fix the others.",
            "Incident first, migration second: revoke what leaked, then expand (add `token_hash`), migrate (write hashes, read both, convert a legacy row on first contact, backfill), and contract (drop the column).",
            "Verify with data, not with code review: dump the store after every operation in tests, watch `plain` and `plain_new` reach 0 during the rollout, and replay a token from the old backup.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9700, Best Current Practice for OAuth 2.0 Security, section 4.14.2 (refresh token rotation) - datatracker.ietf.org/doc/html/rfc9700",
            "OWASP Session Management Cheat Sheet (session ID handling and logging) - cheatsheetseries.owasp.org",
            "PostgreSQL documentation: ALTER TABLE, sha256() and encode(), routine vacuuming",
            "Node.js documentation: crypto.timingSafeEqual (throws when the lengths differ)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the runbook for this migration as your team would run it: the exact SQL of steps 0 to 4, who runs each step, the query that must return 0 before the next step starts, and how to roll back step 2 if release 42 misbehaves (hint: release 41 cannot read rows that only have token_hash - what does that mean for a rollback after an hour?)."),
    ],
});
