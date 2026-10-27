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
// Rules (see the challenge description for the full text):
//   - invalid event -> "invalid"; eventId already accepted -> "duplicate";
//     learnerSeq already applied or already waiting for that learner -> "stale"; else "accepted".
//   - an accepted event is applied when it is the learner's next learnerSeq (1, 2, 3, ...); otherwise
//     it waits until the missing ones arrive, then they are applied in learnerSeq order.
//   - points: challenge.passed = points; progress.updated = 10 if lessonPercent is 100, plus 50 if
//     coursePercent is 100. Points go to "all-time" and to the board of the event's week.
//   - order: more points first; on a tie, the learner whose points on that board changed earlier.
class ProjectionLeaderboard implements Leaderboard {
    apply(event: unknown): Outcome {
        return "invalid";
    }

    waiting(): number {
        return 0;
    }

    top(board: string, n: number): Entry[] {
        return [];
    }

    rank(board: string, userId: string): Entry | null {
        return null;
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
