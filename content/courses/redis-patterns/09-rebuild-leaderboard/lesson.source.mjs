// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-3-3",
    title: "Rebuild the leaderboard from the event log",
    slug: { _type: "slug", current: "rebuild-leaderboard-from-event-log" },
    description:
        "The all-time board had drifted from PostgreSQL, and the script that rebuilt it showed learners a half-empty leaderboard for 40 seconds and counted some new passes twice. Learn how to rebuild a sorted set from the event log into a temporary key, swap it in with RENAME, take a watermark and catch up on the events that arrived meanwhile, deduplicate by event id so a replay is harmless, and check that the result equals every event applied once.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer, CodeDev API (leaderboard)",
        problem:
            "The nightly parity job reported 214 learners whose score in lb:all differs from PostgreSQL: for three days a consumer bug applied redelivered events twice. An engineer ran a one-off script to rebuild the board on Thursday at 10:00. For about 40 seconds the leaderboard page showed the top learner with 40 points, then 2,210, then 4,380; support received screenshots. The next parity run found 17 learners off by exactly one event - all of them had passed a challenge during those 40 seconds.",
    },

    content: [
        h2("1. The incident: a fix that made a second incident"),
        p("The board is derived data. PostgreSQL's `score_events` table has one row per graded pass and a correction row with negative points when a pass is revoked; `lb:all` should be the sum of those rows per learner. When the two disagree, PostgreSQL wins, and the board is rebuilt. This was the script:"),
        code("typescript", `
// scripts/rebuild-leaderboard.ts - the version that ran on Thursday
await redis.del("lb:all");
let lastId = 0;
for (;;) {
    const rows = await pg.query(
        "SELECT id, learner_id, points FROM score_events WHERE id > $1 ORDER BY id LIMIT 1000", [lastId]);
    if (rows.length === 0) break;
    const tx = redis.multi();
    for (const r of rows) tx.zincrby("lb:all", r.points, r.learner_id);
    await tx.exec();
    lastId = rows[rows.length - 1].id;
}`, "rebuild-leaderboard.ts"),
        p("It reads the log correctly - keyset pagination, ordered by id - and it produced the right totals for every learner who did nothing during those 40 seconds. Two things went wrong, and they are the two things this lesson is about: **readers** could see the board while it was being built, and **writers** - the live consumer - kept writing to the same key at the same time."),

        h2("2. Read the evidence"),
        code("text", `
10:00:00.004  script   DEL lb:all
10:00:00.210  script   page 1 (ids 1..1000) applied
10:00:02.118  api      GET /leaderboard?board=all -> u_0815 40, u_1001 30, u_2040 20
10:00:11.733  consumer event 418553 (u_7781 +40) -> ZINCRBY lb:all 40 u_7781
10:00:19.402  api      GET /leaderboard?board=all -> u_0815 2210, u_1001 1650, u_2040 1490
10:00:38.950  script   page 419 (ids 418001..418553) applied     <- includes 418553 again
10:00:40.611  script   done`, "API and script logs"),
        p("The first and third lines explain the screenshots: after `DEL`, every read saw an empty or partly rebuilt board. `MULTI/EXEC` around each page did not help, because it only makes one page atomic; the gaps between pages are visible. The fourth and ninth lines explain the 17 learners: event 418553 arrived while the script was running. The consumer applied it to `lb:all`, and then the script, which had not reached that id yet, read it from the table and applied it again."),
        p("You can reproduce both in a test without Redis or PostgreSQL: run the rebuild against fakes, let the fake database commit a few new events and call the live consumer every time the rebuild queries it, and read the board in between. That is exactly how the challenge in this lesson tests your rebuild."),

        h2("3. Core idea: build where nobody looks, swap, then catch up"),
        p("A correct rebuild has four steps. Each one fixes a specific failure:"),
        numbered([
            "**Take a watermark.** `SELECT max(id) FROM score_events` gives W. The rebuild will build exactly the events with id <= W. Everything after W is handled in step 4, so the build itself has a fixed, finite amount of work.",
            "**Build into a temporary key.** Apply the events 1..W to `lb:all:rebuild`, page by page. Nobody reads that key, so it does not matter how long it takes or what it looks like halfway. Delete any `:rebuild` key a crashed earlier run left behind before you start, or its leftovers are added to your new board.",
            "**Swap with RENAME.** `RENAME lb:all:rebuild lb:all` replaces the live board in one command. A reader sees the old board or the new one, never a mix.",
            "**Catch up from the watermark.** The live consumer never stopped. Events after W that it applied before the swap went to the old board, which RENAME just threw away; events it applies after the swap go to the new board. Replay every event with id > W onto the new board, and skip the ones that are already there.",
        ]),
        p("Step 4 is where the Thursday script double-counted, and it is solved by the same tool as every other duplicate in this course: **deduplicate by event id**. Keep, next to the board, the set of event ids the board contains. The live consumer and the catch-up both go through one function: if the id is already in the set, skip it; otherwise add it and apply the points. Then it does not matter who gets to an event first, or how many times it is delivered."),
        callout("info", "The board and its dedupe set move together",
            "The set of applied ids describes one particular board, so it is rebuilt and swapped with it: lb:seen:rebuild becomes lb:seen in the same step as lb:all:rebuild becomes lb:all. If the two RENAMEs could be separated by a live event, that event would be checked against one board's ids and applied to the other's - either lost or counted twice. Run both inside one MULTI/EXEC so nothing runs between them."),

        h3("What RENAME does, precisely"),
        bullets([
            "`RENAME src dst` moves the value and the TTL of `src` to `dst` and overwrites whatever `dst` held. It is atomic: no command runs between \"old board\" and \"new board\".",
            "If `src` does not exist, RENAME fails with `ERR no such key`. A rebuild of an empty log has nothing to rename: delete the live keys instead.",
            "Overwriting `dst` deletes the old value, and Redis frees it synchronously by default. For a very large old board that can stall the server for a moment; with `lazyfree-lazy-server-del yes` in redis.conf the memory is freed in a background thread. Measure with `LATENCY` monitoring before you worry about it.",
            "In Redis Cluster, both keys must be in the same hash slot. Name them with a hash tag, `lb:{all}` and `lb:{all}:rebuild`, if you run a cluster.",
        ]),

        challenge("chal_quiz_rdp_331"),

        h3("When the watermark is not enough"),
        p("A bigserial id is assigned when the row is inserted, but becomes visible when the transaction commits. A slow transaction can hold id 1839 and commit after you read `max(id) = 1840`. Its event is not in the build (it was invisible) and not in the catch-up (1839 <= 1840). Because the catch-up deduplicates, the fix is cheap: start it a little before the watermark, for example from the max id minus a few thousand, or from the ids committed in the last minutes. Replaying events that are already on the board does nothing. The challenge's fake database commits in id order, so there it is enough to start at the watermark; production code should keep the overlap and a parity check."),
        callout("info", "When not to rebuild like this",
            "If the board can be a minute late, the simplest correct design is to rebuild it on a schedule from learner_score (one row per learner, no event replay) and swap it in - no live consumer, no dedupe set. And a rebuild is only possible because PostgreSQL keeps every event: if Redis were the only copy of the scores, there would be nothing to rebuild from (lesson 2.3)."),

        h2("4. Worked example: the pieces in ioredis"),
        p("Read the log with keyset pagination - `WHERE id > $last ORDER BY id LIMIT n` uses the primary key index for every page, while `OFFSET` gets slower with every page and can skip or repeat rows when new ones arrive. Send each page's writes in a pipeline, since nobody reads the temporary key:"),
        code("typescript", `
const PAGE = 1000;
let last = 0;
for (;;) {
    const rows = await pg.query(
        "SELECT id, learner_id, points FROM score_events WHERE id > $1 AND id <= $2 ORDER BY id LIMIT $3",
        [last, watermark, PAGE]);
    if (rows.length === 0) break;
    const pipe = redis.pipeline();                   // one round trip per page, not atomic - and it does not need to be
    for (const r of rows) {
        pipe.hset("lb:seen:rebuild", String(r.id), "1");
        pipe.zincrby("lb:all:rebuild", r.points, r.learner_id);
    }
    await pipe.exec();
    last = rows[rows.length - 1].id;
}`, "rebuild.pages.ts"),
        p("The swap is the one place where atomicity matters, so it is a transaction:"),
        code("typescript", `
await redis.multi()
    .rename("lb:all:rebuild", "lb:all")
    .rename("lb:seen:rebuild", "lb:seen")
    .exec();`, "rebuild.swap.ts"),
        p("In the live consumer, \"skip if seen\" and \"apply\" belong together as well: `HSET` returns 1 when the field is new and 0 when it existed, so one command both checks and marks. In production, wrap the HSET and the ZINCRBY in a Lua script (lesson 3.2) so a crash cannot mark an event without applying it."),
        p("Now put the four steps together. The challenge gives you the in-memory Redis model and a fake database; its runner commits and delivers live events before every database query and right before your swap, reads the board in between, and compares your final board with every event applied once:"),
        challenge("chal_coding_rdp_332"),

        h2("5. How to verify a rebuild"),
        bullets([
            "**Equality with the log.** After a rebuild (and once the stream is drained), `SELECT learner_id, sum(points) FROM score_events GROUP BY learner_id` must equal `ZRANGE lb:all 0 -1 WITHSCORES` exactly - members, scores, and members at 0. This is the parity job from lesson 3.1, run on demand.",
            "**Idempotence.** Run the rebuild twice in a row. The second run must produce the same board. If it does not, something depends on leftover state.",
            "**Readers.** In a test, read the board at every step of the rebuild. Its size and total must never drop below the board you started with (when no corrections arrive meanwhile). In production, watch the top-10 response: a drop to tiny scores during a rebuild is the Thursday incident.",
            "**Leftovers.** `redis-cli --scan --pattern 'lb:*:rebuild'` must be empty after a successful run. A leftover means a run crashed; the next run must clear it first.",
            "**Interleaving tests.** A fake database that delivers live events before each query, including duplicates and an event right before the swap, finds the double-count and the lost event deterministically. Real concurrency would find them once a month.",
        ]),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**DEL, then replay into the live key.** Readers see a half-built board. Spot it: a reader in a test sees fewer members or lower totals than before the rebuild.",
            "**No catch-up.** Events applied live to the old board during the rebuild disappear with the swap. Spot it: the parity check after a rebuild finds learners missing exactly the passes they earned during it.",
            "**Catch-up without dedupe.** Replaying ids > W with plain ZINCRBY counts again every event the live consumer already applied to the new board. Spot it: learners off by exactly one event, all active during the rebuild.",
            "**One query for the whole log, or OFFSET pages.** Fine on staging, a timeout or a memory spike on production's table; OFFSET also skips rows when new ones arrive. Spot it: the query plan, or a page size limit in tests.",
            "**Leftover temporary keys and an empty log.** A crashed run's `:rebuild` key is added to the next board; a RENAME of a key that was never created fails. Spot it: tests that start with leftovers, and a test with an empty log.",
        ]),

        h2("7. Summary"),
        bullets([
            "The leaderboard is a rebuildable copy of PostgreSQL's event log: build the new board in a temporary key and swap it in with one RENAME (board and dedupe set together, in MULTI/EXEC), so readers never see it half-built.",
            "Take a watermark, build up to it, and after the swap replay everything above it; deduplicating by event id makes the replay harmless, so overlap is safe and nothing the live consumer did is lost or counted twice.",
            "Verify with equality against the log, a second run, readers sampled during the rebuild, and deterministic interleaving tests.",
        ]),

        h2("Sources"),
        bullets([
            "Redis command reference: RENAME (atomic replace, implicit DEL of the destination) and MULTI/EXEC - https://redis.io/docs/latest/develop/interact/transactions/",
            "Redis documentation: Sorted sets - https://redis.io/docs/latest/develop/data-types/sorted-sets/",
            "PostgreSQL documentation: LIMIT and OFFSET (why large offsets are slow) and sequences (nextval is not transactional)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the rebuild against a local Redis and PostgreSQL with 200,000 generated events, run a script that inserts and delivers new events every few milliseconds while it runs, and measure two things: how long the RENAME takes with and without lazyfree-lazy-server-del, and whether the parity check is clean afterwards."),
    ],
});
