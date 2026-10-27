// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-3-2",
    title: "Apply only newer events: versioned score updates",
    slug: { _type: "slug", current: "versioned-score-updates" },
    description:
        "A slow consumer worker wrote an older total over a newer one, and a learner who had hidden from the leaderboard came back two seconds later. Learn why score updates should carry a total and a version from PostgreSQL, how to classify an update as applied, duplicate or stale, why a removal must keep its version, why versions are compared as numbers, and how to make check-and-write atomic in Redis with a Lua script.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (leaderboard consumer)",
        problem:
            "Ticket #6120: \"My profile says 380 points but the leaderboard shows me with 300, and I passed two challenges since then.\" Ticket #6127: \"I turned off 'Show me on the leaderboard' and I am still on it.\" Grading writes the learner's new total to PostgreSQL and an outbox row; a relay publishes it, and two consumer workers apply each message to the Redis board with ZADD (or ZREM when the learner hides). The relay retries a message when a worker does not acknowledge it within 10 seconds.",
    },

    content: [
        h2("1. The incident: every message wins, including the old ones"),
        p("The consumer as it shipped. Each message carries the learner's new total, computed by PostgreSQL in the grading transaction, or `null` when the learner left the board:"),
        code("typescript", `
// src/leaderboard/score.consumer.ts - the version that shipped
async handle(msg: { learnerId: string; totalScore: number | null }) {
    if (msg.totalScore === null) await this.redis.zrem("lb:all", msg.learnerId);
    else await this.redis.zadd("lb:all", msg.totalScore, msg.learnerId);
}`, "score.consumer.ts"),
        p("Sending totals instead of deltas was a good decision: applying the same total twice is harmless, while `ZINCRBY` twice would count the points twice. But a total is only right if it is the **latest** total, and this code has no way to know. Whatever message is handled last wins."),

        h2("2. Read the evidence"),
        p("The consumer logs every message with the worker that handled it. Put the two learners' lines side by side with the database:"),
        code("text", `
received      worker    learner  total  note
10:40:58.020  worker-1  u_2290   300    handler stuck on a slow Redis connection, no ack
10:41:07.112  worker-2  u_2290   340    -> ZADD
10:41:07.590  worker-2  u_2290   380    -> ZADD
10:41:08.031  worker-2  u_2290   300    relay redelivered the unacknowledged message -> ZADD
10:52:30.100  worker-2  u_4410   null   learner hid from the leaderboard -> ZREM
10:52:31.870  worker-1  u_4410   260    older message, delayed in worker-1's buffer -> ZADD`, "consumer log"),
        code("sql", `
SELECT learner_id, total, version, show_on_leaderboard FROM learner_score
WHERE learner_id IN ('u_2290', 'u_4410');

 learner_id | total | version | show_on_leaderboard
------------+-------+---------+---------------------
 u_2290     |   380 |      15 | t
 u_4410     |   260 |       8 | f`, "psql"),
        p("Two different failures, one cause. The message for 300 was created first, but it was **applied last**, because the relay redelivered it after a timeout. The message for 260 was older than the removal, but a slower worker applied it two seconds later and put u_4410 back. Delivery through a queue is at least once and in no guaranteed order: two workers, retries and buffers each break ordering on their own. The board has to decide what is newer by itself."),

        h2("3. Core idea: the database gives every state a version"),
        p("PostgreSQL already knows the order. Add a `version` column to `learner_score` and increment it in the same transaction that changes the total:"),
        code("sql", `
UPDATE learner_score
SET total = total + $2, version = version + 1
WHERE learner_id = $1
RETURNING total, version;          -- both go into the outbox row`, "grading transaction"),
        p("Row locking makes the versions of one learner strictly increasing, in the same order as the totals they describe. Every message now says \"this is the learner's total **as of version N**\", and the consumer keeps the last applied version per learner in a hash next to the board:"),
        bullets([
            "`lb:all` - sorted set, member = learner id, score = total.",
            "`lb:ver` - hash, field = learner id, value = last applied version.",
        ]),
        p("For each message there are exactly three cases, and naming them makes them testable:"),
        numbered([
            "**Applied:** the version is higher than the stored one (or nothing is stored yet). Write the total (or remove the member) and store the version.",
            "**Duplicate:** the version equals the stored one. It is the same database state delivered again; nothing to do. Report it, because a burst of duplicates tells you the relay is retrying.",
            "**Stale:** the version is lower. A newer state is already on the board; drop the message. A burst of stale messages tells you a worker is slow.",
        ]),
        p("With this rule the arrival order stops mattering: whatever order the same messages arrive in, each learner ends at the state of their highest version. That property is what you test."),

        h3("A removal is a state too"),
        p("When u_4410 hides, the board must forget the member - but `lb:ver` must **not** forget the version. If the removal deleted `lb:ver u_4410` as well, the delayed message with version 7 would find no stored version, count as new, and put the learner back: the incident again, with extra steps. The stored version is a tombstone. It is a few bytes per learner, and it is what makes \"hidden\" stick. When the learner shows up again, the database bumps the version once more and the new total wins."),

        h3("Why not a timestamp?"),
        p("`updatedAt` from the API server looks like a version, but two API instances' clocks can disagree by more than the gap between two submissions, and two updates can share a millisecond. A clock tells you when a server *thought* something happened; a counter incremented under a row lock tells you the order in which the database applied it. Use the counter."),
        callout("info", "When not to build this",
            "If the leaderboard may lag by a minute, a job that copies the top totals from PostgreSQL into Redis every minute (into a new key, swapped in as in the next lesson) needs no consumer, no versions and no tombstones. The versioned consumer earns its complexity when the board must move within a second of a pass and messages can be retried or reordered - which is every queue with more than one worker."),

        challenge("chal_quiz_rdp_321"),

        h2("4. Check and write must be one step"),
        p("Every Redis command is atomic. A sequence of commands is not. If the consumer runs `HGET`, compares in TypeScript, and then sends `ZADD` and `HSET`, another worker can run its own `HGET` in between, and both believe they are newest. The stale write then wins - and moves the stored version backwards too."),
        p("Redis gives you two ways to make the sequence one step:"),
        bullets([
            "**A Lua script** (`EVAL`, or `EVALSHA` after `SCRIPT LOAD`; since Redis 7 also Redis Functions with `FCALL`). Redis runs the whole script without running any other command in between. This is the usual choice: one round trip, no retries.",
            "**Optimistic locking:** `WATCH lb:ver`, read, then `MULTI ... EXEC`. If another client changed `lb:ver` after the WATCH, `EXEC` returns null and you retry. It works, but with many learners in one hash every write to the hash aborts the others' transactions, so contention grows with traffic.",
        ]),
        p("A minimal script for the \"only if newer\" rule looks like this. Note `tonumber`: hash values and `ARGV` are strings, and Lua compares strings character by character, so without it \"9\" would count as newer than \"10\":"),
        code("text", `
-- KEYS[1] = lb:all   KEYS[2] = lb:ver   ARGV[1] = learnerId   ARGV[2] = total   ARGV[3] = version
local stored = tonumber(redis.call('HGET', KEYS[2], ARGV[1]) or '0')
local incoming = tonumber(ARGV[3])
if incoming <= stored then
  return 0
end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[3])
return 1`, "set_if_newer.lua"),
        code("typescript", `
// ioredis: define the script once, call it like a command
redis.defineCommand("setIfNewer", { numberOfKeys: 2, lua: readFileSync("set_if_newer.lua", "utf8") });
const changed = await redis.setIfNewer("lb:all", "lb:ver", msg.learnerId, msg.totalScore, msg.version);`, "score.consumer.ts"),
        p("This script is deliberately incomplete: it cannot tell a duplicate from a stale message, and it has no removal. Both matter in production - one for monitoring, one for correctness - and both are part of the challenge."),
        callout("warning", "Pass every key in KEYS",
            "A script must receive every key it touches in KEYS, not build key names inside the script. Redis Cluster uses KEYS to route the call, and both keys must live in the same hash slot: name them lb:{all} and lb:{all}:ver (a hash tag) if the board ever moves to a cluster."),

        h2("5. Write the consumer"),
        p("The challenge gives you the in-memory Redis model, which runs one call at a time, so plain calls are atomic there; the protocol is what is graded. Its runner also replays the same updates in several other orders and checks that every order ends with the same board and versions:"),
        challenge("chal_coding_rdp_322"),

        h2("6. How to verify"),
        bullets([
            "**Order-independence as a test.** Take a list of updates with retries and reorders, apply it in many shuffled orders, and assert the final board and `lb:ver` are identical. One assertion covers a whole class of bugs. Make sure the list never has two different payloads with the same version - the database cannot produce that, and no protocol can make it order-independent.",
            "**Versions above 9.** Every test suite needs a learner at version 9 receiving version 10. String comparison passes every test below 10.",
            "**Parity with PostgreSQL.** `HGET lb:ver u_2290` must equal `learner_score.version`, and `ZSCORE lb:all u_2290` the total, once the stream is drained. A nightly job that samples a few hundred learners catches drift early.",
            "**Metrics.** Count applied, duplicate and stale per minute. Duplicates track relay retries; stale messages track slow workers. Both should be small and spiky, not a steady stream.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**Comparing versions as strings.** In Lua (`stored >= ARGV[3]`) or in TypeScript (`\"10\" < \"9\"`). Spot it: a learner frozen at one total once their version reaches 10; test 9 -> 10.",
            "**Applying equal versions.** `version >= stored` keeps the state correct but reports duplicates as applied and re-triggers side effects such as \"you moved up\" notifications. Spot it: duplicate count is always 0 even while the relay retries.",
            "**Forgetting the tombstone.** Removing the version with the member lets a delayed older total bring a hidden learner back. Spot it: a test that sends removal v8, then total v7.",
            "**Treating 0 as a removal.** `if (!total) zrem(...)` removes a learner whose only pass was revoked. Spot it: a test with total 0 that expects the learner on the board with 0.",
            "**Check in the app, write in Redis.** HGET, compare, ZADD from TypeScript with two workers. Spot it: a two-worker timeline in a review, or rare stale totals under load; move the check into a script.",
        ]),

        h2("8. Summary"),
        bullets([
            "Send totals with a version that PostgreSQL increments in the same transaction; deltas double-count and timestamps disagree between servers.",
            "Apply an update only when its version is higher than the stored one, report equal as duplicate and lower as stale, keep the version even when the learner leaves the board, and compare versions as numbers.",
            "Check and write in one atomic step (a Lua script), and prove order-independence by replaying the same updates in shuffled orders.",
        ]),

        h2("Sources"),
        bullets([
            "Redis documentation: Scripting with Lua (EVAL, EVALSHA) and Redis Functions - https://redis.io/docs/latest/develop/interact/programmability/",
            "Redis documentation: Transactions (MULTI, EXEC, WATCH) - https://redis.io/docs/latest/develop/interact/transactions/",
            "Redis documentation: Sorted sets - https://redis.io/docs/latest/develop/data-types/sorted-sets/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Extend set_if_newer.lua to return 'applied', 'duplicate' or 'stale' and to handle removals, then run it against a local Redis with redis-cli --eval and the update lists from your tests. Measure how many stale messages your own queue produces under load with two workers."),
    ],
});
