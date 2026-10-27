import { readFileSync } from "node:fs";

// CodeDev job tracker: every background job (grade a submission, send a certificate email,
// recompute the leaderboard, generate a course export) has one row whose state only changes
// through the events below. applyEvent(jobs, event, maxAttempts) applies ONE event:
//   - accepted: update the job in `jobs` and return null;
//   - rejected: change nothing and return the reason (exact text below).
//
// Checks, in this order (the first one that fails gives the reason):
//   1. event.type is not one of the eight types        -> "unknown event type"
//   2. a fail event whose failure is not "retryable" or "permanent" -> "invalid failure kind"
//   3. enqueue: a job with this id exists               -> "job already exists"
//      (otherwise create it: queued, 0 attempts, no worker, no failure, and accept)
//   4. any other event for a job id that does not exist -> "unknown job"
//   5. the event is not allowed in the job's state      -> "<type> not allowed when <state>"
//        start            queued, retrying
//        heartbeat        running
//        succeed          running
//        fail             running
//        timeout          running
//        cancel           queued, running, retrying
//        retry-scheduled  failed
//   6. heartbeat / succeed / fail from a worker that does not own the attempt
//                                                       -> "stale worker <workerId> (owner <owner>)"
//   7. retry-scheduled: the last failure was permanent  -> "permanent failure"
//      retry-scheduled: attempts >= maxAttempts         -> "max attempts reached"
//
// Effects of accepted events:
//   start            running, attempts + 1, workerId = event.workerId, lastFailure = null
//   heartbeat        no change
//   succeed          succeeded, workerId = null
//   fail             failed, lastFailure = event.failure, workerId = null
//   timeout          failed, lastFailure = "retryable", workerId = null (the worker lost its lease)
//   cancel           cancelled, workerId = null
//   retry-scheduled  retrying
// Do not change the types or anything below the "do not change" line.

type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "retrying";
type FailureKind = "retryable" | "permanent";

type Job = {
    id: string;
    state: JobState;
    attempts: number;
    workerId: string | null;
    lastFailure: FailureKind | null;
};

type JobEvent =
    | { type: "enqueue"; jobId: string }
    | { type: "start"; jobId: string; workerId: string }
    | { type: "heartbeat"; jobId: string; workerId: string }
    | { type: "succeed"; jobId: string; workerId: string }
    | { type: "fail"; jobId: string; workerId: string; failure: FailureKind }
    | { type: "timeout"; jobId: string }
    | { type: "cancel"; jobId: string }
    | { type: "retry-scheduled"; jobId: string };

const ALLOWED: Record<JobEvent["type"], JobState[]> = {
    enqueue: [],
    start: ["queued", "retrying"],
    heartbeat: ["running"],
    succeed: ["running"],
    fail: ["running"],
    timeout: ["running"],
    cancel: ["queued", "running", "retrying"],
    "retry-scheduled": ["failed"],
};

function applyEvent(jobs: Map<string, Job>, event: JobEvent, maxAttempts: number): string | null {
    if (!Object.prototype.hasOwnProperty.call(ALLOWED, event.type)) return "unknown event type";
    if (event.type === "fail" && event.failure !== "retryable" && event.failure !== "permanent") return "invalid failure kind";

    if (event.type === "enqueue") {
        if (jobs.has(event.jobId)) return "job already exists";
        jobs.set(event.jobId, { id: event.jobId, state: "queued", attempts: 0, workerId: null, lastFailure: null });
        return null;
    }

    const job = jobs.get(event.jobId);
    if (!job) return "unknown job";
    if (!ALLOWED[event.type].includes(job.state)) return `${event.type} not allowed when ${job.state}`;


    switch (event.type) {
        case "start":
            job.state = "running";
            job.attempts += 1;
            job.workerId = event.workerId;
            job.lastFailure = null;
            return null;
        case "heartbeat":
            return null;
        case "succeed":
            job.state = "succeeded";
            job.workerId = null;
            return null;
        case "fail":
            job.state = "failed";
            job.lastFailure = event.failure;
            job.workerId = null;
            return null;
        case "timeout":
            job.state = "failed";
            job.lastFailure = "retryable";
            job.workerId = null;
            return null;
        case "cancel":
            job.state = "cancelled";
            job.workerId = null;
            return null;
        case "retry-scheduled":
            if (job.lastFailure === "permanent") return "permanent failure";
            if (job.attempts >= maxAttempts) return "max attempts reached";
            job.state = "retrying";
            return null;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "maxAttempts": number, "events": JobEvent[] }. Prints one line per rejected event
// (1-based position in the input), then every job in the order it was enqueued.
const input: { maxAttempts: number; events: JobEvent[] } = JSON.parse(readFileSync(0, "utf8"));
const jobs = new Map<string, Job>();
const out: string[] = [];
input.events.forEach((event, i) => {
    const reason = applyEvent(jobs, event, input.maxAttempts);
    if (reason !== null) out.push(`rejected #${i + 1} ${event.type} ${event.jobId ?? "?"}: ${reason}`);
});
for (const job of jobs.values()) out.push(`${job.id} ${job.state} attempts=${job.attempts}`);
console.log(out.join("\n"));
