import { readFileSync } from "node:fs";

// CodeDev leaderboard service (GET /leaderboard?board=all|week, GET /leaderboard/me).
// PostgreSQL keeps every score event; Redis sorted sets serve the boards. Member = learnerId, score = points.
//
//   lb:all                         all-time board, never expires
//   lb:week:<isoYear>-W<ww>        weekly board of the ISO week (Monday 00:00 UTC to Sunday 23:59:59.999 UTC)
//                                  of the event time, for example lb:week:2026-W44; ww has two digits
//
// weekKey(ts)       the weekly key for a timestamp in milliseconds (UTC). The ISO year is the year of the
//                   Thursday of that week: 2027-01-01 is in lb:week:2026-W53, 2024-12-30 in lb:week:2025-W01.
// recordScore(redis, event, now)
//                   valid event: learnerId is a non-empty string, points an integer from 1 to 10000,
//                   ts an integer >= 0 (ms). Otherwise return false and change nothing.
//                   ZINCRBY lb:all. Then the weekly board of ts: it is kept until 7 days after its week ends
//                   (retention end = Monday 00:00 UTC of the next week + 7 days). If the retention end is
//                   <= now, skip the weekly board (a late event must not bring an expired week back);
//                   otherwise ZINCRBY it and EXPIRE it to Math.ceil((retention end - now) / 1000) seconds.
//                   Return true.
// topN(redis, key, n)
//                   the first n entries in Redis order with ordinal ranks 1, 2, 3...; [] when n < 1 or the
//                   board is missing.
// rankOf(redis, key, learnerId)
//                   null when the learner is not on the board; otherwise their rank, score and "around":
//                   the entries from two ranks above to two ranks below them (fewer at the top or bottom),
//                   themselves included.
// Ranks are ordinal and follow Redis order: higher score first; equal scores keep ZREVRANGE order (the
// learner id that is greater in byte order comes first). Two learners never share a rank.
//
// Do not change the types, FakeClock, FakeRedis or the test runner.

type ScoreEvent = { learnerId: string; points: number; ts: number };
type Entry = { rank: number; learnerId: string; score: number };
type RankResult = { rank: number; score: number; around: Entry[] } | null;

const ALL_TIME = "lb:all";
const DAY_MS = 86_400_000;

function weekStart(ts: number): number {
    const day = Math.floor(ts / DAY_MS) * DAY_MS;
    const mondayOffset = (new Date(day).getUTCDay() + 6) % 7; // Monday 0 ... Sunday 6
    return day - mondayOffset * DAY_MS;
}

function weekKey(ts: number): string {
    const thursday = new Date(weekStart(ts) + 3 * DAY_MS);
    const isoYear = thursday.getUTCFullYear();
    const week = 1 + Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / (7 * DAY_MS));
    return `lb:week:${isoYear}-W${String(week).padStart(2, "0")}`;
}

function recordScore(redis: FakeRedis, event: ScoreEvent, now: number): boolean {
    const { learnerId, points, ts } = event;
    if (typeof learnerId !== "string" || learnerId === "") return false;
    if (!Number.isInteger(points) || points < 1 || points > 10000) return false;
    if (!Number.isInteger(ts) || ts < 0) return false;

    redis.zincrby(ALL_TIME, points, learnerId);
    const retentionEnd = weekStart(ts) + 14 * DAY_MS;
    if (retentionEnd <= now) return true;
    const key = weekKey(ts);
    redis.zincrby(key, points, learnerId);
    redis.expire(key, Math.ceil((retentionEnd - now) / 1000));
    return true;
}

function topN(redis: FakeRedis, key: string, n: number): Entry[] {
    return redis.zrevrange(key, 0, n - 1).map((e, i) => ({ rank: i + 1, learnerId: e.member, score: e.score }));
}

function rankOf(redis: FakeRedis, key: string, learnerId: string): RankResult {
    const index = redis.zrevrank(key, learnerId);
    if (index === null) return null;
    const start = Math.max(0, index - 2);
    const around = redis.zrevrange(key, start, index + 2).map((e, i) => ({ rank: start + i + 1, learnerId: e.member, score: e.score }));
    return { rank: index + 1, score: around[index - start].score, around };
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
    private readonly expiresAt = new Map<string, number>();
    private readonly clock: FakeClock;

    constructor(clock: FakeClock) {
        this.clock = clock;
    }

    private count(command: string): void {
        this.calls[command] = (this.calls[command] ?? 0) + 1;
    }

    // Lazy expiry: a key whose expiry time is <= clock.now behaves as missing.
    private zset(key: string, create: boolean): Map<string, number> | undefined {
        const at = this.expiresAt.get(key);
        if (at !== undefined && at <= this.clock.now) {
            this.zsets.delete(key);
            this.expiresAt.delete(key);
        }
        let set = this.zsets.get(key);
        if (!set && create) {
            set = new Map();
            this.zsets.set(key, set);
        }
        return set;
    }

    private sorted(key: string): Array<{ member: string; score: number }> {
        const set = this.zset(key, false);
        if (!set) return [];
        return [...set]
            .map(([member, score]) => ({ member, score }))
            .sort((a, b) => b.score - a.score || (a.member < b.member ? 1 : a.member > b.member ? -1 : 0));
    }

    expire(key: string, seconds: number): 0 | 1 {
        this.count("expire");
        if (!this.zset(key, false)) return 0;
        if (seconds <= 0) {
            this.zsets.delete(key);
            this.expiresAt.delete(key);
        } else {
            this.expiresAt.set(key, this.clock.now + seconds * 1000);
        }
        return 1;
    }

    ttl(key: string): number {
        this.count("ttl");
        if (!this.zset(key, false)) return -2;
        const at = this.expiresAt.get(key);
        return at === undefined ? -1 : Math.ceil((at - this.clock.now) / 1000);
    }

    zincrby(key: string, by: number, member: string): number {
        this.count("zincrby");
        const set = this.zset(key, true)!;
        const score = (set.get(member) ?? 0) + by;
        set.set(member, score);
        return score;
    }

    zscore(key: string, member: string): number | null {
        this.count("zscore");
        return this.zset(key, false)?.get(member) ?? null;
    }

    // Like Redis: negative indexes count from the end (-1 is the last entry); ties are member DESC.
    zrevrange(key: string, start: number, stop: number): Array<{ member: string; score: number }> {
        this.count("zrevrange");
        const all = this.sorted(key);
        const n = all.length;
        if (start < 0) start = Math.max(n + start, 0);
        if (stop < 0) stop = n + stop;
        if (stop >= n) stop = n - 1;
        if (start > stop) return [];
        return all.slice(start, stop + 1);
    }

    zrevrank(key: string, member: string): number | null {
        this.count("zrevrank");
        const index = this.sorted(key).findIndex((e) => e.member === member);
        return index === -1 ? null : index;
    }

    zcard(key: string): number {
        this.count("zcard");
        return this.zset(key, false)?.size ?? 0;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "ops": Op[], "summary"?: true }. Times are ISO strings; the runner turns them into milliseconds.
//   { "op": "clock", "at": iso }                                 the clock moves to "at" (now)
//   { "op": "score", "learnerId", "points", "at": iso }          recordScore with ts = Date.parse(at)
//   { "op": "top", "board": "all" | iso, "n" }                   "all" = lb:all, iso = weekKey(Date.parse(iso))
//   { "op": "rank", "board": "all" | iso, "learnerId" }
//   { "op": "ttl", "board": iso }
// Prints one line per op except clock. With "summary": true, score lines are replaced by one count line.
type Op = { op: string; at?: unknown; learnerId?: unknown; points?: unknown; board?: string; n?: number };

const clock = new FakeClock();
const redis = new FakeRedis(clock);
const test: { ops: Op[]; summary?: boolean } = JSON.parse(readFileSync(0, "utf8"));
const toMs = (v: unknown): number => (typeof v === "string" ? Date.parse(v) : (v as number));
const boardKey = (board: string | undefined): string => (board === "all" ? ALL_TIME : weekKey(toMs(board)));
const show = (entries: Entry[]): string => entries.map((e) => `${e.rank}. ${e.learnerId} ${e.score}`).join(" | ") || "(empty)";
let recorded = 0;
let ignored = 0;
for (const op of test.ops) {
    if (op.op === "clock") {
        clock.now = toMs(op.at);
    } else if (op.op === "score") {
        const ok = recordScore(redis, { learnerId: op.learnerId as string, points: op.points as number, ts: toMs(op.at) }, clock.now);
        if (ok) recorded++;
        else ignored++;
        if (!test.summary) {
            console.log(`score ${JSON.stringify(op.learnerId)} ${JSON.stringify(op.points)} ${JSON.stringify(op.at)} -> ${ok ? "recorded" : "ignored"}`);
        }
    } else if (op.op === "top") {
        const key = boardKey(op.board);
        console.log(`top ${key} ${op.n}: ${show(topN(redis, key, op.n as number))}`);
    } else if (op.op === "rank") {
        const key = boardKey(op.board);
        const r = rankOf(redis, key, op.learnerId as string);
        console.log(`rank ${key} ${op.learnerId}: ${r === null ? "null" : `#${r.rank} with ${r.score}; around: ${show(r.around)}`}`);
    } else if (op.op === "ttl") {
        const key = boardKey(op.board);
        console.log(`ttl ${key}: ${redis.ttl(key)}`);
    }
}
if (test.summary) console.log(`recorded: ${recorded}; ignored: ${ignored}`);
