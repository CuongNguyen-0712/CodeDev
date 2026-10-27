import { readFileSync } from "node:fs";

// Outbox publisher for the CodeDev enrollments service. The service writes every event into the
// outbox table in the same transaction as the enrollment. Relay processes ("A", "B", ...) copy the
// rows to the broker. Write claimBatch and publishClaimed; the runner calls them for each step.
//
// claimBatch(db, owner, now, cfg) - one db.tx. Walk every row whose status is not "sent", in id order:
//   - skip the row if its aggregate is already blocked in this walk;
//   - block its aggregate (and skip the row) if the row is "failed", or nextAttemptAt > now, or another
//     owner holds a live lease on it (leaseOwner !== owner and leaseUntil > now);
//   - otherwise claim it while fewer than cfg.batchSize rows are claimed: leaseOwner = owner,
//     leaseUntil = now + cfg.leaseMs. Stop the walk when the batch is full.
//   Return the claimed ids in ascending order. If cfg.batchSize or cfg.leaseMs is not a positive
//   integer, throw new Error("invalid config") and claim nothing.
//
// publishClaimed(db, broker, owner, now, cfg) - read the rows with status "pending", leaseOwner === owner
// and leaseUntil > now, in id order. For each row whose aggregate is not blocked in this call:
//   - broker.publish(TOPIC, { id, key: aggregate, payload: { type } });
//   - success: in its own db.tx mark the row status "sent", sentAt = now, leaseOwner = null, leaseUntil = 0;
//   - BrokerError: in a db.tx set attempts + 1; when attempts reaches cfg.maxAttempts set status "failed",
//     otherwise nextAttemptAt = now + cfg.backoffMs * 2 ** (attempts - 1); release the lease
//     (leaseOwner = null, leaseUntil = 0) and block the aggregate for the rest of this call.
//   Finally, in one db.tx, release the lease of every row still pending with leaseOwner === owner.
//
// Never catch Crash: when the process "dies", the runner stops the step and the database refuses
// every later write of that process. Do not change the building blocks or the test runner.

const TOPIC = "enrollment-events";

type Config = { batchSize: number; leaseMs: number; backoffMs: number; maxAttempts: number };

function claimBatch(db: FakeDb, owner: string, now: number, cfg: Config): number[] {
    // TODO: one db.tx that leases up to cfg.batchSize rows for this owner, keeping per-aggregate order
    return [];
}

function publishClaimed(db: FakeDb, broker: FakeBroker, owner: string, now: number, cfg: Config): void {
    // TODO: publish the rows this owner still holds a lease on, mark each one sent after its publish,
    // back off on BrokerError, then release the leases you did not use
}
// ------------------------------------------------------------ building blocks (do not change)
type Status = "pending" | "sent" | "failed";
type OutboxRow = {
    id: number;
    aggregate: string;
    type: string;
    status: Status;
    attempts: number;
    nextAttemptAt: number;
    leaseOwner: string | null;
    leaseUntil: number;
    sentAt: number | null;
};
type Tables = { outbox: Map<number, OutboxRow> };
type Message = { id: number; key: string; payload: { type: string } };

/** The process died (scripted by the test). Learner code must let it propagate. */
class Crash extends Error {}
/** The broker refused a publish; the message was not delivered. */
class BrokerError extends Error {}

const out: string[] = [];
const clock = { now: 0 };

class FakeDb {
    private tables: Tables = { outbox: new Map() };
    /** true once the current process crashed: every transaction fails and nothing commits */
    dead = false;

    /** Runs fn on a copy of the tables and commits the copy only if fn returns without throwing. */
    tx<T>(fn: (t: Tables) => T): T {
        if (this.dead) throw new Crash("process is down");
        const copy: Tables = { outbox: new Map([...this.tables.outbox].map(([id, row]) => [id, { ...row }])) };
        const result = fn(copy);
        if (this.dead) throw new Crash("process is down");
        this.tables = copy;
        return result;
    }

    rows(): OutboxRow[] {
        return [...this.tables.outbox.values()].map((row) => ({ ...row })).sort((a, b) => a.id - b.id);
    }
}

class FakeBroker {
    /** scripted: the next N publish calls fail with BrokerError */
    failNext = 0;
    /** scripted: the process crashes right after the Nth successful publish of the step (0 = never) */
    crashAfter = 0;
    delivered = 0;
    client = "";
    private db: FakeDb;

    constructor(db: FakeDb) {
        this.db = db;
    }

    publish(topic: string, msg: Message): void {
        if (this.db.dead) throw new Crash("process is down");
        if (this.failNext > 0) {
            this.failNext--;
            out.push(`t=${clock.now} ${this.client} broker error on #${msg.id}`);
            throw new BrokerError("broker unavailable");
        }
        out.push(`t=${clock.now} ${this.client} published #${msg.id} ${msg.key} ${msg.payload.type}`);
        this.delivered++;
        if (this.delivered === this.crashAfter) {
            this.db.dead = true;
            throw new Crash("process crashed after publish, before mark");
        }
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { config, outbox: [{ aggregate, type }], steps }. Rows get ids 1, 2, 3, ... and start "pending".
// Steps: { "tick": "A" } = claimBatch then publishClaimed; { "claim": "A" }; { "publish": "A" };
// "crashAfter": N on a tick/publish step; { "advance": ms }; { "brokerFails": N }; { "insert": [...] }.
type NewRow = { aggregate: string; type: string };
type Step = {
    tick?: string;
    claim?: string;
    publish?: string;
    crashAfter?: number;
    advance?: number;
    brokerFails?: number;
    insert?: NewRow[];
};
type Input = { config: Config; outbox: NewRow[]; steps: Step[] };

function main(): void {
    const input: Input = JSON.parse(readFileSync(0, "utf8"));
    const db = new FakeDb();
    const broker = new FakeBroker(db);
    let nextId = 1;
    const insert = (rows: NewRow[]): number[] =>
        db.tx((t) =>
            rows.map((r) => {
                const id = nextId++;
                t.outbox.set(id, {
                    id, aggregate: r.aggregate, type: r.type, status: "pending", attempts: 0,
                    nextAttemptAt: 0, leaseOwner: null, leaseUntil: 0, sentAt: null,
                });
                return id;
            }),
        );
    insert(input.outbox);
    for (const step of input.steps) {
        if (step.advance !== undefined) clock.now += step.advance;
        if (step.brokerFails !== undefined) broker.failNext += step.brokerFails;
        if (step.insert) out.push(`t=${clock.now} app inserted ${insert(step.insert).map((id) => `#${id}`).join(" ")}`);
        const owner = step.tick ?? step.claim ?? step.publish;
        if (owner === undefined) continue;
        broker.client = owner;
        broker.crashAfter = step.crashAfter ?? 0;
        broker.delivered = 0;
        try {
            if (step.tick !== undefined || step.claim !== undefined) {
                const ids = claimBatch(db, owner, clock.now, input.config);
                out.push(`t=${clock.now} ${owner} claimed ${ids.length ? ids.map((id) => `#${id}`).join(" ") : "nothing"}`);
            }
            if (step.tick !== undefined || step.publish !== undefined) publishClaimed(db, broker, owner, clock.now, input.config);
        } catch (error) {
            if (!db.dead) out.push(`t=${clock.now} ${owner} error: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (db.dead) {
            out.push(`t=${clock.now} ${owner} crashed`);
            db.dead = false; // the next step is a fresh process
        }
    }
    const rows = db.rows();
    const count = (s: Status): number => rows.filter((r) => r.status === s).length;
    out.push(`outbox: ${count("sent")} sent, ${count("pending")} pending, ${count("failed")} failed`);
    for (const r of rows) {
        if (r.status === "sent") continue;
        let line = `#${r.id} ${r.aggregate} ${r.type} ${r.status} attempts=${r.attempts}`;
        if (r.status === "pending" && r.nextAttemptAt > 0) line += ` next=${r.nextAttemptAt}`;
        if (r.leaseOwner !== null) line += ` lease=${r.leaseOwner}@${r.leaseUntil}`;
        out.push(line);
    }
    console.log(out.join("\n"));
}
main();
