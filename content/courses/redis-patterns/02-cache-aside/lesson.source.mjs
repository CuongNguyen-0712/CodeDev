// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-1-2",
    title: "Cache-aside with TTL: read, miss, load, store",
    slug: { _type: "slug", current: "cache-aside-with-ttl" },
    description:
        "On enrollment campaign day PostgreSQL ran at 92% CPU answering the same course lookups, a scraper sent every unknown id straight to the database, and the first cache made it worse with a spike every five minutes. Learn cache-aside step by step: read Redis, load from PostgreSQL on a miss, store with a TTL and jitter, cache \"not found\" briefly, never cache an error, and verify hit rate and staleness with numbers.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer, CodeDev learning platform (NestJS API, PostgreSQL, Redis)",
        problem:
            "On the morning of the enrollment campaign GET /courses/:id at https://api.codedev.test went from 40 ms to 1.8 s p95 and PostgreSQL CPU sat at 92%. pg_stat_statements showed the course lookup at 2,400 calls per second, 38% of them for course ids that do not exist: a scraper was walking the id space. A quick fix cached courses in Redis for exactly 300 seconds; the database calmed down, then spiked every five minutes, and during a 5-second database failover it cached \"course not found\" for real courses, which returned 404 for five minutes.",
    },

    content: [
        h2("1. The incident: the same query, 2,400 times a second"),
        p("The evidence the on-call engineer collected before touching any code:"),
        code("sql", `
-- pg_stat_statements, top statement by total time during the campaign
SELECT calls, round(mean_exec_time::numeric, 2) AS mean_ms, rows, query
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 1;

  calls   | mean_ms |  rows   | query
----------+---------+---------+-----------------------------------------------
 8640312  |   11.84 | 5356993 | SELECT ... FROM course c JOIN ... WHERE c.id = $1`, "psql"),
        p("8.6 million calls in an hour, but only 5.4 million rows returned: about 38% of the lookups found nothing. The access log explained it - a scraper requesting `/courses/c_100001`, `/courses/c_100002`, ... each answered `404` after a full database round trip. The other 62% were real learners opening the same few hundred course pages over and over. The data changes a few times a day; it was read 2,400 times a second."),
        p("That is the textbook case for a cache: **many reads of the same data, few writes, and a short delay before an edit shows up is acceptable**. The first attempt got the idea right and three details wrong, and each detail caused its own outage. This lesson builds the pattern so that none of the three can happen."),

        h2("2. Cache-aside in four steps"),
        p("In **cache-aside** (also called lazy loading) the application talks to both stores. Redis never talks to PostgreSQL; it only holds what the application put there:"),
        numbered([
            "**Read** the key from Redis: `GET course:<id>`.",
            "**Hit**: deserialise and return. PostgreSQL is not touched.",
            "**Miss**: load from PostgreSQL, the source of truth.",
            "**Store** the result in Redis with a TTL, then return it: `SET course:<id> <json> EX <seconds>`.",
        ]),
        p("Only data that was actually requested gets cached, the cache can be emptied at any time without losing anything, and if Redis is down the application can still answer from PostgreSQL (slower). The price: the first request after a miss pays for both stores, and the cache can return a value that PostgreSQL has already changed - for at most the TTL, unless you also invalidate on write (lesson 4)."),
        h3("Choosing the TTL"),
        p("The TTL is a business decision written in seconds: **how long may a learner see the old value after an admin edits it?** For a course description, five minutes is fine. For a price during a sale, maybe 30 seconds, plus invalidation on edit. For a learner's own progress, caching may not be worth it at all: they notice immediately when it is stale."),
        bullets([
            "**Never cache without a TTL** unless you have another removal path you trust. A key without a TTL is stale forever after the first edit you forget to invalidate, and it never leaves memory.",
            "**Longer TTL** means a higher hit rate and longer staleness. **Shorter TTL** means fresher data and more database reads. Measure the hit rate (section 5) before tuning.",
            "**Do not cache what is cheap.** A primary-key lookup that takes 1 ms on an idle database does not need a cache. The CodeDev lookup took 11.8 ms on a busy one, with joins.",
        ]),

        h2("3. The three details that caused outages"),
        h3("Synchronised expiry: add jitter"),
        p("The quick fix stored every course with `EX 300`. A deploy at 10:00:00 warmed the cache with the 500 most-viewed courses within a second, so all of them expired within the same second at 10:05:00, again at 10:10:00, and so on. Each time, hundreds of misses hit PostgreSQL together:"),
        code("bash", `
$ redis-cli --scan --pattern 'course:*' --count 100 | head -4 | xargs -n1 redis-cli TTL
(integer) 42
(integer) 42
(integer) 42
(integer) 42`, "terminal"),
        p("The fix is **jitter**: add a random number of seconds to each TTL, so keys written together expire spread over a window. With `300 + random 0..60` the misses that came as one wall at 10:05:00 now arrive over a minute and the database sees a gentle slope. Keep the randomness injectable (a `random()` parameter) so tests stay deterministic. Jitter spreads many keys apart; it does not protect one very hot key from a burst of concurrent misses - that is a stampede, lesson 11."),
        h3("Unknown ids: cache \"not found\" too, briefly"),
        p("A cache that stores only found courses does nothing for the scraper: `c_100001` is never in Redis, so every request goes to PostgreSQL. **Negative caching** stores the absence as well - a marker such as the JSON `null` - with a **shorter TTL** than real data. Shorter, because a course can be created after someone asked for it: an admin who publishes `c_207` right after a learner opened the link should not wait five minutes for it to appear. 30 seconds turns a scraper's 1,000 requests per second for the same id into one database query per 30 seconds per id, and keeps the window for new content small."),
        h3("Errors are not answers: never cache them"),
        p("The quick fix caught the database error, treated it as \"not found\" and cached it:"),
        code("typescript", `
// the quick fix - do not copy
let course: Course | null = null;
try {
    course = await this.courses.findById(id);
} catch (err) {
    this.logger.warn(\`course \${id}: \${err}\`);   // a failover error becomes "no such course"...
}
await this.redis.set(\`course:\${id}\`, JSON.stringify(course), "EX", 300);  // ...for 300 seconds`, "course-catalog.service.ts"),
        p("During the 5-second failover, every miss stored `null` for real courses. PostgreSQL was back after 5 seconds; learners got `404 Course not found` for five more minutes. An error means \"I do not know\", and \"I do not know\" must never be stored as an answer. Let the error reach the caller (a 503 with a retry is honest), write nothing to the cache, and the next request after recovery will load the real course."),

        challenge("chal_quiz_rdp_121"),

        h2("4. Worked example: the NestJS service"),
        p("The service the team shipped after the incident, with ioredis. The cache logic is small; the decisions are in the constants and in what the `catch` does not do:"),
        code("typescript", `
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module";
import { CoursesRepository, type CourseDto } from "./courses.repository";

const COURSE_TTL_SECONDS = 300;        // how stale a course page may be (admins were asked)
const COURSE_TTL_JITTER_SECONDS = 60;  // spread expiry of keys written together
const NOT_FOUND_TTL_SECONDS = 30;      // new courses appear within 30 s

@Injectable()
export class CourseCatalogService {
    private readonly logger = new Logger(CourseCatalogService.name);

    constructor(
        @Inject(REDIS) private readonly redis: Redis,
        private readonly courses: CoursesRepository,
        private readonly random: () => number = Math.random,   // injectable for tests
    ) {}

    async getCourse(id: string): Promise<CourseDto | null> {
        const key = \`course:\${id}\`;
        const cached = await this.readCache(key);
        if (cached !== undefined) return cached;

        const course = await this.courses.findById(id);   // throws on DB errors: nothing is cached
        if (course === null) {
            await this.writeCache(key, "null", NOT_FOUND_TTL_SECONDS);
        } else {
            const ttl = COURSE_TTL_SECONDS + Math.floor(this.random() * (COURSE_TTL_JITTER_SECONDS + 1));
            await this.writeCache(key, JSON.stringify(course), ttl);
        }
        return course;
    }

    /** undefined = miss (or unreadable), null = cached "not found", else the course. */
    private async readCache(key: string): Promise<CourseDto | null | undefined> {
        try {
            const raw = await this.redis.get(key);
            return raw === null ? undefined : (JSON.parse(raw) as CourseDto | null);
        } catch (err) {
            this.logger.warn(\`cache read \${key} failed, using the database: \${err}\`);
            return undefined;   // Redis down or a value we cannot parse: behave like a miss
        }
    }

    private async writeCache(key: string, value: string, ttlSeconds: number): Promise<void> {
        try {
            await this.redis.set(key, value, "EX", ttlSeconds);   // node-redis: set(key, value, { EX: ttlSeconds })
        } catch (err) {
            this.logger.warn(\`cache write \${key} failed: \${err}\`);   // the answer is still correct
        }
    }
}`, "course-catalog.service.ts"),
        p("Notice what each `try` protects. Redis failures are swallowed on purpose: the cache is an optimisation, and a request that cannot use it should still succeed from PostgreSQL. Database failures are **not** caught here: they propagate to NestJS, which answers 500 (or a 503 from your exception filter), and nothing is written to Redis."),
        h3("Serialisation is part of the contract"),
        bullets([
            "**`JSON.parse` gives back plain data.** A `Date` in the DTO comes back as a string, a `Map` as `{}`, a `bigint` throws in `JSON.stringify`. Cache a DTO built from plain types (ISO strings for dates, numbers for prices in VND), not an ORM entity with methods.",
            "**The cached shape changes with your code.** After a deploy that renames a field, old values in Redis still have the old shape until they expire. Either put a version in the key (`course:v2:<id>`) when the shape changes, or treat a value you cannot read as a miss, as `readCache` does.",
            "**`null` must survive the round trip.** `JSON.stringify(null)` is `\"null\"` and `JSON.parse(\"null\")` is `null`, which is why the JSON `null` makes a clean \"not found\" marker - distinct from a missing key, which `GET` returns as `null` before any parsing.",
        ]),
        callout("info", "SET with EX, not SET then EXPIRE",
            "SET key value EX 300 stores the value and its TTL in one command. SET followed by EXPIRE is two commands: if the process dies between them, the key lives forever. The same applies to SETEX, which is an older spelling of SET ... EX."),

        h2("5. How to verify it"),
        numbered([
            "**Hit rate.** `redis-cli INFO stats` shows `keyspace_hits` and `keyspace_misses` for the whole instance; hit rate = hits / (hits + misses). For one feature, count in the service (a metric per hit, miss and not-found) - the instance numbers mix every feature together.",
            "**Database load.** `pg_stat_statements.calls` for the course lookup before and after, over the same traffic. The campaign replay in staging went from 2,400 to about 60 calls per second.",
            "**TTL and jitter.** `redis-cli TTL course:c_12` on several keys written together must show different values between 300 and 360; a not-found key shows at most 30.",
            "**Staleness bound.** Edit a course in staging, then poll `GET /courses/:id`: the new title must appear within the TTL. Write that number down - it is the promise you made to the admins.",
            "**Failure behaviour.** Stop PostgreSQL in staging for 10 seconds while requesting an uncached course: you get errors, and `redis-cli EXISTS course:<id>` stays `0`. Start it again: the next request returns the course. Stop Redis instead: requests still succeed, slower.",
            "**Tests with fakes.** A fake Redis on a fake clock and a fake repository that counts calls prove all of the above in milliseconds - that is the exercise below.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**No TTL.** Spot it: `redis-cli TTL course:<id>` returns `-1`, or `SET` without `EX` in the code. The key is stale after the first edit and never leaves memory.",
            "**The same TTL for every key.** Spot it: a database graph with spikes at a fixed period equal to the TTL, and `TTL` showing the same value on keys written together.",
            "**Caching errors as \"not found\".** Spot it: a `catch` that sets the result to `null` (or `[]`) and continues to the cache write. A 404 that outlives a database incident by exactly the TTL is the symptom.",
            "**No negative caching, or with the full TTL.** Spot it: a scraper or a broken link drives database load while the hit rate looks fine; or a newly published course 404s for minutes.",
            "**Trusting the cached shape.** Spot it: `JSON.parse(raw) as CourseDto` with no plan for values written by the previous release, and `Date` methods called on cached fields.",
        ]),

        challenge("chal_coding_rdp_122"),

        h2("7. Summary"),
        bullets([
            "Cache-aside: read Redis, on a miss load from PostgreSQL and store with `SET ... EX`; Redis only ever holds copies, so it can be emptied or fail without losing data.",
            "The TTL is the maximum staleness you accept; add jitter so keys written together do not expire together, and cache \"not found\" with a shorter TTL.",
            "Never cache an error, treat unreadable cached values as a miss, and verify with hit rate, `pg_stat_statements` and `TTL`, not with a feeling that the page got faster.",
        ]),

        h2("Sources"),
        bullets([
            "Redis docs: SET command (EX, PX, NX, XX options) and EXPIRE - redis.io/docs/latest/commands/set/",
            "Redis docs: Understand Redis data types - redis.io/docs/latest/develop/data-types/",
            "PostgreSQL docs: pg_stat_statements - postgresql.org/docs/current/pgstatstatements.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add three counters to your own getCourse (hit, miss, not-found) and expose them as metrics. Replay a log of real requests against a local Redis with TTLs of 30, 300 and 3,000 seconds and plot hit rate against staleness. Write down which TTL you would choose for course pages, prices and a learner's progress, and why."),
    ],
});
