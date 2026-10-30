import { readFileSync } from "node:fs";

// CodeDev job tracker: every background job (grade_submission, send_email, issue_certificate,
// recompute_leaderboard) moves through one state machine, and applyEvent is the only code allowed
// to change a job's state.
//
//   queued  --start-->   running     (a worker picked the job up: attempts + 1)
//   running --succeed--> succeeded   (terminal)
//   running --fail-->    failed      (lastError = the event's error)
//   failed  --retry-->   queued      (only while attempts < maxAttempts)
//   failed  --bury-->    dead        (moved to the dead-letter queue; terminal)
//
// Every accepted event sets updatedAt to event.at. Nothing else changes: lastError changes only on
// "fail", attempts only on "start". Return a new job object; never change the one you were given.
//
// Any other event is rejected and leaves the job as it was. The reason must be exactly:
//   - "no attempts left (<attempts>/<maxAttempts>)"   for a retry of a failed job with attempts >= maxAttempts
//   - "cannot <kind> a <state> job"                    for every other invalid event,
//                                                      e.g. "cannot succeed a queued job"

type JobState = "queued" | "running" | "succeeded" | "failed" | "dead";

type Job = { id: string; type: string; payload: Record<string, unknown>; attempts: number; enqueuedAt: number };

type TrackedJob = Job & { state: JobState; lastError: string | null; updatedAt: number };

type JobEvent =
    | { kind: "start"; at: number }
    | { kind: "succeed"; at: number }
    | { kind: "fail"; at: number; error: string }
    | { kind: "retry"; at: number }
    | { kind: "bury"; at: number };

type Outcome = { ok: true; job: TrackedJob } | { ok: false; reason: string };

const NEXT: Record<JobEvent["kind"], { from: JobState[]; to: JobState }> = {
    start: { from: ["queued", "failed"], to: "running" },
    succeed: { from: ["running"], to: "succeeded" },
    fail: { from: ["running"], to: "failed" },
    retry: { from: ["failed"], to: "queued" },
    bury: { from: ["failed"], to: "dead" },
};

function applyEvent(job: TrackedJob, event: JobEvent, maxAttempts: number): Outcome {
    const rule = NEXT[event.kind];
    if (!rule.from.includes(job.state)) {
        return { ok: false, reason: `cannot ${event.kind} a ${job.state} job` };
    }
    if (event.kind === "retry" && job.attempts >= maxAttempts) {
        return { ok: false, reason: `no attempts left (${job.attempts}/${maxAttempts})` };
    }
    const next: TrackedJob = { ...job, state: rule.to, updatedAt: event.at };
    if (event.kind === "start") next.attempts = job.attempts + 1;
    if (event.kind === "fail") next.lastError = event.error;
    return { ok: true, job: next };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { maxAttempts, jobs: Job[], events: (JobEvent & { jobId })[] }. Every job starts "queued".
// Output: { log: string[], jobs: [{ id, state, attempts, lastError, updatedAt }] }.
type ScriptEvent = JobEvent & { jobId: string };
type Script = { maxAttempts: number; jobs: Job[]; events: ScriptEvent[] };

const script: Script = JSON.parse(readFileSync(0, "utf8"));
const store = new Map<string, TrackedJob>();
for (const job of script.jobs) {
    store.set(job.id, { ...job, state: "queued", lastError: null, updatedAt: job.enqueuedAt });
}
const log: string[] = [];
for (const event of script.events) {
    const before = store.get(event.jobId);
    if (!before) throw new Error(`unknown job ${event.jobId}`);
    const snapshot = JSON.stringify(before);
    const outcome = applyEvent(before, event, script.maxAttempts);
    if (JSON.stringify(before) !== snapshot) {
        log.push(`${event.jobId} ${event.kind}: the input job was modified`);
    }
    if (outcome.ok) {
        store.set(event.jobId, outcome.job);
        log.push(`${event.jobId} ${event.kind}: ${before.state} -> ${outcome.job.state}`);
    } else {
        log.push(`${event.jobId} ${event.kind} rejected: ${outcome.reason}`);
    }
}
const jobs = [...store.values()].map((j) => ({
    id: j.id, state: j.state, attempts: j.attempts, lastError: j.lastError, updatedAt: j.updatedAt,
}));
console.log(JSON.stringify({ log, jobs }));
