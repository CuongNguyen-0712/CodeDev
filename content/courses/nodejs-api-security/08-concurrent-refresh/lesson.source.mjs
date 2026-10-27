// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-3-2",
    title: "Concurrent refresh & token replay: two requests, one token",
    slug: { _type: "slug", current: "concurrent-refresh-token-replay-two-requests-one-token" },
    description:
        "A learner's phone resumed, sent two POST /auth/refresh requests with the same token 40 ms apart, got two 200 responses, and 15 minutes later was flagged as a replay and signed out on every device. Work through the incident like an on-call engineer: read the API log, the refresh code, the PostgreSQL statement log and the family's rows, find the race between the read and the write, rule out a stolen token and clock skew, fix it with a compare-and-swap UPDATE plus a grace or retry answer for the loser, and prove it with a test that forces the interleaving.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "Thursday 09:31. The security channel shows a refresh_token_reuse alert for learner u_8812, and the policy has already signed them out on their phone, laptop and tablet. Ten minutes later the learner writes to support: \"I only opened the app on my phone and I was logged out of everything.\" A second ticket with the same story arrives before you finish reading the first. Refresh token rotation (lesson 2.3) and replay detection (lesson 3.1) shipped last week; the API runs on two instances, api-1 and api-2, behind a load balancer.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario. Replay detection worked exactly as designed: a used refresh token came back, the family was revoked and the policy signed the learner out everywhere. The question is why a learner who did nothing unusual presented a used token at all. Before anyone blocks an IP address or rolls back replay detection, collect the evidence and let it tell you."),
        p("A rollback would hide the problem rather than fix it. Turning replay detection off would bring back the silent theft from lesson 3.1, and the bug you are about to find would still be there, only invisible."),

        h2("2. The evidence pack"),
        p("Four pieces of evidence were collected in the first twenty minutes. The quiz below refers to them by letter."),
        h3("A. API log"),
        code("text", `
09:14:03.118 client  app resumed: GET /me -> 401, GET /progress -> 401, each calls refreshSession()
09:14:03.120 api-1   POST /auth/refresh req=7f1a device=phone-8812 token_id=r_901 -> 200 issued=r_902 (212 ms)
09:14:03.160 api-2   POST /auth/refresh req=7f1b device=phone-8812 token_id=r_901 -> 200 issued=r_903 (131 ms)
09:29:05.004 api-2   POST /auth/refresh req=81c0 device=phone-8812 token_id=r_902 -> 401 replay_detected family=f_77
09:29:05.010 api-2   security_event refresh_token_reuse user=u_8812 family=f_77 token=r_902 device=phone-8812
09:29:05.012 api-2   policy sign_out_all user=u_8812 reason=refresh_token_reuse families_revoked=3`, "api.codedev.test, user u_8812; durations are until the response was sent"),
        h3("B. The refresh code as shipped"),
        code("typescript", `
async refresh(token: string, deviceId: string): Promise<RefreshResult> {
  const row = await this.tokens.findByHash(sha256(token));    // SELECT * FROM refresh_tokens WHERE token_hash = $1
  if (!row || row.revokedAt) throw new UnauthorizedException();
  if (this.clock.now() >= row.expiresAt) throw new UnauthorizedException();
  if (row.usedAt) return this.handleReuse(row, deviceId);      // replay detection (lesson 3.1)

  await this.tokens.retireLiveTokens(row.familyId);           // UPDATE ... SET used_at = now() WHERE family_id = $1 AND used_at IS NULL AND revoked_at IS NULL
  const next = await this.tokens.issue(row);                  // INSERT INTO refresh_tokens ...
  await this.tokens.recordSuccessor(row.id, next);            // UPDATE ... SET replaced_by = $2 WHERE id = $1
  return { status: "rotated", token: next.token };
}`, "auth/auth.service.ts"),
        h3("C. PostgreSQL statement log"),
        code("text", `
09:14:03.121 [7f1a] SELECT * FROM refresh_tokens WHERE token_hash = $1                 -> r_901, used_at NULL
09:14:03.162 [7f1b] SELECT * FROM refresh_tokens WHERE token_hash = $1                 -> r_901, used_at NULL
09:14:03.178 [7f1a] UPDATE refresh_tokens SET used_at = now()
                    WHERE family_id = 'f_77' AND used_at IS NULL AND revoked_at IS NULL -> UPDATE 1
09:14:03.183 [7f1a] INSERT INTO refresh_tokens (id, family_id, ...) VALUES ('r_902', 'f_77', ...)
09:14:03.186 [7f1a] UPDATE refresh_tokens SET replaced_by = 'r_902' WHERE id = 'r_901'
09:14:03.205 [7f1b] UPDATE refresh_tokens SET used_at = now()
                    WHERE family_id = 'f_77' AND used_at IS NULL AND revoked_at IS NULL -> UPDATE 1
09:14:03.209 [7f1b] INSERT INTO refresh_tokens (id, family_id, ...) VALUES ('r_903', 'f_77', ...)
09:14:03.212 [7f1b] UPDATE refresh_tokens SET replaced_by = 'r_903' WHERE id = 'r_901'`, "PostgreSQL statement log, request id (application_name) in brackets"),
        h3("D. The family after the incident"),
        code("sql", `
SELECT id, device_id, used_at, revoked_at, replaced_by
FROM refresh_tokens WHERE family_id = 'f_77' ORDER BY created_at;

 id    | device_id  | used_at      | revoked_at   | replaced_by
 r_901 | phone-8812 | 09:14:03.178 | 09:29:05.004 | r_903
 r_902 | phone-8812 | 09:14:03.205 | 09:29:05.004 |
 r_903 | phone-8812 |              | 09:29:05.004 |`, "psql"),

        h2("3. Reading the evidence"),
        p("Write one line per piece about what it **shows**, before you decide what it means:"),
        bullets([
            "**A**: one device, one token, two refresh requests 40 ms apart on two different instances, both 200, each with a different new token. Fifteen minutes later the same device presents `r_902` and is flagged. Note the durations: 7f1a took 212 ms and 7f1b 131 ms, so 7f1b's response was sent first even though 7f1a started first.",
            "**B**: the code reads the row, checks `usedAt` in TypeScript, and only then writes. There are three awaits, three network round trips to the database, between the check and the end of the rotation.",
            "**C**: the order of the statements as the database executed them, from the database's own clock. Both SELECTs come before the first UPDATE. The two UPDATEs are identical, and each reports one row changed.",
            "**D**: `r_902` has a `used_at` of 09:14:03.205, but no request in A presented `r_902` at that time. `r_901` points to `r_903`, not to `r_902`.",
        ]),
        p("The phone is the next question. Both responses carried a `Set-Cookie` for the refresh token. The phone keeps whichever it processes last, and the slower response, 7f1a with `r_902`, arrived last."),

        h2("4. Hypothesis: a check and a write that are not one step"),
        p("Put C in order and follow both requests:"),
        numbered([
            "7f1a reads `r_901`: unused. 7f1b reads `r_901`: unused. Both pass `if (row.usedAt)`, because both checked a copy taken before anyone wrote.",
            "7f1a retires the family's live token (`r_901`), inserts `r_902` and links it.",
            "7f1b runs the same \"retire the live token\" UPDATE. The live token of the family is now `r_902`, so that is the row it marks as used. It inserts `r_903` and overwrites the link on `r_901`.",
            "Both answer 200. The phone keeps `r_902`, which the database already considers used.",
            "Fifteen minutes later the phone refreshes with `r_902`. A used token outside any grace window: replay detection fires.",
        ]),
        p("This is a **check-then-act race**: a decision made on data read earlier, followed by a write that does not re-check that data. The family-wide WHERE turned it into a false alarm, but it is not the root cause. Even with a WHERE on `id`, both requests would have passed the check and both would have issued a successor: two live tokens in one family. A stolen copy of `r_901` raced against the real phone would get its own live branch, and replay detection would never see a reuse. A race in the rotation silently disables the detection you built in lesson 3.1."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"Someone stole the token.\"** Every request in A comes from `phone-8812`, and nobody presented `r_902` before 09:29. The `used_at` on `r_902` is the timestamp of 7f1b's UPDATE in C. The alarm is evidence to check, not a verdict.",
            "**\"Clock skew between api-1 and api-2.\"** C is stamped by the database server's clock, so the two instances' clocks cannot reorder it, and it shows 7f1b reading before 7f1a writes. 40 ms sounds long, but 7f1a spent 57 ms between its read and its first write. Two requests only need to overlap that gap.",
            "**\"The app should not send two refreshes.\"** True, and section 7 fixes the client too. It is not enough: a learner with two tabs, a retry after a timeout or an old app version will send two again, and an attacker will send as many as they like. The server must be correct for any interleaving.",
        ]),

        h2("5. Choose the fix"),
        p("Write the requirements down from the evidence first:"),
        bullets([
            "Exactly one request rotates a token, however the statements of concurrent requests interleave, on any number of API instances.",
            "A request that loses the race from the same device, inside the grace window, gets the winner's successor: the phone ends up with one live token, whichever response arrives last.",
            "If the winner has not recorded its successor yet, the loser answers \"retry\" (409) rather than inventing a token or raising an alarm.",
            "A loser from another device, or after the window, is still a replay, and no successor is ever issued into a revoked family.",
        ]),
        p("Then test the candidates against the list:"),
        bullets([
            "**A mutex in the Node.js process.** A shows 7f1a on api-1 and 7f1b on api-2. An in-memory lock protects one process; the race is between two.",
            "**`WHERE id = $1` instead of `family_id`.** Removes this false alarm and keeps the double success: the family forks.",
            "**`SELECT ... FOR UPDATE` inside a transaction.** Works: the second request waits for the first to commit, then reads `used_at` and takes the reuse path. It holds a row lock across the whole rotation, and every code path must remember to lock.",
            "**`SERIALIZABLE` isolation.** Works if every caller retries on serialization failures (SQLSTATE 40001). A heavier tool for a one-row decision.",
            "**A compare-and-swap UPDATE.** Make the write itself the check, and act on its result:",
        ]),
        code("sql", `
BEGIN;
-- the compare-and-swap: one row back means this request won
UPDATE refresh_tokens
SET used_at = now()
WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL
RETURNING id;
-- 0 rows: ROLLBACK, read the row again and handle it as a reuse (grace, retry or replay)
INSERT INTO refresh_tokens (id, family_id, user_id, device_id, token_hash, created_at, expires_at)
VALUES ($2, $3, $4, $5, $6, now(), now() + interval '14 days');
UPDATE refresh_tokens SET replaced_by = $2 WHERE id = $1;
COMMIT;`, "rotate.sql"),
        p("In PostgreSQL the second UPDATE on the same row waits for the first transaction to finish and then re-checks its WHERE clause against the committed row, so `used_at IS NULL` is false and it returns no row. There is no window in which both see `NULL`. The loser then reads the row again: inside one transaction for the winner, it finds `replaced_by` already set and answers with the stored successor (lesson 3.1). If the rotation runs as separate statements without a transaction, the loser can arrive between the UPDATE and the link, and that is the `retry` case: the API answers `409 refresh_in_progress` and the client tries again after 100 ms, by which time the successor is there."),
        callout("info", "One more race: revocation during rotation",
            "A replay from another device can revoke the family while a rotation is between its UPDATE and its INSERT. The revoking UPDATE ... WHERE family_id = $1 does not see a row inserted after it started, so the new successor would stay live in a revoked family. Make both operations take the same lock first, for example SELECT 1 FROM refresh_token_families WHERE id = $1 FOR UPDATE, so they run one after the other. The exercise's store models the outcome: issue returns null for a revoked family, and the winner answers \"revoked\"."),

        challenge("chal_quiz_nas_321"),

        h2("6. The challenge: a scheduler that replays the interleaving"),
        p("Races are hard to test because they depend on timing. The challenge removes the timing. The file contains the in-memory `refresh_tokens` table from lesson 3.1, where every method is one atomic SQL statement, and a `Db` wrapper that each request uses. What matters:"),
        bullets([
            "**Every statement is asynchronous**, like a query over the network, so other requests can run between any two of your statements.",
            "**The scheduler decides the order.** A test step lists the requests and a schedule such as `[[\"A\", \"findByHash\"], [\"B\", \"findByHash\"], [\"A\", \"end\"], [\"B\", \"end\"]]`: run request A until it completes its next `findByHash`, pause it, run B until its `findByHash`, then let A and B finish. That is evidence C as a test. The same schedule gives the same result on every run.",
            "**`markUsed` is the compare-and-swap** from section 5. `retireLiveTokens` is the statement from evidence B.",
            "**The output** has one line per request and then every row of the table, so a forked family or a wrongly retired row is visible, not just the statuses.",
        ]),
        p("Run the starter first and compare its output for the first public test with evidence A and D: two rotated results, then a replay. Then fix it."),
        challenge("chal_coding_nas_322"),

        h2("7. How to verify the fix"),
        p("\"It works when I tap refresh twice\" is not verification: the shipped code also worked whenever the two requests happened not to overlap. Verify each requirement with something that forces or counts it:"),
        bullets([
            "**A deterministic interleaving test.** Pause request A right after its SELECT, run B's SELECT, then finish both. On the shipped code: two rotated results with different tokens. After the fix: one rotated, one grace with the same token. Add the schedule where B runs between A's UPDATE and its link (`retry`) and the one where B comes from another device (replay).",
            "**An invariant query on the database.** A family must never have two live tokens. Run it on staging after a load test and as a daily check in production; the answer must be zero rows:",
        ]),
        code("sql", `
SELECT family_id, count(*) AS live_tokens
FROM refresh_tokens
WHERE used_at IS NULL AND revoked_at IS NULL
GROUP BY family_id
HAVING count(*) > 1;`, "invariant.sql"),
        bullets([
            "**A load test with duplicates.** Send pairs of refreshes with the same cookie in parallel against staging with two API instances (for example with autocannon or k6). Count the answers: per pair, exactly one rotation and one grace or retry, and no `refresh_token_reuse` events.",
            "**Production after the deploy.** The number of `refresh_token_reuse` events per day drops back to the few that are real, the `409 refresh_in_progress` count is small and stable, and the invariant query stays empty.",
        ]),
        p("Then fix the client too, so the server rarely has to: one refresh at a time per app, shared by every request that needs it."),
        code("typescript", `
// app/auth/session.ts - single-flight refresh: concurrent callers share one request
let inFlight: Promise<string> | null = null;

export function refreshSession(): Promise<string> {
  inFlight ??= postRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function postRefresh(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.codedev.test/auth/refresh", { method: "POST", credentials: "include" });
    if (res.status === 409) {                               // another request is rotating: try again shortly
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    if (!res.ok) throw new SessionExpiredError();
    return (await res.json()).accessToken;
  }
  throw new SessionExpiredError();
}`, "session.ts"),

        h2("8. Common mistakes in a concurrency incident"),
        bullets([
            "**Trusting the alarm's label.** A replay alert during a race looks like theft. Spot it: line up the API log and the statement log by request id before anyone blocks an IP or rolls back detection.",
            "**Fixing the symptom row.** Changing the family-wide WHERE to `id` makes this sign-out disappear and keeps the double success. Spot it: the invariant query finds families with two live tokens.",
            "**Checking in code, writing in SQL.** Any `if (row.x)` followed by an `UPDATE` that does not repeat the condition is a race. Spot it: the UPDATE has no `AND used_at IS NULL` and the code ignores the row count.",
            "**A lock that lives in one process.** A mutex, a `Map` of in-flight tokens or a Node.js queue does nothing across api-1 and api-2. Spot it: the lock is a JavaScript object, not a database row or a Redis key.",
            "**Testing races with real timing.** Two `fetch` calls in `Promise.all` overlap on some runs and not on others, so the test is flaky. Spot it: a concurrency test that passes and fails without code changes; replace it with a scheduled interleaving.",
        ]),

        h2("9. Summary"),
        numbered([
            "Two refreshes with one token are normal traffic. A read, a check in code and a later write let both succeed: the family forks, a stolen copy gets its own live branch, and an unlucky UPDATE turns into a false replay alarm.",
            "Make the write the check: UPDATE ... WHERE id = $1 AND used_at IS NULL RETURNING. Exactly one request wins; a loser from the same device inside the window gets the winner's successor or a clean retry, and anything else stays a replay.",
            "Prove it by forcing the interleaving in a test and by an invariant on the data: at most one live token per family.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Transaction Isolation, Read Committed (how a blocked UPDATE re-checks its WHERE clause) and Explicit Locking (FOR UPDATE)",
            "PostgreSQL documentation: UPDATE ... RETURNING",
            "RFC 9700, Best Current Practice for OAuth 2.0 Security: refresh token rotation - datatracker.ietf.org/doc/html/rfc9700",
        ]),
        callout("tip", "Self-practice (not graded): draw the sequence diagram",
            "Draw the incident as a sequence diagram with five lifelines: the phone, api-1, api-2, PostgreSQL and the phone's cookie store. Put every statement from evidence C on it with its time, mark the read-to-write gap of request 7f1a, and show which Set-Cookie the phone keeps. Then draw the same two requests after the fix, once for each schedule from the exercise (grace, retry, another device), and mark on each diagram the single statement that decides who wins."),
    ],
});
