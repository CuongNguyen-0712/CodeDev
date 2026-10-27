import { readFileSync } from "node:fs";

// CodeDev submission queue: POST /submissions puts a grading job in front of the grader workers. On exam day
// arrivals can exceed what the graders finish, so the queue is bounded and says "429, come back in N s"
// instead of growing until every learner waits minutes. All times are fake-clock milliseconds.
//
// offer(job, now) - admission:
//   - Invalid job (id not a non-empty string, or priority not "exam" / "practice"): { status: 400 }, nothing
//     changes and it is not counted anywhere.
//   - depth = number of accepted jobs still waiting (not yet taken by a worker).
//   - The threshold is config.limit for "exam" (graded exam submissions) and config.practiceLimit for
//     "practice" (practice runs), with practiceLimit <= limit: practice runs are shed first.
//   - depth < threshold: accept the job -> { status: 202, depth } (depth after adding it).
//   - Otherwise reject -> { status: 429, retryAfterSec } where retryAfterSec is the estimated time for the
//     queue to drain below the threshold: excess = depth - threshold + 1 jobs, graded by config.workers
//     workers at the average grading time. Compute it with integers to stay exact:
//         retryAfterSec = Math.ceil(excess * sumMs / (count * config.workers * 1000))
//     where sumMs / count is the average grading time of the last config.window completed jobs (all
//     priorities; fewer if fewer have completed), or config.defaultGradeMs / 1 before any job completed.
//   - Never drop, replace or reorder away an accepted job: every accepted job is eventually taken.
// take(now) - a worker asks for work: return the waiting exam job accepted first; if no exam job waits, the
//   practice job accepted first; null when nothing waits. The job's wait is now - its accept time.
// complete(jobId, now) - the worker finished the job it took; its grading time is now - the time it was taken.
// depth() - accepted jobs waiting right now.
// stats() - per priority: accepted, rejected, started (taken), maxWaitMs and avgWaitMs over started jobs
//   (Math.round of the mean, 0 when none started).
// Do not change the types or anything below the "do not change" line.

type Priority = "exam" | "practice";
type Job = { id: string; priority: Priority };
type Config = { limit: number; practiceLimit: number; workers: number; defaultGradeMs: number; window: number };
type Offer = { status: 202; depth: number } | { status: 429; retryAfterSec: number } | { status: 400 };
type PriorityStats = { accepted: number; rejected: number; started: number; maxWaitMs: number; avgWaitMs: number };

type Waiting = { job: Job; acceptedAt: number };
type Totals = { accepted: number; rejected: number; started: number; maxWaitMs: number; totalWaitMs: number };

class SubmissionQueue {
    private readonly config: Config;
    private readonly waiting: Record<Priority, Waiting[]> = { exam: [], practice: [] };
    private readonly running = new Map<string, number>();
    private readonly recent: number[] = [];
    private readonly totals: Record<Priority, Totals> = {
        exam: { accepted: 0, rejected: 0, started: 0, maxWaitMs: 0, totalWaitMs: 0 },
        practice: { accepted: 0, rejected: 0, started: 0, maxWaitMs: 0, totalWaitMs: 0 },
    };

    constructor(config: Config) {
        this.config = config;
    }

    offer(job: Job, now: number): Offer {
        if (typeof job.id !== "string" || job.id === "" || (job.priority !== "exam" && job.priority !== "practice")) {
            return { status: 400 };
        }
        const depth = this.depth();
        const threshold = job.priority === "exam" ? this.config.limit : this.config.practiceLimit;
        if (depth < threshold) {
            this.waiting[job.priority].push({ job, acceptedAt: now });
            this.totals[job.priority].accepted++;
            return { status: 202, depth: depth + 1 };
        }
        this.totals[job.priority].rejected++;
        const sumMs = this.config.defaultGradeMs;
        const count = 1;
        const excess = depth - threshold + 1;
        return { status: 429, retryAfterSec: Math.ceil((excess * sumMs) / (count * this.config.workers * 1000)) };
    }

    take(now: number): Job | null {
        const next = this.waiting.exam.shift() ?? this.waiting.practice.shift();
        if (next === undefined) return null;
        const t = this.totals[next.job.priority];
        const wait = now - next.acceptedAt;
        t.started++;
        t.totalWaitMs += wait;
        t.maxWaitMs = Math.max(t.maxWaitMs, wait);
        this.running.set(next.job.id, now);
        return next.job;
    }

    complete(jobId: string, now: number): void {
        const startedAt = this.running.get(jobId);
        if (startedAt === undefined) return;
        this.running.delete(jobId);
        this.recent.push(now - startedAt);
        if (this.recent.length > this.config.window) this.recent.shift();
    }

    depth(): number {
        return this.waiting.exam.length + this.waiting.practice.length;
    }

    stats(): Record<Priority, PriorityStats> {
        const out = (t: Totals): PriorityStats => ({
            accepted: t.accepted,
            rejected: t.rejected,
            started: t.started,
            maxWaitMs: t.maxWaitMs,
            avgWaitMs: t.started === 0 ? 0 : Math.round(t.totalWaitMs / t.started),
        });
        return { exam: out(this.totals.exam), practice: out(this.totals.practice) };
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Simulates config.workers grader workers on a fake clock. Jobs come from "jobs" and, for an exam-day burst,
// from "burst" (generated: perSecond arrivals per second, evenly spaced, for `seconds` seconds; examShare % of
// them are exam submissions; grading takes 1-8 s). At each instant: workers that finish call complete(), idle
// workers call take(), then each arrival is offered and idle workers call take() again. The run continues until
// no job is running or waiting. A job's gradeMs is known only to the runner, as in real life.
type Arrival = { id: unknown; priority: unknown; at: number; gradeMs: number };
type Input = {
    config: Config;
    jobs?: Arrival[];
    burst?: { startMs: number; seconds: number; perSecond: number; examShare: number; seed: number };
};

function main(): void {
    const input: Input = JSON.parse(readFileSync(0, "utf8"));
    const arrivals: Arrival[] = [...(input.jobs ?? [])];
    if (input.burst) {
        const b = input.burst;
        let seed = b.seed;
        const rnd = (n: number): number => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return Math.floor(seed / 65536) % n;
        };
        for (let s = 0; s < b.seconds; s++) {
            for (let k = 0; k < b.perSecond; k++) {
                const at = b.startMs + s * 1000 + Math.floor((k * 1000) / b.perSecond);
                const priority = rnd(100) < b.examShare ? "exam" : "practice";
                arrivals.push({ id: `b${s}-${k}`, priority, at, gradeMs: 1000 + rnd(7001) });
            }
        }
    }
    const order = arrivals.map((a, i) => ({ a, i })).sort((x, y) => x.a.at - y.a.at || x.i - y.i).map((x) => x.a);
    const queue = new SubmissionQueue(input.config);
    const gradeMs = new Map<string, number>();
    const accepted = new Set<string>();
    const taken = new Set<string>();
    const workers: Array<{ job: string | null; until: number }> = [];
    for (let w = 0; w < input.config.workers; w++) workers.push({ job: null, until: Infinity });
    const retryAfter: Record<string, Record<string, number>> = { exam: {}, practice: {} };
    const firstRejections: string[] = [];
    let invalid = 0;
    let duplicateTakes = 0;
    let unknownTakes = 0;
    let maxDepth = 0;
    let lastFinish = 0;
    let next = 0;

    const fill = (now: number): void => {
        for (const w of workers) {
            if (w.job !== null) continue;
            const job = queue.take(now);
            if (job === null) break;
            if (!accepted.has(job.id)) unknownTakes++;
            if (taken.has(job.id)) duplicateTakes++;
            taken.add(job.id);
            w.job = job.id;
            w.until = now + (gradeMs.get(job.id) ?? 1000);
        }
        maxDepth = Math.max(maxDepth, queue.depth());
    };

    for (;;) {
        const busy = Math.min(...workers.map((w) => w.until));
        const now = Math.min(busy, next < order.length ? order[next].at : Infinity);
        if (!Number.isFinite(now)) break;
        for (const w of workers) {
            if (w.job !== null && w.until === now) {
                queue.complete(w.job, now);
                lastFinish = now;
                w.job = null;
                w.until = Infinity;
            }
        }
        fill(now);
        while (next < order.length && order[next].at === now) {
            const a = order[next++];
            const res = queue.offer({ id: a.id, priority: a.priority } as Job, now);
            if (res.status === 202) {
                accepted.add(a.id as string);
                gradeMs.set(a.id as string, a.gradeMs);
            } else if (res.status === 429) {
                const p = String(a.priority);
                retryAfter[p][res.retryAfterSec] = (retryAfter[p][res.retryAfterSec] ?? 0) + 1;
                if (firstRejections.length < 20) firstRejections.push(`t=${now} ${String(a.id)} ${p} 429 retry-after=${res.retryAfterSec}`);
            } else invalid++;
            fill(now);
        }
    }
    const lost = [...accepted].filter((id) => !taken.has(id)).length;
    console.log(JSON.stringify({
        ...queue.stats(),
        invalid,
        maxDepth,
        depthAtEnd: queue.depth(),
        lost,
        duplicateTakes,
        unknownTakes,
        lastFinishMs: lastFinish,
        retryAfter,
        firstRejections,
    }));
}
main();
