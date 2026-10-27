import { readFileSync } from "node:fs";

// Incident: on Thursday Redis stopped answering for 9 minutes and every CodeDev API call failed, even though
// PostgreSQL was healthy. Course pages and session lookups both read through CatalogReader.get, which treats
// the cache as required: an error from Redis becomes an error for the learner, and a Redis that hangs holds
// the request until the client's 30 s timeout.
//
// Fix CatalogReader.get so that the cache is optional on the read path:
//   - ask Redis with a 50 ms timeout (withTimeout, CACHE_TIMEOUT_MS); a value is a hit, null is a miss
//   - a miss loads from PostgreSQL, then writes the value back to Redis without waiting for that write
//     (a failed write is ignored)
//   - a Redis error or timeout loads from PostgreSQL instead (no write-back)
//   - the circuit breaker: skip Redis while breaker.allowRequest() is false; record a success when Redis
//     answers (hit or miss) and a failure when it errors or times out
//   - single flight: concurrent loads of the same key share one PostgreSQL load; once it settles
//     (value or error) the next load of that key goes to PostgreSQL again
//   - an error from PostgreSQL (unknown key) is the request's error
// withTimeout and CircuitBreaker are existing helpers used elsewhere in the API: they are correct.
// Do not change the helpers, the fakes or the test runner.

interface Clock {
    now(): number;
    setTimeout(fn: () => void, ms: number): void;
}
interface Cache {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}
interface Store {
    load(key: string): Promise<string>;
}

const CACHE_TIMEOUT_MS = 50;

/** Rejects with "timeout after <ms> ms" when `work` has not settled after `ms` on the clock. */
function withTimeout<T>(work: Promise<T>, ms: number, clock: Clock): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let done = false;
        clock.setTimeout(() => {
            if (!done) {
                done = true;
                reject(new Error(`timeout after ${ms} ms`));
            }
        }, ms);
        work.then(
            (value) => {
                if (!done) {
                    done = true;
                    resolve(value);
                }
            },
            (err: unknown) => {
                if (!done) {
                    done = true;
                    reject(err);
                }
            },
        );
    });
}

/** Opens for `openMs` after `threshold` consecutive failures; after that, requests are allowed again. */
class CircuitBreaker {
    private clock: Clock;
    private threshold: number;
    private openMs: number;
    private failures = 0;
    private openUntil = 0;
    constructor(clock: Clock, threshold: number, openMs: number) {
        this.clock = clock;
        this.threshold = threshold;
        this.openMs = openMs;
    }
    allowRequest(): boolean {
        return this.clock.now() >= this.openUntil;
    }
    recordSuccess(): void {
        this.failures = 0;
    }
    recordFailure(): void {
        this.failures++;
        if (this.failures >= this.threshold) {
            this.openUntil = this.clock.now() + this.openMs;
            this.failures = 0;
        }
    }
}

class CatalogReader {
    private cache: Cache;
    private store: Store;
    private clock: Clock;
    private breaker: CircuitBreaker;

    constructor(cache: Cache, store: Store, clock: Clock) {
        this.cache = cache;
        this.store = store;
        this.clock = clock;
        this.breaker = new CircuitBreaker(clock, 3, 1000); // added last sprint, not wired in yet
    }

    async get(key: string): Promise<string> {
        const cached = await this.cache.get(key); // Redis sits in front of every catalog and session read
        if (cached !== null) return cached;
        const value = await this.store.load(key);
        await this.cache.set(key, value);
        return value;
    }
}

// ---------------------------------------------------------------- fakes and test runner (do not change)
// Input: { store, cache, events }. `store` is PostgreSQL (key -> value), `cache` the keys already in Redis.
// Events, in time order (ms on a fake clock):
//   { at, request: key, id }        a request calls reader.get(key)
//   { at, redis: "up" | "down" | "hang", flushed? }  Redis changes state; flushed: it came back empty
// Redis "up" answers get/set in 2 ms, "down" refuses in 1 ms ("ECONNREFUSED"), "hang" never answers before the
// client's own 30,000 ms timeout. PostgreSQL answers in 20 ms ("not found: <key>" for an unknown key).
// At the same ms, Redis state changes apply first, then due timers, then new requests.
// Output: each request's result and latency, PostgreSQL loads per key and the peak of concurrent loads.
type Mode = "up" | "down" | "hang";
type Event = { at: number; request?: string; id?: string; redis?: Mode; flushed?: boolean };
type Input = { store: Record<string, string>; cache: Record<string, string>; events: Event[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Input;
let now = 0;
let timerSeq = 0;
const timers: { at: number; seq: number; fn: () => void }[] = [];
const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => void timers.push({ at: now + Math.max(0, ms), seq: timerSeq++, fn }),
};
const after = <T>(ms: number, fn: () => T): Promise<T> =>
    new Promise<T>((resolve, reject) =>
        clock.setTimeout(() => {
            try {
                resolve(fn());
            } catch (err) {
                reject(err);
            }
        }, ms),
    );

let mode: Mode = "up";
const redisData = new Map<string, string>(Object.entries(input.cache ?? {}));
const redis: Cache = {
    get(key) {
        if (mode === "down") return after(1, () => { throw new Error("ECONNREFUSED redis:6379"); });
        if (mode === "hang") return after(30_000, () => { throw new Error("redis timeout after 30000 ms"); });
        return after(2, () => redisData.get(key) ?? null);
    },
    set(key, value) {
        if (mode === "down") return after(1, () => { throw new Error("ECONNREFUSED redis:6379"); });
        if (mode === "hang") return after(30_000, () => { throw new Error("redis timeout after 30000 ms"); });
        return after(2, () => void redisData.set(key, value));
    },
};

const loads = new Map<string, number>();
let running = 0;
let peak = 0;
const postgres: Store = {
    load(key) {
        loads.set(key, (loads.get(key) ?? 0) + 1);
        running++;
        peak = Math.max(peak, running);
        return after(20, () => {
            running--;
            if (!Object.prototype.hasOwnProperty.call(input.store, key)) throw new Error(`not found: ${key}`);
            return input.store[key];
        });
    },
};

const settle = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));

async function main(): Promise<void> {
    const reader = new CatalogReader(redis, postgres, clock);
    const events = [...input.events].sort((a, b) => a.at - b.at);
    const results: string[] = events.filter((e) => e.request !== undefined).map((e) => `${e.id} ${e.request}: no answer`);
    let open = results.length;
    let next = 0;
    let index = 0;
    const LIMIT = 120_000;
    for (;;) {
        const due = timers.length ? Math.min(...timers.map((t) => t.at)) : Infinity;
        const at = Math.min(due, next < events.length ? events[next].at : Infinity);
        if (at === Infinity || at > LIMIT || (open === 0 && next >= events.length)) break;
        now = at;
        while (next < events.length && events[next].at === now && events[next].redis !== undefined) {
            const e = events[next++];
            mode = e.redis as Mode;
            if (e.flushed) redisData.clear();
        }
        for (;;) {
            const ready = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
            if (!ready) break;
            timers.splice(timers.indexOf(ready), 1);
            ready.fn();
            await settle();
        }
        while (next < events.length && events[next].at === now) {
            const e = events[next++];
            if (e.request === undefined) {
                mode = e.redis as Mode;
                if (e.flushed) redisData.clear();
                continue;
            }
            const slot = index++;
            const started = now;
            const label = `${e.id} ${e.request}`;
            reader.get(e.request).then(
                (value) => { results[slot] = `${label}: ok "${value}" in ${now - started} ms`; open--; },
                (err: unknown) => { results[slot] = `${label}: error "${err instanceof Error ? err.message : String(err)}" after ${now - started} ms`; open--; },
            );
            await settle();
        }
    }
    console.log(JSON.stringify({
        requests: results,
        postgresLoads: Object.fromEntries([...loads].sort((a, b) => (a[0] < b[0] ? -1 : 1))),
        peakConcurrentLoads: peak,
    }, null, 2));
}
main();
