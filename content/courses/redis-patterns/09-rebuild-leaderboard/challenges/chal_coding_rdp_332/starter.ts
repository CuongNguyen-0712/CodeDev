import { readFileSync } from "node:fs";

// Rebuild the CodeDev all-time leaderboard from the PostgreSQL event log.
// score_events (id bigserial, learner_id, points) is the source of truth: one row per graded pass, and a
// correction row with negative points when a pass is revoked. A live consumer applies every new row to Redis
// with applyEvent(redis, BOARD, SEEN, event) while the rebuild runs; deliveries are at least once.
//
//   lb:all           sorted set  member = learnerId, score = sum of points of the events applied to it
//   lb:seen          hash        field = event id (decimal string), value "1": the events lb:all contains
//   lb:all:rebuild   lb:seen:rebuild   the same pair while a rebuild builds them
//
// applyEvent(redis, boardKey, seenKey, event)
//   "invalid"    id is not a positive safe integer, learnerId not a non-empty string, or points not a safe
//                integer (negative and 0 are allowed). Nothing changes; the id is not marked as seen.
//   "duplicate"  the id is already a field of seenKey. Nothing changes.
//   "applied"    mark the id in seenKey and ZINCRBY boardKey by points.
//
// rebuild(redis, db)
//   1. Delete lb:all:rebuild and lb:seen:rebuild (a crashed rebuild may have left them).
//   2. watermark = db.maxEventId(). Read the events with id <= watermark in pages of at most PAGE_SIZE rows
//      (db.eventsAfter(afterId, limit), ordered by id) and apply them to the :rebuild keys.
//   3. Swap: RENAME lb:all:rebuild -> lb:all, then RENAME lb:seen:rebuild -> lb:seen, back to back (in
//      production both run inside one MULTI/EXEC). If the log had no events, DEL lb:all and lb:seen instead.
//   4. Catch-up: replay every event with id > watermark, page by page until a page comes back empty, through
//      applyEvent(redis, BOARD, SEEN, ...). Events the live consumer wrote to the old board were lost by the
//      swap and are applied again; events it already wrote to the new board are duplicates and skipped.
// Readers of lb:all must never see a half-built board, and the final board must equal every event applied once.
//
// Do not change the types, FakeClock, FakeRedis, FakeDb or the test runner.

type ScoreEvent = { id: number; learnerId: string; points: number };
type Applied = "applied" | "duplicate" | "invalid";

const BOARD = "lb:all";
const SEEN = "lb:seen";
const NEXT_BOARD = "lb:all:rebuild";
const NEXT_SEEN = "lb:seen:rebuild";
const PAGE_SIZE = 100;

function applyEvent(redis: FakeRedis, boardKey: string, seenKey: string, event: ScoreEvent): Applied {
    return "invalid";
}

function rebuild(redis: FakeRedis, db: FakeDb): void {
    // TODO: build lb:all:rebuild from the log, swap it in, then catch up
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
    private readonly data = new Map<string, Map<string, number> | Map<string, string>>();
    private readonly clock: FakeClock;

    constructor(clock: FakeClock) {
        this.clock = clock;
    }

    private count(command: string): void {
        this.calls[command] = (this.calls[command] ?? 0) + 1;
    }

    private zset(key: string): Map<string, number> {
        let set = this.data.get(key) as Map<string, number> | undefined;
        if (!set) {
            set = new Map();
            this.data.set(key, set);
        }
        return set;
    }

    exists(key: string): 0 | 1 {
        this.count("exists");
        return this.data.has(key) ? 1 : 0;
    }

    del(...keys: string[]): number {
        this.count("del");
        let removed = 0;
        for (const key of keys) if (this.data.delete(key)) removed++;
        return removed;
    }

    // Like Redis: the destination is overwritten; a missing source is an error.
    rename(source: string, destination: string): "OK" {
        this.count("rename");
        const value = this.data.get(source);
        if (!value) throw new Error("ERR no such key");
        this.data.delete(source);
        this.data.set(destination, value);
        return "OK";
    }

    // Returns 1 when the field is new, 0 when it already existed (the value is overwritten).
    hset(key: string, field: string, value: string): number {
        this.count("hset");
        let hash = this.data.get(key) as Map<string, string> | undefined;
        if (!hash) {
            hash = new Map();
            this.data.set(key, hash);
        }
        const added = hash.has(field) ? 0 : 1;
        hash.set(field, value);
        return added;
    }

    hget(key: string, field: string): string | null {
        this.count("hget");
        return (this.data.get(key) as Map<string, string> | undefined)?.get(field) ?? null;
    }

    hgetall(key: string): Record<string, string> {
        this.count("hgetall");
        return Object.fromEntries((this.data.get(key) as Map<string, string> | undefined) ?? []);
    }

    zadd(key: string, score: number, member: string): number {
        this.count("zadd");
        const set = this.zset(key);
        const added = set.has(member) ? 0 : 1;
        set.set(member, score);
        return added;
    }

    zincrby(key: string, by: number, member: string): number {
        this.count("zincrby");
        const set = this.zset(key);
        const score = (set.get(member) ?? 0) + by;
        set.set(member, score);
        return score;
    }

    zscore(key: string, member: string): number | null {
        this.count("zscore");
        return (this.data.get(key) as Map<string, number> | undefined)?.get(member) ?? null;
    }

    // Like Redis: negative indexes count from the end; ties are member DESC (byte order).
    zrevrange(key: string, start: number, stop: number): Array<{ member: string; score: number }> {
        this.count("zrevrange");
        const all = [...((this.data.get(key) as Map<string, number> | undefined) ?? [])]
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
        return (this.data.get(key) as Map<string, number> | undefined)?.size ?? 0;
    }

    // KEYS with a pattern of "*" or "<prefix>*" only.
    keys(pattern: string): string[] {
        this.count("keys");
        const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : null;
        return [...this.data.keys()].filter((k) => (prefix === null ? k === pattern : k.startsWith(prefix))).sort();
    }
}

// PostgreSQL stand-in: score_events ordered by id. beforeCall runs before every query (the runner uses it to
// commit and deliver live events while your rebuild is running).
class FakeDb {
    readonly calls: Record<string, number> = {};
    private readonly rows: ScoreEvent[] = [];
    private readonly beforeCall: () => void;

    constructor(rows: ScoreEvent[], beforeCall: () => void) {
        this.rows = rows.map((r) => ({ ...r })).sort((a, b) => a.id - b.id);
        this.beforeCall = beforeCall;
    }

    // SELECT coalesce(max(id), 0) FROM score_events
    maxEventId(): number {
        this.beforeCall();
        this.calls.maxEventId = (this.calls.maxEventId ?? 0) + 1;
        return this.rows.length ? this.rows[this.rows.length - 1].id : 0;
    }

    // SELECT id, learner_id, points FROM score_events WHERE id > $1 ORDER BY id LIMIT $2   (1 <= limit <= 100)
    eventsAfter(afterId: number, limit: number): ScoreEvent[] {
        this.beforeCall();
        this.calls.eventsAfter = (this.calls.eventsAfter ?? 0) + 1;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(`eventsAfter: limit must be 1..100, got ${limit}`);
        const out: ScoreEvent[] = [];
        for (const r of this.rows) {
            if (r.id > afterId) out.push({ ...r });
            if (out.length === limit) break;
        }
        return out;
    }

    has(id: number): boolean {
        return this.rows.some((r) => r.id === id);
    }

    // The runner commits a live event (ids only grow).
    insert(event: ScoreEvent): void {
        this.rows.push({ ...event });
    }

    all(): ScoreEvent[] {
        return this.rows.map((r) => ({ ...r }));
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "log": [id, learnerId, points][],            rows committed before the rebuild starts
//          "board"?: [learnerId, score][], "seen"?: id[],  lb:all and lb:seen before (default: built from the log)
//          "leftover"?: { "board"?: [learnerId, score][], "seen"?: id[] },   :rebuild keys of a crashed rebuild
//          "live"?: event[][], "summary"?: true }
// live[k] is delivered at the (k+1)-th "tick": a tick happens before every DB query and right before the swap
// (your first RENAME; nothing is delivered between two RENAMEs in a row). A valid live event with a new id is
// first committed to the log; then the live consumer calls applyEvent(redis, BOARD, SEEN, event). Batches left
// when rebuild returns are delivered afterwards. Before each tick a reader reads lb:all.
type Test = {
    log: [number, string, number][];
    board?: [string, number][];
    seen?: number[];
    leftover?: { board?: [string, number][]; seen?: number[] };
    live?: ScoreEvent[][];
    summary?: boolean;
};

const test: Test = JSON.parse(readFileSync(0, "utf8"));
const live = [...(test.live ?? [])];
const sumOf = (entries: Array<{ score: number }>): number => entries.reduce((s, e) => s + e.score, 0);
let readerProblem = "";
let floorCount = 0;
let floorSum = 0;

function tick(): void {
    const view = redis.zrevrange(BOARD, 0, -1);
    if (!readerProblem && (view.length < floorCount || sumOf(view) < floorSum)) {
        readerProblem = `saw a half-built board (${view.length} members, total ${sumOf(view)})`;
    }
    for (const e of live.shift() ?? []) {
        const valid = Number.isSafeInteger(e.id) && e.id > 0 && typeof e.learnerId === "string" && e.learnerId !== "" && Number.isSafeInteger(e.points);
        if (valid && !db.has(e.id)) db.insert(e);
        applyEvent(redis, BOARD, SEEN, e);
    }
}

class ObservedRedis extends FakeRedis {
    private lastRename = -1;
    rename(source: string, destination: string): "OK" {
        const total = (): number => Object.values(this.calls).reduce((s, n) => s + n, 0);
        if (total() !== this.lastRename) tick();
        const result = super.rename(source, destination);
        this.lastRename = total();
        return result;
    }
}

const redis = new ObservedRedis(new FakeClock());
const db = new FakeDb(test.log.map(([id, learnerId, points]) => ({ id, learnerId, points })), tick);
const before = new Map<string, number>();
if (test.board) for (const [id, score] of test.board) redis.zadd(BOARD, score, id);
for (const e of db.all()) before.set(e.learnerId, (before.get(e.learnerId) ?? 0) + e.points);
if (!test.board) for (const [id, score] of before) redis.zadd(BOARD, score, id);
for (const id of test.seen ?? db.all().map((e) => e.id)) redis.hset(SEEN, String(id), "1");
for (const [id, score] of test.leftover?.board ?? []) redis.zadd(NEXT_BOARD, score, id);
for (const id of test.leftover?.seen ?? []) redis.hset(NEXT_SEEN, String(id), "1");
const start = redis.zrevrange(BOARD, 0, -1);
floorCount = Math.min(start.length, before.size);
floorSum = Math.min(sumOf(start), [...before.values()].reduce((s, n) => s + n, 0));

rebuild(redis, db);
while (live.length) tick();

const expected = new Map<string, number>();
for (const e of db.all()) expected.set(e.learnerId, (expected.get(e.learnerId) ?? 0) + e.points);
const final = redis.zrevrange(BOARD, 0, -1);
const matches = final.length === expected.size && final.every((e) => expected.get(e.member) === e.score);
const shown = test.summary ? final.slice(0, 10) : final;
console.log(`board (${final.length} members): ${shown.map((e, i) => `${i + 1}. ${e.member} ${e.score}`).join(" | ") || "(empty)"}`);
console.log(`matches every event applied once: ${matches ? "yes" : "no"}`);
console.log(`seen: ${Object.keys(redis.hgetall(SEEN)).length} event ids; log: ${db.all().length} events`);
console.log(`keys: ${redis.keys("lb:*").join(", ") || "(none)"}`);
console.log(`readers: ${readerProblem || "never saw a half-built board"}`);
