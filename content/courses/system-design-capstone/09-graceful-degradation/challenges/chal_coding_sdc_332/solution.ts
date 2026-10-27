import { readFileSync } from "node:fs";

// CodeDev progress path: POST /progress saves a completed lesson in PostgreSQL (the ProgressStore, the source
// of truth), invalidates the learner's cached progress in Redis (the Cache) and writes the learner's total to
// the leaderboard (a Redis sorted set). Last week a Redis outage made every progress update fail. The rule
// now: progress is saved whenever PostgreSQL is up; Redis problems only make the answer "degraded".
// All times are fake-clock milliseconds; every call made while handling one request happens at that `now`.
//
// Calling a Redis dependency ("cache" or "leaderboard", each with its own config entry):
//   - Ask its circuit breaker first. If the breaker does not allow the call, do not call: the call is skipped
//     and takes 0 ms.
//   - Otherwise call it. It succeeded when outcome.ok is true and outcome.latencyMs <= timeoutMs: it took
//     latencyMs. outcome.ok false is a failure that took min(latencyMs, timeoutMs). outcome.ok true but slower
//     than timeoutMs is a timeout: a failure that took timeoutMs (the dependency may still have applied it).
// CircuitBreaker({ failureThreshold, openMs }):
//   - closed: every call is allowed. A success resets the count of consecutive failures; failureThreshold
//     consecutive failures open the breaker at that `now`.
//   - open: no call is allowed until now >= openedAt + openMs; from then on state(now) is "half-open".
//   - half-open: allow(now) lets exactly one trial call through. Its success closes the breaker (failure count
//     0); its failure opens it again with openedAt = now.
// updateProgress(req, now):
//   1. Invalid unless userId and lessonId are non-empty strings and points is an integer from 0 to 1000:
//      { status: 400, total: null, degraded: false, skipped: [], latencyMs: 0 } and nothing is called.
//   2. store.complete(userId, lessonId, points) saves it and returns { total, latencyMs }.
//   3. cache.invalidate(`progress:${userId}`) through the cache breaker; not a success -> skipped "cache".
//   4. leaderboard.setScore(userId, total) through the leaderboard breaker. Success: remove userId from the
//      retry queue if it is there. Not a success: skipped "leaderboard", and append userId to the retry queue
//      unless it is already in it (then it keeps its place).
//   5. { status: 200, total, degraded: skipped.length > 0, skipped (in the order above), latencyMs: the sum of
//      the time of every call made }.
// drain(now): called by a background timer. Until drainBatch users were written or the queue is empty: ask
//   the leaderboard breaker; if it does not allow the call, stop. Call leaderboard.setScore(userId,
//   store.total(userId)) for the first user in the queue - the total read NOW, never a total remembered from
//   the failed request. Success: remove the user and continue. Failure: stop (the user keeps its place).
//   Return how many users were written.
// getLeaderboard(n, now): leaderboard.top(n) through the leaderboard breaker. Success -> { source: "redis",
//   rows: outcome.rows }. Otherwise fall back to PostgreSQL: store.top(n) -> { source: "postgres", rows }.
//   degraded is true when the rows came from PostgreSQL or when the retry queue is not empty (Redis answered
//   but is missing updates). latencyMs = time of the leaderboard call (if made) + the PostgreSQL query (if made).
// pending() returns the retry queue (user ids, in order); breakerState(name, now) the breaker's state.
// Do not change the infrastructure fakes, the types or anything below the "do not change" line.

// ---------------------------------------------------------------- infrastructure fakes (do not change)
type Outcome = { ok: boolean; latencyMs: number };
type Row = { userId: string; total: number };
type Outage = { from: number; to: number; mode: "down" | "slow"; latencyMs: number };

class RedisFake {
    calls = 0;
    constructor(private readonly outages: Outage[]) {}
    protected outcome(now: number): Outcome {
        this.calls++;
        const o = this.outages.find((x) => x.from <= now && now < x.to);
        if (o === undefined) return { ok: true, latencyMs: 2 };
        return { ok: o.mode === "slow", latencyMs: o.latencyMs };
    }
}

class Cache extends RedisFake {
    invalidate(key: string, now: number): Outcome {
        return this.outcome(now);
    }
}

class Leaderboard extends RedisFake {
    readonly scores = new Map<string, number>();
    setScore(userId: string, total: number, now: number): Outcome {
        const out = this.outcome(now);
        if (out.ok) this.scores.set(userId, total); // a slow call is applied even if the caller timed out
        return out;
    }
    top(n: number, now: number): Outcome & { rows: Row[] } {
        const out = this.outcome(now);
        return { ...out, rows: out.ok ? sortRows(this.scores).slice(0, n) : [] };
    }
}

class ProgressStore {
    private readonly done = new Map<string, Map<string, number>>();
    complete(userId: string, lessonId: string, points: number): { total: number; latencyMs: number } {
        const lessons = this.done.get(userId) ?? new Map<string, number>();
        if (!lessons.has(lessonId)) lessons.set(lessonId, points); // completing a lesson twice counts once
        this.done.set(userId, lessons);
        return { total: this.total(userId), latencyMs: 15 };
    }
    total(userId: string): number {
        let sum = 0;
        for (const p of this.done.get(userId)?.values() ?? []) sum += p;
        return sum;
    }
    top(n: number): { rows: Row[]; latencyMs: number } {
        const totals = new Map<string, number>();
        for (const userId of this.done.keys()) totals.set(userId, this.total(userId));
        return { rows: sortRows(totals).slice(0, n), latencyMs: 120 };
    }
}

function sortRows(m: Map<string, number>): Row[] {
    return [...m].map(([userId, total]) => ({ userId, total })).sort((a, b) => b.total - a.total || (a.userId < b.userId ? -1 : 1));
}

type DependencyConfig = { timeoutMs: number; failureThreshold: number; openMs: number };
type Config = { cache: DependencyConfig; leaderboard: DependencyConfig; drainBatch: number };
type Deps = { store: ProgressStore; cache: Cache; leaderboard: Leaderboard };
type BreakerState = "closed" | "open" | "half-open";
type ProgressRequest = { userId?: unknown; lessonId?: unknown; points?: unknown };
type ProgressResult = { status: 200 | 400; total: number | null; degraded: boolean; skipped: string[]; latencyMs: number };
type LeaderboardResult = { source: "redis" | "postgres"; rows: Row[]; degraded: boolean; latencyMs: number };

// ---------------------------------------------------------------- your code
class CircuitBreaker {
    private failures = 0;
    private openedAt: number | null = null;
    private readonly failureThreshold: number;
    private readonly openMs: number;

    constructor(config: { failureThreshold: number; openMs: number }) {
        this.failureThreshold = config.failureThreshold;
        this.openMs = config.openMs;
    }

    state(now: number): BreakerState {
        if (this.openedAt === null) return "closed";
        return now >= this.openedAt + this.openMs ? "half-open" : "open";
    }

    allow(now: number): boolean {
        return this.state(now) !== "open";
    }

    success(now: number): void {
        this.failures = 0;
        this.openedAt = null;
    }

    failure(now: number): void {
        if (this.state(now) === "half-open") {
            this.openedAt = now;
            return;
        }
        this.failures++;
        if (this.failures >= this.failureThreshold) this.openedAt = now;
    }
}

type Name = "cache" | "leaderboard";

class ProgressService {
    private readonly deps: Deps;
    private readonly config: Config;
    private readonly breakers: Record<Name, CircuitBreaker>;
    private readonly queue: string[] = [];

    constructor(deps: Deps, config: Config) {
        this.deps = deps;
        this.config = config;
        this.breakers = { cache: new CircuitBreaker(config.cache), leaderboard: new CircuitBreaker(config.leaderboard) };
    }

    // returns the time the call took, and whether it succeeded; skipped calls take 0 ms
    private call<T extends Outcome>(name: Name, now: number, op: () => T): { ok: boolean; ms: number; out: T | null } {
        const breaker = this.breakers[name];
        if (!breaker.allow(now)) return { ok: false, ms: 0, out: null };
        const { timeoutMs } = this.config[name];
        const out = op();
        if (out.ok && out.latencyMs <= timeoutMs) {
            breaker.success(now);
            return { ok: true, ms: out.latencyMs, out };
        }
        breaker.failure(now);
        return { ok: false, ms: out.ok ? timeoutMs : Math.min(out.latencyMs, timeoutMs), out: null };
    }

    updateProgress(req: ProgressRequest, now: number): ProgressResult {
        const { userId, lessonId, points } = req;
        if (typeof userId !== "string" || userId === "" || typeof lessonId !== "string" || lessonId === ""
            || typeof points !== "number" || !Number.isInteger(points) || points < 0 || points > 1000) {
            return { status: 400, total: null, degraded: false, skipped: [], latencyMs: 0 };
        }
        const saved = this.deps.store.complete(userId, lessonId, points);
        let latencyMs = saved.latencyMs;
        const skipped: string[] = [];

        const cache = this.call("cache", now, () => this.deps.cache.invalidate(`progress:${userId}`, now));
        latencyMs += cache.ms;
        if (!cache.ok) skipped.push("cache");

        const lb = this.call("leaderboard", now, () => this.deps.leaderboard.setScore(userId, saved.total, now));
        latencyMs += lb.ms;
        const queued = this.queue.indexOf(userId);
        if (lb.ok) {
            if (queued >= 0) this.queue.splice(queued, 1);
        } else {
            skipped.push("leaderboard");
            if (queued < 0) this.queue.push(userId);
        }
        return { status: 200, total: saved.total, degraded: skipped.length > 0, skipped, latencyMs };
    }

    drain(now: number): number {
        let written = 0;
        while (written < this.config.drainBatch && this.queue.length > 0) {
            const userId = this.queue[0];
            const r = this.call("leaderboard", now, () => this.deps.leaderboard.setScore(userId, this.deps.store.total(userId), now));
            if (!r.ok) break;
            this.queue.shift();
            written++;
        }
        return written;
    }

    getLeaderboard(n: number, now: number): LeaderboardResult {
        const r = this.call("leaderboard", now, () => this.deps.leaderboard.top(n, now));
        if (r.ok && r.out !== null) {
            return { source: "redis", rows: r.out.rows, degraded: this.queue.length > 0, latencyMs: r.ms };
        }
        const pg = this.deps.store.top(n);
        return { source: "postgres", rows: pg.rows, degraded: true, latencyMs: r.ms + pg.latencyMs };
    }

    pending(): string[] {
        return [...this.queue];
    }

    breakerState(name: Name, now: number): BreakerState {
        return this.breakers[name].state(now);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Replays events in time order (ties keep input order). A drain timer fires at every multiple of drainEveryMs
// from drainEveryMs up to untilMs; a tick due at or before an event runs before it. After every event and
// tick the runner reads both breaker states and logs each change.
type Event =
    | { at: number; type: "progress"; userId?: unknown; lessonId?: unknown; points?: unknown }
    | { at: number; type: "top"; n: number };
type Input = {
    config: Config;
    outages: { cache?: Outage[]; leaderboard?: Outage[] };
    drainEveryMs: number;
    untilMs: number;
    events: Event[];
};

function main(): void {
    const input: Input = JSON.parse(readFileSync(0, "utf8"));
    const deps: Deps = {
        store: new ProgressStore(),
        cache: new Cache(input.outages.cache ?? []),
        leaderboard: new Leaderboard(input.outages.leaderboard ?? []),
    };
    const service = new ProgressService(deps, input.config);
    const events = input.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at || a.i - b.i).map((x) => x.e);
    const results: string[] = [];
    const transitions: string[] = [];
    const seen: Record<Name, BreakerState> = { cache: "closed", leaderboard: "closed" };
    const users = new Set<string>();
    let degraded = 0;
    let latencyTotal = 0;
    let drained = 0;
    const watch = (now: number): void => {
        for (const name of ["cache", "leaderboard"] as const) {
            const s = service.breakerState(name, now);
            if (s !== seen[name]) transitions.push(`t=${now} ${name} ${seen[name]} -> ${s}`);
            seen[name] = s;
        }
    };
    let tick = input.drainEveryMs;
    const runTicks = (until: number): void => {
        while (tick <= until && tick <= input.untilMs) {
            const n = service.drain(tick);
            drained += n;
            if (n > 0) results.push(`t=${tick} drain ${n}`);
            watch(tick);
            tick += input.drainEveryMs;
        }
    };
    for (const e of events) {
        runTicks(e.at);
        if (e.type === "top") {
            const r = service.getLeaderboard(e.n, e.at);
            if (r.degraded) degraded++;
            latencyTotal += r.latencyMs;
            const rows = r.rows.map((x) => `${x.userId}:${x.total}`).join(",");
            results.push(`t=${e.at} top ${e.n} -> ${r.source}${r.degraded ? " degraded" : ""} ${r.latencyMs}ms [${rows}]`);
        } else {
            const r = service.updateProgress({ userId: e.userId, lessonId: e.lessonId, points: e.points }, e.at);
            if (typeof e.userId === "string" && r.status === 200) users.add(e.userId);
            if (r.degraded) degraded++;
            latencyTotal += r.latencyMs;
            results.push(r.status === 200
                ? `t=${e.at} progress ${String(e.userId)} ${String(e.lessonId)} -> 200 total=${r.total}${r.degraded ? ` degraded=${r.skipped.join("+")}` : ""} ${r.latencyMs}ms`
                : `t=${e.at} progress ${String(e.userId)} ${String(e.lessonId)} -> ${r.status}`);
        }
        watch(e.at);
    }
    runTicks(input.untilMs);
    const behind = [...users].sort().filter((u) => deps.leaderboard.scores.get(u) !== deps.store.total(u));
    console.log(JSON.stringify({
        breakers: { cache: service.breakerState("cache", input.untilMs), leaderboard: service.breakerState("leaderboard", input.untilMs) },
        pending: service.pending(),
        leaderboardBehind: behind,
        calls: { cache: deps.cache.calls, leaderboard: deps.leaderboard.calls },
        degraded,
        latencyTotalMs: latencyTotal,
        drained,
        transitions,
        results,
    }));
}
main();
