// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-4-2",
    title: "Scaling workers: concurrency, rate limits & fairness",
    slug: { _type: "slug", current: "scaling-workers-concurrency-rate-limits-fairness" },
    description:
        "One instructor's bulk regrade put 12,000 jobs in front of every learner's submission, and the CPU-based autoscaler never moved. Learn to size worker concurrency with Little's Law, why more workers stop helping once a downstream is full, how to keep one tenant from starving everyone with lanes, reserved slots and per-tenant caps, how priorities can starve low-priority work, and why I/O-bound workers should scale on queue age instead of CPU.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "On Tuesday at 14:00 an instructor fixed a wrong test in the TypeScript Foundations course and clicked \"Regrade all submissions\". The button enqueued 12,000 grading jobs on the same grading queue that learners' new submissions use. By 14:10 a learner who submitted had to wait behind the whole regrade: the oldest job was 22 minutes old, and support was getting tickets again. The grading workers run with concurrency 1 on 8 replicas behind a CPU-based autoscaler, and their CPU was at 9%, so the autoscaler saw no reason to add any. In the incident channel someone proposes \"set the replicas to 40 and let it drain\".",
    },

    content: [
        h2("1. The incident: one bulk job, every learner waits"),
        p("The regrade feature had been tested with a course of 40 submissions. It does exactly what it says: for every submission of the course it enqueues a normal grading job."),
        code("typescript", `
// courses/regrade.ts - the version that shipped
export async function regradeCourse(courseId: string, queue: Queue): Promise<number> {
    const submissions = await db.submissions.findMany({ where: { courseId } });
    for (const s of submissions) {
        await queue.add("grade", { submissionId: s.id });   // same queue, same priority as a learner's click
    }
    return submissions.length;
}`, "courses/regrade.ts"),
        p("A FIFO queue is fair to jobs, not to people. The 12,000 regrade jobs arrived first, so every learner who clicked Submit after 14:00 was job number 12,001 or later. Nothing was broken: the workers were busy, the code runner was answering, the regrade was progressing. The system simply had no idea that one learner waiting for one result matters more than one instructor waiting for 12,000."),
        p("Two questions follow, and this lesson answers them in order: how much capacity do the workers really have, and how do we share it so that one tenant cannot take all of it?"),

        h2("2. Read the evidence before you scale"),
        p("The on-call dashboard at 14:10 (grading queue and its dependencies):"),
        code("text", `
grading workers   replicas 8, concurrency 1 each, CPU 9%, active jobs 8 of 8
grading queue     depth 11,400, oldest age 22 min, completed ~150/min
grading job       processing time p50 3.0 s (code runner call 2.8 s)
code runner       max 16 concurrent executions, then 429 Too Many Requests
postgres          grading pool 20 connections, 8 in use`, "dashboard 14:10"),
        p("Before changing anything, find which stage limits throughput. Every one of the 8 slots is busy, the job spends most of its time waiting on the code runner, and the code runner has its own hard limit. That limit is the number every scaling decision has to respect: \"set it to 40\" is a guess until you have done the arithmetic in the next section."),

        h2("3. Little's Law: how many jobs must be in progress"),
        p("Little's Law relates three averages of any stable queueing system: **jobs in progress = throughput x time per job** (L = lambda x W). It needs no assumption about how jobs arrive, which makes it the most useful formula for sizing workers:"),
        bullets([
            "**Concurrency you need** = arrival rate x processing time. Certificates arrive at 30 per minute (0.5 per second) and take 4 s each: 0.5 x 4 = 2 jobs in progress on average. Two slots run at 100%, so give it 3 or 4 for bursts.",
            "**Throughput you can get** = slots / processing time. 6 slots at 4 s per job finish 1.5 jobs per second, 90 per minute. If arrivals exceed that for long, the queue grows without limit until arrivals drop.",
            "**Time to drain a backlog** = backlog / (capacity - arrival rate). 5,400 queued certificates with capacity 90 per minute and 30 arriving per minute take 5,400 / 60 = 90 minutes.",
        ]),
        h3("More workers help only until a downstream is full"),
        p("A worker that waits on another system cannot go faster than that system. If the email provider accepts 10 messages per second, the email workers finish at most 10 per second, whether there are 4 workers or 400. Beyond that point extra workers only add requests that get rejected (429), time out, or queue inside the downstream, and if those failures are retried (lesson 3) they add more load exactly when the downstream is saturated."),
        p("So the useful upper bound for the total number of slots is: **downstream limit / share of the job spent in the downstream**, minus anything else that shares the same downstream. Count the slots across every replica, `replicas x concurrency per replica`, and compare that total with each shared resource: the code runner, the database connection pool, a third-party API's rate limit."),
        callout("info", "When processing time grows with concurrency",
            "Little's Law assumes the time per job stays the same. When workers contend for a lock, a hot database row or a shared CPU, adding workers makes every job slower, and past some point total throughput goes down. If processing time rises as you add slots in a load test, you have found that point: stop there and fix the contention instead of scaling."),

        h2("4. Fairness: lanes, reserved slots and per-tenant caps"),
        p("Capacity is the first half. The second half is who gets it. Three tools, from simplest to most flexible:"),
        numbered([
            "**Separate lanes for separate promises.** A learner's submission (someone is watching a spinner) and a bulk regrade (someone will check back later) are different products. Put them on different queues, `grading` and `grading-bulk`, with separate SLOs on age.",
            "**Reserved slots.** Give bulk work at most a fixed share of the slots, for example 4 of 16, and let it borrow the rest only while the interactive lane is empty. A learner then waits at most for one running job to finish, never for the whole regrade.",
            "**Per-tenant caps.** Within a lane, limit how many jobs of one tenant (an instructor, a course, an organisation) run at once. Two instructors regrading at the same time then share the bulk slots instead of the first one taking them all.",
        ]),
        p("Here is a scheduler that combines the three. The workers ask it for their next job instead of popping the queue directly; it is plain TypeScript, so its behaviour can be tested with no broker at all:"),
        code("typescript", `
// grading/fairScheduler.ts
export interface Job { id: string; tenant: string; lane: "interactive" | "bulk" }
export interface Limits { slots: number; bulkSlots: number; perTenant: number }

export class FairScheduler {
    private lanes = { interactive: [] as Job[], bulk: [] as Job[] };
    private perTenant = new Map<string, number>();   // tenant -> jobs running
    private running = 0;
    private bulkRunning = 0;

    constructor(private limits: Limits) {}

    enqueue(job: Job): void {
        this.lanes[job.lane].push(job);
    }

    /** The next job to start, or null when no slot may be used now. */
    next(): Job | null {
        if (this.running >= this.limits.slots) return null;
        let job = this.take("interactive");
        const bulkMayRun = this.bulkRunning < this.limits.bulkSlots || this.lanes.interactive.length === 0;
        if (!job && bulkMayRun) job = this.take("bulk");
        if (!job) return null;
        this.running++;
        if (job.lane === "bulk") this.bulkRunning++;
        this.perTenant.set(job.tenant, (this.perTenant.get(job.tenant) ?? 0) + 1);
        return job;
    }

    done(job: Job): void {
        this.running--;
        if (job.lane === "bulk") this.bulkRunning--;
        this.perTenant.set(job.tenant, (this.perTenant.get(job.tenant) ?? 1) - 1);
    }

    // shortcut: a linear scan; with many tenants keep one sub-queue per tenant and round-robin over them
    private take(lane: "interactive" | "bulk"): Job | null {
        const queue = this.lanes[lane];
        const i = queue.findIndex((j) => (this.perTenant.get(j.tenant) ?? 0) < this.limits.perTenant);
        return i === -1 ? null : queue.splice(i, 1)[0];
    }
}`, "grading/fairScheduler.ts"),
        p("A test that reproduces the incident and proves the fix fits in a few lines: enqueue 12,000 bulk jobs of one instructor, then one interactive job, and check that the interactive job is returned by the very next call to `next()` that finds a free slot."),
        code("typescript", `
const s = new FairScheduler({ slots: 16, bulkSlots: 4, perTenant: 4 });
for (let i = 0; i < 12_000; i++) s.enqueue({ id: \`r\${i}\`, tenant: "instructor-lan", lane: "bulk" });
const started = [s.next(), s.next(), s.next(), s.next(), s.next()];
console.assert(started.filter(Boolean).length === 4, "one instructor gets at most 4 slots");
s.enqueue({ id: "sub-90001", tenant: "learner-17", lane: "interactive" });
console.assert(s.next()?.id === "sub-90001", "a learner does not wait behind the regrade");`, "fairScheduler.test.ts"),
        h3("Priorities, and the starvation they cause"),
        p("Most brokers offer job priorities (BullMQ has a `priority` option on a job, RabbitMQ has priority queues). Strict priority is simple, and it has one sharp edge: as long as high-priority work keeps arriving, low-priority work never runs. During an exam week the bulk lane could wait for days. If you use priorities, add a guarantee for the low lane, such as a reserved slot or a maximum age after which a job is promoted, and put an age SLO on every lane so starvation shows up on a dashboard instead of in an instructor's email."),
        h3("Rate limits are the same idea, measured per second"),
        p("A concurrency cap limits jobs in progress; a rate limit limits jobs started per second. Use a rate limit when the downstream publishes one (an email provider's messages per second, an API's requests per minute) and a concurrency cap when the downstream limits simultaneous work (the code runner's 16 executions, a database pool). Both must be **global across all replicas**: a limit of 10 per second configured in each of 8 replicas is a limit of 80. BullMQ's worker `limiter` option is enforced per queue across workers; check your library's documentation for which scope its limiter has before you rely on it."),

        h2("5. Autoscale on queue age, not CPU"),
        p("CPU is a good scaling signal for work that uses CPU. A grading worker spends most of each job waiting on the network, so its CPU stays low whether it is idle or has a 20-minute backlog. Scale on the thing you promised: the age of the oldest waiting job (lesson 10), or the backlog per worker, with the maximum capped by the downstream limit from section 3:"),
        code("typescript", `
// ops/desiredReplicas.ts - called every 30 s by the scaling job
export function desiredReplicas(
    m: { arrivalsPerSec: number; processingSec: number; depth: number; oldestAgeSec: number },
    c: { perReplica: number; min: number; max: number; drainWithinSec: number; ageSloSec: number },
): number {
    const steady = m.arrivalsPerSec * m.processingSec;              // Little's Law: jobs in progress
    const behind = m.oldestAgeSec > c.ageSloSec / 2;                 // act before the SLO is broken
    const drain = behind ? (m.depth * m.processingSec) / c.drainWithinSec : 0;
    const slots = Math.ceil((steady + drain) * 1.2);                 // 20% headroom for bursts
    return Math.min(c.max, Math.max(c.min, Math.ceil(slots / c.perReplica)));
}`, "ops/desiredReplicas.ts"),
        bullets([
            "`max` is not a cost setting: it is `floor(downstream limit / perReplica)`. Above it, extra replicas only produce 429s.",
            "Scale down slowly (for example, only after 10 minutes below target) so a queue that drains in bursts does not make the replica count flap.",
            "Event-driven autoscalers such as KEDA have scalers for SQS, RabbitMQ and Redis-based queues that read queue length per replica; feeding them the age, or a backlog target derived from it, follows the same idea.",
        ]),

        challenge("chal_quiz_bjm_421"),

        h2("6. How to verify a scaling change"),
        bullets([
            "**Find the plateau in a load test.** In staging, replace the code runner with a fake that sleeps for the measured p50 and enforces the same concurrency limit. Raise the slots step by step and plot completed jobs per minute: throughput rises, then goes flat at the downstream limit. The knee of that curve is your `max`.",
            "**Replay the incident.** Enqueue 12,000 bulk jobs, then submit as a learner and time the result. With lanes and reserved slots it must arrive within about one processing time plus the normal wait, not after the regrade.",
            "**Watch the downstream while scaling.** 429 responses, connection pool waits and timeouts going up while throughput stays flat mean you are past the limit.",
            "**Check the autoscaler with a synthetic backlog.** Pause the workers until the oldest age passes half the SLO, resume, and confirm the replica count rises, stops at `max`, and comes back down after the queue drains.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Scaling replicas past a shared downstream.** Spot it: replicas went up, completed jobs per minute did not, and 429s or pool timeouts appeared.",
            "**One queue for interactive and bulk work.** Spot it: the oldest age of the interactive queue jumps whenever someone starts an import, regrade or backfill.",
            "**Per-replica limits that add up.** A rate limit or concurrency cap configured inside each worker process multiplies with the replica count. Spot it: the downstream sees N times the configured limit after a scale-up.",
            "**Strict priority without a floor.** Spot it: the low-priority lane's oldest age only grows during busy periods and never returns to normal.",
            "**CPU-based autoscaling for I/O-bound workers.** Spot it: replicas stay at the minimum during a backlog, and CPU stays low while every slot is busy.",
        ]),

        h2("8. Summary"),
        bullets([
            "Size workers with Little's Law: slots needed = arrival rate x processing time, plus headroom; throughput is capped by the narrowest shared downstream, counted across all replicas.",
            "Share capacity on purpose: separate lanes for interactive and bulk work, reserved slots, per-tenant caps, and an age SLO on every lane so starvation is visible.",
            "Autoscale I/O-bound workers on queue age or backlog per worker, never above the downstream limit, and scale down slowly.",
        ]),

        h2("Sources"),
        bullets([
            "BullMQ documentation: concurrency, rate limiting and job priorities - docs.bullmq.io (check the current version)",
            "Amazon Builders' Library: Timeouts, retries, and backoff with jitter - why retries add load to an overloaded dependency - aws.amazon.com/builders-library",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "For each queue you run, write one line: arrival rate at peak, processing time p50, slots, downstream limit. Compute the concurrency you need and the maximum that makes sense with Little's Law, and compare them with your current replica settings. Then extend FairScheduler with round-robin between bulk tenants and write a test where two instructors regrade at the same time."),
    ],
});
