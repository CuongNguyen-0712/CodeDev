import { readFileSync } from "node:fs";

// CodeDev login protection: POST /auth/login is limited per key ("ip:<address>" or "user:<id>").
// A brute-force burst at a window boundary got 9 password guesses through a "5 per minute" limit,
// so the API team wants two limiters on Redis with the same contract:
//   { allowed, remaining, retryAfter }   retryAfter in whole seconds (0 when allowed), remaining 0 when denied.
// Both throw a RangeError when limit or windowSeconds is not a whole number >= 1.
//
// fixedWindow(redis, key, limit, windowSeconds) - one counter, "rl:fixed:<key>":
//   count = INCR. If the key has no expiry after the INCR (ttl -1: a new key, or one left without a TTL
//   by a process that crashed between INCR and EXPIRE), EXPIRE it for windowSeconds. Never EXPIRE a key
//   that already has a TTL. Allowed when count <= limit, remaining = limit - count. Denied requests are
//   counted too; their retryAfter is the TTL of the key.
//
// slidingWindow(redis, clock, key, limit, windowSeconds) - approximate sliding window from two fixed
// windows aligned to the clock, in integer milliseconds:
//   W = windowSeconds * 1000, index = Math.floor(clock.now / W), elapsed = clock.now - index * W
//   curr = value of "rl:sliding:<key>:<index>", prev = value of "rl:sliding:<key>:<index - 1>" (missing = 0)
//   weighted = prev * (W - elapsed) + curr * W        (the estimated number of requests, times W)
//   Allowed when weighted + W <= limit * W: INCR the current key (EXPIRE it for 2 * windowSeconds when
//     the INCR returns 1), remaining = Math.floor((limit * W - weighted - W) / W).
//   Denied: write nothing; retryAfter = Math.ceil(waitMs / 1000), where waitMs is the time until the
//     same request would be allowed:
//     if curr + 1 <= limit:  waitMs = W - Math.floor((limit - curr - 1) * W / prev) - elapsed
//     otherwise:             waitMs = (W - elapsed) + (W - Math.floor((limit - 1) * W / curr))
// Do not change the Decision type or anything below the "do not change" line.

type Decision = { allowed: boolean; remaining: number; retryAfter: number };

function fixedWindow(redis: FakeRedis, key: string, limit: number, windowSeconds: number): Decision {
    // TODO
    return { allowed: true, remaining: limit, retryAfter: 0 };
}

function slidingWindow(redis: FakeRedis, clock: FakeClock, key: string, limit: number, windowSeconds: number): Decision {
    // TODO
    return { allowed: true, remaining: limit, retryAfter: 0 };
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
