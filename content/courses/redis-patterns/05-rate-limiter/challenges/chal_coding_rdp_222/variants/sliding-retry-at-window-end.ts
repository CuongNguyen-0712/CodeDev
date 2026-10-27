import { readFileSync } from "node:fs";


type Decision = { allowed: boolean; remaining: number; retryAfter: number };

function checkConfig(limit: number, windowSeconds: number): void {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
        throw new RangeError("limit and windowSeconds must be whole numbers >= 1");
    }
}

function fixedWindow(redis: FakeRedis, key: string, limit: number, windowSeconds: number): Decision {
    checkConfig(limit, windowSeconds);
    const k = `rl:fixed:${key}`;
    const count = redis.incr(k);
    if (redis.ttl(k) === -1) redis.expire(k, windowSeconds);
    if (count <= limit) return { allowed: true, remaining: limit - count, retryAfter: 0 };
    return { allowed: false, remaining: 0, retryAfter: redis.ttl(k) };
}

function slidingWindow(redis: FakeRedis, clock: FakeClock, key: string, limit: number, windowSeconds: number): Decision {
    checkConfig(limit, windowSeconds);
    const W = windowSeconds * 1000;
    const index = Math.floor(clock.now / W);
    const elapsed = clock.now - index * W;
    const currentKey = `rl:sliding:${key}:${index}`;
    const curr = Number(redis.get(currentKey) ?? 0);
    const prev = Number(redis.get(`rl:sliding:${key}:${index - 1}`) ?? 0);
    const weighted = prev * (W - elapsed) + curr * W;
    if (weighted + W <= limit * W) {
        if (redis.incr(currentKey) === 1) redis.expire(currentKey, 2 * windowSeconds);
        return { allowed: true, remaining: Math.floor((limit * W - weighted - W) / W), retryAfter: 0 };
    }
    const waitMs = W - elapsed;
    return { allowed: false, remaining: 0, retryAfter: Math.ceil(waitMs / 1000) };
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
    /** KEYS *: the keys that have not expired. */
    keys(): string[] {
        this.count("keys");
        return [...this.data.keys()].filter((key) => this.live(key) !== undefined).sort();
    }
}


// ---------------------------------------------------------------- test runner (do not change)
// Input: { "limit": 5, "windowSeconds": 60, "requests": [{ "at": 59500, "key": "ip:203.0.113.7" }, ...],
//          "seed"?: { "<key>": "<value>" }, "quiet"?: true }
// "at" is the fake clock in milliseconds (never decreasing). A request may override "limit" or "windowSeconds".
// Both limiters see the same requests, each with its own Redis. "seed" puts keys without a TTL into the
// fixed-window Redis first (left by a process that crashed). One line per request (or a summary per key with
// "quiet"), then the number of keys still in each Redis two windows after the last request.
type Request = { at: number; key: string; limit?: number; windowSeconds?: number };

function decide(limiter: () => Decision): string {
    try {
        const d = limiter();
        return d.allowed ? `allowed, ${d.remaining} left` : `denied, retry in ${d.retryAfter}s`;
    } catch (error) {
        return `error ${(error as Error).name}`;
    }
}

function main(): void {
    const input: { limit: number; windowSeconds: number; requests: Request[]; seed?: Record<string, string>; quiet?: boolean } =
        JSON.parse(readFileSync(0, "utf8"));
    const clock = new FakeClock();
    const fixedRedis = new FakeRedis(clock);
    const slidingRedis = new FakeRedis(clock);
    for (const [key, value] of Object.entries(input.seed ?? {})) fixedRedis.set(key, value);
    const out: string[] = [];
    const tally = new Map<string, number[]>();
    for (const r of input.requests) {
        clock.advance(r.at - clock.now);
        const limit = r.limit ?? input.limit;
        const windowSeconds = r.windowSeconds ?? input.windowSeconds;
        const fixed = decide(() => fixedWindow(fixedRedis, r.key, limit, windowSeconds));
        const sliding = decide(() => slidingWindow(slidingRedis, clock, r.key, limit, windowSeconds));
        if (input.quiet) {
            const t = tally.get(r.key) ?? [0, 0, 0, 0];
            t[fixed.startsWith("allowed") ? 0 : 1]++;
            t[sliding.startsWith("allowed") ? 2 : 3]++;
            tally.set(r.key, t);
        } else {
            out.push(`${(r.at / 1000).toFixed(3)}s ${r.key} | fixed: ${fixed} | sliding: ${sliding}`);
        }
    }
    for (const [key, t] of [...tally].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        out.push(`${key} | fixed: ${t[0]} allowed, ${t[1]} denied | sliding: ${t[2]} allowed, ${t[3]} denied`);
    }
    clock.advance(2 * input.windowSeconds * 1000);
    out.push(`two windows later: fixed ${fixedRedis.keys().length} keys, sliding ${slidingRedis.keys().length} keys`);
    console.log(out.join("\n"));
}
main();
