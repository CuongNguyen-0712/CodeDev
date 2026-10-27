// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-1-3",
    title: "Session keys with TTL: create, extend & delete",
    slug: { _type: "slug", current: "session-keys-with-ttl" },
    description:
        "After a refactor CodeDev sessions were written without a TTL: Redis grew to 4.1 million session keys for 20,000 active learners, and \"Sign out of all devices\" timed out scanning them while an attacker's session stayed alive. Learn to store a session as a hash with a TTL, slide the expiry on use but cap it at an absolute lifetime, keep a per-user index set so signing out everywhere is cheap, clean that index, and verify it all with redis-cli and a fake clock.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer, CodeDev learning platform (NestJS API, PostgreSQL, Redis)",
        problem:
            "A learner reported that someone had used their account. Support reset the password and pressed \"Sign out of all devices\"; the request timed out after 30 seconds, and the next morning the unknown device was still submitting code as that learner. The investigation found that a refactor three months earlier had replaced SET ... EX with HSET for sessions and dropped the TTL, so no session ever expired, and that sign-out-everywhere found a user's sessions by scanning every sess:* key.",
    },

    content: [
        h2("1. The incident: sessions that never end"),
        p("What the investigation collected on the Redis primary and in the API logs:"),
        code("bash", `
$ redis-cli INFO keyspace
db0:keys=4187331,expires=212904,avg_ttl=402113
$ redis-cli --scan --pattern 'sess:*' --count 1000 | wc -l
4102786
$ redis-cli TTL sess:5b1e0c9a
(integer) -1                     # no expiry
$ redis-cli HGETALL sess:5b1e0c9a
1) "userId"     2) "u_31877"
3) "device"     4) "Chrome on Windows"
5) "createdAt"  6) "1784470200000"   # 19 Jul 2026, three months ago`, "terminal"),
        code("text", `
2026-10-24T09:12:44Z POST /auth/sign-out-all user=u_52210 -> 504 after 30001 ms
2026-10-24T09:12:44Z SessionService.signOutAll: SCAN sess:* scanned 1.9M keys, deleted 2, aborted (timeout)
2026-10-25T07:03:10Z POST /submissions user=u_52210 session=e40a71f3 device="Android 14" -> 201`, "api.log"),
        p("Two facts explain everything. `INFO keyspace` shows 4.19 million keys but only 213,000 with a TTL: the session hashes have none, so every sign-in since the refactor is still there - about 200 times the number of learners active in a month. And the only way to find one learner's sessions was to scan all of them, reading `userId` from each, which no request can finish under a 30-second timeout."),
        p("The refactor itself looked harmless. The old code was one command, `SET sess:<id> <json> EX 1800`. The new code stored fields separately so the guard could read `userId` without parsing JSON - `HSET` has no `EX` option, and nobody added the `EXPIRE`."),

        h2("2. What a session in Redis must guarantee"),
        p("A session is short-lived state: \"this browser proved it is learner u_31877, and is still around\". Losing it costs a sign-in, not data, which is why Redis is a good home for it and PostgreSQL does not need every request's `lastSeen`. But a session is also a credential. Four rules follow:"),
        numbered([
            "**It expires when unused.** An idle TTL (CodeDev: 30 minutes) bounds the damage of a session token left on a shared computer.",
            "**Use extends it, but not forever.** Each authenticated request slides the expiry forward (`EXPIRE` again), so an active learner is not signed out mid-lesson. An **absolute lifetime** (CodeDev: 12 hours after sign-in) caps the sliding, so a stolen token that an attacker keeps using still dies.",
            "**It can be deleted on demand.** Sign out of one device deletes one key; sign out everywhere (after a password reset, or from the \"Your devices\" page) deletes all of one user's sessions - quickly, without scanning the keyspace.",
            "**Every key it creates expires too.** Indexes that point to sessions must not outlive them.",
        ]),
        callout("info", "When not to do this yourself",
            "If your framework already stores sessions in Redis (express-session with connect-redis, for example), use its TTL options instead of writing your own store, and check what it does for sign-out-everywhere - many stores have no per-user index. A stateless JWT with no server-side session cannot be revoked before it expires: if you need sign-out-everywhere, you need server-side state somewhere."),

        h2("3. The layout: a hash per session, a set per user"),
        code("bash", `
# sign-in at 2026-10-26 08:00:00 UTC (1793001600000 ms)
HSET   sess:7c2e19d4 userId u_31877 device "Chrome on Windows" createdAt 1793001600000
EXPIRE sess:7c2e19d4 1800                      # idle TTL
SADD   user:u_31877:sessions 7c2e19d4          # the user's index
EXPIRE user:u_31877:sessions 43200             # no session can outlive this

# every authenticated request
HGETALL sess:7c2e19d4                          # empty reply = signed out
EXPIRE  sess:7c2e19d4 <min(1800, seconds left until createdAt + 12 h)>

# sign out of this device
DEL  sess:7c2e19d4
SREM user:u_31877:sessions 7c2e19d4

# sign out everywhere
SMEMBERS user:u_31877:sessions                 # -> ids
DEL  sess:<id1> sess:<id2> ...                 # returns how many still existed
SREM user:u_31877:sessions <id1> <id2> ...     # the set disappears when it is empty`, "redis-cli"),
        bullets([
            "**A hash per session** stores the fields separately (`HGET sess:<id> userId` reads one), stays in the compact listpack encoding at this size, and takes a TTL as a whole key. Hash fields cannot have their own TTL before Redis 7.4 (`HEXPIRE`); the key-level TTL is all you need here.",
            "**The session id is the secret.** Generate it with a CSPRNG (`crypto.randomBytes(32).toString(\"base64url\")` in Node.js), put it in an `HttpOnly`, `Secure`, `SameSite` cookie, and never derive it from the user id. Refuse to create a session whose key already exists: a collision means a bug or someone replaying an id.",
            "**The index set** `user:<id>:sessions` answers \"which sessions does this user have\" in one command, so sign-out-everywhere costs the number of that user's sessions, not the number of keys in Redis.",
        ]),
        h3("The index goes stale, and that is expected"),
        p("Redis has no foreign keys. When `sess:7c2e19d4` expires, nothing removes `7c2e19d4` from `user:u_31877:sessions`. The index therefore contains a mix of live and dead ids, and the code must treat it as a hint:"),
        bullets([
            "**Sign out everywhere** deletes every listed key; `DEL` simply ignores keys that are gone and returns how many it actually removed - that is the honest count to show. Then it removes exactly those ids from the index.",
            "**Listing devices** reads each listed session; an empty `HGETALL` means it expired, so `SREM` it from the index while you are there.",
            "**The index needs a TTL too.** Give it the absolute lifetime on every sign-in: no session in it can live longer than 12 hours after the newest sign-in, so when the set expires, everything it pointed to is already gone. Without that, a learner who never comes back leaves a set behind forever.",
        ]),
        h3("Sliding expiry with a cap"),
        p("On each request compute the seconds left until the absolute deadline, `floor((createdAt + 12 h - now) / 1000)`, and set the TTL to the smaller of that and the idle TTL. Round **down**, so the session never outlives the cap. When nothing is left, delete the session and answer `401`. Redis can also express the deadline directly: `EXPIREAT`/`PEXPIREAT` take an absolute Unix time, and Redis 7 adds `EXPIRE ... GT`/`LT` options to only lengthen or only shorten a TTL - check the command docs for your server version before relying on them."),

        challenge("chal_quiz_rdp_131"),

        h2("4. Worked example: SessionStore in NestJS"),
        p("The store the team shipped, with ioredis. Writes that belong together go in one `MULTI` transaction, so a crash cannot leave a session without its TTL - the exact failure of the incident:"),
        code("typescript", `
import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module";

const IDLE_TTL_SECONDS = 1800;            // 30 min without a request
const ABSOLUTE_LIFETIME_SECONDS = 43200;  // 12 h after sign-in, however active

export type Session = { id: string; userId: string; device: string; createdAt: number };

@Injectable()
export class SessionStore {
    constructor(@Inject(REDIS) private readonly redis: Redis, private readonly now: () => number = Date.now) {}

    async create(userId: string, device: string): Promise<string> {
        const id = randomBytes(32).toString("base64url");
        if (await this.redis.exists(\`sess:\${id}\`)) throw new Error("session id collision");   // a bug or a replayed id
        await this.redis
            .multi()
            .hset(\`sess:\${id}\`, { userId, device, createdAt: String(this.now()) })
            .expire(\`sess:\${id}\`, IDLE_TTL_SECONDS)
            .sadd(\`user:\${userId}:sessions\`, id)
            .expire(\`user:\${userId}:sessions\`, ABSOLUTE_LIFETIME_SECONDS)
            .exec();
        return id;
    }

    /** Called by the auth guard on every request. null = signed out (401). */
    async touch(id: string): Promise<Session | null> {
        const h = await this.redis.hgetall(\`sess:\${id}\`);
        if (!h.userId) return null;                        // ioredis returns {} for a missing key
        const createdAt = Number(h.createdAt);
        const left = Math.floor((createdAt + ABSOLUTE_LIFETIME_SECONDS * 1000 - this.now()) / 1000);
        if (left <= 0) {
            await this.remove(id, h.userId);
            return null;
        }
        await this.redis.expire(\`sess:\${id}\`, Math.min(IDLE_TTL_SECONDS, left));
        return { id, userId: h.userId, device: h.device, createdAt };
    }

    async remove(id: string, userId: string): Promise<void> {
        await this.redis.multi().del(\`sess:\${id}\`).srem(\`user:\${userId}:sessions\`, id).exec();
    }

    async removeAll(userId: string): Promise<number> {
        const index = \`user:\${userId}:sessions\`;
        const ids = await this.redis.smembers(index);
        if (ids.length === 0) return 0;
        const removed = await this.redis.del(...ids.map((id) => \`sess:\${id}\`));   // counts only keys that still existed
        await this.redis.srem(index, ...ids);                // only the ids we read: see below
        return removed;
    }
}`, "session.store.ts"),
        callout("info", "Client differences",
            "ioredis accepts hset(key, object) and returns {} from hgetall for a missing key; node-redis v4+ uses hSet(key, object), hGetAll and a multi() whose exec() returns the replies without the error tuples. Check the docs of your client version. In a Redis Cluster, the keys of one MULTI must hash to the same slot; sess:<id> and user:<id>:sessions usually do not, so send them as separate commands or use hash tags."),
        p("Two details are easy to miss. The guard calls `touch` and nothing else touches the TTL: the \"Your devices\" page reads sessions with `HGETALL` and must not extend them, or merely looking at the list would keep every old device signed in. And `removeAll` removes from the index only the ids it read, instead of deleting the whole set: a sign-in that lands between `SMEMBERS` and the cleanup keeps its index entry, so the next sign-out-everywhere still finds it."),

        h2("5. How to verify it"),
        numbered([
            "**Every session key has a TTL.** `redis-cli --scan --pattern 'sess:*' --count 1000 | head -1000 | xargs -n1 redis-cli TTL | sort | uniq -c` must show no `-1`. Alert on the ratio `expires / keys` from `INFO keyspace` dropping - the incident's 213k of 4.19M would have fired on day one.",
            "**Sliding works and stops.** On a fake clock: sign in, use the session every 25 minutes; `TTL` stays 1800 until the last 30 minutes before the 12-hour mark, then shrinks to the deadline, and the first request after it gets `401`.",
            "**Idle sessions die.** Sign in, wait 31 minutes on the fake clock, request: `401`, and `EXISTS sess:<id>` is `0`.",
            "**Sign out everywhere is cheap and complete.** `SLOWLOG` shows no scan; the response time does not grow with the total number of keys; afterwards every session of that user gets `401`, and other users are untouched.",
            "**The index stays small.** After listing devices, `SMEMBERS user:<id>:sessions` contains only ids whose keys exist, and `TTL user:<id>:sessions` is never `-1`.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**`HSET` without `EXPIRE`.** Spot it: `TTL sess:<id>` returns `-1`; `INFO keyspace` shows `expires` far below `keys`; memory grows with total sign-ins instead of active users.",
            "**Sliding with no absolute cap.** Spot it: `HGET sess:<id> createdAt` days in the past on a key whose `TTL` is still close to the idle TTL.",
            "**Finding a user's sessions with `SCAN` or `KEYS`.** Spot it: sign-out-everywhere latency that grows with the size of Redis rather than with the user's number of devices.",
            "**An index that is never cleaned or never expires.** Spot it: `SCARD user:<id>:sessions` in the hundreds for a learner with two devices, or `TTL` of the set at `-1`.",
            "**Reading counts as use.** Spot it: an admin or \"Your devices\" page that calls the same function as the auth guard; old sessions never expire for users who check their device list.",
        ]),

        challenge("chal_coding_rdp_132"),

        h2("7. Summary"),
        bullets([
            "Store a session as a hash with a TTL set in the same transaction; slide the TTL on authenticated use, capped by an absolute lifetime counted from sign-in.",
            "Keep a per-user index set so one user's sessions can be listed and deleted without scanning; it goes stale, so clean it when you read it and give it a TTL of its own.",
            "Verify with `TTL`, `INFO keyspace` and a fake clock: no key without expiry, idle and absolute limits enforced, and sign-out-everywhere independent of the size of Redis.",
        ]),

        h2("Sources"),
        bullets([
            "Redis docs: EXPIRE (and its NX, XX, GT, LT options), EXPIREAT, TTL - redis.io/docs/latest/commands/expire/",
            "Redis docs: Understand Redis data types (hashes, sets) - redis.io/docs/latest/develop/data-types/",
            "OWASP Session Management Cheat Sheet: idle and absolute timeouts - cheatsheetseries.owasp.org",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add a lastSeen field and a \"Your devices\" endpoint to your own app that shows device and last activity for each live session, with a \"Sign out\" button per row. Then write the alert: the share of sess:* keys without a TTL, sampled with SCAN every hour, should be zero."),
    ],
});
