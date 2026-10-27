import { readFileSync } from "node:fs";

// Outbox in the same transaction. The enrollment and wallet services of CodeDev now publish through
// a transactional outbox: a command writes its business change AND the events describing it in one
// db.tx(), and a relay (not part of this task) publishes the pending outbox rows later.
// Implement the two commands:
//
// placeEnrollment({ userId, courseId })
//   reject, in this order: "unknown user" (no wallet), "unknown course", "already enrolled", "course full"
//   writes: enrollments row { id: ids.next("enr"), userId, courseId, createdAt }, courses[courseId].enrolled + 1
//   events: enrollment.created  aggregate enrollment/<enrollment id>  payload { enrollmentId, userId, courseId }
//           course.full         aggregate course/<courseId>           payload { courseId, seats }
//           (only when this enrollment took the last seat, after enrollment.created)
//
// awardPoints({ userId, amount, reason })
//   reject, in this order: "unknown user", "invalid amount" (not an integer from 1 to 10000), "missing reason" (empty)
//   writes: wallets[userId].points + amount
//   events: points.awarded  aggregate wallet/<userId>  payload { userId, amount, reason, balance }  (balance = new points)
//           level.reached   aggregate wallet/<userId>  payload { userId, level }
//           (one per level crossed, lowest first; level = Math.floor(points / 1000))
//
// Every event is an outbox row { id: ids.next("evt"), aggregateType, aggregateId, eventType, payload,
// createdAt: clock.now(), status: "pending" }, payload keys in the order shown. Take ids only after
// validation passed: the enrollment id first, then one event id per event, in event order.
// A rejection throws new Rejected("<reason>") and writes nothing. The process may crash before or
// after the commit (the runner does that): a command is either fully committed or not at all.

// ------------------------------------------------------------------ types
type Course = { id: string; title: string; seats: number; enrolled: number };
type Enrollment = { id: string; userId: string; courseId: string; createdAt: string };
type Wallet = { userId: string; points: number };
type OutboxRow = {
    id: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: string;
    status: "pending" | "sent";
};
type Tables = {
    courses: Map<string, Course>;
    enrollments: Map<string, Enrollment>;
    wallets: Map<string, Wallet>;
    outbox: Map<string, OutboxRow>;
};
type PlaceEnrollment = { userId: string; courseId: string };
type AwardPoints = { userId: string; amount: number; reason: string };
type Deps = { db: FakeDb; ids: Ids; clock: Clock };

/** A business rule refused the command: throw it inside the transaction so nothing is written. */
class Rejected extends Error {}

// ------------------------------------------------------------------ commands (write these)
function placeEnrollment({ db, ids, clock }: Deps, cmd: PlaceEnrollment): void {
    // TODO: validate, then write the enrollment, the seat count and the outbox rows in one db.tx()
}

function awardPoints({ db, ids, clock }: Deps, cmd: AwardPoints): void {
    // TODO: validate, then write the new balance and the outbox rows in one db.tx()
}

// ------------------------------------------------------------------ database and crashes (do not change)
/** The process died at a scripted crash point. Never catch it: the runner restarts the service. */
class Crash extends Error {}

type CrashPoint = "beforeCommit" | "afterCommit";
// The crash point of the current command fires the first time the process reaches it. Once the
// process is dead every database call throws Crash, even if a catch swallowed the first one.
const faults = { crashAt: null as CrashPoint | null, dead: false, point: "" };

function reach(point: CrashPoint): void {
    if (faults.dead) throw new Crash("the process is dead");
    if (faults.crashAt !== point) return;
    faults.crashAt = null;
    faults.dead = true;
    faults.point = point;
    throw new Crash(`crash ${point}`);
}

function copyTables(t: Tables): Tables {
    const copy = <K, V>(m: Map<K, V>): Map<K, V> => new Map([...m].map(([k, v]) => [k, JSON.parse(JSON.stringify(v)) as V]));
    return { courses: copy(t.courses), enrollments: copy(t.enrollments), wallets: copy(t.wallets), outbox: copy(t.outbox) };
}

class FakeDb {
    private data: Tables;
    constructor(data: Tables) {
        this.data = data;
    }
    /** Runs fn on a copy of the tables; commits the copy only if fn returns without throwing. */
    tx<T>(fn: (t: Tables) => T): T {
        if (faults.dead) throw new Crash("the process is dead");
        const draft = copyTables(this.data);
        const result = fn(draft);
        reach("beforeCommit");
        this.data = draft;
        reach("afterCommit");
        return JSON.parse(JSON.stringify(result ?? null)) as T;
    }
    /** For the test runner only. */
    inspect(): Tables {
        return copyTables(this.data);
    }
}

/** Like a PostgreSQL sequence: one counter per prefix, a value taken by a rolled-back transaction is not reused. */
class Ids {
    private counters = new Map<string, number>();
    next(prefix: string): string {
        const n = (this.counters.get(prefix) ?? 0) + 1;
        this.counters.set(prefix, n);
        return `${prefix}_${n}`;
    }
}

/** Fake clock: one second per command; it does not move during a command. */
class Clock {
    seconds = 0;
    now(): string {
        return new Date(Date.UTC(2026, 9, 27, 9, 0, 0) + this.seconds * 1000).toISOString();
    }
}

// ------------------------------------------------------------------ test runner (do not change)
// Input: { courses: [{ id, title, seats }], wallets: [{ userId, points }], commands }. A command is
// { op: "place", userId, courseId, crash? } or { op: "award", userId, amount, reason, crash? };
// "crash" ("beforeCommit" | "afterCommit") kills the process at that point of the command.
// Output: the answer to each command, then every table in insertion order.
type Command =
    | ({ op: "place"; crash?: CrashPoint } & PlaceEnrollment)
    | ({ op: "award"; crash?: CrashPoint } & AwardPoints);

function main(): void {
    const input: { courses: { id: string; title: string; seats: number }[]; wallets: Wallet[]; commands: Command[] } =
        JSON.parse(readFileSync(0, "utf8"));
    const db = new FakeDb({
        courses: new Map(input.courses.map((c) => [c.id, { ...c, enrolled: 0 }])),
        enrollments: new Map(),
        wallets: new Map(input.wallets.map((w) => [w.userId, { ...w }])),
        outbox: new Map(),
    });
    const clock = new Clock();
    const deps: Deps = { db, ids: new Ids(), clock };

    for (const cmd of input.commands) {
        clock.seconds++;
        faults.crashAt = cmd.crash ?? null;
        let answer = "ok";
        try {
            if (cmd.op === "place") placeEnrollment(deps, { userId: cmd.userId, courseId: cmd.courseId });
            else awardPoints(deps, { userId: cmd.userId, amount: cmd.amount, reason: cmd.reason });
        } catch (err) {
            if (err instanceof Rejected) answer = `rejected (${err.message})`;
            else if (!(err instanceof Crash)) answer = `error (${(err as Error).message})`;
        }
        if (faults.dead) answer = `no response (process crashed ${faults.point})`;
        faults.dead = false;
        faults.crashAt = null;
        const what = cmd.op === "place" ? `place ${cmd.userId}/${cmd.courseId}` : `award ${cmd.userId} ${JSON.stringify(cmd.amount)}`;
        console.log(`${what}: ${answer}`);
    }

    const t = db.inspect();
    console.log("--- database");
    console.log(`courses: ${[...t.courses.values()].map((c) => `${c.id} ${c.enrolled}/${c.seats}`).join(", ")}`);
    console.log(`enrollments: ${[...t.enrollments.values()].map((e) => `${e.id} ${e.userId}/${e.courseId} ${e.createdAt}`).join(", ") || "none"}`);
    console.log(`wallets: ${[...t.wallets.values()].map((w) => `${w.userId} ${w.points}`).join(", ")}`);
    console.log(`outbox: ${t.outbox.size} row(s)`);
    for (const r of t.outbox.values()) {
        console.log(`${r.id} ${r.aggregateType}/${r.aggregateId} ${r.eventType} ${JSON.stringify(r.payload)} ${r.createdAt} ${r.status}`);
    }
}

main();
