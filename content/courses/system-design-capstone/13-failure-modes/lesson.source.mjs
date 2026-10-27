// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-5-1",
    title: "Failure modes & single points of failure",
    slug: { _type: "slug", current: "failure-modes-single-points-of-failure" },
    description:
        "A hung PDF renderer in the certificate service stopped every learner from saving progress for 26 minutes. Learn to walk the CodeDev design component by component (PostgreSQL, Redis, the submission queue, grader workers, the certificate service and the payment provider), ask how each one fails, who notices and how far the damage spreads, find the single points of failure you have and decide which ones to accept, give every remote call a timeout inside one request deadline and a retry budget, and turn it all into a failure-mode table where every row says how it was verified.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer preparing the CodeDev production readiness review",
        problem:
            "On Sunday at 21:04 the PDF renderer inside the certificate service stopped answering: a font download it made on every render hung. The API issued certificates inline: POST /lessons/:id/complete saved progress, updated the leaderboard and then called the certificate service over HTTP with no timeout of its own. Learners who finished a course waited until the load balancer gave up after 30 s. Within four minutes every API instance had all 40 of its request slots held by those waits, and from 21:08 to 21:34 nobody could save progress on any lesson, open a course page or submit code. Certificates are issued a few hundred times a day; progress is saved tens of thousands of times. The production readiness review on Wednesday now asks the team for one thing: a failure-mode table for every component, with evidence.",
    },

    content: [
        h2("1. The incident: a nice-to-have feature took down the core"),
        p("Here is the request that started it, from the tracing backend (Observability with OpenTelemetry covers how these spans are produced):"),
        code("text", `
trace 7f3a91c2  POST /lessons/l_88/complete          30,004 ms   504 (load balancer idle timeout)
  ├─ auth.verifySession                                  1 ms
  ├─ progress.update          PostgreSQL               14 ms
  ├─ leaderboard.zincrby      Redis                     2 ms
  └─ certificate.issue        HTTP POST cert-svc   29,987 ms   (no response, span ended by client abort)`, "trace 7f3a91c2"),
        p("And what the API instances looked like a few minutes later:"),
        code("text", `
time    api_inflight (max 40)   waiting_on        GET /courses/:id p95   POST /progress p95   5xx rate
21:03            6              -                       120 ms              95 ms           0.1 %
21:05           23              cert-svc (19)           140 ms             110 ms           0.4 %
21:08           40              cert-svc (37)        30,000 ms          30,000 ms          61 %
21:20           40              cert-svc (38)        30,000 ms          30,000 ms          74 %
21:34           11              -                       130 ms             100 ms           0.2 %   (cert-svc restarted)`, "api dashboard, Sunday"),
        p("Read the last two columns. `GET /courses/:id` never calls the certificate service, yet it timed out too. It did not need the certificate service: it needed a free request slot, and the slots were all held by requests waiting on a dependency with no timeout. The failure of one small component spread through a shared resource to every feature. That spread is the **blast radius**, and it is the thing this lesson teaches you to predict before production does it for you."),

        h2("2. Read the evidence: three questions per component"),
        p("Failure mode analysis is a walk through the design, one component at a time, asking the same three questions:"),
        numbered([
            "**How does it fail?** Not just \"down\". Slow, hung, returning errors, returning wrong or stale data, losing recent writes, filling up, or answering only some requests. Slow and hung are the dangerous ones, because nothing fails fast enough to trigger a fallback.",
            "**Who notices, and how fast?** Which metric or alert moves (error rate, latency, age of the oldest job, a reconciliation count), or does a learner notice first?",
            "**How far does it spread?** Which user journeys break, which keep working, and through which shared resource (request slots, a connection pool, a thread pool, a Redis node, a queue) the failure travels.",
        ]),
        p("For the certificate incident the answers were: it **hung** (not down, so no connection error and no fallback); the first signal was the API's in-flight count at 21:05, which had no alert; and it spread through the API's request slots to every route. Each answer points to a fix: a timeout turns a hang into a fast error, an alert on in-flight requests and on certificate job age finds it sooner, and moving the call off the request path cuts the path it spreads through."),
        callout("info", "Rank journeys before components",
            "Write down the user journeys and rank them first. For CodeDev: (1) open a lesson and save progress, (2) submit code and get it accepted (p95 2 s), (3) see a grading result, then (4) leaderboard, (5) certificates, (6) purchase a course, (7) emails. A failure in a component is serious in proportion to the highest-ranked journey it can break. The certificate service supports journey 5 and broke journey 1: that mismatch is the finding."),

        h2("3. Walk the components"),
        p("The architecture from lesson 3: API (NestJS), progress service, PostgreSQL as the source of truth, Redis as a cache and for the leaderboard projection (a sorted set that can be rebuilt), the submission queue with grader workers, the certificate service, and an external payment provider. Scale assumptions used below: 20,000 daily active learners, peak 340 submissions/s on exam day, p95 300 ms for reads and 2 s for submit acceptance, 1 to 8 s per grading job."),
        h3("PostgreSQL"),
        bullets([
            "**Primary lost** (crash, zone outage): every write stops - progress, submissions, purchases - until a standby is promoted. With a managed standby and automatic failover this often takes one to two minutes; do not trust that figure, measure it in a failover drill. Reads served from cache keep working if lesson 9's degradation is in place.",
            "**Slow** (a bad plan, a lock held by a migration, a long report): the dangerous mode. Requests wait on the connection pool, the pool fills, and every route that needs the database queues behind it. Mitigate with `statement_timeout` per role, a small separate pool for reports and admin, and a pool wait timeout so a request fails in milliseconds instead of waiting for a connection.",
            "**Lost data** (bad migration, a bug that overwrites rows): replicas copy the damage. Only backups with point-in-time recovery help, and only if a restore has been tested.",
        ]),
        h3("Redis: cache and leaderboard"),
        bullets([
            "**Down or slow**: lesson 12's incident. If the API waits on Redis with a long timeout or treats a cache error as a request error, the cache becomes a hard dependency. With a 50 ms timeout and a fallback to PostgreSQL (behind a limit, so the database is not flooded), the blast radius shrinks to \"reads are a bit slower\".",
            "**Failover loses recent writes**: Redis replication is asynchronous, so a promoted replica can miss the last writes the primary acknowledged. For the cache that is harmless. For the leaderboard it means scores silently missing, which is why the leaderboard is a projection rebuilt from PostgreSQL (lesson 11) and checked against it, not a source of truth.",
            "**Shared node**: cache and leaderboard on one Redis means one memory spike or one eviction policy affects both. Separate instances, or at least separate memory policies, give each its own blast radius.",
        ]),
        h3("Submission queue and grader workers"),
        bullets([
            "**Queue unavailable**: new submissions cannot be handed to graders. If the API writes the submission and an outbox row in one PostgreSQL transaction (lesson 10), it can still accept the submission within 2 s and a relay publishes it when the queue is back. Without that, a queue outage is a submit outage.",
            "**Workers slow, crashed or too few**: grading results arrive late; the oldest job's age climbs (Background Jobs & Messaging). A worker that dies mid-job is covered by the lease or visibility timeout, which must be longer than the slowest job: graders take up to 8 s and the sandbox kills a run at 10 s, so a 30 s lease leaves room. A lease shorter than a job gives two workers the same submission.",
            "**Poison input**: a submission that crashes the grader every time. Without a maximum attempt count it cycles forever and takes a slot each time; with one it lands in the dead-letter queue and someone is told.",
            "**Backlog**: on exam day arrivals can exceed grading capacity for minutes. The bounded queue and backpressure from lesson 8 keep acceptance honest instead of letting the backlog grow without limit.",
        ]),
        h3("Certificate service"),
        bullets([
            "**Slow or hung**: the incident. Issuing a certificate is not part of saving progress, so it should not run inside that request. The progress update publishes a `CourseCompleted` event; a certificate job consumes it with its own timeout and retries. A hung renderer then delays certificates and nothing else, and the job age alert tells you.",
            "**Issued twice**: a retried job must not send two emails or create two PDFs; the job keys its side effects by `(userId, courseId)`.",
        ]),
        h3("Third-party payment provider"),
        bullets([
            "**Outage or slow responses**: you cannot fix it, only contain it. Checkout should be the only journey that calls the provider; course pages, progress and submissions read the learner's entitlement from PostgreSQL.",
            "**Unknown outcome**: a timeout on \"create payment\" means you do not know if the learner was charged. Send an idempotency key the provider supports, retry at most once with that key, and confirm through the provider's webhook or by querying the payment, never by assuming.",
            "**Late or lost webhooks**: grant access when the confirmed payment is recorded, and run a periodic reconciliation against the provider's API so a lost webhook becomes a delay, not a learner who paid and has no access.",
        ]),

        h2("4. Single points of failure: find them, then decide"),
        p("A single point of failure (SPOF) is a part whose failure alone stops a journey that matters. The quickest way to find them is to list everything there is exactly one of, including things that are not servers:"),
        code("text", `
exactly one of ...                         breaks journeys      decision
PostgreSQL primary                          1, 2, 3, 6           accept: managed standby, auto failover, RTO 2 min (drilled quarterly)
Redis node (cache + leaderboard)            4 (and 1-2 before    split into two instances; API degrades without either (lesson 9)
                                            lesson 12's fix)
region                                      all                  accept: single region, multi-zone (cost, lesson 14)
payment provider                            6                    accept: contract + reconciliation; no other journey depends on it
cron host running reconciliation jobs       6 (slowly)           move to the scheduled-job runner with 2 replicas + a lock
certificate signing key, one secret store   5                    accept; documented restore from the backup vault
the one engineer who knows the grader       3 (during incidents) runbook + second on-call trained by a game day
sandbox`, "spof-list.txt"),
        p("Not every SPOF should be removed. Removing one costs money and complexity: a second region roughly doubles infrastructure and makes every write a consistency question (lesson 14 prices it). What a review needs is that every SPOF is **known**, its impact is ranked by journey, and accepting it is a written decision with a recovery time someone has measured."),
        callout("warning", "A replica is not automatically redundancy",
            "A standby that has never been promoted, a replica whose replication lag nobody watches, or a second instance that shares the same disk, zone, config file or deploy pipeline as the first is one failure away from being a SPOF again. Redundancy counts only after you have failed over to it on purpose."),

        h2("5. Timeouts inside a deadline, retries inside a budget"),
        p("Almost every cascading failure has the same shape as the certificate incident: a slow dependency, callers that wait too long, and retries that add load at the worst moment. The Google SRE book chapter \"Addressing Cascading Failures\" (in this course's sources) describes it in detail. Two rules contain it."),
        h3("Rule 1: every remote call has a timeout, and all of them fit in one request deadline"),
        p("Start from the target, not from each client's default. Submit acceptance has a p95 target of 2 s; give the handler a 1,500 ms deadline and leave the rest for the network and the load balancer. Each call gets the smaller of its own limit and what the request has left:"),
        code("typescript", `
// api/lib/deadline.ts
export class Deadline {
    private constructor(private readonly endsAt: number, private readonly now: () => number) {}

    static in(ms: number, now: () => number = Date.now): Deadline {
        return new Deadline(now() + ms, now);
    }

    remaining(): number {
        return Math.max(0, this.endsAt - this.now());
    }

    // the call's own limit, but never more than the request has left (minus time to answer)
    timeoutFor(callLimitMs: number, reserveMs = 50): number {
        return Math.max(0, Math.min(callLimitMs, this.remaining() - reserveMs));
    }
}`, "api/lib/deadline.ts"),
        p("Per-call limits come from measured latency: a few times the dependency's healthy p99, not its worst day. Typical starting points for CodeDev: Redis 50 ms, a PostgreSQL statement 300 ms on the request path, enqueue 200 ms, the payment provider a few seconds on checkout only. A timeout that only exists as a client default (30 s, or none at all) is the bug from section 1."),
        h3("Rule 2: retries are capped per request and per dependency"),
        p("A timeout per attempt is not a deadline per request. Three retries of a 2 s call can hold the request for 8 s plus backoff. And retries multiply across layers: if the browser, the API and the payment client each make up to 3 attempts, one click can become 27 calls to a provider that is already struggling. Retry in one layer, stop when the deadline is spent, and give each dependency a **retry budget**: retries may add only a small share to its traffic (the SRE book's \"Handling Overload\" chapter uses 10%), so a dependency that is failing for everyone gets fewer retries, not more."),
        code("typescript", `
// api/lib/retryBudget.ts - retries may add at most \`ratio\` to a dependency's calls in the current window
export class RetryBudget {
    private calls = 0;
    private retries = 0;

    constructor(private readonly ratio = 0.1, private readonly minRetries = 10) {}

    onCall(): void { this.calls++; }
    onRetry(): void { this.retries++; }
    canRetry(): boolean { return this.retries < Math.max(this.minRetries, this.calls * this.ratio); }
    resetWindow(): void { this.calls = 0; this.retries = 0; }       // every 10 s, from a timer
}

// api/payments/checkout.ts - the one route that talks to the provider
const providerBudget = new RetryBudget();

export async function createPayment(order: Order, deadline: Deadline): Promise<ProviderPayment> {
    const idempotencyKey = \`order-\${order.id}\`;                   // same key on every attempt
    for (let attempt = 1; ; attempt++) {
        const timeoutMs = deadline.timeoutFor(4_000);
        if (timeoutMs === 0) throw new DeadlineExceeded("payment.create");
        providerBudget.onCall();
        try {
            return await provider.createPayment(order, { idempotencyKey, timeoutMs });
        } catch (error) {
            const retry = attempt < 2 && isRetryable(error) && providerBudget.canRetry();
            if (!retry) throw error;                                // checkout shows "try again" - nothing else is affected
            providerBudget.onRetry();
        }
    }
}`, "api/payments/checkout.ts"),
        p("And the certificate fix itself is not a better timeout: it is taking the call off the request path."),
        code("typescript", `
// progress/completeLesson.ts - after the fix
await db.transaction(async (tx) => {
    const done = await progress.markComplete(tx, userId, lessonId);              // lesson 4
    if (done.courseCompleted) {
        await outbox.add(tx, { type: "CourseCompleted", key: \`\${userId}:\${courseId}\`, userId, courseId });
    }
});
// the certificate worker consumes CourseCompleted with a 10 s render timeout, retries with backoff,
// and an alert on the age of its oldest job; the request above never waits for it`, "progress/completeLesson.ts"),

        challenge("chal_quiz_sdc_511"),

        h2("6. The failure-mode table"),
        p("Collect the walk into one table. One row per component and failure mode, and every column filled in. The last column is what turns the table from a list of hopes into evidence:"),
        code("text", `
component / failure        detection                     blast radius (journeys)      mitigation                                verified by
-------------------------  ----------------------------  ---------------------------  ----------------------------------------  -----------------------------------------
PostgreSQL primary lost    write errors, failover event  1,2,3,6 for failover time    managed standby, auto failover, idem-     staging drill 2026-10-12: 74 s write gap,
                                                                                      potent writes retried once after it       0 lost submissions
PostgreSQL slow            pool wait p95, statement      all DB routes               statement_timeout 1 s, report pool,       load test with a 5 s lock held: API p95
                           timeouts                                                   pool wait timeout 100 ms                  410 ms, errors only on locked rows
Redis down / slow          cache error rate              none (reads slower)          50 ms timeout, fallback to PG behind a    game day: Redis stopped 10 min, progress
                                                                                      limit (lessons 9, 12)                     p95 180 ms, 0 errors
Leaderboard data lost      rank count != PG count        4 (stale until rebuilt)      rebuild projection from PG (lesson 11)    rebuild drill: 200k learners in 3 min 10 s
Queue unavailable          enqueue errors, outbox lag    3 delayed; 2 still accepted  outbox in the submission transaction      broker paused 5 min: 0 lost, relay caught
                                                                                                                                up in 40 s
Grader worker dies         lease expiry, job age         3 delayed                    30 s lease (> 10 s sandbox kill), idem-   kill -9 during job: regraded once, one
                                                                                      potent result write, max 5 attempts, DLQ  result row
Certificate svc hung       certificate job age > 15 min  5 delayed                    async job, 10 s render timeout, backoff   renderer paused 20 min: progress p95
                                                                                                                                unchanged, certificates caught up
Payment provider down      checkout error rate,          6                            4 s timeout, 1 retry with idempotency     provider sandbox returning 503: checkout
                           webhook lag                                                key, webhook + reconciliation             fails, course pages unaffected`, "docs/failure-modes.txt"),
        bullets([
            "**Detection names a signal, not \"monitoring\".** If you cannot point to the metric and the alert, the failure is detected by learners.",
            "**Blast radius names journeys**, and the shared resource it travels through when it is wider than the component itself.",
            "**Verified by** is a drill, a load test, a game day or an automated test with its date and its result. A row with an empty last column is an open risk and should be listed as one.",
        ]),

        h2("7. How to verify"),
        bullets([
            "**Fault injection in tests.** Give each client a fake that can hang, fail or answer slowly, as the challenges in this course do with in-memory components and fake clocks, and assert that the request fails within its deadline and that unrelated routes still answer.",
            "**Game days in staging.** Stop Redis, pause the certificate renderer, promote the PostgreSQL standby, block the payment sandbox. For each, watch the dashboards of the journeys that should keep working, and time detection and recovery.",
            "**Latency injection, not only shutdowns.** A proxy that adds 5 s of latency to a dependency (for example Toxiproxy) reproduces the hung case, which is the one that cascades. Shutting a dependency down only tests the easy case: connection refused, fast failure.",
            "**Check the timeouts exist.** Search the code for every HTTP, database and Redis client and confirm each has an explicit timeout tied to the deadline; a client created with defaults is a finding.",
            "**Traces during a drill.** A span that ends at the deadline with a clear `DeadlineExceeded` is the evidence that rule 1 works; a span that lasts until the load balancer's 30 s is the evidence that it does not.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Analysing only \"down\".** Spot it: the table has rows for crashes but none for slow, hung or stale, and the last incident was a hang.",
            "**Timeout per attempt treated as a deadline.** Spot it: a trace shows the same call three or four times in a row, and the request's total time is a multiple of the client timeout.",
            "**Retries at every layer.** Spot it: during a dependency outage its request rate goes up, not down, and the API's retry counters climb with its error rate.",
            "**One shared pool for everything.** Spot it: one slow dependency raises latency on routes that never call it, as `GET /courses/:id` did at 21:08. Give critical journeys their own slots or pools (bulkheads).",
            "**Redundancy that was never exercised.** Spot it: nobody can say when the standby was last promoted or how long the failover took.",
        ]),

        h2("9. Summary"),
        bullets([
            "Walk every component with three questions - how it fails (including slow, hung and stale), who notices, and how far it spreads - and rank the damage by user journey, not by component.",
            "List what there is exactly one of; remove the single points of failure that break top journeys cheaply, and accept the rest as written decisions with a measured recovery time.",
            "Fit every remote call's timeout inside one request deadline, cap retries per request and per dependency, keep non-essential work off the request path, and record in a failure-mode table how each row was verified.",
        ]),

        h2("Sources"),
        bullets([
            "Google SRE book: Addressing Cascading Failures, and Handling Overload (retry budgets, deadline propagation) - sre.google/sre-book",
            "AWS Builders' Library: Using load shedding to avoid overload - aws.amazon.com/builders-library",
            "Redis documentation: replication (asynchronous by default) - redis.io/docs",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the failure-mode table for your own copy of the CodeDev design, one row per component and failure mode, with the six columns above. Then pick the two rows with the widest blast radius, run them as a game day in a staging or local environment (stop a container, add latency with a proxy), and fill in the \"verified by\" column with what you measured."),
    ],
});
