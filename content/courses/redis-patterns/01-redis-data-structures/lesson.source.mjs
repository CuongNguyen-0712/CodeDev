// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-1-1",
    title: "How to choose a Redis data structure by access pattern",
    slug: { _type: "slug", current: "redis-data-structures-by-access-pattern" },
    description:
        "The CodeDev leaderboard lived in one JSON string: every score change read, parsed, edited and rewrote 2 MB. Learn to start from the access pattern - which reads and writes happen, how often, on how much data - and pick strings, hashes, sets, sorted sets, lists or streams to match, how to measure memory and find big keys with redis-cli, and why Redis holds copies while PostgreSQL holds the truth.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform (NestJS API, PostgreSQL, Redis)",
        problem:
            "During the October coding contest the API at https://api.codedev.test slowed to a crawl every time a learner passed a challenge. POST /submissions p95 went from 180 ms to 2.4 s, Redis network output reached 90 MB/s, and two learners reported that points they had clearly earned were missing from the leaderboard. The leaderboard was one Redis string, leaderboard:global, holding a JSON object of about 40,000 learners: every score change read the whole 2 MB value, parsed it in Node.js, changed one number and wrote 2 MB back.",
    },

    content: [
        h2("1. The incident: one key, 2 MB per write"),
        p("The ticket the on-call engineer opened on the contest evening, shortened:"),
        code("text", `
INC-2026-1014  Leaderboard writes saturate Redis during the contest
Impact   POST /submissions p95 180 ms -> 2.4 s (19:00-20:10), 2 learners missing points
Signals  Redis network out 90 MB/s (normal: 3 MB/s); Node.js event loop lag up to 600 ms
         SLOWLOG: GET/SET leaderboard:global 9-14 ms each
Size     STRLEN leaderboard:global = 2,097,152 bytes (~40,000 learners)
Rate     ~22 score changes/s at peak -> ~44 MB/s read + ~44 MB/s written`, "incident"),
        p("And the code that wrote every score:"),
        code("typescript", `
// leaderboard.service.ts - the version that shipped
async addPoints(userId: string, points: number): Promise<void> {
    const raw = await this.redis.get("leaderboard:global");          // 2 MB over the network
    const board: Record<string, number> = raw ? JSON.parse(raw) : {}; // ~15 ms of CPU, event loop blocked
    board[userId] = (board[userId] ?? 0) + points;                    // the only real change: one number
    await this.redis.set("leaderboard:global", JSON.stringify(board)); // 2 MB back
}`, "leaderboard.service.ts"),
        p("Nothing here is a Redis bug. Redis did exactly what it was asked: store and return one 2 MB string. The design treated Redis as a place to park a JSON document, and the document grew with the number of learners. Every write paid for the whole leaderboard, and the top-10 page paid for it again on every read."),
        p("The two missing scores are a second, quieter bug: two API instances read the same version of the string, each added its own points and wrote the whole thing back, and the second write silently replaced the first. Section 4 shows why."),

        h2("2. Read the evidence with redis-cli"),
        p("Before changing anything, measure what is in Redis. These commands are safe on a production replica and on most primaries (each is O(1) or reads one key), with one warning noted below:"),
        code("bash", `
$ redis-cli TYPE leaderboard:global
string
$ redis-cli STRLEN leaderboard:global
(integer) 2097152
$ redis-cli MEMORY USAGE leaderboard:global
(integer) 2105400            # bytes, including Redis's own overhead for the key
$ redis-cli OBJECT ENCODING leaderboard:global
"raw"
$ redis-cli --bigkeys        # samples every key with SCAN; run it on a replica if you can
...
Biggest string found "leaderboard:global" has 2097152 bytes`, "terminal"),
        bullets([
            "`TYPE` tells you which structure a key really is. `STRLEN` (strings) and `HLEN`, `SCARD`, `ZCARD`, `LLEN`, `XLEN` (the others) give the size in elements.",
            "`MEMORY USAGE key` estimates the bytes a key takes, overhead included. For big aggregate keys it samples elements; `MEMORY USAGE key SAMPLES 0` measures every element (slower).",
            "`redis-cli --bigkeys` walks the keyspace with `SCAN` and reports the largest key of each type. Newer redis-cli versions also offer `--memkeys` (by memory) - check `redis-cli --help` on your version. Both add load, so prefer a replica.",
            "`SLOWLOG GET 10` lists the slowest recent commands with their duration in microseconds. A plain `GET` of a small key takes microseconds; 9-14 ms means the payload is the problem.",
        ]),
        callout("warning", "Never run KEYS * in production",
            "KEYS walks the whole keyspace in one blocking command. On a few million keys it stalls every other client for seconds. Use SCAN with a MATCH pattern and a COUNT, which returns a cursor and a small batch at a time."),

        h2("3. Start from the access pattern, not from the data"),
        p("In PostgreSQL you model the data first and let the query planner find a way to answer any query. Redis has no planner: each structure answers a few operations cheaply and the rest expensively. So you start from the other end and write down, for each feature, **which operations run, how often, and on how much data**. Then pick the structure whose cheap operations are exactly those."),
        p("Here are the five Redis-backed features of CodeDev, written that way:"),
        bullets([
            "**Course page cache.** Read the whole course by id, thousands of times per second; written rarely (an admin edit). Always read and replaced as a unit. **String** holding JSON, key `course:<id>`, with a TTL: `GET`, `SET ... EX`. Lesson 2.",
            "**Session.** Read on every authenticated request; a few small fields (userId, device, createdAt) that are sometimes read or updated one at a time; must disappear after inactivity. **Hash** per session, key `sess:<id>`, with a TTL: `HGETALL`, `HSET`, `EXPIRE`. Lesson 3.",
            "**Online learners.** \"Who was active in the last 5 minutes\", count and membership. A **set** answers membership (`SISMEMBER`) and count (`SCARD`) in O(1), but a set member cannot expire on its own. Since \"recent\" is about time, a **sorted set** scored by last-seen time fits better: `ZADD online <ts> <userId>`, `ZREMRANGEBYSCORE online -inf <ts-300000>`, `ZCARD online`.",
            "**Leaderboard.** Add points to one learner (many times per second), read the top N, read one learner's rank. A **sorted set**: `ZINCRBY`, `ZRANGE ... REV`, `ZREVRANK` - each O(log N) plus the size of what you read. Module 3.",
            "**Activity feed.** \"The last 20 things that happened in this course\", appended constantly, read newest first, old entries dropped. A capped **list** (`LPUSH` + `LTRIM`) is the simplest; a **stream** (`XADD ... MAXLEN ~ 1000`, `XREVRANGE ... COUNT 20`) adds ids with timestamps and lets several consumers read independently.",
        ]),
        callout("info", "Strings are not only for text",
            "A Redis string is a byte array up to 512 MB. It is the right structure for a value you always read and write whole: a JSON blob, a counter (INCR), a lock token (SET NX EX). The incident's mistake was not using a string; it was storing in one string something that is updated one entry at a time."),
        h3("When not to put it in Redis at all"),
        p("Every structure above holds a **copy** or a **short-lived** fact. Redis keeps data in memory and writes it to disk according to its persistence settings: with RDB snapshots you can lose the writes since the last snapshot, with `appendfsync everysec` about a second of writes, and with replication a failover can drop writes the old primary acknowledged but had not sent yet. With `maxmemory` and an `allkeys-*` eviction policy it may also delete keys on purpose to make room. That is fine for a cache, which can be rebuilt, and for a session, which can be recreated by signing in again. It is not fine for points a learner earned. CodeDev keeps every score change in a PostgreSQL table; the sorted set is derived from it and can be rebuilt (lessons 6 and 9)."),
        p("And some data does not need Redis yet. If PostgreSQL answers the course page in 3 ms with an index and the database is at 15% CPU, a cache adds a second copy to keep correct and buys nothing measurable. Add Redis when a measurement says you need it."),

        h2("4. Worked example: the leaderboard as a sorted set"),
        p("Same feature, structure chosen from the access pattern. One member per learner, the score is the learner's points:"),
        code("bash", `
$ redis-cli ZINCRBY lb:contest:2026-10 30 u_1042      # add 30 points, atomically, on the server
"1290"
$ redis-cli ZRANGE lb:contest:2026-10 0 9 REV WITHSCORES   # top 10 (Redis 6.2+; older: ZREVRANGE ... WITHSCORES)
 1) "u_77"
 2) "2410"
 3) "u_1042"
 4) "1290"
 ...
$ redis-cli ZREVRANK lb:contest:2026-10 u_1042         # 0-based rank from the top
(integer) 1
$ redis-cli ZCARD lb:contest:2026-10
(integer) 40112
$ redis-cli OBJECT ENCODING lb:contest:2026-10
"skiplist"`, "terminal"),
        p("A score change now sends a few dozen bytes and costs O(log N) on the server. The top-10 query reads ten members, not 40,000. In NestJS with ioredis the service becomes:"),
        code("typescript", `
import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module";

@Injectable()
export class LeaderboardService {
    constructor(@Inject(REDIS) private readonly redis: Redis) {}

    // Called after the score change is committed in PostgreSQL (the source of truth).
    async addPoints(contestId: string, userId: string, points: number): Promise<void> {
        await this.redis.zincrby(\`lb:contest:\${contestId}\`, points, userId);
    }

    async top(contestId: string, n: number): Promise<Array<{ userId: string; points: number }>> {
        const flat = await this.redis.zrevrange(\`lb:contest:\${contestId}\`, 0, n - 1, "WITHSCORES");
        const rows: Array<{ userId: string; points: number }> = [];
        for (let i = 0; i < flat.length; i += 2) rows.push({ userId: flat[i], points: Number(flat[i + 1]) });
        return rows;
    }
}`, "leaderboard.service.ts"),
        callout("info", "ioredis or node-redis",
            "ioredis takes arguments in Redis order (zincrby(key, increment, member); zrevrange(key, start, stop, \"WITHSCORES\") returns a flat array). node-redis v4+ uses camelCase methods and option objects (zIncrBy, zRangeWithScores(key, 0, 9, { REV: true })). Method names and return shapes differ between major versions: check the docs of the version in your package.json."),
        h3("Why the old version lost points"),
        p("Redis runs commands one at a time, so each single command is atomic. A **sequence** of commands from one client is not: other clients' commands can run between them. With two API instances:"),
        code("text", `
instance A: GET leaderboard:global        -> {..., "u_88": 400, "u_91": 120}
instance B: GET leaderboard:global        -> {..., "u_88": 400, "u_91": 120}
instance A: SET leaderboard:global {..., "u_88": 430, "u_91": 120}   OK
instance B: SET leaderboard:global {..., "u_88": 400, "u_91": 150}   OK   <- A's +30 is gone`, "lost update"),
        p("`ZINCRBY` (or `HINCRBY`, `INCRBY`) moves the read-modify-write into Redis, where it runs as one command. When you do need several commands to act as one, use a `MULTI`/`EXEC` transaction with `WATCH`, or a Lua script - lesson 4 and module 3 come back to this."),
        h3("Big keys and small encodings"),
        bullets([
            "**A big key is a latency problem, not only a memory problem.** Reading, writing, deleting or migrating it blocks Redis for the time it takes. Use `UNLINK` instead of `DEL` to free a big key in the background (Redis 4+).",
            "**Collections grow without a limit unless you give them one.** A feed list needs `LTRIM`, a stream `MAXLEN` or `MINID`, a per-contest sorted set a key per contest and a TTL or a cleanup job when the contest ends.",
            "**Small hashes, sets and sorted sets are stored compactly.** Up to a threshold (in Redis 7 the defaults are 128 entries and 64-byte values for hashes and sorted sets, `hash-max-listpack-entries` and friends) they use a `listpack` encoding that costs far less memory than the full structure. `OBJECT ENCODING` shows which one a key uses. That is why a hash per session is cheap.",
            "**Key names cost memory too.** Millions of keys with long prefixes add up; short, consistent prefixes (`sess:`, `course:`, `lb:`) are easier to scan and cheaper.",
        ]),

        challenge("chal_quiz_rdp_111"),

        h2("5. How to verify the new design"),
        numbered([
            "**Size per operation.** Run `redis-cli --stat` or watch `INFO stats` (`total_net_input_bytes`, `total_net_output_bytes`) while you replay a minute of contest traffic in staging. Bytes per score change should drop from megabytes to under a hundred.",
            "**Command latency.** `SLOWLOG RESET`, replay, then `SLOWLOG GET 10`: no leaderboard command should appear. `redis-cli --latency` on the side should stay in the sub-millisecond range.",
            "**Correctness under concurrency.** A test that fires 1,000 concurrent `addPoints(..., 1)` calls for the same learner from several connections must end with exactly 1,000 more points. The JSON version fails it; `ZINCRBY` passes it.",
            "**Memory.** `MEMORY USAGE lb:contest:2026-10` and `INFO memory` (`used_memory`) before and after. A sorted set costs more per entry than compact JSON - expect more bytes in total, spent on structure that makes each operation cheap.",
            "**Rebuildability.** Delete the key in staging and run the rebuild from PostgreSQL (lesson 9). If you cannot rebuild it, Redis has become your source of truth.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**A collection serialised into one string.** Spot it: `GET` + `JSON.parse` + change one entry + `JSON.stringify` + `SET` in the same function, or a string key whose `STRLEN` keeps growing with your user count.",
            "**Read-modify-write across several commands.** Spot it: a value read with `GET`/`HGET`, changed in Node.js and written back. Under concurrency it loses updates. Use the atomic command (`INCRBY`, `HINCRBY`, `ZINCRBY`) or a transaction.",
            "**A set or hash used for something ordered.** Spot it: `HGETALL` or `SMEMBERS` followed by a sort in application code to get a top N. That reads the whole collection every time; a sorted set reads only what you return.",
            "**Collections without a bound.** Spot it: `LPUSH` or `XADD` without `LTRIM` or `MAXLEN`, or keys without a TTL that nobody ever deletes. `--bigkeys` finds them months later.",
            "**Redis as the only copy.** Spot it: a feature whose data exists nowhere else, and no rebuild script. Ask what happens after `FLUSHALL` or a failover; if the answer is \"we lose it\", it belongs in PostgreSQL.",
        ]),

        h2("7. Summary"),
        bullets([
            "Write down the operations, their frequency and their size first; then choose the Redis structure whose cheap commands are those operations - string for whole values, hash for small records, sorted set for ranking and time windows, list or stream for feeds.",
            "Measure with `TYPE`, `MEMORY USAGE`, `OBJECT ENCODING`, `--bigkeys` and `SLOWLOG`; a key whose size grows with your users and is rewritten whole is the incident waiting to happen.",
            "Redis holds copies and short-lived facts. PostgreSQL holds what you cannot afford to lose, and everything in Redis can be rebuilt from it.",
        ]),

        h2("Sources"),
        bullets([
            "Redis docs: Understand Redis data types - redis.io/docs/latest/develop/data-types/",
            "Redis docs: Sorted sets - redis.io/docs/latest/develop/data-types/sorted-sets/",
            "Redis docs: Redis persistence - redis.io/docs/latest/operate/oss_and_stack/management/persistence/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Start Redis locally (docker run -p 6379:6379 redis:7), write 40,000 learners into one JSON string and into a sorted set, and compare MEMORY USAGE, OBJECT ENCODING and the time of one score change in each (redis-cli --latency while a script updates scores). Then write a one-page table for your own project: feature, operations, frequency, chosen structure, TTL, and where the source of truth lives."),
    ],
});
