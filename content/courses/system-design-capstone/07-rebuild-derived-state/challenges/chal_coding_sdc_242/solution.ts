import { readFileSync } from "node:fs";

// CodeDev leaderboard recovery.
//
// The Redis node that held the leaderboard restarted empty, and the key "leaderboard" now holds an old,
// stale board restored from yesterday's export. PostgreSQL is the source of truth: every row of the
// progress table is one ProgressEvent with a unique, increasing sequence number `seq` (there can be gaps).
// The leaderboard is derived data: a learner's score is the sum of `points` of all their rows.
//
// Write rebuildLeaderboard(db, feed, redis, pageSize). It must:
//   1. build the new board in the key "leaderboard:rebuild" - never write to "leaderboard" while building,
//      because learners keep reading it. A crashed earlier rebuild may have left "leaderboard:rebuild"
//      behind: start from an empty key;
//   2. snapshot: page through the table with db.readPage(afterSeq, pageSize) (keyset pagination: rows
//      with seq > afterSeq, ordered by seq, at most pageSize). Start with afterSeq = 0, continue after the
//      last seq you received, and stop after the first page that has fewer than pageSize rows;
//   3. new events keep arriving while you page: they are committed to the table (with a higher seq) AND
//      delivered to the live feed. feed.drain() returns every row delivered since the last drain. The feed
//      can also deliver a row again, or late (a row that was committed long ago). After the snapshot,
//      drain the feed and replay only rows the snapshot did not include - every row counts exactly once;
//   4. swap atomically: redis.rename("leaderboard:rebuild", "leaderboard") replaces the old board in one
//      step. Like Redis, rename throws when the source key does not exist: if the new board is empty,
//      delete "leaderboard" instead.
//
// Available: db.readPage, db.maxSeq() (highest seq right now), feed.drain(),
// redis.zincrby(key, member, by), redis.zscore(key, member), redis.exists(key), redis.del(key),
// redis.rename(src, dst). Types and fakes are defined in the runner block below.

const BOARD = "leaderboard";
const BUILD = "leaderboard:rebuild";

function rebuildLeaderboard(db: ProgressDb, feed: LiveFeed, redis: FakeRedis, pageSize: number): void {
    redis.del(BUILD); // leftovers of a crashed rebuild would be counted twice

    // snapshot, with keyset pagination: the cursor is also the high-water mark
    let highWater = 0;
    for (;;) {
        const page = db.readPage(highWater, pageSize);
        for (const row of page) redis.zincrby(BUILD, row.userId, row.points);
        if (page.length > 0) highWater = page[page.length - 1].seq;
        if (page.length < pageSize) break;
    }

    // replay: only rows above the high-water mark, in seq order, each seq once
    const replay = feed.drain().filter((row) => row.seq > highWater).sort((a, b) => a.seq - b.seq);
    for (const row of replay) {
        if (row.seq <= highWater) continue; // the feed delivered this row twice
        redis.zincrby(BUILD, row.userId, row.points);
        highWater = row.seq;
    }

    if (redis.exists(BUILD)) redis.rename(BUILD, BOARD);
    else redis.del(BOARD);
}

// ---------------------------------------------------------------- test runner (do not change)
type ProgressEvent = { eventId: string; userId: string; courseId: string; lessonId: string; points: number; occurredAtMs: number };
type ProgressRow = ProgressEvent & { seq: number };
type RowTuple = [number, string, number]; // [seq, userId, points]
type Arrival = { afterPage: number; commit?: RowTuple[]; redeliver?: number[] };
type Generate = { seed: number; users: number; rows: number; every: number };
type Input = {
    pageSize: number;
    topN: number;
    rows?: RowTuple[];
    oldBoard?: [string, number][];
    leftover?: [string, number][];
    during?: Arrival[];
    generate?: Generate;
};

function toRow([seq, userId, points]: RowTuple): ProgressRow {
    return {
        seq, eventId: `evt_${seq}`, userId, courseId: "system-design-capstone",
        lessonId: `lesson-sdc-${(seq % 13) + 1}`, points, occurredAtMs: 1_760_000_000_000 + seq * 1000,
    };
}

class ProgressDb {
    private rows: ProgressRow[] = [];
    pagesRead = 0;
    constructor(private readonly afterRead: (page: number) => void) {}
    insert(row: ProgressRow): void {
        if (this.rows.length > 0 && row.seq <= this.rows[this.rows.length - 1].seq) throw new Error(`seq ${row.seq} must increase`);
        this.rows.push(row);
    }
    find(seq: number): ProgressRow | undefined {
        return this.rows.find((r) => r.seq === seq);
    }
    all(): ProgressRow[] {
        return this.rows.map((r) => ({ ...r }));
    }
    /** SELECT * FROM progress WHERE seq > afterSeq ORDER BY seq LIMIT limit */
    readPage(afterSeq: number, limit: number): ProgressRow[] {
        if (++this.pagesRead > 100_000) throw new Error("too many page reads");
        const page = this.rows.filter((r) => r.seq > afterSeq).slice(0, Math.max(0, limit)).map((r) => ({ ...r }));
        this.afterRead(this.pagesRead);
        return page;
    }
    maxSeq(): number {
        return this.rows.length > 0 ? this.rows[this.rows.length - 1].seq : 0;
    }
}

class LiveFeed {
    private pending: ProgressRow[] = [];
    push(row: ProgressRow): void {
        this.pending.push({ ...row });
    }
    drain(): ProgressRow[] {
        const out = this.pending;
        this.pending = [];
        return out;
    }
}

class FakeRedis {
    private sets = new Map<string, Map<string, number>>();
    zincrby(key: string, member: string, by: number): number {
        const set = this.sets.get(key) ?? new Map<string, number>();
        this.sets.set(key, set);
        const next = (set.get(member) ?? 0) + by;
        set.set(member, next);
        return next;
    }
    zscore(key: string, member: string): number | null {
        return this.sets.get(key)?.get(member) ?? null;
    }
    exists(key: string): boolean {
        return this.sets.has(key);
    }
    del(key: string): void {
        this.sets.delete(key);
    }
    rename(src: string, dst: string): void {
        const set = this.sets.get(src);
        if (!set) throw new Error("ERR no such key");
        this.sets.delete(src);
        this.sets.set(dst, set);
    }
    top(key: string, n: number): string[] {
        return [...(this.sets.get(key) ?? new Map<string, number>()).entries()]
            .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
            .slice(0, n)
            .map(([user, points]) => `${user}:${points}`);
    }
    keys(): string[] {
        return [...this.sets.keys()].sort();
    }
}

function generated(g: Generate, pageSize: number): Pick<Input, "rows" | "during" | "oldBoard"> {
    let state = g.seed >>> 0;
    const next = (n: number): number => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state % n;
    };
    const user = (): string => `u${String(next(g.users) + 1).padStart(3, "0")}`;
    const points = [5, 10, 10, 20, 50];
    let seq = 0;
    const row = (): RowTuple => {
        seq += 1 + (next(5) === 0 ? 1 : 0); // sequences have gaps
        return [seq, user(), points[next(points.length)]];
    };
    const rows: RowTuple[] = [];
    for (let i = 0; i < g.rows; i++) rows.push(row());
    const during: Arrival[] = [];
    for (let page = g.every; page * pageSize < g.rows; page += g.every) {
        const commit = [row(), row()];
        during.push({ afterPage: page, commit, redeliver: [rows[next(rows.length)][0], commit[0][0]] });
    }
    const oldBoard: [string, number][] = [["u001", 900], ["u002", 850], ["u003", 40]];
    return { rows, during, oldBoard };
}

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const setup = input.generate ? { ...input, ...generated(input.generate, input.pageSize) } : input;
const redis = new FakeRedis();
const feed = new LiveFeed();
const seen: string[][] = [];
const arrivals = new Map<number, Arrival[]>();
for (const a of setup.during ?? []) arrivals.set(a.afterPage, [...(arrivals.get(a.afterPage) ?? []), a]);
const arrive = (page: number): void => {
    for (const a of arrivals.get(page) ?? []) {
        for (const t of a.commit ?? []) {
            const row = toRow(t);
            db.insert(row);
            feed.push(row);
        }
        for (const seq of a.redeliver ?? []) {
            const row = db.find(seq);
            if (row) feed.push(row);
        }
    }
};
const db: ProgressDb = new ProgressDb((page) => {
    arrive(page);
    seen.push(redis.top(BOARD, setup.topN)); // a learner opens the leaderboard page
});
for (const t of setup.rows ?? []) db.insert(toRow(t));
for (const [user, points] of setup.oldBoard ?? []) redis.zincrby(BOARD, user, points);
for (const [user, points] of setup.leftover ?? []) redis.zincrby(BUILD, user, points);
arrive(0);

rebuildLeaderboard(db, feed, redis, setup.pageSize);

const truth = new FakeRedis();
for (const r of db.all()) truth.zincrby("truth", r.userId, r.points);
const final = redis.top(BOARD, Number.MAX_SAFE_INTEGER);
console.log(JSON.stringify({
    final: final.slice(0, setup.topN),
    matchesTruth: JSON.stringify(final) === JSON.stringify(truth.top("truth", Number.MAX_SAFE_INTEGER)),
    seen,
    pagesRead: db.pagesRead,
    keys: redis.keys(),
}));
