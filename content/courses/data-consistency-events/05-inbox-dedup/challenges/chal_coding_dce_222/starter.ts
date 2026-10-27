import { readFileSync } from "node:fs";

// Certificate counters for the CodeDev course dashboard. The certificates service publishes
// "certificate.issued" events ({ courseId, userId }); this consumer keeps counters[courseId], the
// number of certificates issued per course. The broker delivers at least once: a message that was
// not acked (the consumer crashed) is delivered again. Write InboxConsumer.
//
// handle(msg, now) returns "processed", "duplicate" or "invalid":
//   - "invalid" when msg.id or msg.payload.courseId is not a non-empty string: change nothing;
//   - "duplicate" when the inbox already has a row for msg.id: change nothing;
//   - "processed" otherwise: in ONE db.tx, insert the inbox row (msg.id -> { processedAt: now })
//     and add 1 to counters[courseId] (a missing counter counts as 0).
//   The check and the writes belong in the same transaction as the effect.
//
// cleanup(now, retentionMs) deletes, in one db.tx, every inbox row with now - processedAt >= retentionMs
// and returns how many rows it deleted. The inbox only remembers ids inside the retention window:
// a message delivered again after its row was deleted is processed again (counted twice). That is
// the documented limit of this design; the retention must be longer than any redelivery delay.
//
// After a crash the runner starts a new InboxConsumer on the same database: anything you keep in
// the consumer object is lost, only committed rows survive. Never catch Crash.
// Do not change the building blocks or the test runner.

type Outcome = "processed" | "duplicate" | "invalid";

class InboxConsumer {
    private db: FakeDb;

    constructor(db: FakeDb) {
        this.db = db;
    }

    handle(msg: Message, now: number): Outcome {
        // TODO: skip invalid and already processed messages; otherwise record msg.id in the inbox and
        // count the certificate, in one transaction
        return "processed";
    }

    cleanup(now: number, retentionMs: number): number {
        // TODO: delete inbox rows older than the retention window and return how many were deleted
        return 0;
    }
}
// ------------------------------------------------------------ building blocks (do not change)
type InboxRow = { processedAt: number };
type Tables = { inbox: Map<string, InboxRow>; counters: Map<string, number> };
type Message = { id: string; key: string; payload: { courseId: string; userId: string }; offset: number };
type CrashPoint = "beforeCommit" | "afterCommit";

/** The process died (scripted by the test). Learner code must let it propagate. */
class Crash extends Error {}

class FakeDb {
    private tables: Tables = { inbox: new Map(), counters: new Map() };
    /** scripted: the process dies around the commit of the transaction that changes counters */
    crashAt: CrashPoint | null = null;
    dead = false;

    /** Runs fn on a copy of the tables and commits the copy only if fn returns without throwing. */
    tx<T>(fn: (t: Tables) => T): T {
        if (this.dead) throw new Crash("process is down");
        const copy: Tables = {
            inbox: new Map([...this.tables.inbox].map(([id, row]) => [id, { ...row }])),
            counters: new Map(this.tables.counters),
        };
        const result = fn(copy);
        if (this.dead) throw new Crash("process is down");
        const changesEffect = JSON.stringify([...copy.counters]) !== JSON.stringify([...this.tables.counters]);
        if (changesEffect && this.crashAt === "beforeCommit") {
            this.dead = true;
            throw new Crash("crashed before commit");
        }
        this.tables = copy;
        if (changesEffect && this.crashAt === "afterCommit") {
            this.dead = true;
            throw new Crash("crashed after commit, before ack");
        }
        return result;
    }

    counters(): [string, number][] {
        return [...this.tables.counters].sort(([a], [b]) => (a < b ? -1 : 1));
    }

    inboxSize(): number {
        return this.tables.inbox.size;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: list of steps.
//   { "deliver": { "id": "m1", "courseId": "sql-101", "userId": "u1" }, "crash"?: "beforeCommit" | "afterCommit" }
//   { "advance": ms }            moves the fake clock
//   { "cleanup": retentionMs }   calls consumer.cleanup(now, retentionMs)
// A delivery is acked when handle returns and the process did not crash; a crash starts a new consumer.
type Step = {
    deliver?: { id: string; courseId: string; userId: string };
    crash?: CrashPoint;
    advance?: number;
    cleanup?: number;
};

function main(): void {
    const steps: Step[] = JSON.parse(readFileSync(0, "utf8"));
    const db = new FakeDb();
    const out: string[] = [];
    let now = 0;
    let consumer = new InboxConsumer(db);
    steps.forEach((step, offset) => {
        if (step.advance !== undefined) now += step.advance;
        if (step.cleanup !== undefined) {
            try {
                out.push(`t=${now} cleanup removed ${consumer.cleanup(now, step.cleanup)}`);
            } catch (error) {
                out.push(`t=${now} cleanup error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        if (!step.deliver) return;
        const d = step.deliver;
        const msg: Message = { id: d.id, key: d.userId, payload: { courseId: d.courseId, userId: d.userId }, offset };
        db.crashAt = step.crash ?? null;
        let result = "";
        try {
            result = `${consumer.handle(msg, now)}, acked`;
        } catch (error) {
            if (!db.dead) result = `error: ${error instanceof Error ? error.message : String(error)}, not acked`;
        }
        if (db.dead) {
            result = `crashed ${step.crash === "beforeCommit" ? "before commit" : "after commit"}, not acked`;
            db.dead = false;
            consumer = new InboxConsumer(db); // the process restarts
        }
        db.crashAt = null;
        out.push(`t=${now} ${d.id || "(no id)"} ${d.courseId || "(no course)"}: ${result}`);
    });
    out.push(`counters: ${db.counters().map(([course, n]) => `${course}=${n}`).join(" ") || "(none)"}`);
    out.push(`inbox: ${db.inboxSize()} rows`);
    console.log(out.join("\n"));
}
main();
