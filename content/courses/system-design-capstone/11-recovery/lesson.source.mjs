// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-4-2",
    title: "Recovery: rebuild the leaderboard after losing the cache",
    slug: { _type: "slug", current: "recovery-rebuild-leaderboard-after-losing-cache" },
    description:
        "Redis restarted empty and took the CodeDev leaderboard with it. The first rebuild read every progress event in one query: progress writes slowed to 2.8 s, learners watched their rank drop to #812 while the board refilled, and 6,912 events written during the rebuild never reached it. Learn to rebuild a projection from the source of truth in batches that leave room for writes, into new keys, while readers get the last snapshot with a \"rebuilding\" status, then catch up past the watermark and switch with one write.",
    estimatedTime: 40,

    scenario: {
        role: "Backend engineer on call for the leaderboard, CodeDev learning platform",
        problem:
            "Sunday 10:02. The Redis instance that holds the leaderboard hit its memory limit during a key migration, was restarted by its supervisor and came back empty: persistence was off because \"it is only a cache\". The weekly and all-time boards on https://app.codedev.test went blank. The runbook said \"rebuild from PostgreSQL\", so the on-call engineer ran the script rebuild-leaderboard.ts. For the next three minutes progress saves took up to 2.8 s, learners posted screenshots of their rank falling from #3 to #812, and on Monday the nightly reconciliation found 6,912 events counted in PostgreSQL but not on the board.",
    },

    content: [
        h2("1. The incident: the rebuild that hurt more than the loss"),
        p("Losing the leaderboard was expected to be harmless. The design of lesson 6 says the board is a **projection**: every point on it comes from a progress event in PostgreSQL, so it can always be recomputed. The script that recomputed it was the problem:"),
        code("typescript", `
// scripts/rebuild-leaderboard.ts (runbook version)
const rows = await db.query("SELECT user_id, week, points FROM progress_event ORDER BY seq"); // 9.8 M rows
const pipeline = redis.pipeline();
for (const r of rows) {
  pipeline.zincrby("lb:alltime", r.points, r.user_id);
  pipeline.zincrby(\`lb:weekly:\${r.week}\`, r.points, r.user_id);
}
await pipeline.exec();`, "rebuild-leaderboard.ts"),
        p("It reads the whole log, then writes into the same keys the API reads from. Three dashboards from the 3 minutes 10 seconds it ran tell the rest:"),
        code("text", `
time      PG CPU  progress write p95  leaderboard reads (alltime top 3)             API memory (rebuild pod)
10:02:30  31%     45 ms               (empty board)                                 0.4 GB
10:03:10  94%     2,810 ms            u_2203 1,210 / u_0815 1,050 / u_1290 980      3.9 GB
10:04:40  88%     2,350 ms            u_0815 11,400 / u_2203 10,960 / u_4471 10,020  4.1 GB
10:05:40  33%     47 ms               u_0815 18,920 / u_2203 18,450 / u_4471 17,990  0.4 GB
Monday reconciliation: 6,912 events with seq > 9,812,440 are missing from the board (all written 10:02:05 - 10:05:15)`, "dashboards, Sunday"),

        h2("2. Read the evidence: three separate failures"),
        bullets([
            "**It blocked writes.** One query over 9.8 million rows plus sorting by `seq` took PostgreSQL to 94% CPU, and learners saving progress shared that CPU: write p95 went from 45 ms to 2.8 s. The rebuild is a background job; it competed with the most important journey on the platform as if it were more important.",
            "**It served a half-built board.** Readers used `lb:alltime` while the script was still filling it. A learner with 18,000 points showed 1,210 because most of their events had not been read yet. A board that is fresh but incomplete is wrong, and it looks like data loss to the learner.",
            "**It lost the events written during the rebuild.** The query saw the log as it was at 10:02:05 (seq up to 9,812,440). The runbook stops the leaderboard consumer while the script runs (so it does not write into a board being refilled) and restarts it afterwards, subscribed from the latest position of the stream. Events written between the query and the restart reached neither the script nor the consumer. That is the 6,912.",
        ]),
        p("The memory column is a fourth warning: loading every row into the API process works at 9.8 million rows and fails at 40 million. A recovery procedure must work at the size the system will have when you need it, not the size it had when the runbook was written."),

        h2("3. Core idea: rebuild beside, catch up, switch once"),
        p("A projection is rebuildable only if three things are true: the source of truth keeps every fact (the `progress_event` log with a monotonic `seq`), applying the facts is deterministic, and you have a procedure that does it **without hurting the live system**. The procedure has five parts:"),
        numbered([
            "**Batches with a cursor.** Read `WHERE seq > :cursor ORDER BY seq LIMIT 5000` (keyset pagination on the primary key: each batch is an index range scan, never an `OFFSET`). Each batch is small enough that writes keep their latency; pause between batches if PostgreSQL's CPU goes above a threshold.",
            "**New keys.** Write into `lb:v9:alltime` and `lb:v9:weekly:<week>`, not into the keys readers use. Nobody sees them until they are complete.",
            "**A labelled fallback for readers.** Until the switch, `GET /leaderboard` answers from the hourly snapshot (top 100 per board, saved to PostgreSQL with its `asOfSeq`) and says `status: \"rebuilding\"`, so the web app shows \"Leaderboard is being refreshed\" above a consistent, slightly old board.",
            "**A watermark and a catch-up.** The head of the log when the rebuild starts (W) is where the bulk copy ends, not where the rebuild ends. Keep reading from the cursor until it reaches the head **as it is now**, because learners kept writing.",
            "**One atomic switch, then live updates from the right place.** `SET lb:current v9` moves every reader at once. The live consumer then applies only events with `seq` above the last one the rebuild applied, and skips redeliveries at or below it.",
        ]),
        h3("When not to"),
        p("Rebuilding is the last line of defence, not the first. If a 3-minute rebuild with a stale board is not acceptable, keep Redis from losing the data in the first place: AOF persistence or a replica costs a little memory and money and turns most restarts into a non-event. The reverse also holds: for a projection with a few thousand rows, a synchronous rebuild in one transaction is simpler than everything above. Measure the rebuild time in a drill, compare it with what the product can tolerate (lesson 14 sets the leaderboard target at 99% and allows it to be stale), and only then decide how much machinery it needs."),
        callout("info", "Replay the events, or aggregate them?",
            "The leaderboard could also be rebuilt from aggregates: SELECT user_id, sum(points) ... WHERE seq <= :W GROUP BY user_id, in batches of user ids. That reads the same rows but writes 200,000 ZADDs instead of 19.6 million ZINCRBYs. Either works with the five parts above: the watermark W still separates the bulk copy from the catch-up. Replaying events is simpler to make identical to the live consumer (one apply function for both), which is why this lesson uses it."),

        challenge("chal_quiz_sdc_421"),

        h2("4. Worked example: the rebuild job"),
        p("The job runs as a background worker, not inside an API request. Its state (version, cursor, status) lives in PostgreSQL so that a crashed job resumes instead of starting over, as long as the new keys still exist in Redis:"),
        code("typescript", `
async function rebuild(version: number) {
  const watermark = await db.one("SELECT max(seq) AS w FROM progress_event");      // for the logs
  let cursor = 0;
  for (;;) {
    const batch = await db.query(
      "SELECT seq, user_id, week, points FROM progress_event WHERE seq > $1 ORDER BY seq LIMIT 5000", [cursor]);
    const pipeline = redis.pipeline();
    for (const e of batch) apply(pipeline, version, e);                             // same function as the consumer
    await pipeline.exec();
    if (batch.length) cursor = batch[batch.length - 1].seq;
    await jobs.saveCursor(version, cursor);

    const head = await db.one("SELECT max(seq) AS h FROM progress_event");
    if (cursor >= head.h) break;                                                    // caught up, past the watermark
    if ((await pgCpu()) > 0.6) await sleep(200);                                    // leave room for writes
  }
  await redis.set("lb:current", \`v\${version}\`);                                 // the switch: one write
  await jobs.markLive(version, cursor);                                             // consumer resumes after cursor
  log.info({ version, watermark: watermark.w, appliedSeq: cursor }, "leaderboard rebuilt");
}

function apply(p: ChainableCommander, version: number, e: ProgressEvent) {
  p.zincrby(\`lb:v\${version}:alltime\`, e.points, e.user_id);
  p.zincrby(\`lb:v\${version}:weekly:\${e.week}\`, e.points, e.user_id);
}`, "leaderboard-rebuild.worker.ts"),
        p("The read path checks the pointer and falls back to the snapshot. Note that a lost Redis also loses `lb:current`, so a missing pointer means \"rebuilding\", never \"empty board\":"),
        code("typescript", `
async function readBoard(board: string, n: number): Promise<BoardRead> {
  const live = await redis.get("lb:current");                // null after Redis was lost
  if (live) return { status: "ready", top: await redis.zrevrange(\`lb:\${live}:\${board}\`, 0, n - 1, "WITHSCORES") };
  const snap = await db.one("SELECT as_of_seq, top FROM leaderboard_snapshot WHERE board = $1", [board]);
  return { status: "rebuilding", asOfSeq: snap.as_of_seq, top: snap.top.slice(0, n) };
}`, "leaderboard.reader.ts"),

        h2("5. The watermark on a timeline"),
        p("Here is Sunday's rebuild done the right way, with the same log and the same writes:"),
        code("text", `
seq:   1 ............................. 9,812,440 (W, head at start) ...... 9,819,352 (head at switch)
       |---- bulk copy: 1,963 batches of 5,000 ---|--- catch-up: 2 batches ---|
time:  10:02:05                                   10:05:12                    10:05:15  SET lb:current v9
live consumer:  until 10:05:15 -> ignores events (the rebuild will read them from the log)
                after 10:05:15 -> applies seq > 9,819,352, skips seq <= 9,819,352 (redeliveries)`, "rebuild #2, with catch-up"),
        p("The handover is the delicate part. If the consumer kept applying live events to the new keys during the rebuild, the catch-up would read them from the log again and count them twice. If it applied them to the old keys, or was paused and restarted from the latest position as on Sunday, they would be lost at the switch. Choosing one owner per range of `seq` (the rebuild up to the switch, the consumer after it) removes both failures."),

        h2("6. The challenge: rebuild without blocking, then switch"),
        p("The challenge gives you an append-only event log, a fake Redis with sorted sets and an hourly snapshot. The runner interleaves rebuild steps with learner writes, redeliveries, reads, and a second loss of Redis in the middle of a rebuild. You write `LeaderboardService`: batches through a cursor, new keys, snapshot reads with a status, catch-up to the moving head, one switch, and live updates that skip anything already applied."),
        challenge("chal_coding_sdc_422"),

        h2("7. How to verify"),
        bullets([
            "**A rebuild drill, timed, in staging with production-sized data.** Flush the leaderboard Redis and run the job. Record the time to switch (CodeDev's last drill: 200,000 learners, 3 min 10 s) and put it in the failure-mode table of lesson 13. A drill nobody times does not tell you whether the stale period is acceptable.",
            "**Write latency during the drill.** Run the normal load test for progress writes at the same time. Pass if write p95 stays within 10% of its baseline (45 ms); if not, lower the batch size or raise the pause.",
            "**Reconcile after the switch.** The same query as lesson 10: every learner's score equals the sum of their progress events. Then write during the rebuild on purpose and check those learners specifically: they are the ones a missing catch-up loses.",
            "**Readers never see a partial board.** Poll GET /leaderboard every second during the drill: each answer is either `rebuilding` with the snapshot's `asOfSeq`, or `ready` with the complete board, never a ready board whose top scores are lower than the snapshot's.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Rebuilding into the live keys.** Readers see the board filling up from zero. Spot it: the rebuild script writes to the same key names the reader uses.",
            "**Stopping at the watermark.** Events written during the rebuild are lost. Spot it: the loop ends at a `max(seq)` read once, before the loop.",
            "**Feeding live events into the new keys and also catching up from the log.** Every event written during the rebuild counts twice. Spot it: the consumer has a \"rebuild in progress\" branch that writes to the new version.",
            "**One huge query, or OFFSET pagination.** Either saturates PostgreSQL, the second one more with every page. Spot it: `LIMIT ... OFFSET`, or no `LIMIT` at all, in a recovery script.",
            "**Assuming the rebuild finishes once.** Redis can fail again during the rebuild. Spot it: a job that resumes its cursor without checking that the keys it was filling still exist.",
        ]),

        h2("9. Summary"),
        numbered([
            "A projection is only as recoverable as its rebuild procedure: rebuild in bounded batches from the source of truth, into new keys, and measure it in a drill.",
            "During the rebuild, readers get the last snapshot with an explicit \"rebuilding\" status; a fresh but partial board is wrong, a labelled stale one is honest.",
            "The watermark ends the bulk copy, not the rebuild: catch up to the moving head, switch with one write, and let the live consumer own every seq after the switch.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler, Patterns of Distributed Systems: Write-Ahead Log and High-Water Mark - martinfowler.com/articles/patterns-of-distributed-systems/",
            "Redis documentation: Redis persistence (RDB and AOF) - redis.io/docs/latest/operate/oss_and_stack/management/persistence/",
            "PostgreSQL documentation: LIMIT and OFFSET (why OFFSET still reads the skipped rows) - postgresql.org/docs/current/queries-limit.html",
        ]),
        callout("tip", "Self-practice (not graded): write the recovery runbook",
            "Rewrite CodeDev's runbook entry \"Leaderboard lost\" in at most 15 lines: how you detect it (lb:current missing, reconciliation alert), what readers see meanwhile, the command that starts the rebuild, the two numbers you watch (write p95, cursor vs head), how you know it switched, and the reconciliation you run afterwards. Then decide, with numbers from a drill, whether AOF persistence on the leaderboard Redis is worth enabling."),
    ],
});
