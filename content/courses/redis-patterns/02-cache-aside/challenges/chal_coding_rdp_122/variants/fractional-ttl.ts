import { readFileSync } from "node:fs";

// CodeDev course pages: cache-aside for GET /courses/:id.
// PostgreSQL (here: FakeDb) is the source of truth; Redis (FakeRedis) only holds copies.
//
// getCourse(id, deps) must:
//   1. read the key "course:<id>" from Redis;
//   2. on a hit, return the cached course (parsed from JSON), or null for a cached "not found",
//      without touching the database;
//   3. on a miss, read the course with deps.db.findCourseById(id) and store the result:
//      - a course: JSON.stringify(course) with a TTL of
//        COURSE_TTL_SECONDS + Math.floor(deps.random() * (COURSE_TTL_JITTER_SECONDS + 1)) seconds
//        (call deps.random() exactly once per stored course, and at no other time);
//      - not found (null): a "not found" marker for NOT_FOUND_TTL_SECONDS (the JSON "null" works well);
//   4. never cache an error: when the database throws, let the error propagate and write nothing;
//   5. treat a cached value that is not valid JSON (left by an older deploy) as a miss.
// Do not change the Course type, the constants or anything below the "do not change" line.

type Course = { id: string; title: string; priceVnd: number; published: boolean };

const COURSE_TTL_SECONDS = 300;
const COURSE_TTL_JITTER_SECONDS = 60;
const NOT_FOUND_TTL_SECONDS = 30;

type Deps = { redis: FakeRedis; db: FakeDb; random: () => number };

function getCourse(id: string, deps: Deps): Course | null {
    const key = `course:${id}`;
    const cached = deps.redis.get(key);
    if (cached !== null) {
        try {
            return JSON.parse(cached) as Course | null;
        } catch {
            // unreadable value from an older deploy: fall through and reload it
        }
    }
    const course = deps.db.findCourseById(id); // throws when the database is down: nothing is cached
    if (course === null) {
        deps.redis.set(key, "null", { ex: NOT_FOUND_TTL_SECONDS });
    } else {
        const ttl = COURSE_TTL_SECONDS + deps.random() * COURSE_TTL_JITTER_SECONDS;
        deps.redis.set(key, JSON.stringify(course), { ex: ttl });
    }
    return course;
}

// ---------------------------------------------------------------- in-memory Redis and database (do not change)
// A small model of the Redis commands used here. Values are strings, the clock is in milliseconds,
// expiry is lazy: a key whose expiry time is <= clock.now behaves as missing. `calls` counts commands.
class FakeClock {
    now = 0;
    advance(ms: number): void {
        this.now += ms;
    }
}

type Entry = { value: string; expiresAt: number | null };

class FakeRedis {
    private data = new Map<string, Entry>();
    private clock: FakeClock;
    calls: Record<string, number> = {};
    constructor(clock: FakeClock) {
        this.clock = clock;
    }

    private count(command: string): void {
        this.calls[command] = (this.calls[command] ?? 0) + 1;
    }
    private live(key: string): Entry | undefined {
        const entry = this.data.get(key);
        if (entry && entry.expiresAt !== null && entry.expiresAt <= this.clock.now) {
            this.data.delete(key);
            return undefined;
        }
        return entry;
    }

    get(key: string): string | null {
        this.count("get");
        return this.live(key)?.value ?? null;
    }
    /** SET key value [EX seconds] [NX]. Like Redis, EX must be a positive whole number. */
    set(key: string, value: string, opts: { ex?: number; nx?: boolean } = {}): "OK" | null {
        this.count("set");
        if (opts.ex !== undefined && !Number.isInteger(opts.ex)) throw new Error("ERR value is not an integer or out of range");
        if (opts.ex !== undefined && opts.ex <= 0) throw new Error("ERR invalid expire time in 'set' command");
        if (opts.nx && this.live(key)) return null;
        this.data.set(key, { value: String(value), expiresAt: opts.ex === undefined ? null : this.clock.now + opts.ex * 1000 });
        return "OK";
    }
    del(...keys: string[]): number {
        this.count("del");
        let removed = 0;
        for (const key of keys) if (this.live(key) && this.data.delete(key)) removed++;
        return removed;
    }
    exists(key: string): 0 | 1 {
        this.count("exists");
        return this.live(key) ? 1 : 0;
    }
    expire(key: string, seconds: number): 0 | 1 {
        this.count("expire");
        const entry = this.live(key);
        if (!entry) return 0;
        if (!Number.isInteger(seconds)) throw new Error("ERR value is not an integer or out of range");
        if (seconds <= 0) {
            this.data.delete(key);
            return 1;
        }
        entry.expiresAt = this.clock.now + seconds * 1000;
        return 1;
    }
    /** -2 when the key is missing, -1 when it has no expiry, else the whole seconds left (rounded up). */
    ttl(key: string): number {
        this.count("ttl");
        const entry = this.live(key);
        if (!entry) return -2;
        if (entry.expiresAt === null) return -1;
        return Math.ceil((entry.expiresAt - this.clock.now) / 1000);
    }
}

/** PostgreSQL stand-in: the source of truth. `reads` counts findCourseById calls. */
class FakeDb {
    private rows = new Map<string, Course>();
    reads = 0;
    down = false;
    constructor(rows: Course[]) {
        for (const row of rows) this.rows.set(row.id, { ...row });
    }
    findCourseById(id: string): Course | null {
        this.reads++;
        if (this.down) throw new Error("db unavailable");
        const row = this.rows.get(id);
        return row ? { ...row } : null;
    }
    upsert(row: Course): void {
        this.rows.set(row.id, { ...row });
    }
    remove(id: string): void {
        this.rows.delete(id);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "db": Course[], "random": number[], "steps": Step[] }. random() returns the numbers in turn (cycling).
// Steps: get (prints the result or the error), advance (ms), ttl (prints TTL of course:<id>), dbUpsert,
// dbRemove, dbDown, dbUp, corrupt (an older deploy writes a raw value without TTL).
// Last line: database reads and the Redis GET and SET commands.
type Step =
    | { op: "get"; id: string }
    | { op: "advance"; ms: number }
    | { op: "ttl"; id: string }
    | { op: "dbUpsert"; course: Course }
    | { op: "dbRemove"; id: string }
    | { op: "dbDown" }
    | { op: "dbUp" }
    | { op: "corrupt"; id: string; value: string };

const input: { db: Course[]; random: number[]; steps: Step[] } = JSON.parse(readFileSync(0, "utf8"));
const clock = new FakeClock();
const redis = new FakeRedis(clock);
const db = new FakeDb(input.db);
let draw = 0;
const random = (): number => (input.random.length ? input.random[draw++ % input.random.length] : 0);
const deps: Deps = { redis, db, random };
const out: string[] = [];
for (const step of input.steps) {
    switch (step.op) {
        case "get":
            try {
                out.push(`get ${step.id} -> ${JSON.stringify(getCourse(step.id, deps))}`);
            } catch (error) {
                out.push(`get ${step.id} -> error: ${(error as Error).message}`);
            }
            break;
        case "advance":
            clock.advance(step.ms);
            break;
        case "ttl": {
            const before = redis.calls.ttl ?? 0;
            out.push(`ttl course:${step.id} = ${redis.ttl(`course:${step.id}`)}`);
            redis.calls.ttl = before;
            break;
        }
        case "dbUpsert":
            db.upsert(step.course);
            break;
        case "dbRemove":
            db.remove(step.id);
            break;
        case "dbDown":
            db.down = true;
            break;
        case "dbUp":
            db.down = false;
            break;
        case "corrupt": {
            const before = redis.calls.set ?? 0;
            redis.set(`course:${step.id}`, step.value);
            redis.calls.set = before;
            break;
        }
    }
}
out.push(`db reads ${db.reads}, redis get ${redis.calls.get ?? 0}, redis set ${redis.calls.set ?? 0}`);
console.log(out.join("\n"));
