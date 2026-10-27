import { readFileSync } from "node:fs";

// CodeDev catalog: CatalogService of the NestJS API, as plain TypeScript.
// PostgreSQL (FakeDb) is the source of truth. Redis (FakeRedis) keeps copies for CACHE_TTL_SECONDS:
//   course:<id>                   one course, as JSON (the course page)
//   courses:category:<category>   the courses of one category, as a JSON array (the category page)
//
// Bug report: an admin lowered "Redis Patterns" from 249000 to 199000 VND. The course page and the
// category page kept showing 249000 for about an hour. A later edit was followed by a manual DEL of
// the key, yet a few seconds after it the course page showed the old price again: a catalog request
// that had loaded the row before the edit stored it in Redis after the edit.
//
// Fix the service with this protocol (the tests replay slow requests and check exactly this):
//   - updateCoursePrice writes PostgreSQL first; once the UPDATE has answered it invalidates
//     course:<id> and courses:category:<category of that course>. Invalidating a key means
//     INCR "<key>:ver", then DEL <key>. The update path never SETs a cached value.
//   - a cache fill (a miss in getCourse or listCategory) reads "<key>:ver" before it queries
//     PostgreSQL, and after the query answers it SETs the key (EX CACHE_TTL_SECONDS) only if
//     "<key>:ver" has not changed. Either way the request returns what it loaded.
//   - keep the validation: a price that is not a whole number >= 0, or an unknown course id,
//     returns false and changes nothing.
// Do not change the Course type, the constant or anything below the "do not change" line.

type Course = { id: string; title: string; category: string; priceVnd: number };

const CACHE_TTL_SECONDS = 3600;

class CatalogService {
    private redis: FakeRedis;
    private db: FakeDb;
    constructor(redis: FakeRedis, db: FakeDb) {
        this.redis = redis;
        this.db = db;
    }

    getCourse(id: string): Promise<Course | null> {
        return this.cached(`course:${id}`, () => this.db.findCourse(id));
    }

    listCategory(category: string): Promise<Course[]> {
        return this.cached(`courses:category:${category}`, () => this.db.listByCategory(category));
    }

    async updateCoursePrice(id: string, priceVnd: number): Promise<boolean> {
        if (!Number.isInteger(priceVnd) || priceVnd < 0) return false;
        const row = await this.db.updatePrice(id, priceVnd);
        return row !== null;
    }

    // Cache-aside: GET; on a miss, load from PostgreSQL and SET with a TTL.
    private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
        const hit = this.redis.get(key);
        if (hit !== null) return JSON.parse(hit) as T;
        const value = await load();
        this.redis.set(key, JSON.stringify(value), { ex: CACHE_TTL_SECONDS });
        return value;
    }
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
    /** INCR: a missing key counts as 0; the key keeps its TTL. */
    incr(key: string): number {
        return this.incrby(key, 1);
    }
    incrby(key: string, by: number): number {
        this.count("incrby");
        const entry = this.live(key);
        const current = entry ? Number(entry.value) : 0;
        if (!Number.isInteger(current)) throw new Error("ERR value is not an integer or out of range");
        const next = current + by;
        if (entry) entry.value = String(next);
        else this.data.set(key, { value: String(next), expiresAt: null });
        return next;
    }
}

/**
 * PostgreSQL stand-in: the source of truth. Every query answers asynchronously, like a real driver.
 * A query reads the committed rows when it is sent; an UPDATE commits when it answers.
 * The test runner can hold the answer of one actor's next query to replay a slow request.
 */
class FakeDb {
    private rows = new Map<string, Course>();
    actor = "";
    readsBy: Record<string, number> = {};
    private slow = new Set<string>();
    private held = new Map<string, () => void>();
    constructor(rows: Course[]) {
        for (const row of rows) this.rows.set(row.id, { ...row });
    }

    /** SELECT * FROM courses WHERE id = $1 */
    findCourse(id: string): Promise<Course | null> {
        this.readsBy[this.actor] = (this.readsBy[this.actor] ?? 0) + 1;
        const row = this.rows.get(id);
        const snapshot = row ? { ...row } : null;
        return this.answer(() => snapshot);
    }
    /** SELECT * FROM courses WHERE category = $1 ORDER BY id */
    listByCategory(category: string): Promise<Course[]> {
        this.readsBy[this.actor] = (this.readsBy[this.actor] ?? 0) + 1;
        const snapshot = [...this.rows.values()]
            .filter((row) => row.category === category)
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
            .map((row) => ({ ...row }));
        return this.answer(() => snapshot);
    }
    /** UPDATE courses SET price_vnd = $2 WHERE id = $1 RETURNING * (null when no row matched) */
    updatePrice(id: string, priceVnd: number): Promise<Course | null> {
        return this.answer(() => {
            const row = this.rows.get(id);
            if (!row) return null;
            row.priceVnd = priceVnd;
            return { ...row };
        });
    }

    hold(actor: string): void {
        this.slow.add(actor);
    }
    /** Drops a hold that was not used (the request answered from Redis without a query). */
    unhold(actor: string): void {
        this.slow.delete(actor);
    }
    release(actor: string): void {
        const resolve = this.held.get(actor);
        this.held.delete(actor);
        resolve?.();
    }
    private answer<T>(compute: () => T): Promise<T> {
        const actor = this.actor;
        if (!this.slow.has(actor)) return Promise.resolve(compute());
        this.slow.delete(actor);
        return new Promise<T>((resolve) => this.held.set(actor, () => resolve(compute())));
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "db": Course[], "steps": Step[] }. Each request runs as an "actor" (A, B, U...).
// { "as": "A", "getCourse": "c1" }, { "as": "B", "listCategory": "redis" },
// { "as": "U", "updateCoursePrice": "c1", "priceVnd": 199000 }: start a request; with "slow": true its
// next PostgreSQL query does not answer until { "resume": "A" }. { "advance": 600 } moves the clock (seconds).
// After each step: what the request returned, and whether it read PostgreSQL ("db") or only Redis ("cache").
type Step = {
    as?: string;
    getCourse?: string;
    listCategory?: string;
    updateCoursePrice?: string;
    priceVnd?: number;
    slow?: boolean;
    resume?: string;
    advance?: number;
};
type Running = { label: string; reads: number; done: boolean; text: string };

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function show(value: unknown): string {
    if (value === null) return "not found";
    if (typeof value === "boolean") return value ? "ok" : "rejected";
    if (Array.isArray(value)) return value.map((c: Course) => `${c.id} ${c.priceVnd}`).join(", ") || "(none)";
    const c = value as Course;
    return `${c.title} ${c.priceVnd}`;
}

async function main(): Promise<void> {
    const input: { db: Course[]; steps: Step[] } = JSON.parse(readFileSync(0, "utf8"));
    const clock = new FakeClock();
    const redis = new FakeRedis(clock);
    const db = new FakeDb(input.db);
    const service = new CatalogService(redis, db);
    const running = new Map<string, Running>();
    const out: string[] = [];

    const report = (actor: string): string => {
        const r = running.get(actor)!;
        if (!r.done) return `${r.label} -> waiting for PostgreSQL`;
        if (r.label.includes("updateCoursePrice")) return `${r.label} -> ${r.text}`;
        return `${r.label} -> ${r.text} (${(db.readsBy[actor] ?? 0) > r.reads ? "db" : "cache"})`;
    };

    for (const step of input.steps) {
        if (step.advance !== undefined) {
            clock.advance(step.advance * 1000);
            out.push(`+${step.advance}s`);
            continue;
        }
        if (step.resume !== undefined) {
            db.actor = step.resume;
            db.release(step.resume);
            await settle();
            out.push(`resume ${step.resume}: ${running.has(step.resume) ? report(step.resume) : "nothing to resume"}`);
            continue;
        }
        const actor = step.as ?? "A";
        db.actor = actor;
        if (step.slow) db.hold(actor);
        let label: string;
        let request: () => Promise<unknown>;
        if (step.getCourse !== undefined) {
            const id = step.getCourse;
            label = `${actor} getCourse ${id}`;
            request = () => service.getCourse(id);
        } else if (step.listCategory !== undefined) {
            const category = step.listCategory;
            label = `${actor} listCategory ${category}`;
            request = () => service.listCategory(category);
        } else {
            const id = step.updateCoursePrice ?? "";
            const price = step.priceVnd as number;
            label = `${actor} updateCoursePrice ${id} ${JSON.stringify(price)}`;
            request = () => service.updateCoursePrice(id, price);
        }
        const r: Running = { label, reads: db.readsBy[actor] ?? 0, done: false, text: "" };
        running.set(actor, r);
        Promise.resolve()
            .then(request)
            .then(
                (value) => {
                    r.text = show(value);
                    r.done = true;
                },
                (error: unknown) => {
                    r.text = `error: ${(error as Error).message}`;
                    r.done = true;
                },
            );
        await settle();
        db.unhold(actor);
        out.push(report(actor));
    }
    console.log(out.join("\n"));
}
main();
