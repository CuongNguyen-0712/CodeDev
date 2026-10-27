import { readFileSync } from "node:fs";

// Rebuild the CodeDev leaderboard after the Redis cache was lost.
// PostgreSQL keeps every progress event in an append-only log (seq 1, 2, 3, ...): that is the source of truth.
// The leaderboard projection lives in Redis: one sorted set for "alltime" and one per week ("weekly:2026-W44").
// When Redis comes back empty, LeaderboardService rebuilds both from the log, in the background:
//   startRebuild()  the cache was lost (again): forget any partial rebuild and start over from the first event
//   step()          one background batch: read at most batchSize events after your cursor (one log.read call),
//                   add them to NEW keys (not the ones readers use); when the cursor has reached the log's
//                   current head, switch readers to the new keys at once (status "ready"). Writes keep arriving
//                   during the rebuild: keep stepping until you caught up with them (the head moves).
//   onEvent(e)      a new progress event was appended to the log (seq > every earlier one). While rebuilding,
//                   the rebuild will read it from the log. When ready, add it to the live board, once: the bus
//                   delivers at least once, so skip an event whose seq you already applied.
//   read(board, n)  board must be "alltime" or "weekly:<YYYY>-W<ww>", else { status: "error", error: "unknown_board" };
//                   n must be an integer 1..100, else { status: "error", error: "invalid_limit" }.
//                   ready:      { status: "ready", top } from the live sorted set
//                   rebuilding: { status: "rebuilding", asOfSeq, top } from the snapshot (its first n entries,
//                               [] for a board it does not have)
// top is a list of [userId, score], highest score first, ties by userId (cache.ztop already sorts that way).
// Do not change the types, the fakes or the test runner.

type ProgressEvent = { seq: number; userId: string; week: string; points: number };
type Entry = [string, number];
interface EventLog {
    headSeq(): number;
    /** Events with seq > afterSeq, in seq order, at most `limit` of them. */
    read(afterSeq: number, limit: number): ProgressEvent[];
}
interface Cache {
    zincrby(key: string, member: string, by: number): void;
    /** The n highest members of a sorted set ([] for a missing key). */
    ztop(key: string, n: number): Entry[];
}
/** The last known top N of each board, written every hour to object storage. */
type Snapshot = { asOfSeq: number; boards: Record<string, Entry[]> };
type BoardRead =
    | { status: "ready"; top: Entry[] }
    | { status: "rebuilding"; asOfSeq: number; top: Entry[] }
    | { status: "error"; error: string };

const BOARD_NAME = /^(alltime|weekly:\d{4}-W\d{2})$/;

class LeaderboardService {
    private log: EventLog;
    private cache: Cache;
    private snapshot: Snapshot;
    private batchSize: number;
    private status: "ready" | "rebuilding" = "rebuilding";
    private building = 0; // version of the keys being rebuilt
    private live = 0; // version of the keys readers use
    private cursor = 0; // last seq the rebuild has read
    private appliedSeq = 0; // last seq in the live board

    constructor(log: EventLog, cache: Cache, snapshot: Snapshot, batchSize: number) {
        this.log = log;
        this.cache = cache;
        this.snapshot = snapshot;
        this.batchSize = batchSize;
    }

    startRebuild(): void {
        this.status = "rebuilding";
        this.building++;
        this.cursor = 0;
    }

    step(): void {
        if (this.status !== "rebuilding") return;
        const batch = this.log.read(this.cursor, this.batchSize);
        for (const event of batch) this.apply(this.building, event);
        if (batch.length > 0) this.cursor = batch[batch.length - 1].seq;
        if (this.cursor >= this.log.headSeq()) {
            this.live = this.building; // the switch: one assignment, readers never see a half-built board
            this.appliedSeq = this.cursor;
            this.status = "ready";
        }
    }

    onEvent(event: ProgressEvent): void {
        if (this.status !== "ready") return;
        this.apply(this.live, event);
        this.appliedSeq = event.seq;
    }

    read(board: string, n: number): BoardRead {
        if (typeof board !== "string" || !BOARD_NAME.test(board)) return { status: "error", error: "unknown_board" };
        if (!Number.isInteger(n) || n < 1 || n > 100) return { status: "error", error: "invalid_limit" };
        if (this.status === "ready") return { status: "ready", top: this.cache.ztop(this.key(this.live, board), n) };
        return { status: "rebuilding", asOfSeq: this.snapshot.asOfSeq, top: (this.snapshot.boards[board] ?? []).slice(0, n) };
    }

    private key(version: number, board: string): string {
        return `lb:v${version}:${board}`;
    }

    private apply(version: number, event: ProgressEvent): void {
        this.cache.zincrby(this.key(version, "alltime"), event.userId, event.points);
        this.cache.zincrby(this.key(version, `weekly:${event.week}`), event.userId, event.points);
    }
}

// ---------------------------------------------------------------- fakes and test runner (do not change)
// Input: { batchSize, snapshot, log, script }. `log` holds the events already in PostgreSQL (seq 1..). Redis has
// just come back empty: the runner creates the service and calls startRebuild(). Script steps:
//   { tick: k }                     the background job calls step() k times
//   { write: { userId, week, points } }  a learner earns points: the event is appended to the log, then onEvent
//   { redeliver: seq }              the bus delivers the event with that seq again (onEvent)
//   { read: board, n }              a learner opens the leaderboard: read(board, n)
//   { flush: true }                 Redis is lost again (every key is gone), then startRebuild()
// After the script the job keeps calling step() until "alltime" reads "ready" (at most 100,000 times).
// Output: every read, then the final top 100 of "alltime" and of every week in the log.
type Step = {
    tick?: number;
    write?: { userId: string; week: string; points: number };
    redeliver?: number;
    read?: string;
    n?: number;
    flush?: boolean;
};
type Input = { batchSize: number; snapshot: Snapshot; log: Omit<ProgressEvent, "seq">[]; script: Step[] };

class FakeLog implements EventLog {
    events: ProgressEvent[] = [];
    append(event: Omit<ProgressEvent, "seq">): ProgressEvent {
        const stored = { seq: this.events.length + 1, userId: event.userId, week: event.week, points: event.points };
        this.events.push(stored);
        return { ...stored };
    }
    headSeq(): number {
        return this.events.length;
    }
    read(afterSeq: number, limit: number): ProgressEvent[] {
        const from = Math.max(0, Math.floor(afterSeq));
        return this.events.slice(from, from + Math.max(0, limit)).map((e) => ({ ...e }));
    }
}

class FakeRedis implements Cache {
    sets = new Map<string, Map<string, number>>();
    zincrby(key: string, member: string, by: number): void {
        const set = this.sets.get(key) ?? new Map<string, number>();
        set.set(member, (set.get(member) ?? 0) + by);
        this.sets.set(key, set);
    }
    ztop(key: string, n: number): Entry[] {
        const set = this.sets.get(key);
        if (!set) return [];
        return [...set].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, Math.max(0, n));
    }
    flushall(): void {
        this.sets.clear();
    }
}

function main(): void {
    const input = JSON.parse(readFileSync(0, "utf8")) as Input;
    const log = new FakeLog();
    for (const event of input.log) log.append(event);
    const redis = new FakeRedis();
    const service = new LeaderboardService(log, redis, input.snapshot, input.batchSize);
    service.startRebuild();
    const reads: unknown[] = [];
    for (const step of input.script) {
        if (step.tick !== undefined) for (let i = 0; i < step.tick; i++) service.step();
        else if (step.write !== undefined) service.onEvent(log.append(step.write));
        else if (step.redeliver !== undefined) service.onEvent({ ...log.events[step.redeliver - 1] });
        else if (step.read !== undefined) reads.push({ board: step.read, n: step.n, ...service.read(step.read, step.n as number) });
        else if (step.flush) {
            redis.flushall();
            service.startRebuild();
        }
    }
    let finalSteps = 0;
    while (service.read("alltime", 1).status !== "ready" && finalSteps < 100_000) {
        service.step();
        finalSteps++;
    }
    const weeks = [...new Set(log.events.map((e) => e.week))].sort();
    const final: Record<string, unknown> = { alltime: service.read("alltime", 100) };
    for (const week of weeks) final[`weekly:${week}`] = service.read(`weekly:${week}`, 100);
    console.log(JSON.stringify({ reads, final }, null, 2));
}
main();
