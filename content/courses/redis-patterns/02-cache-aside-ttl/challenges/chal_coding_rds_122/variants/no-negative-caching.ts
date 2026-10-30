import { readFileSync } from "node:fs";

// CodeDev course pages: cache-aside with a TTL.
//
// Every course page starts with getCourse(courseId). Today it runs
// SELECT id, title, lesson_count FROM courses WHERE id = $1 on every page view, and a bot that
// requests random course ids keeps PostgreSQL busy with queries that find nothing.
// Put Redis in front of the database with the cache-aside pattern:
//
//   - key: course:{courseId}, value: the course as a JSON string.
//   - GET the key first. A hit returns the cached course and does not read the database.
//   - A miss reads the database exactly once (db.findCourse) and stores the answer with SET ... EX:
//       a course that exists     -> cached for COURSE_TTL_SECONDS (300 s);
//       a course that is missing -> cached as "not found" for NOT_FOUND_TTL_SECONDS (30 s), so the
//                                   same unknown id does not reach the database again for 30 s.
//   - A hit never changes the key's TTL: a cached copy is never older than its TTL.
//   - When the database throws (it is down), let the error reach the caller and cache nothing:
//     an outage is not a "not found".
//
// Use only redis (the in-memory Redis below: get, set(key, value, { ex })...) and db.findCourse.
// The tests advance a fake clock; never read the real time.

const COURSE_TTL_SECONDS = 300;    // a cached course page is at most 5 minutes old
const NOT_FOUND_TTL_SECONDS = 30;  // "no such course" is remembered for 30 seconds

interface Course {
    id: number;
    title: string;
    lessonCount: number;
}

/** Returns the course, or null when no course has this id. */
function getCourse(courseId: number, redis: FakeRedis, db: CourseDb): Course | null {
    const key = `course:${courseId}`;
    const cached = redis.get(key);
    if (cached !== null) return JSON.parse(cached) as Course;
    const course = db.findCourse(courseId);
    if (course !== null) redis.set(key, JSON.stringify(course), { ex: COURSE_TTL_SECONDS });
    return course;
}

// ---------------------------------------------------------------- in-memory Redis (do not change)
// A small, deterministic stand-in for the Redis commands this course uses. Time comes from a FakeClock
// (milliseconds), so expiry is exact and tests never sleep. Semantics follow Redis: a key with an
// expiry is gone once clock.now() >= its deadline; TTL returns -2 for a missing key and -1 for a key
// without expiry; sorted sets order by score, then by member (ZREVRANGE / ZREVRANK reverse both).
class FakeClock {
    constructor(private ms: number = 0) {}
    now(): number { return this.ms; }
    advance(ms: number): void { this.ms += ms; }
}

type RedisValue =
    | { kind: "string"; value: string }
    | { kind: "hash"; value: Map<string, string> }
    | { kind: "zset"; value: Map<string, number> };

class FakeRedis {
    private data = new Map<string, RedisValue>();
    private deadlines = new Map<string, number>();
    /** Every command name in call order, e.g. ["GET", "SET"]; tests use it to count round trips. */
    readonly calls: string[] = [];

    constructor(readonly clock: FakeClock) {}

    private live(key: string): RedisValue | undefined {
        const deadline = this.deadlines.get(key);
        if (deadline !== undefined && this.clock.now() >= deadline) {
            this.data.delete(key);
            this.deadlines.delete(key);
        }
        return this.data.get(key);
    }
    private typed<K extends RedisValue["kind"]>(key: string, kind: K): Extract<RedisValue, { kind: K }> | undefined {
        const entry = this.live(key);
        if (entry && entry.kind !== kind) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
        return entry as Extract<RedisValue, { kind: K }> | undefined;
    }

    // keys
    exists(key: string): boolean { this.calls.push("EXISTS"); return this.live(key) !== undefined; }
    del(key: string): number {
        this.calls.push("DEL");
        const existed = this.live(key) !== undefined;
        this.data.delete(key);
        this.deadlines.delete(key);
        return existed ? 1 : 0;
    }
    expire(key: string, seconds: number): boolean {
        this.calls.push("EXPIRE");
        if (this.live(key) === undefined) return false;
        this.deadlines.set(key, this.clock.now() + seconds * 1000);
        return true;
    }
    ttl(key: string): number {
        this.calls.push("TTL");
        if (this.live(key) === undefined) return -2;
        const deadline = this.deadlines.get(key);
        return deadline === undefined ? -1 : Math.ceil((deadline - this.clock.now()) / 1000);
    }
    keys(prefix: string): string[] {
        this.calls.push("KEYS");
        return [...this.data.keys()].filter((k) => k.startsWith(prefix) && this.live(k) !== undefined).sort();
    }

    // strings
    get(key: string): string | null {
        this.calls.push("GET");
        return this.typed(key, "string")?.value ?? null;
    }
    /** SET key value [EX seconds] [NX]. Without ex, SET removes any previous expiry (like Redis). Returns false when NX blocks it. */
    set(key: string, value: string, options: { ex?: number; nx?: boolean } = {}): boolean {
        this.calls.push("SET");
        if (options.nx && this.live(key) !== undefined) return false;
        this.data.set(key, { kind: "string", value });
        if (options.ex !== undefined) this.deadlines.set(key, this.clock.now() + options.ex * 1000);
        else this.deadlines.delete(key);
        return true;
    }
    /** INCRBY; a missing key counts from 0 and keeps no expiry. */
    incr(key: string, by: number = 1): number {
        this.calls.push("INCR");
        const entry = this.typed(key, "string");
        const next = (entry ? Number(entry.value) : 0) + by;
        if (entry) entry.value = String(next);
        else this.data.set(key, { kind: "string", value: String(next) });
        return next;
    }

    // hashes
    hset(key: string, fields: Record<string, string>): number {
        this.calls.push("HSET");
        let entry = this.typed(key, "hash");
        if (!entry) { entry = { kind: "hash", value: new Map() }; this.data.set(key, entry); }
        let added = 0;
        for (const [field, value] of Object.entries(fields)) {
            if (!entry.value.has(field)) added++;
            entry.value.set(field, value);
        }
        return added;
    }
    hget(key: string, field: string): string | null {
        this.calls.push("HGET");
        return this.typed(key, "hash")?.value.get(field) ?? null;
    }
    hgetall(key: string): Record<string, string> {
        this.calls.push("HGETALL");
        return Object.fromEntries(this.typed(key, "hash")?.value ?? []);
    }
    hdel(key: string, field: string): number {
        this.calls.push("HDEL");
        const entry = this.typed(key, "hash");
        if (!entry || !entry.value.delete(field)) return 0;
        if (entry.value.size === 0) { this.data.delete(key); this.deadlines.delete(key); }
        return 1;
    }

    // sorted sets
    zadd(key: string, score: number, member: string): number {
        this.calls.push("ZADD");
        let entry = this.typed(key, "zset");
        if (!entry) { entry = { kind: "zset", value: new Map() }; this.data.set(key, entry); }
        const added = entry.value.has(member) ? 0 : 1;
        entry.value.set(member, score);
        return added;
    }
    zincrby(key: string, by: number, member: string): number {
        this.calls.push("ZINCRBY");
        let entry = this.typed(key, "zset");
        if (!entry) { entry = { kind: "zset", value: new Map() }; this.data.set(key, entry); }
        const next = (entry.value.get(member) ?? 0) + by;
        entry.value.set(member, next);
        return next;
    }
    zscore(key: string, member: string): number | null {
        this.calls.push("ZSCORE");
        return this.typed(key, "zset")?.value.get(member) ?? null;
    }
    zrem(key: string, member: string): number {
        this.calls.push("ZREM");
        const entry = this.typed(key, "zset");
        if (!entry || !entry.value.delete(member)) return 0;
        if (entry.value.size === 0) { this.data.delete(key); this.deadlines.delete(key); }
        return 1;
    }
    zcard(key: string): number {
        this.calls.push("ZCARD");
        return this.typed(key, "zset")?.value.size ?? 0;
    }
    private descending(key: string): { member: string; score: number }[] {
        const entries = [...(this.typed(key, "zset")?.value ?? [])].map(([member, score]) => ({ member, score }));
        return entries.sort((a, b) => b.score - a.score || (a.member < b.member ? 1 : a.member > b.member ? -1 : 0));
    }
    /** ZREVRANGE key start stop WITHSCORES: highest score first, inclusive indexes, negative counts from the end. */
    zrevrange(key: string, start: number, stop: number): { member: string; score: number }[] {
        this.calls.push("ZREVRANGE");
        const all = this.descending(key);
        const from = start < 0 ? Math.max(all.length + start, 0) : start;
        const to = stop < 0 ? all.length + stop : stop;
        return all.slice(from, to + 1);
    }
    /** ZREVRANK: 0 for the highest score, null when the member is not in the set. */
    zrevrank(key: string, member: string): number | null {
        this.calls.push("ZREVRANK");
        const index = this.descending(key).findIndex((e) => e.member === member);
        return index === -1 ? null : index;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
/** The courses table, faked: findCourse is SELECT ... WHERE id = $1 and counts every read. */
class CourseDb {
    private rows = new Map<number, Course>();
    reads = 0;
    down = false;

    constructor(courses: Course[]) {
        for (const course of courses) this.rows.set(course.id, { ...course });
    }
    findCourse(courseId: number): Course | null {
        this.reads++;
        if (this.down) throw new Error("db unavailable");
        const row = this.rows.get(courseId);
        return row ? { ...row } : null;
    }
    /** Another part of the platform writes the row (no cache involved). */
    put(course: Course): void {
        this.rows.set(course.id, { ...course });
    }
}

type Step =
    | { op: "get"; courseId: number }
    | { op: "ttl"; courseId: number }
    | { op: "advance"; ms: number }
    | { op: "put"; course: Course }
    | { op: "dbDown" }
    | { op: "dbUp" };

const input: { courses: Course[]; ops: Step[] } = JSON.parse(readFileSync(0, "utf8"));
const clock = new FakeClock();
const redis = new FakeRedis(clock);
const db = new CourseDb(input.courses);
const outcomes: unknown[] = [];

for (const step of input.ops) {
    switch (step.op) {
        case "get": {
            const before = db.reads;
            try {
                const course = getCourse(step.courseId, redis, db);
                outcomes.push({ title: course === null ? null : course.title, db: db.reads - before });
            } catch (error) {
                outcomes.push({ error: error instanceof Error ? error.message : String(error), db: db.reads - before });
            }
            break;
        }
        case "ttl":
            outcomes.push({ ttl: redis.ttl(`course:${step.courseId}`) });
            break;
        case "advance":
            clock.advance(step.ms);
            break;
        case "put":
            db.put(step.course);
            break;
        case "dbDown":
            db.down = true;
            break;
        case "dbUp":
            db.down = false;
            break;
    }
}
console.log(JSON.stringify(outcomes));
