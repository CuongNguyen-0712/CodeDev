import { readFileSync } from "node:fs";

// DB Commit Succeeded, Publish Failed. On Tuesday, during a 3-minute broker failover, 37 learners
// were enrolled (their rows are in the database and they got 201 Created) but the certificate
// service never received enrollment.created for them: no welcome email, no "Enrolled" badge.
// enroll() commits the enrollment, then publishes the event; the publish timed out, the error was
// logged and swallowed. A crash between the commit and the publish loses the event the same way.
//
// Fix the enrollment service so that every committed enrollment eventually produces exactly one
// enrollment.created event, and no event ever exists for an enrollment that was not committed:
//   - enroll() writes the enrollment AND an outbox row in the same db.tx(), and does not publish;
//   - relayOnce() (the scheduler calls it every second) publishes the pending outbox rows in the
//     order they were written and marks a row sent only after its publish returned.
// The certificate service deduplicates by message id, so a row published twice with the same id
// counts once. The broker, the database, the crash points and the test runner must not change.

// ------------------------------------------------------------------ types
type Course = { id: string; title: string; seats: number };
type Enrollment = { id: string; userId: string; courseId: string; status: "active"; createdAt: string };
type OutboxRow = {
    id: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: string;
    status: "pending" | "sent";
    sentAt: string | null;
};
type Tables = { courses: Map<string, Course>; enrollments: Map<string, Enrollment>; outbox: Map<string, OutboxRow> };
type Message = { id: string; key: string; type: string; payload: Record<string, unknown> };
type EnrollCommand = { userId: string; courseId: string };
type Deps = { db: FakeDb; broker: FakeBroker; ids: Ids; clock: Clock; log: (line: string) => void };

/** A business rule refused the command; the transaction rolls back and the client gets 4xx. */
class Rejected extends Error {}

const TOPIC = "enrollments";

// ------------------------------------------------------------------ enrollment service (fix this)
function createEnrollmentService({ db, broker, ids, clock, log }: Deps) {
    return {
        /** POST /enrollments. Returns the enrollment id; throws Rejected for a business rule. */
        enroll(cmd: EnrollCommand): string {
            const enrollment = db.tx((t) => {
                if (!t.courses.has(cmd.courseId)) throw new Rejected("unknown course");
                for (const e of t.enrollments.values()) {
                    if (e.userId === cmd.userId && e.courseId === cmd.courseId) throw new Rejected("already enrolled");
                }
                const row: Enrollment = {
                    id: ids.next("enr"),
                    userId: cmd.userId,
                    courseId: cmd.courseId,
                    status: "active",
                    createdAt: clock.now(),
                };
                t.enrollments.set(row.id, row);
                broker.publish(TOPIC, {
                    id: ids.next("evt"),
                    key: row.id,
                    type: "enrollment.created",
                    payload: { enrollmentId: row.id, userId: row.userId, courseId: row.courseId },
                });
                return row;
            });


            return enrollment.id;
        },

        /** The scheduler calls this every second. */
        relayOnce(): void {
            // Nothing to relay: enroll() publishes directly.
        },
    };
}

// ------------------------------------------------------------------ database, broker, crashes (do not change)
/** The process died at a scripted crash point. Never catch it: the runner restarts the service. */
class Crash extends Error {}
/** The broker did not accept the message (failover in progress). Nothing was delivered. */
class BrokerTimeout extends Error {}

type CrashPoint = "beforeCommit" | "afterCommit" | "afterPublish";
// The crash point of the current step fires the first time the process reaches it. Once the
// process is dead every database and broker call throws Crash, even if a catch swallowed the first one.
const faults = { crashAt: null as CrashPoint | null, dead: false, point: "", brokerUp: true };

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
    return { courses: copy(t.courses), enrollments: copy(t.enrollments), outbox: copy(t.outbox) };
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

class FakeBroker {
    /** Every message the broker accepted, in offset order (the topic log). */
    readonly log: (Message & { topic: string; offset: number })[] = [];
    publish(topic: string, message: Message): void {
        if (faults.dead) throw new Crash("the process is dead");
        if (!faults.brokerUp) throw new BrokerTimeout(`publish to ${topic} timed out after 5000 ms (leader election in progress)`);
        this.log.push({ ...(JSON.parse(JSON.stringify(message)) as Message), topic, offset: this.log.length });
        reach("afterPublish");
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

/** Fake clock: one second per step of the test. */
class Clock {
    seconds = 0;
    now(): string {
        return new Date(Date.UTC(2026, 9, 27, 14, 0, 0) + this.seconds * 1000).toISOString();
    }
}

// ------------------------------------------------------------------ test runner (do not change)
// Input: { courses, steps }. A step is { op: "enroll", userId, courseId, crash? }, { op: "relay", crash? }
// or { op: "broker", up }. "crash" is "beforeCommit", "afterCommit" or "afterPublish": the process dies
// the first time it reaches that point during the step, and the runner restarts the service.
// Output: what each enroll request answered, then, after a final restart with the broker up and three
// relay ticks, what the certificate service received (deduplicated by message id) per enrollment.
type Step =
    | { op: "enroll"; userId: string; courseId: string; crash?: CrashPoint }
    | { op: "relay"; crash?: CrashPoint }
    | { op: "broker"; up: boolean };

function main(): void {
    const input: { courses: Course[]; steps: Step[] } = JSON.parse(readFileSync(0, "utf8"));
    const db = new FakeDb({ courses: new Map(input.courses.map((c) => [c.id, c])), enrollments: new Map(), outbox: new Map() });
    const broker = new FakeBroker();
    const clock = new Clock();
    const deps: Deps = { db, broker, ids: new Ids(), clock, log: () => {} };
    let service = createEnrollmentService(deps);
    const restart = (): void => {
        faults.dead = false;
        faults.crashAt = null;
        service = createEnrollmentService(deps);
    };

    for (const step of input.steps) {
        clock.seconds++;
        if (step.op === "broker") {
            faults.brokerUp = step.up;
            continue;
        }
        faults.crashAt = step.crash ?? null;
        let answer = "201 Created";
        try {
            if (step.op === "enroll") service.enroll({ userId: step.userId, courseId: step.courseId });
            else service.relayOnce();
        } catch (err) {
            if (err instanceof Rejected) answer = `409 rejected (${err.message})`;
            else if (err instanceof BrokerTimeout) answer = "500 broker timeout";
            else if (!(err instanceof Crash)) answer = `500 ${(err as Error).message}`;
        }
        if (faults.dead) {
            answer = `no response (process crashed ${faults.point})`;
            restart();
        }
        faults.crashAt = null;
        if (step.op === "enroll") console.log(`enroll ${step.userId}/${step.courseId}: ${answer}`);
    }

    restart();
    faults.brokerUp = true;
    for (let tick = 0; tick < 3; tick++) {
        clock.seconds++;
        try {
            service.relayOnce();
        } catch {
            // the scheduler logs the error and tries again on the next tick
        }
    }

    // The certificate service: it reads the topic and ignores a message id it has already processed.
    const seen = new Set<string>();
    const received: Message[] = [];
    for (const m of broker.log) {
        if (m.topic !== TOPIC || seen.has(m.id)) continue;
        seen.add(m.id);
        received.push(m);
    }
    const state = db.inspect();
    const belongs = (m: Message, e: Enrollment): boolean =>
        m.type === "enrollment.created" && m.key === e.id &&
        m.payload.enrollmentId === e.id && m.payload.userId === e.userId && m.payload.courseId === e.courseId;
    console.log("--- after a restart and 3 relay ticks with the broker up");
    for (const e of state.enrollments.values()) {
        const n = received.filter((m) => belongs(m, e)).length;
        console.log(`${e.userId}/${e.courseId}: ${n} event${n === 1 ? "" : "s"}${n === 0 ? " (missing)" : n > 1 ? " (duplicate)" : ""}`);
    }
    const orphans = received.filter((m) => ![...state.enrollments.values()].some((e) => belongs(m, e))).length;
    console.log(`events for no committed enrollment: ${orphans}`);
    console.log(`outbox rows still pending: ${[...state.outbox.values()].filter((r) => r.status === "pending").length}`);
}

main();
