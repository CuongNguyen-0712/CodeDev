import { readFileSync } from "node:fs";

// Spot the AI Mistake: a consumer that adds points twice. The request sent to an AI coding assistant was:
//   "Write a consumer that adds the points from `points.awarded` events to the wallet balance."
// The assistant wrote WalletConsumer below. It validates the payload, changes the balance inside a
// transaction, and its unit tests (one delivery per event) pass, so the pull request was merged.
//
// On Monday a deploy restarted the wallet consumers and the consumer group rebalanced. Messages
// that had been processed but not yet acked were delivered again to the new owner of the partition,
// and support received tickets: "my points doubled". The leaderboard reads these balances.
//
// Fix WalletConsumer so that every points.awarded event changes the balance exactly once, however
// many times and in whatever order it is delivered, across crashes and restarts:
//   - handle(msg) returns "applied" the first time an event id changes a balance, "duplicate" for
//     an event id that already changed it (no change), and "invalid" (no change) when msg.id or
//     payload.userId is not a non-empty string or payload.amount is not a positive integer;
//   - two different events with the same user and amount are two awards: both are applied;
//   - the runner may crash the process just before or just after the transaction that changes
//     wallets commits; a new WalletConsumer then takes over the same database.
// The schema already has processed_events (event id -> processedAt) and points_ledger (event id ->
// { userId, amount }) tables. Record the event id in the same transaction as the balance change;
// either table works. The runner prints what handle returns and the balances, nothing else.
// Never catch Crash. Do not change the building blocks or the test runner.

type Outcome = "applied" | "duplicate" | "invalid";

class WalletConsumer {
    private db: FakeDb;

    constructor(db: FakeDb) {
        this.db = db;
    }

    /** Adds the points of one points.awarded event to the user's wallet. */
    handle(msg: Message): Outcome {
        const { userId, amount } = msg.payload;
        if (typeof userId !== "string" || userId === "" || !Number.isInteger(amount) || amount <= 0) {
            return "invalid";
        }
        this.db.tx((t) => {
            const balance = t.wallets.get(userId) ?? 0;
            t.wallets.set(userId, balance + amount);
        });
        return "applied";
    }
}
// ------------------------------------------------------------ building blocks (do not change)
type LedgerRow = { userId: string; amount: number };
type Tables = {
    wallets: Map<string, number>;
    processed_events: Map<string, number>;
    points_ledger: Map<string, LedgerRow>;
};
type Message = { id: string; key: string; payload: { userId: string; amount: number }; offset: number };
type CrashPoint = "beforeCommit" | "afterCommit";

/** The process died (scripted by the test). Learner code must let it propagate. */
class Crash extends Error {}

const clock = { now: 0 };

class FakeDb {
    private tables: Tables = { wallets: new Map(), processed_events: new Map(), points_ledger: new Map() };
    /** scripted: the process dies around the commit of the transaction that changes wallets */
    crashAt: CrashPoint | null = null;
    dead = false;

    /** Runs fn on a copy of the tables and commits the copy only if fn returns without throwing. */
    tx<T>(fn: (t: Tables) => T): T {
        if (this.dead) throw new Crash("process is down");
        const copy: Tables = {
            wallets: new Map(this.tables.wallets),
            processed_events: new Map(this.tables.processed_events),
            points_ledger: new Map([...this.tables.points_ledger].map(([id, row]) => [id, { ...row }])),
        };
        const result = fn(copy);
        if (this.dead) throw new Crash("process is down");
        const changesWallets = JSON.stringify([...copy.wallets]) !== JSON.stringify([...this.tables.wallets]);
        if (changesWallets && this.crashAt === "beforeCommit") {
            this.dead = true;
            throw new Crash("crashed before commit");
        }
        this.tables = copy;
        if (changesWallets && this.crashAt === "afterCommit") {
            this.dead = true;
            throw new Crash("crashed after commit, before ack");
        }
        return result;
    }

    wallets(): [string, number][] {
        return [...this.tables.wallets].sort(([a], [b]) => (a < b ? -1 : 1));
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: list of steps.
//   { "deliver": { "id": "p1", "userId": "u1", "amount": 50 }, "crash"?: "beforeCommit" | "afterCommit" }
//   { "rebalance": true }   the partition moves to a new WalletConsumer (unacked messages come again later)
// A delivery is acked when handle returns and the process did not crash; a crash starts a new consumer.
// The offset of a message is fixed the first time its id is delivered (a redelivery keeps it).
type Step = {
    deliver?: { id: string; userId: string; amount: number };
    crash?: CrashPoint;
    rebalance?: boolean;
};

function main(): void {
    const steps: Step[] = JSON.parse(readFileSync(0, "utf8"));
    const db = new FakeDb();
    const out: string[] = [];
    const offsets = new Map<string, number>();
    let consumer = new WalletConsumer(db);
    for (const step of steps) {
        clock.now += 1000;
        if (step.rebalance) {
            consumer = new WalletConsumer(db);
            out.push("rebalance: partition assigned to a new consumer");
        }
        if (!step.deliver) continue;
        const d = step.deliver;
        if (!offsets.has(d.id)) offsets.set(d.id, offsets.size);
        const msg: Message = { id: d.id, key: d.userId, payload: { userId: d.userId, amount: d.amount }, offset: offsets.get(d.id)! };
        db.crashAt = step.crash ?? null;
        let result = "";
        try {
            result = `${consumer.handle(msg)}, acked`;
        } catch (error) {
            if (!db.dead) result = `error: ${error instanceof Error ? error.message : String(error)}, not acked`;
        }
        if (db.dead) {
            result = `crashed ${step.crash === "beforeCommit" ? "before commit" : "after commit"}, not acked`;
            db.dead = false;
            consumer = new WalletConsumer(db); // the process restarts
        }
        db.crashAt = null;
        out.push(`${d.id || "(no id)"} ${d.userId || "(no user)"} +${d.amount}: ${result}`);
    }
    out.push(`wallets: ${db.wallets().map(([user, balance]) => `${user}=${balance}`).join(" ") || "(none)"}`);
    console.log(out.join("\n"));
}
main();
