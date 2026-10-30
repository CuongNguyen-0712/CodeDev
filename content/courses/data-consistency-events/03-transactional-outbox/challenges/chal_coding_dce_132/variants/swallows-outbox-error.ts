import { readFileSync } from "node:fs";

// CodeDev premium purchase: a learner pays for a course with reward points.
//
// buyCourse(db, cmd) must make the purchase and record its events in ONE transaction, so that a
// failure anywhere (a lost connection, a constraint, a crash) leaves either everything or nothing.
//
// Inside db.transaction((tx) => ...), in this order of checks:
//   1. course = tx.getCourse(cmd.courseId), user = tx.getUser(cmd.userId):
//      either missing                     -> return { status: "not_found" }                  (no writes)
//   2. tx.findEnrollment(userId, courseId) exists
//                                          -> return { status: "already_enrolled", enrollmentId } (no writes)
//   3. user.points < course.pricePoints    -> return { status: "insufficient_points", balance: user.points } (no writes)
//   4. otherwise:
//      - tx.setUserPoints(userId, user.points - price)   (returns the user row with version + 1)
//      - tx.insertEnrollment({ userId, courseId, purchaseId, enrolledAt: cmd.at })
//      - tx.insertOutbox(...) for PointsDebited, then tx.insertOutbox(...) for EnrollmentCreated
//      - return { status: "enrolled", enrollmentId, balance: <points after the debit> }
//
// Each outbox row: { eventId, topic, payload: <the DomainEvent>, createdAt: cmd.at }
//   PointsDebited     eventId `${purchaseId}:PointsDebited`, topic "points",
//                     aggregateId `user-${userId}`, seq = the user's version after the debit,
//                     payload { userId, purchaseId, amount: price, balance: <points after> }
//   EnrollmentCreated eventId `${purchaseId}:EnrollmentCreated`, topic "enrollments",
//                     aggregateId `enrollment-${enrollmentId}`, seq 1,
//                     payload { enrollmentId, userId, courseId, purchaseId }
//
// Do not catch errors: let them leave the transaction so it rolls back (the runner reports them).
// The types and the Tx API are in the runner section below.

function buyCourse(db: Db, cmd: BuyCommand): BuyResult {
    return db.transaction((tx) => {
        const course = tx.getCourse(cmd.courseId);
        const user = tx.getUser(cmd.userId);
        if (!course || !user) return { status: "not_found" };

        const existing = tx.findEnrollment(cmd.userId, cmd.courseId);
        if (existing) return { status: "already_enrolled", enrollmentId: existing.id };

        const price = course.pricePoints;
        if (user.points < price) return { status: "insufficient_points", balance: user.points };

        const debited = tx.setUserPoints(user.id, user.points - price);
        const enrollment = tx.insertEnrollment({
            userId: cmd.userId, courseId: cmd.courseId, purchaseId: cmd.purchaseId, enrolledAt: cmd.at,
        });

        const pointsDebited: DomainEvent = {
            eventId: `${cmd.purchaseId}:PointsDebited`,
            aggregateId: `user-${user.id}`,
            seq: debited.version,
            type: "PointsDebited",
            payload: { userId: user.id, purchaseId: cmd.purchaseId, amount: price, balance: debited.points },
        };
        const enrollmentCreated: DomainEvent = {
            eventId: `${cmd.purchaseId}:EnrollmentCreated`,
            aggregateId: `enrollment-${enrollment.id}`,
            seq: 1,
            type: "EnrollmentCreated",
            payload: { enrollmentId: enrollment.id, userId: cmd.userId, courseId: cmd.courseId, purchaseId: cmd.purchaseId },
        };
        try {
            tx.insertOutbox({ eventId: pointsDebited.eventId, topic: "points", payload: pointsDebited, createdAt: cmd.at });
            tx.insertOutbox({ eventId: enrollmentCreated.eventId, topic: "enrollments", payload: enrollmentCreated, createdAt: cmd.at });
        } catch (error) {
            // events are not critical: do not fail the purchase because of them
            console.error("outbox write failed", error);
        }

        return { status: "enrolled", enrollmentId: enrollment.id, balance: debited.points };
    });
}

// ---------------------------------------------------------------- test runner (do not change)
type DomainEvent = { eventId: string; aggregateId: string; seq: number; type: string; payload: Record<string, unknown> };
type OutboxRow = { id: number; eventId: string; topic: string; payload: Record<string, unknown>; createdAt: number; sentAt: number | null };
type User = { id: number; points: number; version: number };
type Course = { id: number; title: string; pricePoints: number };
type Enrollment = { id: number; userId: number; courseId: number; purchaseId: string; enrolledAt: number };
type BuyCommand = { purchaseId: string; userId: number; courseId: number; at: number };
type BuyResult = { status: string; enrollmentId?: number; balance?: number };

// Every read and write goes through a transaction: there is no autocommit API.
interface Tx {
    getCourse(courseId: number): Course | undefined;
    getUser(userId: number): User | undefined;
    findEnrollment(userId: number, courseId: number): Enrollment | undefined;
    setUserPoints(userId: number, points: number): User; // CHECK points >= 0; version + 1; returns the new row
    insertEnrollment(row: Omit<Enrollment, "id">): Enrollment; // UNIQUE (userId, courseId); assigns id
    insertOutbox(row: { eventId: string; topic: string; payload: Record<string, unknown>; createdAt: number }): OutboxRow; // UNIQUE eventId
}
interface Db {
    // Runs fn on a private copy of the data. fn returns -> COMMIT (all writes become durable at once).
    // fn throws -> ROLLBACK (every write of fn is discarded) and the error is rethrown.
    transaction<T>(fn: (tx: Tx) => T): T;
}

type Fault = { op: string; nth?: number };
type Step = BuyCommand & { fail?: Fault; crashAfterCommit?: boolean };
type Input = { users: User[]; courses: Course[]; enrollments?: Enrollment[]; steps: Step[] };
type State = { users: User[]; enrollments: Enrollment[]; outbox: OutboxRow[]; nextEnrollmentId: number; nextOutboxId: number };

class Crash extends Error {}

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const startEnrollments = input.enrollments ?? [];
// Simplification: ids live in the state, so a rolled-back insert gives its id back.
// (A PostgreSQL sequence would not: nextval() is never rolled back.)
let state: State = {
    users: clone(input.users),
    enrollments: clone(startEnrollments),
    outbox: [],
    nextEnrollmentId: startEnrollments.reduce((max, e) => Math.max(max, e.id), 0) + 1,
    nextOutboxId: 1,
};
let fault: Fault | undefined;
let calls: Record<string, number> = {};
let crashAfterCommit = false;
let crashed = false;
let inTransaction = false;

function hit(op: string): void {
    calls[op] = (calls[op] ?? 0) + 1;
    if (fault && fault.op === op && calls[op] === (fault.nth ?? 1)) throw new Error(`connection lost during ${op}`);
}

const db: Db = {
    transaction<T>(fn: (tx: Tx) => T): T {
        if (crashed) throw new Crash("the process is dead");
        if (inTransaction) throw new Error("nested transactions are not supported");
        const work = clone(state);
        let open = true;
        const guard = (): void => {
            if (!open) throw new Error("this transaction is already finished");
        };
        const tx: Tx = {
            getCourse: (courseId) => {
                guard();
                const course = input.courses.find((c) => c.id === courseId);
                return course ? clone(course) : undefined;
            },
            getUser: (userId) => {
                guard();
                const user = work.users.find((u) => u.id === userId);
                return user ? clone(user) : undefined;
            },
            findEnrollment: (userId, courseId) => {
                guard();
                const found = work.enrollments.find((e) => e.userId === userId && e.courseId === courseId);
                return found ? clone(found) : undefined;
            },
            setUserPoints: (userId, points) => {
                guard();
                hit("setUserPoints");
                const user = work.users.find((u) => u.id === userId);
                if (!user) throw new Error(`no user ${userId}`);
                if (points < 0) throw new Error("check constraint violated: points >= 0");
                user.points = points;
                user.version += 1;
                return clone(user);
            },
            insertEnrollment: (row) => {
                guard();
                hit("insertEnrollment");
                if (work.enrollments.some((e) => e.userId === row.userId && e.courseId === row.courseId)) {
                    throw new Error("unique violation: enrollments (userId, courseId)");
                }
                const enrollment: Enrollment = {
                    id: work.nextEnrollmentId++, userId: row.userId, courseId: row.courseId,
                    purchaseId: row.purchaseId, enrolledAt: row.enrolledAt,
                };
                work.enrollments.push(enrollment);
                return clone(enrollment);
            },
            insertOutbox: (row) => {
                guard();
                hit("insertOutbox");
                if (work.outbox.some((r) => r.eventId === row.eventId)) throw new Error("unique violation: outbox (eventId)");
                const outboxRow: OutboxRow = {
                    id: work.nextOutboxId++, eventId: row.eventId, topic: row.topic,
                    payload: clone(row.payload), createdAt: row.createdAt, sentAt: null,
                };
                work.outbox.push(outboxRow);
                return clone(outboxRow);
            },
        };
        inTransaction = true;
        try {
            const result = fn(tx);
            state = work; // COMMIT
            if (crashAfterCommit) {
                crashed = true;
                throw new Crash("process killed right after COMMIT");
            }
            return result;
        } finally {
            open = false;
            inTransaction = false;
        }
    },
};

const results: Record<string, unknown>[] = [];
for (const step of input.steps) {
    fault = step.fail;
    calls = {};
    crashAfterCommit = step.crashAfterCommit === true;
    crashed = false;
    const cmd: BuyCommand = { purchaseId: step.purchaseId, userId: step.userId, courseId: step.courseId, at: step.at };
    try {
        const result = buyCourse(db, cmd);
        results.push(crashed ? { purchaseId: cmd.purchaseId, status: "crashed" } : { purchaseId: cmd.purchaseId, ...result });
    } catch (error) {
        results.push(crashed
            ? { purchaseId: cmd.purchaseId, status: "crashed" }
            : { purchaseId: cmd.purchaseId, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
}
console.log(JSON.stringify({ results, users: state.users, enrollments: state.enrollments, outbox: state.outbox }));
