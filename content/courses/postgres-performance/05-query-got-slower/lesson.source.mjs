// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-2-2",
    title: "The query got slower: a sign-in that stopped using its index",
    slug: { _type: "slug", current: "query-got-slower-sign-in-stopped-using-its-index" },
    description:
        "After a small release, the user lookup of CodeDev's sign-in went from 4 ms to 900 ms at p95 and the database CPU from 22% to 85%. Work through the incident like the on-call engineer: read the release diff, the plans before and after, pg_stat_statements and the table statistics, form a hypothesis, rule out bloat and memory, choose between an expression index, citext and normalising on write, and verify the fix with the plan and the production numbers.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "Tuesday 09:40. The latency alert of https://api.codedev.test fires: the span auth.lookup_user of POST /auth/sign-in has a p95 of 900 ms, against 4 ms last week, and the primary database runs at 85% CPU. Support has tickets from learners who wait several seconds on the sign-in page. Release 2026.10.20, deployed the evening before, contains one change to sign-in: learners asked for sign-in to accept their email in any case, so \"Mai.Nguyen@CodeDev.test\" and \"mai.nguyen@codedev.test\" now sign in to the same account.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario: a one-line change, a review that checked behaviour, and a query that stopped using its index. The pull request was small and correct in what it returned:"),
        code("typescript", `
// api/auth/signIn.ts (release 2026.10.20, PR #913 "auth: case-insensitive sign-in")
export async function findUserForSignIn(email: string) {
  return db.oneOrNone<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE lower(email) = lower($1)",
    [email],
  );
}`, "signIn.ts"),
        p("The tests passed: one signs in with \"MAI@CODEDEV.TEST\" and finds the account stored as \"mai@codedev.test\". The test database has 40 users. Production has 1.2 million. Resist the urge to add an index straight away: on call, the first job is to show **what changed in the plan and why**, because that also tells you which fixes are safe."),

        h2("2. The evidence pack"),
        p("Five pieces of evidence were collected in the first twenty minutes, on a production replica and from the monitoring views. The quiz refers to them by letter."),
        h3("A. The release diff"),
        code("text", `
-  SELECT id, password_hash FROM users WHERE email = $1
+  SELECT id, password_hash FROM users WHERE lower(email) = lower($1)

users: 1.2M rows; indexes: users_pkey (id), users_email_key UNIQUE (email)`, "PR #913"),
        h3("B. The plan before the release"),
        code("text", `
EXPLAIN (ANALYZE, BUFFERS) SELECT id, password_hash FROM users WHERE email = 'mai.nguyen@codedev.test';

Index Scan using users_email_key on users  (cost=0.43..8.45 rows=1 width=68) (actual time=0.031..0.032 rows=1 loops=1)
  Index Cond: (email = 'mai.nguyen@codedev.test'::text)
  Buffers: shared hit=4
Planning Time: 0.102 ms
Execution Time: 0.049 ms`, "replica, old query"),
        h3("C. The plan after the release"),
        code("text", `
EXPLAIN (ANALYZE, BUFFERS) SELECT id, password_hash FROM users WHERE lower(email) = lower('mai.nguyen@codedev.test');

Gather  (cost=1000.00..24318.33 rows=6000 width=68) (actual time=611.402..842.957 rows=1 loops=1)
  Workers Planned: 2
  Workers Launched: 2
  Buffers: shared hit=2208 read=13256
  ->  Parallel Seq Scan on users  (cost=0.00..22718.33 rows=2500 width=68) (actual time=764.211..823.590 rows=0 loops=3)
        Filter: (lower(email) = 'mai.nguyen@codedev.test'::text)
        Rows Removed by Filter: 400000
        Buffers: shared hit=2208 read=13256
Planning Time: 0.118 ms
Execution Time: 843.020 ms`, "replica, new query"),
        h3("D. pg_stat_statements"),
        code("text", `
SELECT query, calls, round(mean_exec_time::numeric, 2) AS mean_ms,
       round((shared_blks_hit + shared_blks_read)::numeric / calls) AS blocks_per_call
FROM pg_stat_statements WHERE query LIKE '%FROM users WHERE%email%';

 query                                                              | calls  | mean_ms | blocks_per_call
--------------------------------------------------------------------+--------+---------+----------------
 SELECT id, password_hash FROM users WHERE email = $1               | 412380 |    0.04 |               4   (snapshot 2026-10-19)
 SELECT id, password_hash FROM users WHERE lower(email) = lower($1) |  18412 |  812.37 |           15464   (today)`, "primary"),
        h3("E. Table checks"),
        code("text", `
SELECT n_live_tup, n_dead_tup, last_autovacuum FROM pg_stat_user_tables WHERE relname = 'users';
 n_live_tup | n_dead_tup |    last_autovacuum
------------+------------+------------------------
    1201544 |       3120 | 2026-10-21 03:12:40+00

SELECT count(*) FROM users WHERE email <> lower(email);
 count
-------
 48310`, "primary"),

        h2("3. Reading the evidence"),
        p("One line per piece, for what it **shows**:"),
        bullets([
            "**A** changes one thing: the comparison is no longer on the column `email`, it is on the expression `lower(email)`. The only index on emails is on the column.",
            "**B** is the healthy shape: an Index Scan with the comparison in **Index Cond**, 4 buffers (the B-tree levels plus the row), well under a millisecond.",
            "**C** is a different shape. The comparison is a **Filter** on a Parallel Seq Scan. Remember from lesson 1.2 that `rows` and `Rows Removed by Filter` are per loop: three processes each removed about 400,000 rows, so every sign-in checks the whole table. 2,208 + 13,256 = 15,464 buffers per call. The estimate rows=6000 is 0.5% of the table, the planner's default guess for an equality on an expression it has no statistics for.",
            "**D** confirms it is not a one-off on the replica: the same 15,464 blocks per call in production, a mean of 812 ms, against 4 blocks and 0.04 ms for the old query.",
            "**E** says the table is healthy (0.3% dead rows, vacuumed two days ago) and that 48,310 users have capital letters in their stored email.",
        ]),

        h2("4. Hypothesis: a function on the column hides it from the index"),
        p("A B-tree index on `email` is the list of stored emails in sorted order. It can answer \"where is the value X?\" because equal values are next to each other. It cannot answer \"where are the values whose lower case is X?\": `Mai.Nguyen@...`, `MAI.NGUYEN@...` and `mai.nguyen@...` all have the same lower case, but the index is sorted by the stored values, and nothing tells the planner that the values with one lower case form one contiguous range (in the C collation, upper-case letters even sort before every lower-case one). PostgreSQL only uses an index for the exact expression it was built on, so for `lower(email) = ...` it has no usable index and falls back to reading every row and computing `lower()` for each."),
        p("The hypothesis explains all the evidence: the timing (the first release with the new query), the plan shape (Filter instead of Index Cond), the work (every block of the table per call), the CPU (1.2 million `lower()` calls per sign-in, 18,000 sign-ins so far) and the bad estimate (no statistics on the expression)."),
        callout("info", "Same family of bugs",
            "Anything that wraps the indexed column hides it the same way: date(created_at) = '2026-10-20', created_at::date = ..., email || '' = ..., coalesce(deleted_at, ...) = ..., or an implicit cast when the parameter type does not match the column type. The fix is either to compare the bare column (created_at >= '2026-10-20' AND created_at < '2026-10-21') or to index the expression."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"The table is bloated.\"** E shows 3,120 dead rows out of 1.2 million and a recent autovacuum. More to the point, B read 4 blocks because it never looked at the rest of the table; bloat cannot turn 4 blocks into 15,464. A VACUUM FULL would also take an ACCESS EXCLUSIVE lock on users, which blocks every sign-in while it runs.",
            "**\"The database needs more RAM.\"** Most blocks in C were read from disk, so a bigger cache would make each call faster. But it would still touch 15,464 blocks and call lower() 1.2 million times per sign-in, and that work grows with every new user. CPU at 85% is the work, not the disk.",
            "**\"Parallel workers are the problem.\"** Turning off parallelism makes the same scan run in one process, slower. The workers are the planner making the best of a plan with no index.",
        ]),

        challenge("chal_quiz_pgp_221"),

        h2("5. Choose the fix"),
        p("Write the requirements down first, from the feature and the evidence:"),
        bullets([
            "Sign-in finds the account whatever case the learner types, including the 48,310 accounts stored with capitals.",
            "The lookup searches an index: Index Cond, a handful of buffers, back near 0.05 ms.",
            "No downtime: users is read on every sign-in and written on every sign-up.",
            "Uniqueness ignores case from now on, so \"Mai@...\" and \"mai@...\" cannot become two accounts.",
        ]),
        p("Then test the candidates against the list:"),
        bullets([
            "**Revert the release.** A valid first step if the fix takes longer than a few minutes: it restores 4 ms and case-sensitive sign-in. Revert, then fix forward.",
            "**`WHERE email = lower($1)`.** Uses users_email_key again and fails requirement 1: an account stored as `Linh.Tran@CodeDev.test` can never sign in, whatever is typed. E counts 48,310 such accounts.",
            "**An expression index on `lower(email)`.** Indexes exactly the expression the query compares. No change to the query or the data, and a UNIQUE version also enforces case-insensitive uniqueness.",
            "**citext.** Change the column to the `citext` type (extension), whose comparisons ignore case, so `WHERE email = $1` is case-insensitive and its index is used. Clean for new schemas; on an existing table it is a column type change with its own migration plan, and the PostgreSQL docs suggest considering nondeterministic collations as the alternative.",
            "**Normalise on write.** Store `lower(email)` (keep what the user typed in a display column if you need it), lower the existing rows in a migration, and compare with `email = lower($1)`. Simple queries forever; it needs a data migration and every write path must normalise.",
        ]),
        p("For the incident the expression index is the smallest change that meets all four requirements. Check for case duplicates first, because the unique index fails to build if any exist:"),
        code("sql", `
-- 1. Would a case-insensitive unique index fail?
SELECT lower(email), count(*) FROM users GROUP BY lower(email) HAVING count(*) > 1;

-- 2. Build it without blocking sign-ups (cannot run inside a transaction).
CREATE UNIQUE INDEX CONCURRENTLY users_email_lower ON users (lower(email));

-- 3. Collect statistics on the expression, so the estimate is 1 row instead of 6000.
ANALYZE users;`, "fix, run on the primary"),
        p("If step 1 returns rows, those are real duplicate accounts created before the release; they need a product decision (merge, rename, contact the user) before the index can be unique. Build a non-unique expression index meanwhile to stop the incident."),

        h2("6. The challenge: the same bug in SQLite"),
        p("SQLite supports indexes on expressions with the same rule: the index is used when the WHERE clause compares exactly the indexed expression. The starter has the release's schema and query. The runner inserts the users (some stored with capitals, some with `_` or `%` in the address), runs the sign-in query for each attempt under a budget of SQLite VM steps that stands in for the 900 ms, and checks two things in every test: that `EXPLAIN QUERY PLAN` shows a SEARCH through an index, and that each attempt returns the right account."),
        p("Run the starter first and look at the plan verdict: SQLite reports `SCAN users USING COVERING INDEX users_email`, which reads every entry of the email index. \"USING INDEX\" in a SCAN line is still a full scan."),
        challenge("chal_coding_pgp_222"),

        h2("7. How to verify the fix"),
        bullets([
            "**The plan.** EXPLAIN (ANALYZE, BUFFERS) of the new query shows `Index Scan using users_email_lower`, `Index Cond: (lower(email) = ...)`, a handful of buffers and rows=1 estimated. Run it with an email stored in mixed case too.",
            "**The production numbers that raised the incident.** Reset or snapshot pg_stat_statements and compare mean_ms and blocks per call for the lower(email) query with D; watch the p95 of auth.lookup_user and the database CPU go back to last week's level.",
            "**A regression test that would have failed.** The test suite had 40 users, so every plan was fast. Add a test that runs EXPLAIN on the sign-in query and fails on a Seq Scan, or a CI job that runs the hot queries against a seeded table of realistic size.",
            "**The behaviour.** Sign in with the stored case, with another case, and with an account stored in mixed case; an unknown email finds nothing.",
        ]),
        code("typescript", `
// auth/signIn.plan.test.ts - runs against the seeded integration database (200k users)
test("sign-in lookup searches the lower(email) index", async () => {
  const rows = await db.manyOrNone<{ "QUERY PLAN": string }>(
    "EXPLAIN SELECT id, password_hash FROM users WHERE lower(email) = lower($1)",
    ["Linh.Tran@CodeDev.test"],
  );
  const plan = rows.map((r) => r["QUERY PLAN"]).join("\\n");
  expect(plan).toContain("Index Cond: (lower(email)");
  expect(plan).not.toContain("Seq Scan");
});`, "signIn.plan.test.ts"),

        h2("8. Common mistakes in a \"query got slower\" incident"),
        bullets([
            "**Tuning the server before reading the plan.** More memory, more workers, a bigger instance. Spot it: nobody has compared the plan before and after the release yet.",
            "**Fixing speed and breaking results.** `email = lower($1)` is fast and locks out mixed-case accounts. Spot it: the proposed fix comes with a plan but no test on stored data with capitals.",
            "**Adding an index that does not match the expression.** An index on email, or on email with another collation, does nothing for lower(email). Spot it: after the migration, the plan still has the comparison in a Filter.",
            "**Creating the index without CONCURRENTLY on a busy table.** A plain CREATE INDEX blocks writes to users for the whole build. Spot it: the migration has no CONCURRENTLY and runs inside a transaction.",
            "**Testing on a tiny table.** 40 users make a Seq Scan look instant. Spot it: no test or CI job runs EXPLAIN against realistic data volumes.",
        ]),

        h2("9. Summary"),
        numbered([
            "A function on an indexed column hides it from the index: the plan turns from Index Scan with Index Cond into a Seq Scan with a Filter, and the cost grows with the table.",
            "Read the evidence before acting: the plan shape and the blocks per call explain the slowdown; healthy vacuum stats and the 4-block plan before the release rule out bloat and memory.",
            "Fix it so the indexed expression and the compared expression match (expression index, citext, or normalised data), keep the results correct for every stored case, and verify with the plan and the production numbers.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Indexes on Expressions - https://www.postgresql.org/docs/current/indexes-expressional.html",
            "PostgreSQL documentation: CREATE INDEX (CONCURRENTLY) and citext",
            "PostgreSQL documentation: Using EXPLAIN and pg_stat_statements - https://www.postgresql.org/docs/current/pgstatstatements.html",
            "SQLite documentation: Indexes On Expressions",
        ]),
        callout("tip", "Self-practice (not graded): write the incident note",
            "Write the incident note as you would post it in the incident channel, in at most ten lines: what users saw, the impact (p95, CPU, how long, how many sign-ins), the root cause in one sentence, why tests and review did not catch it, the fix and how it was verified, and two follow-ups (for example a plan test in CI against realistic data, and a decision on normalising emails on write). Every claim should point at one piece of evidence, A to E."),
    ],
});
