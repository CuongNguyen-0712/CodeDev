// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-3-1",
    title: "Leaderboards with sorted sets: top N & a learner's rank",
    slug: { _type: "slug", current: "leaderboard-sorted-sets-top-n-rank" },
    description:
        "The new Redis leaderboard answered in 2 ms instead of 2.4 s, and then the two best learners on CodeDev saw an empty \"Around you\" box. Learn why a sorted set fits top N and rank, how Redis orders equal scores and which rank rule to promise, how negative indexes and a top of zero bite, how to name and expire weekly boards by ISO week, and when a PostgreSQL query is still the better leaderboard.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (leaderboard)",
        problem:
            "Last sprint the leaderboard moved from a PostgreSQL window query (2.4 s at the Monday-morning peak) to Redis sorted sets. Response times dropped to a few milliseconds, but on day one two tickets arrived. u_0815, first on the all-time board, wrote: \"The 'Around you' box on my profile is empty. My friend who is third sees five people.\" The second learner on the board reported the same. And an ops review found 52 keys named lb:week:* in Redis, the oldest from a year ago, none with an expiry.",
    },

    content: [
        h2("1. The incident: fast, and wrong for the people who look the most"),
        p("This is the endpoint behind the profile page as it shipped. The all-time board is the sorted set `lb:all`: member = learner id, score = points. The service asks Redis for the learner's position and for two learners above and below:"),
        code("typescript", `
// src/leaderboard/leaderboard.service.ts - the version that shipped (ioredis)
async me(learnerId: string) {
    const rank = await this.redis.zrevrank("lb:all", learnerId);
    const flat = await this.redis.zrevrange("lb:all", rank - 2, rank + 2, "WITHSCORES");
    return { rank, around: toEntries(flat) };      // [member, score, member, score, ...] -> entries
}`, "leaderboard.service.ts"),
        p("It compiles (`rank` is typed loosely by the client) and it works for almost everyone: for the learner in position 300 it asks for positions 298 to 302. It fails for exactly the learners who check their rank most often - the top two - and it shows ranks starting at 0 for everyone. The weekly boards have a quieter problem: nothing ever deletes them."),

        h2("2. Reproduce it and read the evidence"),
        p("You do not need the app. `redis-cli` against a staging copy shows every piece:"),
        code("bash", `
$ redis-cli ZCARD lb:all
(integer) 4812
$ redis-cli ZREVRANK lb:all u_0815
(integer) 0
$ redis-cli ZREVRANGE lb:all -2 2 WITHSCORES
(empty array)
$ redis-cli ZREVRANK lb:all u_1001
(integer) 2
$ redis-cli ZREVRANGE lb:all 0 4 WITHSCORES
 1) "u_0815"   2) "4380"   3) "u_2040"   4) "3720"   5) "u_1001"
 6) "3600"     7) "u_7781" 8) "3410"     9) "u_3310" 10) "3395"`, "redis-cli, staging"),
        p("ZREVRANK is **0-based**: the best learner is at index 0. The service subtracted 2 and sent `-2` to ZREVRANGE. In Redis range commands a negative index is not an error and not zero: it counts from the end of the set, so `-2` means \"the second-to-last member\", position 4810. A range from 4810 to 2 has its start after its stop, and Redis answers with an empty list. For the second learner the request is 4811 to 3: empty again. For the third learner, `0..4`: the five entries u_1001 saw."),
        p("Now the weekly keys:"),
        code("bash", `
$ redis-cli --scan --pattern 'lb:week:*' | wc -l
52
$ redis-cli TTL lb:week:2025-W44
(integer) -1                 # exists, no expiry
$ redis-cli MEMORY USAGE lb:week:2025-W44
(integer) 187344`, "redis-cli, staging"),
        p("A weekly board is read for a week or two and then never again, yet each one stays in memory forever. It is not urgent at 52 keys; it becomes urgent when someone adds a daily board or a board per course using the same code."),

        h2("3. Why a sorted set, and when not to use one"),
        p("A sorted set keeps members ordered by score at all times. That makes the three questions a leaderboard asks cheap, whatever the board size:"),
        bullets([
            "**Add points:** `ZINCRBY lb:all 40 u_1001` - O(log N). It creates the member at 0 if it is missing. (`ZADD` sets the score; use it when you have the total, as in the next lesson.)",
            "**Top N:** `ZREVRANGE lb:all 0 9 WITHSCORES` - O(log N + M) for M returned entries. Since Redis 6.2 the same is `ZRANGE lb:all 0 9 REV WITHSCORES`; the Redis docs mark ZREVRANGE as deprecated in favour of it, but it still works and the challenges in this course use its name.",
            "**A learner's rank:** `ZREVRANK lb:all u_1001` - O(log N), 0-based, `nil` when the member is not in the set. `ZSCORE` gives the score.",
        ]),
        p("Compare that with the PostgreSQL version it replaced: to rank one learner, the database sorted every learner's total with a window function on every request. With an index on the totals that gets better, but \"how many learners are above me\" stays a count over a growing range."),
        callout("info", "When not to use Redis for this",
            "A board of a few thousand learners that is read a few times a minute is fine in PostgreSQL: a learner_totals table with an index on (total DESC) answers top 10 in well under a millisecond, and a rank is one COUNT(*) on that index. Use EXPLAIN ANALYZE before you add a second store. A sorted set also gives you exactly one ordering: boards filtered by country, course or cohort need one sorted set each, and every extra board is extra writes and extra memory. Whatever you choose, PostgreSQL keeps the score events: the sorted set is a fast, rebuildable copy (lesson 3.3)."),

        h3("Equal scores: decide the rule, then write it down"),
        p("Redis has no notion of who reached a score first. Members with equal scores are ordered by their bytes: ZRANGE lists `u_1001` before `u_2040`, and ZREVRANGE reverses the whole order, so `u_2040` comes first. The order of ZADD calls makes no difference. You then have to choose what number to print:"),
        bullets([
            "**Ordinal rank (1, 2, 3, 4):** the position in Redis order. Every learner has a distinct rank, and ZREVRANK + 1 is the answer. This is what the CodeDev board promises, and what the challenge uses.",
            "**Shared rank (1, 2, 2, 4):** equal scores share a rank. Fair-looking, but Redis cannot give it to you directly: you need the number of members with a strictly higher score (`ZCOUNT lb:all (score +inf`), one more command per learner.",
            "**Earlier wins:** encode time into the score, for example `points * 1e10 + (9999999999 - unixSeconds)`. Scores are 64-bit doubles, exact only up to 2^53, so check the largest value you can produce before you trust it.",
        ]),
        p("None of these is \"correct\". What matters is that the API, the page and the tests use the same rule. Put it in the API documentation, the way the challenge puts it in its description."),

        challenge("chal_quiz_rdp_311"),

        h2("4. Weekly boards: the key comes from the event time"),
        p("A weekly board is one sorted set per week. The key has to be computable from a timestamp, by every service, the same way. CodeDev uses the ISO 8601 week: weeks start on Monday, and week 1 is the week that contains the year's first Thursday. Two rules follow, and both have bitten real teams:"),
        bullets([
            "**The ISO year is not the calendar year.** It is the year of the Thursday of that week. Monday 30 December 2024 is in 2025-W01, and Friday 1 January 2027 is in 2026-W53. Code that formats `new Date(ts).getUTCFullYear()` next to the week number writes the last days of December into the first week of the *same* calendar year - a board from twelve months ago, which, without an expiry, still exists.",
            "**Use the event time, in UTC.** An event earned on Sunday at 23:59 that is processed on Monday at 00:01 belongs to the week it was earned. And \"Monday\" must mean Monday in one agreed time zone; a server that formats in its local time puts learners near midnight on the wrong board.",
        ]),
        p("Keys are written with a two-digit week so they sort and read well: `lb:week:2026-W05`, `lb:week:2026-W44`."),

        h3("Expiry: a fixed end, not a sliding window"),
        p("Each weekly board should disappear on its own once nobody reads it. CodeDev keeps a board for 7 days after its week ends, so learners can still look at last week. The tempting code is `EXPIRE key 1209600` (14 days) after every write. That is a **sliding** expiry: every new point pushes the end further out, and a late event for an old week brings a board back from the dead. The end of a week's retention is a fixed moment, so compute it from the week and set it:"),
        code("bash", `
# week 2026-W44 starts Monday 2026-10-26 00:00 UTC; next week starts 2026-11-02;
# retention ends 7 days later, 2026-11-09 00:00 UTC = 1794182400
$ redis-cli EXPIREAT lb:week:2026-W44 1794182400
(integer) 1
$ redis-cli TTL lb:week:2026-W44
(integer) 1177200`, "redis-cli"),
        p("`EXPIREAT` takes the absolute Unix time, which is the clearest way to say \"this board ends at that moment\". The in-memory model in the challenge only has `EXPIRE`, so there you convert: seconds left = `Math.ceil((retentionEnd - now) / 1000)`. Setting the same end again on every write is harmless. One more rule: if the retention end has already passed when an event arrives (a learner's submission graded after a long outage), skip the weekly board entirely. The all-time board still counts the points."),

        h2("5. Worked example: reading the board with ioredis"),
        p("The read path is short once the rules are fixed. ioredis returns `WITHSCORES` replies as one flat array of strings, so convert them once:"),
        code("typescript", `
type Entry = { rank: number; learnerId: string; score: number };

// [member, score, member, score, ...] -> entries with ordinal ranks starting at firstRank
function toEntries(flat: string[], firstRank: number): Entry[] {
    const entries: Entry[] = [];
    for (let i = 0; i < flat.length; i += 2) {
        entries.push({ rank: firstRank + i / 2, learnerId: flat[i], score: Number(flat[i + 1]) });
    }
    return entries;
}

async function top(redis: Redis, key: string, n: number): Promise<Entry[]> {
    if (!Number.isInteger(n) || n < 1) return [];      // ZRANGE key 0 -1 would return the whole board
    const flat = await redis.zrange(key, 0, n - 1, "REV", "WITHSCORES");
    return toEntries(flat, 1);
}`, "leaderboard.read.ts"),
        p("Two details carry most of the weight. The guard on `n` is not decoration: with `n = 0` the stop index is `-1`, which means \"to the last member\", so a request for zero entries returns all 4,812. And the rank is computed from the position (`firstRank + i / 2`), never typed in by hand - which is also how the \"Around you\" window works: ask ZREVRANK for the learner's index, start the window two places above it but **not below index 0**, and number the entries from the start you actually used."),
        p("Write the rest yourself. The challenge gives you an in-memory model of the Redis commands (same names and semantics, including negative indexes and expiry on a fake clock) and asks for the weekly key, recording a score on both boards with the retention rule, top N, and a learner's rank with neighbours:"),
        challenge("chal_coding_rdp_312"),

        h2("6. How to verify a leaderboard"),
        bullets([
            "**Edges, by hand.** In redis-cli, look at the first, the second, the last and an unknown learner: `ZREVRANK` returns `0`, `1`, `ZCARD - 1` and `(nil)`. Your API should show ranks 1, 2, the board size, and \"not ranked\" - never 0 and never an error.",
            "**Unit tests with a fake.** Boards of 5 learners with equal scores pin down the tie rule; timestamps on Sunday 23:59:59 UTC, Monday 00:00:00 UTC, 30 December and 1 January pin down the weekly key. The challenge's tests are a good list to copy.",
            "**Parity with the source of truth.** A nightly job compares the top 100 of `lb:all` with `SELECT learner_id, total FROM learner_totals ORDER BY total DESC, learner_id DESC LIMIT 100`. Note the `learner_id DESC` tiebreak: without it PostgreSQL may order equal totals differently from Redis and the job reports false drift.",
            "**Expiry.** `redis-cli --scan --pattern 'lb:week:*'` should list a handful of keys, and `TTL` on each should be positive and shrink day by day - never `-1`.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**Showing ZREVRANK as the rank.** The best learner is \"#0\". Spot it: a test for the top learner that expects rank 1.",
            "**Negative start indexes.** `rank - 2` for the top two learners counts from the end of the board and returns nothing (or the wrong people). Spot it: an empty or strange window for rank 1 and 2 in a test; clamp with `Math.max(0, ...)`.",
            "**A top of zero returns everything.** `ZREVRANGE key 0 n-1` with `n = 0` is `0 -1`. Spot it: a response size alarm, or a test with `n = 0` that expects an empty list.",
            "**Calendar year in an ISO week key.** The last days of December land in a board from the start of that year. Spot it: a test with 2024-12-30 and 2027-01-01 that expects 2025-W01 and 2026-W53.",
            "**No expiry, or a sliding one.** `TTL` of `-1`, or a TTL that jumps back up after each event, and old weeks that reappear after a late event. Spot it: scan `lb:week:*` and check TTLs; replay a late event in a test.",
        ]),

        h2("8. Summary"),
        bullets([
            "A sorted set answers \"add points\", \"top N\" and \"my rank\" in O(log N); PostgreSQL stays the source of truth, and a small board may not need Redis at all.",
            "Equal scores are ordered by member bytes, not by time. Pick a rank rule (CodeDev: ordinal, Redis order), write it down, and test the edges: first, second, last, unknown, and n = 0.",
            "Weekly boards are keyed by the ISO week of the event time (ISO year of the Thursday) and expire at a fixed moment after the week ends; late events must not bring an old board back.",
        ]),

        h2("Sources"),
        bullets([
            "Redis documentation: Sorted sets - https://redis.io/docs/latest/develop/data-types/sorted-sets/",
            "Redis command reference: ZRANGE (REV, negative indexes), ZREVRANK, ZINCRBY, EXPIREAT",
            "ISO 8601 week date: weeks start on Monday; week 1 contains the year's first Thursday",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add shared ranks (1, 2, 2, 4) next to the ordinal ones with ZCOUNT, and measure the cost: one extra command per learner in the window. Then write the nightly parity query for your own leaderboard and run it against a staging copy of Redis."),
    ],
});
