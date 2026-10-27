// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-4-2",
    title: "Cache stampedes & hot keys",
    slug: { _type: "slug", current: "cache-stampedes-hot-keys" },
    description:
        "At the evening peak the cached detail page of CodeDev's most popular course expired, and 1,900 requests went to PostgreSQL in one second. Learn why cache-aside stampedes, how to measure it, and the fixes in order of cost: single-flight in the process, a short lock with SET NX EX, early refresh with stale-while-revalidate, and TTL jitter. Then find hot keys and big keys before they find you, with INFO, SLOWLOG, LATENCY and the database's own statistics.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Tuesday 19:00, ten minutes after a marketing email about the Node.js API Security course. GET /courses/nodejs-api-security on https://api.codedev.test goes from a p99 of 41 ms to 6.8 s, the API returns 503 for about four seconds, and PostgreSQL shows 100 active connections out of 100. Redis looks healthy: CPU at 30%, no slow commands. Nothing was deployed. At 19:00:00 the cache key course:detail:nodejs-api-security reached the end of its one-hour TTL.",
    },

    content: [
        h2("1. The incident"),
        p("The course detail endpoint uses cache-aside from lesson 1.2, exactly as written there: read the key, on a miss load from PostgreSQL, store the result with a TTL, return it."),
        code("typescript", `
// courses/course-detail.ts (ioredis) - the version in production
export async function getCourseDetail(slug: string): Promise<CourseDetail> {
  const key = \`course:detail:\${slug}\`;
  const cached = await redis.get(key);
  if (cached !== null) return JSON.parse(cached);

  const data = await db.loadCourseDetail(slug); // joins course, lessons, ratings: about 180 ms
  await redis.set(key, JSON.stringify(data), "EX", 3600);
  return data;
}`, "course-detail.ts"),
        p("This code is correct for one request. The incident is about what it does for two thousand requests that arrive in the same second, and that is a property no unit test of this function will ever show you."),

        h2("2. Read the evidence"),
        code("text", `
18:59:59.990 cache hit  course:detail:nodejs-api-security  (TTL left 0.01 s)
19:00:00.004 cache miss course:detail:nodejs-api-security -> load from PostgreSQL
19:00:00.006 cache miss course:detail:nodejs-api-security -> load from PostgreSQL
... 1,897 "cache miss" lines for this key between 19:00:00.000 and 19:00:01.000 ...
19:00:01.412 cache miss course:detail:nodejs-api-security -> load failed: timeout acquiring a connection (pool 20/20)

INFO stats, delta 19:00:00-19:00:01:   keyspace_misses +1912   keyspace_hits +2210
pg_stat_statements, same second:       SELECT ... FROM course c JOIN lesson l ... WHERE c.slug = $1
                                       calls +100   mean_exec_time 182 ms
pg_stat_activity:                      100 active, 0 idle (9 active before 19:00)`, "API log (5 instances, pool of 20 connections each), Redis and PostgreSQL"),
        bullets([
            "Nearly all misses in that second are for **one key**: this is not a cold cache, it is one hot key that expired.",
            "PostgreSQL ran the **same query** 100 times at once: one per available connection. The other 1,800 requests queued for a connection and many timed out.",
            "Redis is fine. It answered every GET quickly; the misses were correct answers.",
        ]),
        p("A simple estimate tells you whether a key can stampede: **concurrent loads at expiry = request rate x load time**. Here 1,900 requests per second x 0.18 s is about 340 loads in flight before the first one finishes and stores the value, more than the whole pool. A key read 5 times a second with a 20 ms load gives 0.1: no stampede is possible, and none of the machinery below is worth its complexity."),

        h2("3. Why cache-aside stampedes"),
        p("Cache-aside has no memory of work in progress. Between the moment a key expires and the moment the first loader stores the new value, every reader sees the same miss and makes the same decision. The cache was absorbing the load; for the duration of one load it absorbs nothing, and the full traffic of the hottest key in the system goes to the slowest component in the system."),
        p("Three situations produce it, and the fixes differ:"),
        bullets([
            "**One hot key expires** (this incident): fix it with single-flight, a lock or early refresh.",
            "**Many keys expire together**, because they were written together (a warm-up after a deploy, a nightly job) with the same TTL: fix it with TTL jitter.",
            "**The cache is empty** after a Redis restart or a flush: every key is cold at once. Fix it with a gradual warm-up, rate-limited loads, and a restart plan (lesson 4.3).",
        ]),
        p("When **not** to bother: keys with low traffic or cheap loads (use the estimate above), and data that can be served stale for a few seconds anyway, where a slightly longer TTL is the simplest fix. Every technique below adds a failure mode of its own."),

        h2("4. The fixes, from cheapest to strongest"),
        h3("Single-flight in the process"),
        p("Inside one API instance, let the first request for a key start the load and let every other request for the same key await the **same promise**. With 5 instances, at most 5 loads reach PostgreSQL instead of 340. It needs no Redis command at all, and it is often enough on its own."),
        h3("A short lock with SET NX EX"),
        p("Across instances, take a lock before loading: SET lock:<key> <token> NX EX <seconds>. NX makes it succeed for exactly one caller; EX makes it disappear if that caller crashes. The others wait briefly for the value instead of loading. Two rules: the lock TTL must be longer than the slowest load you accept, or a second loader starts while the first is still running; and release it with a compare-and-delete script, so a holder whose lock already expired cannot delete someone else's."),
        h3("Early refresh: stale-while-revalidate"),
        p("Better still, do not let a hot key expire under load at all. Store the value with a **soft** expiry (\"fresh until\") inside it and a longer **hard** TTL on the key. After the soft expiry, the next reader triggers one refresh in the background and every reader keeps getting the slightly old value until the new one is stored. Readers never wait for PostgreSQL unless the key is truly missing. A variant refreshes probabilistically shortly before expiry (often called XFetch); the effect is the same: one early reload instead of a crowd at the deadline."),
        h3("TTL jitter"),
        p("For many keys written together, add a random amount to each TTL, for example EX 3600 plus 0-300 seconds. The number of reloads per hour does not change; the number per second does, and that is what the database feels."),
        code("typescript", `
// courses/course-detail.ts (ioredis) - after the incident
import { randomUUID } from "node:crypto";

type Cached = { data: CourseDetail; freshUntil: number };
const SOFT_TTL_MS = 5 * 60_000;   // served as fresh for 5 minutes
const HARD_TTL_S = 60 * 60;       // a stale copy is kept for an hour
const LOCK_TTL_S = 10;            // longer than the slowest load we accept (2 s)
const RELEASE_IF_OWNER =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end';

const inflight = new Map<string, Promise<CourseDetail>>();

export async function getCourseDetail(slug: string): Promise<CourseDetail> {
  const key = \`course:detail:\${slug}\`;
  const raw = await redis.get(key);
  if (raw !== null) {
    const cached = JSON.parse(raw) as Cached;
    if (Date.now() >= cached.freshUntil) void refresh(slug, key).catch(logRefreshError); // in the background
    return cached.data; // fresh or slightly stale: nobody waits for PostgreSQL
  }
  return refresh(slug, key); // truly missing: someone has to wait
}

// Single-flight: one load per key per process.
function refresh(slug: string, key: string): Promise<CourseDetail> {
  let pending = inflight.get(key);
  if (!pending) {
    pending = loadAndStore(slug, key).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

// Lock: one load per key across all instances.
async function loadAndStore(slug: string, key: string): Promise<CourseDetail> {
  const lockKey = \`lock:\${key}\`;
  const token = randomUUID();
  const locked = (await redis.set(lockKey, token, "EX", LOCK_TTL_S, "NX")) === "OK";
  if (!locked) {
    const value = await waitForCachedValue(key, { everyMs: 50, maxMs: 1000 });
    if (value !== null) return value;
    // the holder is slow or gone: load anyway rather than fail the request
  }
  try {
    const data = await db.loadCourseDetail(slug);
    const ttl = HARD_TTL_S + Math.floor(Math.random() * 300); // jitter: 0-5 minutes
    await redis.set(key, JSON.stringify({ data, freshUntil: Date.now() + SOFT_TTL_MS }), "EX", ttl);
    return data;
  } finally {
    if (locked) await redis.eval(RELEASE_IF_OWNER, 1, lockKey, token);
  }
}`, "course-detail.ts"),
        p("Read it against the incident: at 19:00 the key is *stale*, not missing, so all 1,900 readers get the old page at Redis speed, each instance starts at most one refresh, and only the instance that wins the lock queries PostgreSQL. One query instead of 340. The cost is that a course edited at 18:59 can show the old version for up to the soft TTL; invalidation on write (lesson 2.1) still deletes the key when an admin changes the course, and the first request after that waits for one load, protected by the same lock."),

        challenge("chal_quiz_rdp_421"),

        h2("5. Hot keys and big keys"),
        p("A stampede is what happens when a hot key *misses*. A hot key causes trouble even when it hits:"),
        bullets([
            "**Hot key.** One key gets a large share of all requests. Redis executes commands on one main thread, and in a cluster a key lives on one shard, so that shard's CPU and network carry the whole load while the others idle. Fixes, simplest first: a tiny in-process cache in front of Redis for that key (1-5 seconds is plenty for a course page); several copies of the key (course:detail:<slug>:0 ... :7, read one at random, write all) so they spread over shards; reads from replicas where slightly stale data is acceptable.",
            "**Big key.** One value or collection is large: a 2 MB JSON string, a hash with a million fields, a sorted set with every learner ever. Reading it costs network and CPU on every request, and commands that touch all of it (HGETALL, ZRANGE 0 -1, DEL of the whole key) block the server while they run. Fixes: store what one request needs (lesson 1.1), page through collections (ZREVRANGE with a range, HSCAN), and delete big keys with UNLINK, which frees memory in the background.",
        ]),
        callout("info", "Measure before you shard",
            "Most \"Redis is slow\" reports turn out to be one hot or big key. Find it before you add nodes: a cluster spreads keys, not the traffic of one key."),

        h2("6. How to measure"),
        p("Use the numbers each component keeps about itself, before and after a change, with the same traffic:"),
        code("bash", `
# hit rate and misses (take two readings and subtract)
redis-cli INFO stats | grep -E 'keyspace_(hits|misses)'
# which commands run most and how long they take
redis-cli INFO commandstats | grep -E 'cmdstat_(get|set|hgetall|zrevrange)'
# slow commands (threshold: slowlog-log-slower-than, in microseconds)
redis-cli SLOWLOG GET 10
# latency spikes by event (needs latency-monitor-threshold > 0)
redis-cli LATENCY LATEST
# biggest keys per type, and memory of one key (scan the keyspace: run it on a replica)
redis-cli --bigkeys
redis-cli MEMORY USAGE course:detail:nodejs-api-security
# most frequently used keys (only with an LFU maxmemory-policy)
redis-cli --hotkeys`, "redis-cli"),
        code("sql", `
-- the database side of a stampede: same query, many calls, all at once
SELECT calls, mean_exec_time, left(query, 60) AS query
  FROM pg_stat_statements ORDER BY calls DESC LIMIT 5;

SELECT state, count(*) FROM pg_stat_activity GROUP BY state;`, "psql"),
        p("Options and output formats of these tools change between Redis versions; check redis-cli --help and the command pages for the version you run. On a managed service some of them (MONITOR, CONFIG, DEBUG) may be disabled; the provider's metrics usually include hits, misses, evictions and per-shard CPU."),

        h2("7. How to verify the fix"),
        bullets([
            "**A load test that crosses an expiry.** Set the key's soft TTL to 10 seconds on staging, run a constant load on the endpoint (autocannon or k6) for a minute, and count the loads: pg_stat_statements calls for the detail query should grow by about one per refresh, not by hundreds. p99 should not move at the refresh.",
            "**A unit test with a fake loader.** Start 1,000 concurrent getCourseDetail calls on a missing key with a fake loader that resolves after 100 ms, and assert the loader ran once per process. Add a test where the lock holder never stores a value and assert the waiters still return after the wait limit.",
            "**Production after the deploy.** At every hour mark the miss rate for the key stays near zero and pg_stat_activity stays flat.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**A lock without EX.** One crash leaves a lock that never goes away, and the key is never rebuilt. Spot it: SET ... NX with no EX or PX, or a TTL of -1 on a lock key.",
            "**A lock TTL shorter than the load.** The lock expires mid-load and a second loader starts. Spot it: compare the lock TTL with the p99 of the load query, not its mean.",
            "**Releasing with a plain DEL.** A holder that took too long deletes the lock of the next holder. Spot it: a DEL of a lock key with no token comparison.",
            "**Waiters polling in a tight loop.** 1,800 requests calling GET every millisecond move the stampede from PostgreSQL to Redis. Spot it: a spike of GET in INFO commandstats at expiry; poll every 50-100 ms with a time limit.",
            "**Fixing a stampede with a bigger connection pool.** More identical queries at once make each one slower. Spot it: pg_stat_statements shows the same query with calls equal to the pool size.",
        ]),

        h2("9. Summary"),
        numbered([
            "A stampede happens when a key that many requests read stops being in the cache for the duration of one load; estimate it with request rate x load time before adding any machinery.",
            "Fix it in order of cost: single-flight in the process, a short SET NX EX lock across instances, early refresh so hot keys never expire under load, and TTL jitter for keys written together.",
            "Hot and big keys hurt even when they hit: find them with INFO, SLOWLOG, LATENCY, --bigkeys and MEMORY USAGE, and confirm on the database side with pg_stat_statements and pg_stat_activity.",
        ]),

        h2("Sources"),
        bullets([
            "Redis documentation: SET (NX, EX options) and the distributed-lock pattern - redis.io/docs/latest/commands/set/",
            "Redis documentation: Diagnosing latency issues, SLOWLOG and LATENCY - redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/",
            "PostgreSQL documentation: pg_stat_statements - postgresql.org/docs/current/pgstatstatements.html",
        ]),
    ],
});
