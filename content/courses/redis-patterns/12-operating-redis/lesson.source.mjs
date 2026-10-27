// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-4-3",
    title: "Operating Redis: memory, eviction & persistence",
    slug: { _type: "slug", current: "operating-redis-memory-eviction-persistence" },
    description:
        "Learners were logged out at random for an afternoon, then logins failed with an OOM error, after a new feature cached catalog searches without a TTL. Learn what maxmemory and each eviction policy mean for sessions and for cache, what RDB and AOF keep and lose on a restart, what replication and failover do not promise, which numbers to watch, and the key naming and TTL hygiene that keeps one shared Redis healthy.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on the platform team, CodeDev learning platform",
        problem:
            "Thursday 14:20. Support reports learners being logged out of https://app.codedev.test in the middle of a lesson, then signing in again without trouble. At 16:45 sign-in itself starts failing: POST /auth/login on https://api.codedev.test returns 500 with \"OOM command not allowed when used memory > 'maxmemory'\" in the log. The only change that week was the new catalog search, which caches each search result page in Redis. Sessions, rate-limit counters, the leaderboard and the catalog cache all live in the same Redis instance.",
    },

    content: [
        h2("1. The incident"),
        p("Redis is fast because it keeps everything in memory, and memory is the budget you operate. Every lesson so far added keys to the same instance: course caches (1.2), sessions (1.3), rate-limit counters (2.2), the leaderboard and its version hash (module 3 and lesson 4.1). Nobody owned the total. The catalog search shipped on Monday with this line:"),
        code("typescript", `
// catalog/search.ts
await redis.set(\`catalog:search:\${hash(query)}:p\${page}\`, JSON.stringify(result)); // no EX`, "search.ts"),
        p("Every distinct search, by every learner, on every page, is now a key that lives forever."),

        h2("2. Read the evidence"),
        code("text", `
$ redis-cli INFO memory
used_memory_human:3.98G
maxmemory_human:4.00G
maxmemory_policy:volatile-lru
mem_fragmentation_ratio:1.12

$ redis-cli INFO keyspace
db0:keys=2140332,expires=61204,avg_ttl=402113

$ redis-cli INFO stats | grep -E 'evicted_keys|keyspace_(hits|misses)'
evicted_keys:48211
keyspace_hits:91822310
keyspace_misses:20411932

$ redis-cli --scan --pattern 'catalog:search:*' --count 1000 | head -3 | xargs -n1 redis-cli TTL
(integer) -1
(integer) -1
(integer) -1

$ redis-cli --memkeys    # run on the replica: it scans the whole keyspace
... Biggest string found "catalog:search:9f2c1e:p1" has 48211 bytes ...
... 2078114 strings with 3.61G bytes (97.09% of keys, avg size 1.82K) ...`, "redis-cli on the primary (INFO) and on the replica (scans), 16:50"),
        bullets([
            "Memory is at the limit, and almost all of it is strings, overwhelmingly catalog:search keys.",
            "Only 61,204 of 2.1 million keys have a TTL. The catalog:search keys are not among them (TTL -1).",
            "Redis has evicted 48,211 keys. With volatile-lru, the only candidates were keys **with** a TTL: sessions, rate-limit counters and the lb:seen markers. That is the afternoon of random logouts.",
            "Once nothing evictable is left, a volatile policy behaves like noeviction: writes that need memory fail with OOM. Creating a session is such a write. That is the 16:45 outage.",
        ]),

        h2("3. maxmemory and eviction policies"),
        p("maxmemory sets the budget; maxmemory-policy decides what happens when a write needs more. In open-source Redis the default maxmemory on 64-bit systems is 0 (no limit: the OS decides, usually badly) and the default policy is noeviction; managed services often ship other defaults, so read yours with CONFIG GET or the provider's console. The policies fall into three groups:"),
        bullets([
            "**noeviction**: nothing is removed; writes that need memory fail with an OOM error, reads keep working. Right for data you cannot lose silently (sessions, the leaderboard, rate-limit counters), together with a memory alert well below the limit.",
            "**allkeys-lru, allkeys-lfu, allkeys-random**: any key may be evicted, least recently used, least frequently used or at random. Right for a pure cache, where an eviction costs one reload. Wrong for sessions: an idle learner's session is exactly a least recently used key, and its TTL is only an upper bound on its life.",
            "**volatile-lru, volatile-lfu, volatile-random, volatile-ttl**: only keys with an expiry may be evicted (volatile-ttl picks the ones closest to expiring). Meant for an instance that mixes cache keys with TTLs and permanent keys without. It works only if every cache key has a TTL; keys written without one are invisible to the policy, as this incident shows.",
        ]),
        p("LRU and LFU in Redis are approximations that sample a few keys (maxmemory-samples) rather than tracking exact order, and newer Redis releases may add policies or tune these; the documentation of your version is the reference."),
        h3("The design rule"),
        p("Data that can be reloaded and data that cannot should not share an eviction policy. The simplest robust layout for CodeDev is two instances (or two databases in a managed service that supports separate policies per database):"),
        code("text", `
# redis-cache: course pages, catalog search, anything with a loader
maxmemory 3gb
maxmemory-policy allkeys-lru     # or allkeys-lfu for skewed popularity
appendonly no                    # a restart costs a warm-up, not data

# redis-state: sessions, rate limits, leaderboard, lb:seen / lb:version
maxmemory 2gb
maxmemory-policy noeviction      # fail loudly instead of logging users out
appendonly yes
appendfsync everysec`, "redis.conf excerpts"),
        p("When **not** to split: a small deployment where all keys fit with room to spare. One instance is fine as long as every cache key has a TTL and an alert fires at around 75-80% of maxmemory. Split when the cache can grow without bound, as search results can."),

        h2("4. Persistence: what a restart keeps"),
        p("Redis can write its data to disk in two ways, and you can use both, either or neither:"),
        bullets([
            "**RDB snapshots.** A forked child writes the whole dataset to a file at intervals (the save rules, or BGSAVE). Compact and fast to load; a crash loses every write since the last snapshot, which can be minutes. The fork needs extra memory while pages are copied on write, which matters on a box near its limit.",
            "**AOF (append-only file).** Every write is appended to a log and replayed at start-up. appendfsync controls how often it reaches the disk: always (every write, slow), everysec (the usual choice: a crash can lose about the last second), no (the OS decides). The file is rewritten in the background to stay compact; recent versions split it into several files, with details that changed between releases.",
            "**Neither.** A restart starts empty. Perfectly reasonable for a pure cache, with a warm-up plan so the empty cache does not stampede the database (lesson 4.2).",
        ]),
        p("Then ask, per kind of key, what a restart costs:"),
        bullets([
            "**Cache:** a warm-up. Nothing is lost that PostgreSQL does not have.",
            "**Sessions:** with no persistence, every learner is logged out. With AOF everysec, at most the sessions created in the last second.",
            "**Rate-limit counters:** a fresh window for everyone; usually acceptable.",
            "**Leaderboard:** whatever was not persisted, which is why lesson 3.3 made it rebuildable from learner_score. The rebuild is the real backup, persistence just makes it rarely needed.",
        ]),

        h2("5. Replication and failover"),
        p("A replica receives the primary's writes **asynchronously**. The primary acknowledges a write to the client before the replica has it. When the primary fails and Sentinel (or the managed service) promotes the replica, writes that were acknowledged but not yet replicated are gone, regardless of the old primary's AOF settings. WAIT numreplicas timeout makes a client wait until replicas acknowledge a write, which narrows the window; it does not make Redis a strongly consistent store."),
        bullets([
            "**Clients must follow the failover**: connect through Sentinel or the provider's endpoint, not a fixed IP, and retry briefly on connection errors during the switch.",
            "**Reads from replicas are slightly stale.** Fine for a course page, not for \"did my rate-limit counter just pass the limit\".",
            "**Watch replication health**: role, master_link_status:up and the gap between master_repl_offset and the replica's offset in INFO replication.",
        ]),

        challenge("chal_quiz_rdp_431"),

        h2("6. What to monitor"),
        p("A short list, all from INFO, that would have caught this incident on Monday:"),
        bullets([
            "**used_memory vs maxmemory.** Alert at around 75-80%, page at 90%. Track the trend: a straight line up after a release is a missing TTL.",
            "**evicted_keys** (rate). On a cache instance a steady rate is normal; on a state instance with noeviction it must stay 0, and on a volatile-* instance any eviction means something with a TTL you care about was removed.",
            "**Hit rate** = keyspace_hits / (keyspace_hits + keyspace_misses), as a rate over a few minutes, per instance. A drop after a deploy usually means a key name changed or a TTL got shorter.",
            "**expires vs keys** in INFO keyspace. On a cache instance the two should be close; a growing gap is keys without a TTL.",
            "**Persistence status**: rdb_last_bgsave_status and aof_last_write_status must be ok; a failing write to disk means the next restart loses more than you think.",
            "**Latency and slow commands**: SLOWLOG and LATENCY (lesson 4.2), plus connected_clients and rejected_connections.",
        ]),
        code("text", `
# alert rules (Prometheus redis_exporter metric names; adjust to your exporter and version)
redis_memory_used_bytes / redis_memory_max_bytes > 0.8                for 10m   -> warn
rate(redis_evicted_keys_total{instance="redis-state"}[5m]) > 0        for 1m    -> page
rate(redis_keyspace_hits_total[5m]) /
  (rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m])) < 0.8   for 15m -> warn
redis_rdb_last_bgsave_status != 1 or redis_aof_last_write_status != 1                          -> page`, "alerts.yaml (sketch)"),

        h2("7. Key naming and TTL hygiene"),
        p("Most Redis incidents start with a key nobody can attribute or a key that never expires. Four habits prevent both:"),
        numbered([
            "**Names that say who owns them**: <feature>:<entity>:<id>[:<part>], for example course:detail:nodejs-api-security, session:7f3a..., rl:login:ip:203.0.113.7, lb:global. Then a scan by prefix tells you which feature is growing.",
            "**A TTL on every cache key, at write time.** Not a later EXPIRE call that a crash can skip: SET key value EX seconds in one command. Make it hard to forget by giving the codebase one cache helper whose signature requires a TTL.",
            "**A version in the prefix when the format changes** (course:v3:detail:...), so old entries are ignored and expire on their own instead of being deleted with a risky mass delete.",
            "**Never KEYS in production.** It blocks the server while it walks the keyspace. Use SCAN with MATCH and COUNT, preferably on a replica.",
        ]),
        code("typescript", `
// ops/ttl-audit.ts - sample keys by prefix and report the ones without a TTL (run against a replica)
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_REPLICA_URL!);
const stats = new Map<string, { keys: number; noTtl: number; bytes: number }>();
let scanned = 0;

for await (const keys of redis.scanStream({ count: 1000 })) {
  for (const key of keys as string[]) {
    if (++scanned > 200_000) break;                           // a sample is enough
    const prefix = key.split(":").slice(0, 2).join(":");     // e.g. catalog:search
    const [ttl, bytes] = await Promise.all([redis.ttl(key), redis.memory("USAGE", key)]);
    const s = stats.get(prefix) ?? { keys: 0, noTtl: 0, bytes: 0 };
    s.keys++;
    if (ttl === -1) s.noTtl++;
    s.bytes += Number(bytes ?? 0);
    stats.set(prefix, s);
  }
  if (scanned > 200_000) break;
}
console.table([...stats].map(([prefix, s]) => ({ prefix, ...s })).sort((a, b) => b.bytes - a.bytes));
await redis.quit();`, "ttl-audit.ts"),
        p("Run it weekly or after each release that touches Redis; a prefix with keys and noTtl equal and bytes growing is the next incident."),

        h2("8. How to verify the fix"),
        bullets([
            "**After the fix (TTL on catalog:search, then the split):** expires approaches keys on the cache instance, evicted_keys on the state instance stays at 0, used_memory levels off, and the OOM errors stop. Delete the existing catalog:search keys with SCAN plus UNLINK in batches, not KEYS plus DEL.",
            "**A restart drill on staging.** Count session keys and ZCARD lb:global, restart the state instance, count again: the difference is what a crash costs with your persistence settings. Then restart the cache instance under load and watch the database during the warm-up.",
            "**A failover drill.** Trigger a failover (SENTINEL FAILOVER or the provider's test) and check that the API reconnects within seconds and that the leaderboard drift check from lesson 4.1 is clean afterwards.",
        ]),

        h2("9. Common mistakes"),
        bullets([
            "**Assuming a TTL protects a key.** It limits how long a key lives, not whether it gets evicted. Spot it: sessions on an allkeys-* instance.",
            "**A volatile-* policy with cache keys that have no TTL.** The cache grows, the keys with TTLs get evicted, then writes fail. Spot it: INFO keyspace with expires far below keys.",
            "**Treating AOF as \"nothing is ever lost\".** everysec loses about a second; failover loses unreplicated writes. Spot it: data whose only copy is in Redis.",
            "**No memory alert below maxmemory.** The first signal is an outage. Spot it: an alert list without used_memory / maxmemory.",
            "**Running KEYS, MONITOR or --bigkeys against a busy primary.** They cost the server real time. Spot it: SLOWLOG entries for KEYS; run scans on a replica.",
        ]),

        h2("10. Summary"),
        numbered([
            "maxmemory is the budget and the policy decides who pays: allkeys-* for a pure cache, noeviction for sessions and leaderboards, volatile-* only when every cache key has a TTL. Separate data you can reload from data you cannot.",
            "RDB and AOF reduce what a restart loses, and asynchronous replication can still lose acknowledged writes on failover: keep the source of truth in PostgreSQL and keep everything in Redis rebuildable or acceptable to lose.",
            "Watch memory against maxmemory, evictions, hit rate, expires vs keys and persistence status, and keep key names attributable and every cache key on a TTL set in the same SET.",
        ]),

        h2("Sources"),
        bullets([
            "Redis documentation: Key eviction (maxmemory and policies) - redis.io/docs/latest/develop/reference/eviction/",
            "Redis documentation: Redis persistence (RDB and AOF) - https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/",
            "Redis documentation: Replication and high availability with Sentinel - redis.io/docs/latest/operate/oss_and_stack/management/replication/",
        ]),
        callout("tip", "Self-practice (not graded): an operations sheet for your Redis",
            "For a Redis you run (or a local one with the CodeDev keys of this course), write one page: each key prefix, its owner, its TTL, whether it can be reloaded; the instance and policy it belongs on; what a restart and a failover cost for each; and the three alerts you would set first. Verify every line with a command: CONFIG GET, INFO, TTL on a sample key."),
    ],
});
