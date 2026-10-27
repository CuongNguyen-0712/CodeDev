// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-2-1",
    title: "Cache drift: update the database, invalidate the cache",
    slug: { _type: "slug", current: "cache-drift-update-database-invalidate-cache" },
    description:
        "An admin lowered a course price and the course page kept the old one for an hour; after a hotfix added a DEL, a slow request put the old price back seconds later. Learn why every write path must invalidate the keys derived from the row it changed, why you delete instead of set, why the delete comes after the commit, and how a version check stops a reader that loaded before the change from re-caching it.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev catalog API (NestJS, PostgreSQL, Redis)",
        problem:
            "At 10:00 an admin lowered \"Redis Patterns\" from 249,000 to 199,000 VND for a weekend promotion. PostgreSQL had the new price at once, but https://app.codedev.test/courses/redis-patterns and the Redis category page showed 249,000 until about 11:00, and support received a dozen tickets from learners who saw one price on the course page and another at checkout. A hotfix added a DEL of the course key to the admin endpoint. The next day the same thing happened again on a smaller scale: the price was correct for a few seconds after an edit, then the old price came back for an hour.",
    },

    content: [
        h2("1. The incident: a write path that forgot the cache"),
        p("The catalog API reads courses with cache-aside, the pattern from lesson 1.2: `GET` the key, and on a miss load the row from PostgreSQL and `SET` it with a one-hour TTL. Two key families exist: `course:<id>` for the course page, and `courses:category:<category>` for the category page, which holds the whole list with prices. This is the update path that shipped:"),
        code("typescript", `
// catalog/catalog.service.ts (as shipped)
@Injectable()
export class CatalogService {
  constructor(private readonly db: CoursesRepository, private readonly redis: Redis) {}

  async updateCoursePrice(id: string, priceVnd: number): Promise<boolean> {
    if (!Number.isInteger(priceVnd) || priceVnd < 0) return false;
    const row = await this.db.updatePrice(id, priceVnd);   // UPDATE ... RETURNING *
    return row !== null;
  }
}`, "catalog.service.ts"),
        p("Nothing in this method talks to Redis. PostgreSQL is right, the cache holds a copy taken before the edit, and nobody tells the cache that its copy is out of date. The copy stays until its TTL ends. That is **cache drift**: the cache and the source of truth disagree, and the cache wins because readers ask it first."),
        p("Drift is not caused by Redis. It is caused by a write path that does not know which cached keys are derived from the row it changed. Every cache you add creates a duty for every code path that writes the underlying data: the admin endpoint, the bulk import script, the migration, the support tool that fixes a price by SQL."),

        h2("2. Reproduce it and read the evidence"),
        p("Put the two sources side by side. The database answer is the truth; the Redis answer is what learners see:"),
        code("bash", `
$ psql "$DATABASE_URL" -c "SELECT id, price_vnd, updated_at FROM courses WHERE id = 'c1'"
 id | price_vnd |        updated_at
----+-----------+---------------------------
 c1 |    199000 | 2026-10-24 10:00:03+07

$ redis-cli GET course:c1
"{\\"id\\":\\"c1\\",\\"title\\":\\"Redis Patterns\\",\\"category\\":\\"redis\\",\\"priceVnd\\":249000}"
$ redis-cli TTL course:c1
(integer) 3187
$ redis-cli GET courses:category:redis
"[{\\"id\\":\\"c1\\",...,\\"priceVnd\\":249000},{\\"id\\":\\"c2\\",...}]"`, "terminal, 10:07"),
        p("The `TTL` tells you how long the wrong answer will last: 3187 seconds, so until about 10:00 plus one hour from the last fill. Note the second key: the category list also embeds the price. A fix that only deletes `course:c1` leaves the category page wrong."),
        h3("The second incident: the old price comes back"),
        p("After the hotfix the endpoint ran `DEL course:c1` after the UPDATE. The following day an edit was correct for a few seconds and then reverted. `MONITOR` streams every command Redis receives; it is expensive, so run it for a few seconds on a staging copy or during a short reproduction, never as a permanent log. Merged with the PostgreSQL log, it showed this order:"),
        code("text", `
10:00:00.000 [catalog-api-2] GET course:c1 -> (nil)
10:00:00.002 [catalog-api-2] SELECT * FROM courses WHERE id = 'c1'     -- slow: answers at .478 with 249000
10:00:00.120 [admin-api]     UPDATE courses SET price_vnd = 199000 ...; COMMIT
10:00:00.125 [admin-api]     DEL course:c1 -> (integer) 0
10:00:00.482 [catalog-api-2] SET course:c1 '{...,"priceVnd":249000}' EX 3600`, "MONITOR + PostgreSQL log"),
        p("The DEL ran at the right time. A reader that started *before* the edit loaded the old row and wrote it *after* the DEL. Deleting is necessary, but on its own it is not sufficient: a slow reader can still re-populate the key with a value it loaded before the change."),

        h2("3. Core idea: the database decides, the cache forgets"),
        p("Three rules cover almost every cache-aside system. Each has a reason you can test."),
        h3("Rule 1: delete, do not set"),
        p("It is tempting to make the update path write the new value into Redis (write-through). It looks more efficient: the next reader gets a hit. It is also less safe:"),
        bullets([
            "**The last SET wins, not the newest value.** Two edits whose SETs reach Redis in the opposite order of their COMMITs leave the older price cached. A slow reader's SET can also land after yours, exactly as in the trace.",
            "**The update path must build the cached shape.** For `course:<id>` that is easy; for `courses:category:<c>` it means re-querying the whole list inside the write path, for a key nobody may read.",
            "**A missing key is always safe.** The worst a DEL can do is cause one extra database read. The worst a wrong SET can do is serve a wrong value for a whole TTL.",
        ]),
        h3("Rule 2: invalidate after the commit, and every derived key"),
        p("If you delete before the UPDATE commits, a reader can miss, read the *old* committed row, and cache it before your transaction commits. Delete after the database has answered. If the write happens inside a transaction, delete after the transaction commits, not inside it: a rolled-back transaction should not have changed anything, and a delete inside it can run before other readers can see the new row."),
        p("\"Every derived key\" means every key whose value includes data from that row. Write the list down next to the key names, per entity, so a reviewer can check it:"),
        code("typescript", `
// catalog/cache-keys.ts - one place that knows what a course row is copied into
export const courseKeys = (row: { id: string; category: string }) => [
  \`course:\${row.id}\`,                    // course page
  \`courses:category:\${row.category}\`,    // category page lists the price
];`, "cache-keys.ts"),
        p("Avoid pattern deletes such as `KEYS courses:*` followed by DEL in production: `KEYS` walks the whole keyspace in one blocking call. If you really need to find keys by pattern, use `SCAN` in batches, but a list of known keys is simpler and faster."),
        h3("Rule 3: a fill that started before the change must not win"),
        p("The race in the trace has three common fixes, from simplest to strongest:"),
        bullets([
            "**Short TTL only.** Accept that a stale fill can live for the TTL. Fine for a view count or a \"popular this week\" list; not for a price a learner is about to pay.",
            "**Delayed double delete.** Delete after the commit, then delete again after a delay longer than a slow read (for example 1-2 seconds, from your p99 query time). It removes most stale fills, but a read slower than the delay still wins, and the second delete needs a timer or a queue that survives a restart.",
            "**A version check on the fill.** Each invalidation increments a version counter for the key. A fill reads the version before its query and stores its result only if the version is unchanged afterwards. A reader that overlapped an invalidation gives its result to its own caller and does not cache it.",
        ]),
        callout("info", "When not to cache at all",
            "Invalidation is a cost paid on every write path forever. If a value is read rarely, or must be exact at the moment of use, read it from PostgreSQL. The checkout endpoint of CodeDev reads the price from the database inside the payment transaction even though the course page is cached: a cached price may be shown, but it is never charged."),

        challenge("chal_quiz_rdp_211"),

        h2("4. Worked example: an instructor profile with a version check"),
        p("The same pattern on a different entity: the instructor profile `instructor:<id>` and the list `courses:instructor:<id>`, both derived from the `instructors` row. The fill and the invalidation are small enough to read in one go:"),
        code("typescript", `
const TTL_SECONDS = 3600;

// Invalidate: bump the version first, then remove the value.
async function invalidate(redis: Redis, key: string): Promise<void> {
  await redis.multi().incr(\`\${key}:ver\`).del(key).exec();
}

// Fill on a miss: remember the version, query, store only if nobody invalidated meanwhile.
async function cached<T>(redis: Redis, key: string, load: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit !== null) return JSON.parse(hit) as T;
  const seen = (await redis.get(\`\${key}:ver\`)) ?? "";
  const value = await load();
  await redis.eval(FILL_IF_UNCHANGED, 2, key, \`\${key}:ver\`, seen, JSON.stringify(value), TTL_SECONDS);
  return value;   // the caller gets what it loaded either way
}

async function renameInstructor(id: string, name: string): Promise<void> {
  const row = await db.instructors.update({ where: { id }, data: { name } });  // commits here
  for (const key of [\`instructor:\${row.id}\`, \`courses:instructor:\${row.id}\`]) await invalidate(redis, key);
}`, "instructors.cache.ts (ioredis)"),
        p("The check and the SET must happen as one step: between a separate `GET key:ver` and `SET key`, another client could invalidate. A Lua script runs atomically on the Redis server, so nothing can run between its commands:"),
        code("text", `
-- FILL_IF_UNCHANGED: KEYS[1] = key, KEYS[2] = key:ver
-- ARGV[1] = version seen before the query ("" when none), ARGV[2] = value, ARGV[3] = TTL seconds
local current = redis.call('GET', KEYS[2]) or ''
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1`, "fill-if-unchanged.lua"),
        bullets([
            "`redis.call('GET', ...)` returns `false` in Lua for a missing key, hence `or ''`.",
            "Keep the version keys without a TTL, or with a TTL much longer than the value's. If a version key expired while a fill was running, the fill would see \"\" twice and could store a stale value.",
            "In Redis Cluster both keys of a script must be in the same hash slot. Put the shared part in braces: `{instructor:42}` and `{instructor:42}:ver`.",
            "If Redis is unreachable during the invalidation, the database write already happened. Log it, alert on it, and let the TTL bound the damage; teams that cannot accept that window write the invalidation to an outbox table in the same transaction and process it afterwards.",
        ]),

        h2("5. Fix the catalog service"),
        p("The challenge contains the catalog service with both bugs: the update path that never invalidates, and a shared `cached()` helper that lets a slow reader re-cache an old value. The fake database can hold the answer of a query, so the tests replay the exact interleavings from section 2: a reader that loaded before the edit, a slow UPDATE, edits of the category list, invalid prices. Each test prints what every reader saw and whether it came from PostgreSQL or Redis. The description specifies the version protocol exactly, so the tests are deterministic."),
        challenge("chal_coding_rdp_212"),

        h2("6. How to verify invalidation"),
        bullets([
            "**A test with a slow fake database.** The race only appears when a read overlaps a write. A test that runs requests one after the other will always pass. Hold a query, run the edit, release the query, then read again, as the challenge does.",
            "**Compare Redis with PostgreSQL after an edit.** A small script that runs the UPDATE, waits a second, then compares `GET course:<id>` (or a miss) with `SELECT` for every key in `courseKeys(row)`. Run it in staging after each deploy of a write path.",
            "**MONITOR during a reproduction.** A few seconds of `redis-cli MONITOR | grep course:c1` shows the order of GET, SET, INCR and DEL across instances. That order, not the order of the code, decides what is cached.",
            "**A drift metric.** Sample N cached keys per minute, compare them with the database, and count mismatches. A rising count after a deploy means a write path is missing its invalidation.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**A write path without invalidation.** Admin endpoints, imports, scripts and manual SQL all change rows. Spot it: search the code for every UPDATE of the table and check each one calls the invalidation; for manual SQL, have a runbook step or a trigger-driven job.",
            "**SET from the update path.** Spot it: the write method builds a cached value. Ask what happens if a slower writer's SET arrives after yours.",
            "**Delete before the commit, or inside the transaction.** Spot it: the DEL sits above `await tx.commit()` or inside the transaction callback.",
            "**Forgetting derived keys.** The course key is deleted, the category list is not. Spot it: a key family that embeds the changed column but is not in the entity's key list.",
            "**A version check that is not atomic.** `GET key:ver`, then `SET key` as two commands leaves a window. Spot it: no Lua script, `WATCH`/`MULTI`, or equivalent around the conditional SET.",
        ]),

        h2("8. Summary"),
        numbered([
            "Cache drift comes from write paths, not from Redis: every write must invalidate every key derived from the row it changed.",
            "Write the database first, then DEL (never SET) the derived keys after the commit; a missing key costs one read, a wrong key costs a whole TTL.",
            "A reader that loaded before the change can re-cache it after your DEL; a version check on the fill (atomic, in a Lua script) or a delayed second delete closes that window, and a slow-database test proves it.",
        ]),

        h2("Sources"),
        bullets([
            "Redis documentation: data types and commands (GET, SET, DEL, INCR, EVAL, MONITOR, SCAN) - redis.io/docs/latest/develop/data-types/",
            "Redis documentation: scripting with Lua (atomic execution, keys in the same hash slot) - redis.io/docs/latest/develop/interact/programmability/eval-intro/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List every code path in your project that writes a cached table (endpoints, workers, scripts, migrations) and, next to each, the cache keys it must invalidate. Then write one test with a held database query that proves a slow reader cannot re-cache an old value, and run your drift script in staging after an edit."),
    ],
});
