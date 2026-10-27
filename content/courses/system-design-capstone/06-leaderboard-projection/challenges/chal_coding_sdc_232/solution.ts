import { readFileSync } from "node:fs";

// The leaderboard projection of CodeDev: it reads progress.updated and challenge.passed events from
// the event bus and keeps two kinds of boards, "all-time" and one board per ISO week ("2026-W44").
// PostgreSQL stays the source of truth; this projection can be rebuilt from the events at any time.
// Implement ProjectionLeaderboard. Do not change the types or the test runner.

type Entry = { rank: number; userId: string; points: number };
type Outcome = "accepted" | "duplicate" | "stale" | "invalid";

interface Leaderboard {
    // Takes one event exactly as it came off the bus (untrusted JSON).
    apply(event: unknown): Outcome;
    // Number of accepted events that are waiting for an earlier learnerSeq of the same learner.
    waiting(): number;
    // board = "all-time" or a week such as "2026-W44". Ranks start at 1.
    top(board: string, n: number): Entry[];
    rank(board: string, userId: string): Entry | null;
}

type GoodEvent =
    | { eventId: string; type: "challenge.passed"; userId: string; learnerSeq: number; week: string; points: number }
    | { eventId: string; type: "progress.updated"; userId: string; learnerSeq: number; week: string; lessonPercent: number; coursePercent: number };

// ---------------------------------------------------------------- your code
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function parse(raw: unknown): GoodEvent | null {
    if (typeof raw !== "object" || raw === null) return null;
    const e = raw as Record<string, unknown>;
    if (!isText(e.eventId) || !isText(e.userId) || !isText(e.week) || !isInt(e.learnerSeq, 1, Number.MAX_SAFE_INTEGER)) return null;
    if (e.type === "challenge.passed" && isInt(e.points, 1, 500)) return e as GoodEvent;
    if (e.type === "progress.updated" && isInt(e.lessonPercent, 0, 100) && isInt(e.coursePercent, 0, 100)) return e as GoodEvent;
    return null;
}

function pointsOf(e: GoodEvent): number {
    if (e.type === "challenge.passed") return e.points;
    return (e.lessonPercent === 100 ? 10 : 0) + (e.coursePercent === 100 ? 50 : 0);
}

type Score = { points: number; since: number };

class ProjectionLeaderboard implements Leaderboard {
    private seen = new Set<string>();
    private applied = new Map<string, number>(); // userId -> highest learnerSeq applied
    private buffered = new Map<string, Map<number, GoodEvent>>(); // userId -> learnerSeq -> event
    private boards = new Map<string, Map<string, Score>>();
    private counter = 0;

    apply(raw: unknown): Outcome {
        const e = parse(raw);
        if (!e) return "invalid";
        if (this.seen.has(e.eventId)) return "duplicate";
        const last = this.applied.get(e.userId) ?? 0;
        const waiting = this.buffered.get(e.userId) ?? new Map<number, GoodEvent>();
        if (e.learnerSeq <= last || waiting.has(e.learnerSeq)) return "stale";
        this.seen.add(e.eventId);
        waiting.set(e.learnerSeq, e);
        this.buffered.set(e.userId, waiting);
        let next = last + 1;
        while (waiting.has(next)) {
            this.score(waiting.get(next)!);
            waiting.delete(next);
            this.applied.set(e.userId, next);
            next++;
        }
        return "accepted";
    }

    private score(e: GoodEvent): void {
        this.counter++;
        const points = pointsOf(e);
        if (points === 0) return;
        for (const name of ["all-time", e.week]) {
            const board = this.boards.get(name) ?? new Map<string, Score>();
            const old = board.get(e.userId)?.points ?? 0;
            board.set(e.userId, { points: old + points, since: this.counter });
            this.boards.set(name, board);
        }
    }

    waiting(): number {
        let n = 0;
        for (const m of this.buffered.values()) n += m.size;
        return n;
    }

    private ordered(board: string): Entry[] {
        const rows = [...(this.boards.get(board) ?? new Map<string, Score>()).entries()];
        rows.sort(([ua, a], [ub, b]) => b.points - a.points || a.since - b.since || (ua < ub ? -1 : ua > ub ? 1 : 0));
        return rows.map(([userId, s], i) => ({ rank: i + 1, userId, points: s.points }));
    }

    top(board: string, n: number): Entry[] {
        return this.ordered(board).slice(0, n);
    }

    rank(board: string, userId: string): Entry | null {
        return this.ordered(board).find((e) => e.userId === userId) ?? null;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { top, watch, batches: [{ week, events }] }. After each batch: the outcome counts, the
// number of waiting events, the top N of "all-time" and of the batch's week, and the watched learners.
type Input = { top: number; watch: string[]; batches: { week: string; events: unknown[] }[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const board: Leaderboard = new ProjectionLeaderboard();
const show = (entries: Entry[]): string => entries.map((e) => `${e.rank}. ${e.userId} ${e.points}`).join(", ") || "(empty)";
const at = (e: Entry | null): string => (e ? `#${e.rank} ${e.points}` : "-");
input.batches.forEach((batch, i) => {
    const counts: Record<Outcome, number> = { accepted: 0, duplicate: 0, stale: 0, invalid: 0 };
    for (const event of batch.events) counts[board.apply(event)]++;
    console.log(`batch ${i + 1} week ${batch.week}: accepted ${counts.accepted}, duplicate ${counts.duplicate}, stale ${counts.stale}, invalid ${counts.invalid}, waiting ${board.waiting()}`);
    console.log(`  all-time: ${show(board.top("all-time", input.top))}`);
    console.log(`  ${batch.week}: ${show(board.top(batch.week, input.top))}`);
    for (const user of input.watch) {
        console.log(`  ${user}: all-time ${at(board.rank("all-time", user))}, ${batch.week} ${at(board.rank(batch.week, user))}`);
    }
});
