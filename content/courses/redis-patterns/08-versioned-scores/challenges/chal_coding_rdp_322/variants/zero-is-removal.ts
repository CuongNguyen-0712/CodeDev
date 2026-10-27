import { readFileSync } from "node:fs";

// CodeDev leaderboard consumer: applies score updates from PostgreSQL to the Redis board lb:all.
// After each graded submission, PostgreSQL recomputes the learner's total and bumps learner_score.version
// in the same transaction, and an outbox relay sends { learnerId, totalScore, version }. Two consumer workers
// read the outbox stream, the relay retries, so an update can arrive twice and an older one after a newer one.
// totalScore null means the learner left the board (show_on_leaderboard turned off, or the account deleted).
//
//   lb:all    sorted set   member = learnerId, score = totalScore
//   lb:ver    hash         field = learnerId, value = the last applied version as a decimal string
//
// applyUpdate(redis, update) returns:
//   "invalid"    learnerId is not a non-empty string, version is not a positive safe integer, or totalScore is
//                neither null nor a safe integer >= 0. Nothing changes.
//   "duplicate"  version equals the stored version (the same database row again; the payload is not compared).
//   "stale"      version is lower than the stored version. Nothing changes.
//   "applied"    version is higher, or the learner has no stored version (counts as 0): ZADD the total, or
//                ZREM the learner when totalScore is null, and store the version in lb:ver - also for a removal,
//                so an older update arriving later cannot bring the learner back.
// Versions are compared as numbers (lb:ver holds strings: "9" < "10").
// The result must not depend on arrival order: any order of the same updates ends with the same lb:all and lb:ver.
//
// Do not change the types, FakeClock, FakeRedis or the test runner.

type ScoreUpdate = { learnerId: string; totalScore: number | null; version: number };
type Outcome = "applied" | "duplicate" | "stale" | "invalid";

const BOARD = "lb:all";
const VERSIONS = "lb:ver";

function applyUpdate(redis: FakeRedis, update: ScoreUpdate): Outcome {
    const { learnerId, totalScore, version } = update;
    if (typeof learnerId !== "string" || learnerId === "") return "invalid";
    if (!Number.isSafeInteger(version) || version < 1) return "invalid";
    if (totalScore !== null && (!Number.isSafeInteger(totalScore) || totalScore < 0)) return "invalid";

    // In production these lines run as one Lua script (EVALSHA), so no other worker runs between them.
    const stored = Number(redis.hget(VERSIONS, learnerId) ?? "0");
    if (version === stored) return "duplicate";
    if (version < stored) return "stale";
    if (!totalScore) redis.zrem(BOARD, learnerId);
    else redis.zadd(BOARD, totalScore, learnerId);
    redis.hset(VERSIONS, learnerId, String(version));
    return "applied";
}

// ---------------------------------------------------------------- in-memory Redis model (do not change)
class FakeClock {
    now = 0;
    advance(ms: number): void {
        this.now += ms;
    }
}

class FakeRedis {
    readonly calls: Record<string, number> = {};
    private readonly zsets = new Map<string, Map<string, number>>();
    private readonly hashes = new Map<string, Map<string, string>>();
    private readonly clock: FakeClock;

    constructor(clock: FakeClock) {
        this.clock = clock;
    }

    private count(command: string): void {
        this.calls[command] = (this.calls[command] ?? 0) + 1;
    }

    hset(key: string, field: string, value: string): number {
        this.count("hset");
        let hash = this.hashes.get(key);
        if (!hash) {
            hash = new Map();
            this.hashes.set(key, hash);
        }
        const added = hash.has(field) ? 0 : 1;
        hash.set(field, value);
        return added;
    }

    hget(key: string, field: string): string | null {
        this.count("hget");
        return this.hashes.get(key)?.get(field) ?? null;
    }

    hgetall(key: string): Record<string, string> {
        this.count("hgetall");
        return Object.fromEntries(this.hashes.get(key) ?? []);
    }

    zadd(key: string, score: number, member: string): number {
        this.count("zadd");
        let set = this.zsets.get(key);
        if (!set) {
            set = new Map();
            this.zsets.set(key, set);
        }
        const added = set.has(member) ? 0 : 1;
        set.set(member, score);
        return added;
    }

    zincrby(key: string, by: number, member: string): number {
        this.count("zincrby");
        let set = this.zsets.get(key);
        if (!set) {
            set = new Map();
            this.zsets.set(key, set);
        }
        const score = (set.get(member) ?? 0) + by;
        set.set(member, score);
        return score;
    }

    // Like Redis: an empty sorted set is deleted.
    zrem(key: string, member: string): number {
        this.count("zrem");
        const set = this.zsets.get(key);
        if (!set || !set.delete(member)) return 0;
        if (set.size === 0) this.zsets.delete(key);
        return 1;
    }

    zscore(key: string, member: string): number | null {
        this.count("zscore");
        return this.zsets.get(key)?.get(member) ?? null;
    }

    // Like Redis: negative indexes count from the end; ties are member DESC (byte order).
    zrevrange(key: string, start: number, stop: number): Array<{ member: string; score: number }> {
        this.count("zrevrange");
        const all = [...(this.zsets.get(key) ?? [])]
            .map(([member, score]) => ({ member, score }))
            .sort((a, b) => b.score - a.score || (a.member < b.member ? 1 : a.member > b.member ? -1 : 0));
        const n = all.length;
        if (start < 0) start = Math.max(n + start, 0);
        if (stop < 0) stop = n + stop;
        if (stop >= n) stop = n - 1;
        if (start > stop) return [];
        return all.slice(start, stop + 1);
    }

    zcard(key: string): number {
        this.count("zcard");
        return this.zsets.get(key)?.size ?? 0;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "initial"?: { "board"?: [learnerId, score][], "versions"?: [learnerId, version][] },
//          "updates": ScoreUpdate[], "orders"?: number, "summary"?: true }
// Prints one line per update, then the board and the stored versions. With "orders": k it also replays the
// same updates in k other orders (from the same initial state) and says whether every order ends the same.
// With "summary": true the per-update lines are replaced by a count per outcome and the board by its top 10.
type Test = {
    initial?: { board?: [string, number][]; versions?: [string, number][] };
    updates: ScoreUpdate[];
    orders?: number;
    summary?: boolean;
};

const test: Test = JSON.parse(readFileSync(0, "utf8"));

function fresh(): FakeRedis {
    const redis = new FakeRedis(new FakeClock());
    for (const [id, score] of test.initial?.board ?? []) redis.zadd(BOARD, score, id);
    for (const [id, version] of test.initial?.versions ?? []) redis.hset(VERSIONS, id, String(version));
    return redis;
}

function state(redis: FakeRedis, limit: number): string {
    const board = redis.zrevrange(BOARD, 0, limit - 1).map((e, i) => `${i + 1}. ${e.member} ${e.score}`);
    const versions = Object.entries(redis.hgetall(VERSIONS))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([id, v]) => `${id}=${v}`);
    return `board (${redis.zcard(BOARD)}): ${board.join(" | ") || "(empty)"}\nversions: ${versions.join(" ") || "(none)"}`;
}

const redis = fresh();
const counts: Record<string, number> = {};
for (const u of test.updates) {
    const outcome = applyUpdate(redis, u);
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    if (!test.summary) console.log(`${JSON.stringify(u.learnerId)} v${JSON.stringify(u.version)} total ${JSON.stringify(u.totalScore)} -> ${outcome}`);
}
if (test.summary) console.log(Object.keys(counts).sort().map((k) => `${k}: ${counts[k]}`).join("; "));
const final = state(redis, Number.MAX_SAFE_INTEGER);
console.log(test.summary ? state(redis, 10) : final);

if (test.orders) {
    let seed = 20261026;
    const random = (): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
    let same = 0;
    for (let k = 0; k < test.orders; k++) {
        const order = [...test.updates];
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        const other = fresh();
        for (const u of order) applyUpdate(other, u);
        if (state(other, Number.MAX_SAFE_INTEGER) === final) same++;
    }
    console.log(`same final board and versions in ${same} of ${test.orders} other orders`);
}
