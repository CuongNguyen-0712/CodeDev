import { readFileSync } from "node:fs";
// Known wrong answer: the processed-id marker never expires, so Redis keeps one key per event forever.

// Cache Drift & Duplicate Events. Learners watch their score on the CodeDev leaderboard go
// backwards: u_2041 had 1310 points at 10:00:03 and 1240 at 10:00:05, while PostgreSQL still says
// 1310 (learner_score.version 18). The queue delivers score.updated events at least once and in any
// order: a consumer restart redelivers every message that was not acknowledged yet, and two
// consumers share the queue. This consumer writes the total of every delivered event with ZADD,
// so whichever delivery arrives last wins.
//
// Fix ScoreConsumer.handle (the challenge description has the exact rules). Do not change the
// message parsing, the Redis model or the test runner.

type Outcome = "applied" | "duplicate" | "stale" | "invalid";

const LEADERBOARD = "lb:global";
const VERSIONS = "lb:version"; // hash: userId -> version of the last applied event
const SEEN_PREFIX = "lb:seen:"; // lb:seen:<eventId> exists once the event was processed
// The queue redelivers an unacknowledged message for up to 24 hours: keep the marker twice as long.
const SEEN_TTL_SECONDS = 48 * 60 * 60;

class ScoreConsumer {
    redis: FakeRedis;

    constructor(redis: FakeRedis) {
        this.redis = redis;
    }

    // Called once per delivery of a score.updated message, before the message is acknowledged.
    handle(raw: unknown): Outcome {
        const event = parseEvent(raw);
        if (event === null) return "invalid";
        const seenKey = SEEN_PREFIX + event.eventId;
        if (this.redis.exists(seenKey) === 1) return "duplicate";

        const stored = this.redis.hget(VERSIONS, event.userId);
        const isNewer = stored === null || event.version > Number(stored);
        if (isNewer) {
            // A newer version may carry a lower total (a correction): it is still applied.
            this.redis.zadd(LEADERBOARD, event.total, event.userId);
            this.redis.hset(VERSIONS, event.userId, String(event.version));
        }
        // In production these commands run as one Lua script, so a crash cannot split them.
        this.redis.set(seenKey, "1");
        return isNewer ? "applied" : "stale";
    }
}

// ------------------------------------------------------------ Redis model (do not change)
// In-memory model of the Redis commands used in this course. Values are strings, like in Redis.
// Expiry is lazy: a key whose expiry time is <= clock.now behaves as missing.
class FakeClock {
    now = 0; // milliseconds
    advance(ms: number): void {
        this.now += ms;
    }
}

type Entry =
    | { type: "string"; value: string; expiresAt: number | null }
    | { type: "hash"; value: Map<string, string>; expiresAt: number | null }
    | { type: "zset"; value: Map<string, number>; expiresAt: number | null };

const WRONGTYPE = "WRONGTYPE Operation against a key holding the wrong kind of value";

class FakeRedis {
    calls: Record<string, number> = {};
    clock: FakeClock;
    data = new Map<string, Entry>();

    constructor(clock: FakeClock) {
        this.clock = clock;
    }

    count(command: string): void {
        this.calls[command] = (this.calls[command] ?? 0) + 1;
    }

    entry(key: string): Entry | undefined {
        const e = this.data.get(key);
        if (e !== undefined && e.expiresAt !== null && e.expiresAt <= this.clock.now) {
            this.data.delete(key);
            return undefined;
        }
        return e;
    }

    hash(key: string, create: boolean): Map<string, string> | undefined {
        const e = this.entry(key);
        if (e === undefined) {
            if (!create) return undefined;
            const value = new Map<string, string>();
            this.data.set(key, { type: "hash", value, expiresAt: null });
            return value;
        }
        if (e.type !== "hash") throw new Error(WRONGTYPE);
        return e.value;
    }

    zset(key: string, create: boolean): Map<string, number> | undefined {
        const e = this.entry(key);
        if (e === undefined) {
            if (!create) return undefined;
            const value = new Map<string, number>();
            this.data.set(key, { type: "zset", value, expiresAt: null });
            return value;
        }
        if (e.type !== "zset") throw new Error(WRONGTYPE);
        return e.value;
    }

    get(key: string): string | null {
        this.count("get");
        const e = this.entry(key);
        if (e === undefined) return null;
        if (e.type !== "string") throw new Error(WRONGTYPE);
        return e.value;
    }

    // SET key value [EX seconds] [NX]: with nx, only when the key does not exist (returns null otherwise).
    set(key: string, value: string, opts: { ex?: number; nx?: boolean } = {}): "OK" | null {
        this.count("set");
        if (opts.ex !== undefined && (!Number.isInteger(opts.ex) || opts.ex <= 0)) {
            throw new Error("ERR invalid expire time in 'set' command");
        }
        if (opts.nx && this.entry(key) !== undefined) return null;
        const expiresAt = opts.ex === undefined ? null : this.clock.now + opts.ex * 1000;
        this.data.set(key, { type: "string", value: String(value), expiresAt });
        return "OK";
    }

    del(...keys: string[]): number {
        this.count("del");
        let removed = 0;
        for (const key of keys) {
            if (this.entry(key) !== undefined) {
                this.data.delete(key);
                removed++;
            }
        }
        return removed;
    }

    exists(key: string): 0 | 1 {
        this.count("exists");
        return this.entry(key) === undefined ? 0 : 1;
    }

    expire(key: string, seconds: number): 0 | 1 {
        this.count("expire");
        const e = this.entry(key);
        if (e === undefined) return 0;
        e.expiresAt = this.clock.now + seconds * 1000;
        return 1;
    }

    // -2 when the key is missing, -1 when it has no expiry, else whole seconds left (rounded up).
    ttl(key: string): number {
        this.count("ttl");
        const e = this.entry(key);
        if (e === undefined) return -2;
        if (e.expiresAt === null) return -1;
        return Math.ceil((e.expiresAt - this.clock.now) / 1000);
    }

    hset(key: string, field: string, value: string): number {
        this.count("hset");
        const h = this.hash(key, true)!;
        const added = h.has(field) ? 0 : 1;
        h.set(field, String(value));
        return added;
    }

    hget(key: string, field: string): string | null {
        this.count("hget");
        return this.hash(key, false)?.get(field) ?? null;
    }

    hgetall(key: string): Record<string, string> {
        this.count("hgetall");
        return Object.fromEntries(this.hash(key, false) ?? []);
    }

    // ZADD key score member: sets the score (last write wins), returns 1 when the member is new.
    zadd(key: string, score: number, member: string): number {
        this.count("zadd");
        if (!Number.isFinite(score)) throw new Error("ERR value is not a valid float");
        const z = this.zset(key, true)!;
        const added = z.has(member) ? 0 : 1;
        z.set(member, score);
        return added;
    }

    zscore(key: string, member: string): number | null {
        this.count("zscore");
        return this.zset(key, false)?.get(member) ?? null;
    }

    // Highest score first; equal scores by member in descending byte order, like Redis.
    zrevrange(key: string, start: number, stop: number): Array<{ member: string; score: number }> {
        this.count("zrevrange");
        const z = this.zset(key, false);
        if (z === undefined) return [];
        const sorted = [...z].map(([member, score]) => ({ member, score }))
            .sort((a, b) => b.score - a.score || (a.member < b.member ? 1 : a.member > b.member ? -1 : 0));
        const from = start < 0 ? Math.max(sorted.length + start, 0) : start;
        const to = stop < 0 ? sorted.length + stop : Math.min(stop, sorted.length - 1);
        return from > to ? [] : sorted.slice(from, to + 1);
    }

    zcard(key: string): number {
        this.count("zcard");
        return this.zset(key, false)?.size ?? 0;
    }

    // Test runner only. In production you would use SCAN with MATCH, never KEYS.
    countKeys(prefix: string): number {
        let n = 0;
        for (const key of [...this.data.keys()]) if (key.startsWith(prefix) && this.entry(key) !== undefined) n++;
        return n;
    }
}

// ------------------------------------------------------------ message parsing (do not change)
// A score.updated message as the outbox publishes it. version is learner_score.version in
// PostgreSQL: it starts at 1 and grows by 1 on every change of that learner's total.
type ScoreEvent = { eventId: string; userId: string; total: number; version: number };

// Returns null for a message that is not a valid score.updated event.
function parseEvent(raw: unknown): ScoreEvent | null {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const m = raw as Record<string, unknown>;
    const { eventId, userId, total, version } = m;
    if (typeof eventId !== "string" || eventId === "" || typeof userId !== "string" || userId === "") return null;
    if (typeof total !== "number" || !Number.isInteger(total) || total < 0) return null;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return null;
    return { eventId, userId, total, version };
}

// ------------------------------------------------------------ test runner (do not change)
// Input: { "trace": boolean, "steps": [...] }. A step is { "deliver": <message> }, { "restart": true }
// (a new ScoreConsumer on the same Redis) or { "advanceSeconds": n } (moves the fake clock).
type Step = { deliver?: unknown; restart?: boolean; advanceSeconds?: number };

const input = JSON.parse(readFileSync(0, "utf8")) as { trace?: boolean; steps: Step[] };
const BOARD = "lb:global";
const clock = new FakeClock();
const redis = new FakeRedis(clock);
let consumer = new ScoreConsumer(redis);
const counts: Record<string, number> = { applied: 0, duplicate: 0, stale: 0, invalid: 0 };
// What PostgreSQL holds: the total of each learner's highest version delivered so far.
const truth = new Map<string, { version: number; total: number }>();
const log = (line: string): void => {
    if (input.trace) console.log(line);
};

input.steps.forEach((step, i) => {
    const n = i + 1;
    if (step.restart === true) {
        consumer = new ScoreConsumer(redis);
        log(`${n} restart: new consumer, same Redis`);
        return;
    }
    if (typeof step.advanceSeconds === "number") {
        clock.advance(step.advanceSeconds * 1000);
        log(`${n} clock +${step.advanceSeconds}s`);
        return;
    }
    const event = parseEvent(step.deliver);
    const outcome: string = consumer.handle(step.deliver);
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    if (event === null) {
        log(`${n} ${JSON.stringify(step.deliver) ?? "nothing"} -> ${outcome}`);
        return;
    }
    const known = truth.get(event.userId);
    if (known === undefined || event.version > known.version) {
        truth.set(event.userId, { version: event.version, total: event.total });
    }
    const now = redis.zscore(BOARD, event.userId);
    log(`${n} ${event.eventId} ${event.userId} v${event.version} total=${event.total} -> ${outcome}, ZSCORE ${now}`);
});

console.log(Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", "));
const top = redis.zrevrange(BOARD, 0, 9).map((e) => `${e.member} ${e.score}`);
console.log(`top: ${top.length ? top.join(", ") : "(empty)"}`);
const drift = [...truth]
    .filter(([userId, row]) => redis.zscore(BOARD, userId) !== row.total)
    .map(([userId, row]) => `${userId} redis=${redis.zscore(BOARD, userId)} db=${row.total}`);
console.log(`drift vs PostgreSQL: ${drift.length ? `${drift.length} (${drift.slice(0, 5).join(", ")})` : "none"}`);
console.log(`seen markers: ${redis.countKeys("lb:seen:")}`);
