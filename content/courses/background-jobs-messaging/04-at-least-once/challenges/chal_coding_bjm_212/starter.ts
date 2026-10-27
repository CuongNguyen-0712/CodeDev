import { readFileSync } from "node:fs";

// CodeDev certificates worker. When a learner completes a course, the API enqueues an
// "issue-certificate" job { userId, courseId }. The worker below writes the certificate row and a
// "certificate.issued" event (an outbox row: a relay sends it to the event bus after the commit, and
// the event gives the course bonus EXP and sends the certificate email).
//
// The queue delivers each job at least once. Last week a deploy stopped a worker after it had written
// the certificate but before it acknowledged the job: the job was delivered again and the learner got
// two certificates, two emails and the course bonus twice.
//
// Make handleIssueCertificate idempotent:
//   - the idempotency key is the business key "certificate:<userId>:<courseId>", not the job id: the
//     same completion can be enqueued twice under two job ids (the API retried the enqueue);
//   - when the key is already in the processed-jobs store, write nothing and return "duplicate";
//   - otherwise insert the certificate, publish the event and mark the key processed, all three in one
//     db.transaction(...), and return "issued". A crash inside a transaction rolls back all of its writes;
//     a write made outside a transaction is committed at once;
//   - a job whose userId or courseId is missing or not a non-empty string writes nothing and returns
//     "invalid" (it is acknowledged: a retry cannot fix it).
// Do not catch errors: a crash must reach the queue so the job is delivered again.
// Do not change the types or anything below the "do not change" line.

type CertificateJob = { id: string; data: { userId: string; courseId: string } };
type Outcome = "issued" | "duplicate" | "invalid";

interface Tx {
    /** SELECT 1 FROM processed_jobs WHERE key = $1 */
    hasProcessed(key: string): boolean;
    /** INSERT INTO processed_jobs (key) VALUES ($1) */
    markProcessed(key: string): void;
    /** INSERT INTO certificates (user_id, course_id, job_id) VALUES (...) */
    insertCertificate(row: { userId: string; courseId: string; jobId: string }): void;
    /** INSERT INTO outbox (type, payload) VALUES ('certificate.issued', ...) */
    publishEvent(event: { type: "certificate.issued"; userId: string; courseId: string }): void;
}
/** The same queries without a transaction (each one commits on its own), plus transaction(). */
interface Db extends Tx {
    /** BEGIN; work(tx); COMMIT. If work throws (or the worker crashes), nothing it wrote is kept. */
    transaction<T>(work: (tx: Tx) => T): T;
}

function handleIssueCertificate(job: CertificateJob, db: Db): Outcome {
    const { userId, courseId } = job.data;
    db.insertCertificate({ userId, courseId, jobId: job.id });
    db.publishEvent({ type: "certificate.issued", userId, courseId });
    return "issued";
}

// ---------------------------------------------------------------- in-memory queue and database (do not change)
// The queue delivers at least once: a delivery that is not acknowledged (the worker crashed) becomes
// visible again visibilityTimeoutMs after it was received and is delivered again. One worker takes the
// visible job that has waited longest; each delivery takes 1000 ms of fake time.
class WorkerCrash extends Error {}

type State = { processed: string[]; certificates: string[]; events: string[] };
let state: State = { processed: [], certificates: [], events: [] };
let crashAfterSideEffect = false;
let inTransaction = false;

function sideEffectDone(): void {
    if (crashAfterSideEffect) {
        crashAfterSideEffect = false;
        throw new WorkerCrash("after_side_effect");
    }
}

function queries(current: () => State): Tx {
    return {
        hasProcessed: (key) => current().processed.includes(key),
        markProcessed: (key) => {
            current().processed.push(key);
        },
        insertCertificate: (row) => {
            current().certificates.push(`${row.userId}/${row.courseId} (${row.jobId})`);
            sideEffectDone();
        },
        publishEvent: (event) => {
            current().events.push(`${event.type} ${event.userId}/${event.courseId}`);
            sideEffectDone();
        },
    };
}

const db: Db = {
    ...queries(() => state),
    transaction<T>(work: (tx: Tx) => T): T {
        if (inTransaction) throw new Error("nested transactions are not supported");
        const draft: State = {
            processed: [...state.processed],
            certificates: [...state.certificates],
            events: [...state.events],
        };
        inTransaction = true;
        try {
            const result = work(queries(() => draft));
            state = draft; // COMMIT
            return result;
        } finally {
            inTransaction = false;
        }
    },
};

type Message = { seq: number; job: CertificateJob; visibleAt: number; receives: number };
type Crash = { job: string; delivery: number; point: "after_side_effect" | "before_ack" };
type Input = {
    visibilityTimeoutMs: number;
    jobs: Array<{ id: string; data: { userId: string; courseId: string }; at?: number }>;
    crashes?: Crash[];
};

function main(): void {
    const input: Input = JSON.parse(readFileSync(0, "utf8"));
    const queue: Message[] = input.jobs.map((j, seq) => ({
        seq,
        job: { id: j.id, data: j.data },
        visibleAt: j.at ?? 0,
        receives: 0,
    }));
    const crashes = input.crashes ?? [];
    const log: string[] = [];
    let now = 0;
    while (queue.length > 0) {
        const next = [...queue].sort((a, b) => a.visibleAt - b.visibleAt || a.seq - b.seq)[0];
        now = Math.max(now, next.visibleAt);
        next.receives++;
        const receivedAt = now;
        next.visibleAt = receivedAt + input.visibilityTimeoutMs;
        const crash = crashes.find((c) => c.job === next.job.id && c.delivery === next.receives);
        crashAfterSideEffect = crash?.point === "after_side_effect";
        const label = `t=${receivedAt} ${next.job.id} #${next.receives}`;
        now += 1000;
        try {
            const outcome = handleIssueCertificate({ id: next.job.id, data: { ...next.job.data } }, db);
            if (crash?.point === "before_ack") {
                log.push(`${label}: ${outcome}, crash before ack`);
                continue;
            }
            queue.splice(queue.indexOf(next), 1); // ack
            log.push(`${label}: ${outcome}`);
        } catch (error) {
            if (!(error instanceof WorkerCrash)) throw error;
            log.push(`${label}: crash ${error.message}`);
        } finally {
            crashAfterSideEffect = false;
        }
    }
    console.log(JSON.stringify({ log, certificates: state.certificates, events: state.events }));
}
main();
