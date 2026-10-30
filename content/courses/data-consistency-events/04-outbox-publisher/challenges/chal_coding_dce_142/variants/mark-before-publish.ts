import { readFileSync } from "node:fs";

// CodeDev premium purchases write an outbox row in the same transaction as the points debit and the
// enrollment. This relay is the other half: it moves those rows to the message broker.
//
// Write OutboxRelay.tick(), one polling pass:
//   1. In a transaction, read the outbox and take the unsent rows (sentAt === null) in id order, at most
//      batchSize of them. tx.selectOutbox() returns copies of every row in storage order, like
//      SELECT * FROM outbox without ORDER BY: storage order is not id order.
//   2. Publish them one by one, in that order:
//      broker.publish(row.topic, { eventId: row.eventId, payload: row.payload }).
//      publish returns once the broker has acknowledged the message, or throws BrokerError.
//   3. Only after publish returned, mark that row in its own transaction: tx.markSent(row.id, clock.now()).
//      markSent returns 1 when it changed the row, 0 when the row was already marked.
//   4. On BrokerError, stop the pass at once: do not mark that row and do not publish any later row, so the
//      next pass starts again from the oldest unsent row and the order of events is kept.
//   5. Return how many rows this pass marked as sent.
// Any other error (the runner's Crash, for example) must propagate: the process is dying.
//
// After a crash the runner throws the relay away and creates a new one: nothing kept in memory survives a
// restart, only committed rows and messages the broker acknowledged. A row that was published but not marked
// before a crash is published again (at-least-once; consumers deduplicate by eventId). A row must never be
// marked sent without having been published.

type OutboxRow = {
    id: number;
    eventId: string;
    topic: string;
    payload: Record<string, unknown>;
    createdAt: number;
    sentAt: number | null;
};

interface Tx {
    /** SELECT * FROM outbox: copies of every row, in storage order (no ORDER BY). */
    selectOutbox(): OutboxRow[];
    /** UPDATE outbox SET sent_at = $2 WHERE id = $1 AND sent_at IS NULL; returns the number of rows changed. */
    markSent(id: number, sentAt: number): number;
}

interface Db {
    /** Runs fn in one transaction: all of its writes are committed, or none if fn throws. */
    transaction<T>(fn: (tx: Tx) => T): T;
}

interface Broker {
    /** Returns after the broker acknowledged the message; throws BrokerError when it did not. */
    publish(topic: string, message: { eventId: string; payload: Record<string, unknown> }): void;
}

interface Clock {
    now(): number;
}

class OutboxRelay {
    private readonly db: Db;
    private readonly broker: Broker;
    private readonly clock: Clock;
    private readonly batchSize: number;

    constructor(db: Db, broker: Broker, clock: Clock, batchSize: number) {
        this.db = db;
        this.broker = broker;
        this.clock = clock;
        this.batchSize = batchSize;
    }

    /** One polling pass. Returns how many rows this pass marked as sent. */
    tick(): number {
        const batch = this.db.transaction((tx) =>
            tx.selectOutbox()
                .filter((row) => row.sentAt === null)
                .sort((a, b) => a.id - b.id)
                .slice(0, this.batchSize));
        let marked = 0;
        for (const row of batch) {
            // claim the row first so no other pass picks it up again
            marked += this.db.transaction((tx) => tx.markSent(row.id, this.clock.now()));
            try {
                this.broker.publish(row.topic, { eventId: row.eventId, payload: row.payload });
            } catch (error) {
                if (error instanceof BrokerError) break;
                throw error;
            }
        }
        return marked;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { batchSize, outbox: [[id, eventId, sentAt], ...] in storage order, steps: ["tick" | { insert: [...] }],
//          broker: { "<publish attempt>": "fail" | "crashBefore" | "crashAfterAck" }, crashAfterMark: [<markSent call>] }
// Publish attempts and markSent calls are counted from 1 over the whole test, across restarts.
// "crashAfterAck": the broker stores the message, then the process dies before publish returns.
// crashAfterMark: the transaction with that markSent call commits, then the process dies.
// Output: { ticks: [marked count | "crash", ...], published: [eventId, ...], outbox: [[id, sentAt], ...] by id }
class BrokerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BrokerError";
    }
}

class Crash extends Error {
    constructor(message: string) {
        super(message);
        this.name = "Crash";
    }
}

type RowInput = [number, string, number | null];
type Step = "tick" | { insert: RowInput[] };
type Case = {
    batchSize: number;
    outbox: RowInput[];
    steps: Step[];
    broker?: Record<string, "fail" | "crashBefore" | "crashAfterAck">;
    crashAfterMark?: number[];
};

const input: Case = JSON.parse(readFileSync(0, "utf8"));
const toRow = ([id, eventId, sentAt]: RowInput): OutboxRow => ({
    id, eventId, topic: "purchases", payload: { outboxId: id, type: "CoursePurchased" }, createdAt: id * 10, sentAt,
});
let table: OutboxRow[] = input.outbox.map(toRow);
const published: string[] = [];
const crashAfterMark = new Set(input.crashAfterMark ?? []);
let publishAttempts = 0;
let markCalls = 0;
let time = 0;

type Life = { dead: boolean };
const die = (life: Life, why: string): never => {
    life.dead = true;
    throw new Crash(why);
};
const alive = (life: Life): void => {
    if (life.dead) throw new Crash("the process is dead");
};

function makeDb(life: Life): Db {
    return {
        transaction<T>(fn: (tx: Tx) => T): T {
            alive(life);
            const snapshot: OutboxRow[] = structuredClone(table);
            let crashOnCommit = false;
            const tx: Tx = {
                selectOutbox: () => structuredClone(table),
                markSent: (id: number, sentAt: number): number => {
                    markCalls++;
                    if (crashAfterMark.has(markCalls)) crashOnCommit = true;
                    const row = table.find((r) => r.id === id);
                    if (!row || row.sentAt !== null) return 0;
                    row.sentAt = sentAt;
                    return 1;
                },
            };
            let result: T;
            try {
                result = fn(tx);
            } catch (error) {
                table = snapshot;
                throw error;
            }
            if (crashOnCommit) die(life, `crash after the commit of markSent call ${markCalls}`);
            return result;
        },
    };
}

function makeBroker(life: Life): Broker {
    return {
        publish(topic: string, message: { eventId: string; payload: Record<string, unknown> }): void {
            alive(life);
            publishAttempts++;
            const action = input.broker?.[String(publishAttempts)];
            if (action === "fail") throw new BrokerError(`broker unavailable (attempt ${publishAttempts})`);
            if (action === "crashBefore") die(life, `crash before publish attempt ${publishAttempts}`);
            const row = table.find((r) => r.eventId === message.eventId);
            if (!row || topic !== row.topic || JSON.stringify(message.payload) !== JSON.stringify(row.payload)) {
                throw new Error(`publish: message ${message.eventId} does not match its outbox row`);
            }
            published.push(message.eventId);
            if (action === "crashAfterAck") die(life, `crash after the broker acked attempt ${publishAttempts}`);
        },
    };
}

const clock: Clock = { now: () => time };
const ticks: (number | string)[] = [];
let life: Life = { dead: false };
let relay = new OutboxRelay(makeDb(life), makeBroker(life), clock, input.batchSize);
for (const step of input.steps) {
    time += 1000;
    if (step !== "tick") {
        table.push(...step.insert.map(toRow));
        continue;
    }
    let outcome: number | string;
    try {
        outcome = relay.tick();
    } catch (error) {
        if (!(error instanceof Crash)) throw error;
        outcome = "crash";
    }
    if (life.dead) {
        outcome = "crash";
        life = { dead: false };
        relay = new OutboxRelay(makeDb(life), makeBroker(life), clock, input.batchSize);
    }
    ticks.push(outcome);
}
console.log(JSON.stringify({
    ticks,
    published,
    outbox: [...table].sort((a, b) => a.id - b.id).map((r) => [r.id, r.sentAt]),
}));
