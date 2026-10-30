import { readFileSync } from "node:fs";

// CodeDev progress consumer: it reads LessonCompleted events from the broker and keeps two things
// in PostgreSQL up to date: enrollment_progress (completed lessons per enrollment) and certificates.
//
// The broker delivers at least once: after a lost ack, a consumer restart or a rebalance, the same
// event (same eventId) comes back. Today every delivery adds 1, so a redelivered lesson pushes the
// counter up and learners get a certificate before they have finished the course.
//
// Write handleLessonCompleted(db, event) as an idempotent consumer with an inbox table:
//   - event.aggregateId is the enrollment id, event.payload.totalLessons the number of lessons
//     of that course;
//   - do ALL of the following inside ONE db.transaction(...):
//       * record event.eventId in the inbox; if it is already there, this is a duplicate:
//         change nothing and return "duplicate";
//       * otherwise add 1 to the completed lessons of the enrollment (an unknown enrollment has 0);
//       * when the new count reaches totalLessons, issue the certificate of that enrollment;
//       * return "applied".
//   - the process can crash at any write: db.transaction keeps all of its writes or none of them,
//     two separate transactions do not. A crashed delivery is not acked, so it is delivered again.
//
// Use only the transaction you are given (tx). Do not keep your own Set or Map of eventIds:
// a restarted consumer starts with nothing but what is in the database.

type DomainEvent = { eventId: string; aggregateId: string; seq: number; type: string; payload: Record<string, unknown> };

interface ProgressTx {
    /** SELECT 1 FROM inbox WHERE event_id = $1 */
    hasInbox(eventId: string): boolean;
    /** INSERT INTO inbox (event_id) VALUES ($1) ON CONFLICT DO NOTHING - true if inserted, false if already there */
    insertInbox(eventId: string): boolean;
    /** completed lessons of the enrollment, 0 if it has no row yet */
    getCompleted(enrollmentId: string): number;
    setCompleted(enrollmentId: string, completed: number): void;
    issueCertificate(enrollmentId: string): void;
}

interface ProgressDb {
    /** Runs fn in one transaction: commits every write if fn returns, rolls all of them back if it throws. */
    transaction<T>(fn: (tx: ProgressTx) => T): T;
}

function handleLessonCompleted(db: ProgressDb, event: DomainEvent): "applied" | "duplicate" {
    // TODO: one transaction - inbox row, then the effect; skip duplicates.
    return "applied";
}

// ---------------------------------------------------------------- test runner (do not change)
class Crash extends Error {}
type Delivery = { event: DomainEvent; crashAtWrite?: number; crashBeforeAck?: boolean };
type State = { inbox: Set<string>; completed: Map<string, number>; certificates: string[] };

let durable: State = { inbox: new Set(), completed: new Map(), certificates: [] };
let writes = 0;
let crashAtWrite = 0;

function write(): void {
    writes++;
    if (crashAtWrite > 0 && writes === crashAtWrite) throw new Crash("process crashed during a write");
}

const db: ProgressDb = {
    transaction<T>(fn: (tx: ProgressTx) => T): T {
        const work: State = { inbox: new Set(durable.inbox), completed: new Map(durable.completed), certificates: [...durable.certificates] };
        const tx: ProgressTx = {
            hasInbox: (eventId) => work.inbox.has(eventId),
            insertInbox: (eventId) => {
                write();
                if (work.inbox.has(eventId)) return false;
                work.inbox.add(eventId);
                return true;
            },
            getCompleted: (enrollmentId) => work.completed.get(enrollmentId) ?? 0,
            setCompleted: (enrollmentId, completed) => {
                write();
                work.completed.set(enrollmentId, completed);
            },
            issueCertificate: (enrollmentId) => {
                write();
                work.certificates.push(enrollmentId);
            },
        };
        const result = fn(tx); // throws -> work is dropped: nothing reaches durable
        durable = work;
        return result;
    },
};

const script: { deliveries: Delivery[] } = JSON.parse(readFileSync(0, "utf8"));
const results: string[] = [];
try {
    for (const delivery of script.deliveries) {
        let attempt = 0;
        for (;;) {
            attempt++;
            writes = 0;
            crashAtWrite = attempt === 1 ? (delivery.crashAtWrite ?? 0) : 0;
            try {
                const result = handleLessonCompleted(db, delivery.event);
                results.push(result);
                if (attempt === 1 && delivery.crashBeforeAck) {
                    results.push("crash"); // committed, but the process died before the ack
                    continue;
                }
                break; // ack
            } catch (error) {
                if (!(error instanceof Crash)) throw error;
                results.push("crash"); // no ack: the broker delivers the event again after the restart
            }
        }
    }
    const completed: Record<string, number> = {};
    for (const key of [...durable.completed.keys()].sort()) completed[key] = durable.completed.get(key) ?? 0;
    console.log(JSON.stringify({ results, completed, certificates: [...durable.certificates].sort(), inbox: durable.inbox.size }));
} catch (error) {
    console.log(JSON.stringify({ error: String(error) }));
}
