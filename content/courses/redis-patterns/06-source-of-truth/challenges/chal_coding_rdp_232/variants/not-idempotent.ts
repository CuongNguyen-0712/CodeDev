import { readFileSync } from "node:fs";


type ScoreEvent = { eventId: string; userId: string; points: number };
type AwardResult = "counted" | "duplicate" | "rejected";

const LEADERBOARD_KEY = "leaderboard:global";

class LeaderboardService {
    private redis: FakeRedis;
    private db: FakeDb;
    constructor(redis: FakeRedis, db: FakeDb) {
        this.redis = redis;
        this.db = db;
    }

    async awardPoints(event: ScoreEvent): Promise<AwardResult> {
        if (!isValidEvent(event)) return "rejected";
        await this.db.insertScoreEvent(event);
        // A ZINCRBY on a missing key would create a leaderboard holding one learner.
        if (this.redis.exists(LEADERBOARD_KEY) === 1) this.redis.zincrby(LEADERBOARD_KEY, event.points, event.userId);
        return "counted";
    }

    async top(n: number): Promise<Array<{ member: string; score: number }>> {
        if (!Number.isInteger(n) || n < 1) return [];
        await this.ensureLeaderboard();
        return this.redis.zrevrange(LEADERBOARD_KEY, 0, n - 1);
    }

    async scoreOf(userId: string): Promise<number> {
        await this.ensureLeaderboard();
        return this.redis.zscore(LEADERBOARD_KEY, userId) ?? 0;
    }

    private async ensureLeaderboard(): Promise<void> {
        if (this.redis.exists(LEADERBOARD_KEY) === 1) return;
        for (const { userId, total } of await this.db.totalsByUser()) this.redis.zadd(LEADERBOARD_KEY, total, userId);
    }
}

function isValidEvent(event: ScoreEvent): boolean {
    return (
        typeof event.eventId === "string" && event.eventId.length > 0 &&
        typeof event.userId === "string" && event.userId.length > 0 &&
        Number.isInteger(event.points) && event.points >= 1
    );
}

// ---------------------------------------------------------------- in-memory Redis and database (do not change)
// A small model of the Redis commands used here: sorted sets (score, member) and the key commands.
// Ties are ordered like Redis: by score, then by member in byte order (descending for ZREVRANGE).
// `calls` counts commands. Like a Redis without persistence, a restart (flushall) loses every key.
class FakeRedis {
    private zsets = new Map<string, Map<string, number>>();
    calls: Record<string, number> = {};

    private count(command: string): void {
        this.calls[command] = (this.calls[command] ?? 0) + 1;
    }
    private sorted(key: string): Array<{ member: string; score: number }> {
        const set = this.zsets.get(key);
        if (!set) return [];
        return [...set]
            .map(([member, score]) => ({ member, score }))
            .sort((a, b) => b.score - a.score || (a.member < b.member ? 1 : a.member > b.member ? -1 : 0));
    }

    exists(key: string): 0 | 1 {
        this.count("exists");
        return this.zsets.has(key) ? 1 : 0;
    }
    del(...keys: string[]): number {
        this.count("del");
        let removed = 0;
        for (const key of keys) if (this.zsets.delete(key)) removed++;
        return removed;
    }
    /** ZADD key score member: sets the score; returns 1 when the member is new. */
    zadd(key: string, score: number, member: string): number {
        this.count("zadd");
        if (!Number.isFinite(score)) throw new Error("ERR value is not a valid float");
        const set = this.zsets.get(key) ?? new Map<string, number>();
        const added = set.has(member) ? 0 : 1;
        set.set(member, score);
        this.zsets.set(key, set);
        return added;
    }
    /** ZINCRBY key by member: a missing key or member starts at 0; returns the new score. */
    zincrby(key: string, by: number, member: string): number {
        this.count("zincrby");
        if (!Number.isFinite(by)) throw new Error("ERR value is not a valid float");
        const set = this.zsets.get(key) ?? new Map<string, number>();
        const score = (set.get(member) ?? 0) + by;
        set.set(member, score);
        this.zsets.set(key, set);
        return score;
    }
    zscore(key: string, member: string): number | null {
        this.count("zscore");
        return this.zsets.get(key)?.get(member) ?? null;
    }
    /** ZREVRANGE key start stop WITHSCORES: highest first, inclusive indexes, negative counts from the end. */
    zrevrange(key: string, start: number, stop: number): Array<{ member: string; score: number }> {
        this.count("zrevrange");
        const all = this.sorted(key);
        const from = start < 0 ? Math.max(0, all.length + start) : start;
        const to = stop < 0 ? all.length + stop : Math.min(stop, all.length - 1);
        return from > to ? [] : all.slice(from, to + 1);
    }
    /** ZREVRANK key member: 0 for the highest score, null when the member is missing. */
    zrevrank(key: string, member: string): number | null {
        this.count("zrevrank");
        const index = this.sorted(key).findIndex((e) => e.member === member);
        return index < 0 ? null : index;
    }
    zcard(key: string): number {
        this.count("zcard");
        return this.zsets.get(key)?.size ?? 0;
    }
    /** FLUSHALL: what a restart without persistence does to the data. */
    flushall(): void {
        this.zsets.clear();
    }
}

/** PostgreSQL stand-in: table score_events (event_id PRIMARY KEY, user_id, points). `calls` counts queries. */
class FakeDb {
    private events = new Map<string, ScoreEvent>();
    calls: Record<string, number> = {};

    /** INSERT INTO score_events ... ON CONFLICT (event_id) DO NOTHING: true when a row was inserted. */
    async insertScoreEvent(event: ScoreEvent): Promise<boolean> {
        this.calls.insertScoreEvent = (this.calls.insertScoreEvent ?? 0) + 1;
        if (this.events.has(event.eventId)) return false;
        this.events.set(event.eventId, { ...event });
        return true;
    }
    /** SELECT user_id, SUM(points) AS total FROM score_events GROUP BY user_id */
    async totalsByUser(): Promise<Array<{ userId: string; total: number }>> {
        this.calls.totalsByUser = (this.calls.totalsByUser ?? 0) + 1;
        const totals = new Map<string, number>();
        for (const e of this.events.values()) totals.set(e.userId, (totals.get(e.userId) ?? 0) + e.points);
        return [...totals].map(([userId, total]) => ({ userId, total }));
    }
    /** For the test runner only: the stored events, without counting a query. */
    peek(): ScoreEvent[] {
        return [...this.events.values()];
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of steps: { "award": { "eventId", "userId", "points" } }, { "top": 3 }, { "score": "u_an" },
// { "restart": true } (Redis restarts and loses every key) and { "check": true } (prints what PostgreSQL
// holds, the per-learner totals, and how many times the leaderboard was rebuilt with totalsByUser).
type Step = { award?: ScoreEvent; top?: number; score?: string; restart?: boolean; check?: boolean };

async function main(): Promise<void> {
    const steps: Step[] = JSON.parse(readFileSync(0, "utf8"));
    const redis = new FakeRedis();
    const db = new FakeDb();
    const service = new LeaderboardService(redis, db);
    const out: string[] = [];
    for (const step of steps) {
        try {
            if (step.award !== undefined) {
                const e = step.award;
                out.push(`award ${e.eventId} ${e.userId} +${e.points} -> ${await service.awardPoints(e)}`);
            } else if (step.top !== undefined) {
                const rows = await service.top(step.top);
                out.push(`top ${step.top} -> ${rows.map((r) => `${r.member} ${r.score}`).join(", ") || "(empty)"}`);
            } else if (step.score !== undefined) {
                out.push(`score ${step.score} -> ${await service.scoreOf(step.score)}`);
            } else if (step.restart) {
                redis.flushall();
                out.push("redis restarted: every key is gone");
            } else if (step.check) {
                const events = db.peek();
                const totals = new Map<string, number>();
                for (const e of events) totals.set(e.userId, (totals.get(e.userId) ?? 0) + e.points);
                const list = [...totals].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([u, t]) => `${u} ${t}`).join(", ");
                out.push(`postgres: score_events=${events.length} (${list || "none"}); totalsByUser queries: ${db.calls.totalsByUser ?? 0}`);
            }
        } catch (error) {
            out.push(`error: ${(error as Error).message}`);
        }
    }
    console.log(out.join("\n"));
}
main();
