// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-4-3",
    title: "Architecture review board: a cache outage that took down the API",
    slug: { _type: "slug", current: "architecture-review-board-cache-outage" },
    description:
        "For 9 minutes every CodeDev API call failed while PostgreSQL sat at 10% CPU: a network change made Redis unreachable, and the session and catalog reads waited 30 s for it. The architecture review board wants answers before exam day. Work through the evidence pack like the engineer presenting it: read the dashboard, the dependency diagram and the timeout settings, form a hypothesis, rule out \"add a replica\" and \"scale the API\", choose a fix that makes the cache optional on the read path, and prove it with a chaos test that kills and hangs Redis.",
    estimatedTime: 45,

    scenario: {
        role: "Backend engineer presenting the incident to the architecture review board, CodeDev learning platform",
        problem:
            "Thursday 2026-10-22, 14:02 to 14:11. A security group change dropped every packet from the API subnet to the Redis subnet. Redis itself stayed healthy, PostgreSQL stayed healthy, and yet 96% of all API calls failed: learners could not open a course, save progress or submit code. Exam day is in two weeks, with a peak of 340 submissions/s. The architecture review board has put the incident on Monday's agenda with four questions, and you are presenting.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario. The fix itself is small; what the board wants is the reasoning: which evidence shows what, which tempting fixes would not have helped, and how you will prove the real fix before 20,000 learners depend on it. The incident note posted in the channel at 14:15 was short:"),
        code("text", `
14:02  security group sg-redis updated (ticket NET-2291: "tighten Redis ingress")
14:02  API 5xx rises; on-call paged at 14:03 ("API error rate > 5%")
14:06  Redis healthy from the bastion: PING 0.4 ms, memory 61%, no errors
14:09  NET-2291 identified as the only change in the window
14:11  security group rolled back; API recovers within 40 s
impact 9 min, about 125,000 failed requests, 4,100 learners with a failed progress save (retried by the app later)`, "incident note"),
        p("Read that note the way the board will: Redis was fine, PostgreSQL was fine, the network change only affected one path. So why did **everything** fail?"),

        h2("2. The evidence pack"),
        p("Four pieces of evidence go to the board. The quiz below refers to them by letter."),
        h3("A. API dashboard"),
        code("text", `
time      req/s  5xx %  p95 ms   in-flight per instance (max 40)  Redis errors/s  PG CPU  PG p95
14:00     241    0.1      118     7                                0               34%     6 ms
14:02:30  236    38     30,002    40                               0               21%     5 ms
14:04     238    96     30,001    40                               8               11%     4 ms
14:08     240    97     30,001    40                               8               10%     4 ms
14:11:20  security group change rolled back
14:12     243    0.3      131     8                                0               35%     6 ms
(5xx at 14:04: 91% are 503 "server busy" returned at once by the in-flight limit, 9% are timeouts)`, "all 6 API instances"),
        h3("B. Dependency diagram"),
        code("text", `
browser -> load balancer -> API (NestJS, 6 instances, 40 request slots each)
  every route except /health/live: AuthGuard -> SessionCache.get("session:<id>") -> Redis
                                   (no fallback; PostgreSQL has the sessions table but nothing reads it)
  GET /courses, /courses/:id, /lessons/:id: CatalogReader.get("course:<slug>") -> Redis -> on a miss PostgreSQL
  POST /lessons/:id/complete: AuthGuard, then progress service -> PostgreSQL (progress + outbox)
  GET /leaderboard: Redis sorted set (shows "unavailable" when Redis fails, lesson 9)
Redis: redis-main primary + 1 replica (Sentinel), both in subnet 10.20.8.0/24
Cause: at 14:02 a security group change dropped every packet from the API subnet to 10.20.8.0/24
       (no reset, no error: connections just hang)`, "as reviewed"),
        h3("C. Timeout settings"),
        code("yaml", `
redis:
  connectTimeoutMs: 30000
  commandTimeoutMs: 0           # 0 = wait for the reply forever
http:
  maxInFlightPerInstance: 40    # above that: 503 "server busy" at once
postgres:
  poolSize: 20                  # per instance
  statementTimeoutMs: 300`, "api/config/production.yaml"),
        h3("D. The review board's questions"),
        numbered([
            "POST /lessons/:id/complete does not read the catalog. Why did it fail?",
            "Would a second Redis replica have prevented this?",
            "Should we run 12 API instances instead of 6?",
            "What is the fix, what does it cost PostgreSQL, and how will you prove it before exam day?",
        ]),

        h2("3. Reading the evidence"),
        p("One line per piece, about what it **shows**:"),
        bullets([
            "**A**: errors start at 14:02:30 and stop within a minute of the rollback. The in-flight count is pinned at 40 on every instance, almost all errors are instant 503s from that limit, and the requests that did get a slot took 30,001 ms. Redis errors appear only from 14:04, at a steady trickle. PostgreSQL got **less** busy.",
            "**B**: every route but `/health/live` reads the session from Redis with no fallback, and catalog reads go to Redis first. The load balancer's health check uses `/health/live`, so it kept every instance in rotation while they failed. Primary and replica share one subnet.",
            "**C**: a connection waits up to 30 s and a command waits forever. Nothing on the request path fails fast.",
            "**D**: the board asks about blast radius (1), two fixes people proposed in the channel (2, 3), and the fix with its cost and proof (4).",
        ]),
        p("Notice what A rules out on its own: this was not overload. Traffic was flat at about 240 requests/s, PostgreSQL was idle, and the API's CPU (not shown) was low. Requests were not working; they were **waiting**."),

        h2("4. Hypothesis: the cache is a single point of failure"),
        p("Put the facts in order:"),
        numbered([
            "At 14:02 packets to Redis are dropped silently, so every Redis call waits: 30 s to connect, forever for a command on an open connection.",
            "Every route except the liveness probe calls Redis through AuthGuard before doing anything else.",
            "Each instance has 40 slots. At about 40 requests/s per instance, holding each request for 30 s would need about 1,200 slots; 40 fill in 1 s (Little's law: in-flight = arrival rate x time in system).",
            "With the slots full, every other request is rejected at once with 503, whatever it was going to do: that is why saving progress failed (board question 1).",
            "The first 30 s timeouts expire around 14:03 and free a few slots, which are refilled at once by requests that wait another 30 s: the trickle of Redis errors in A.",
        ]),
        p("A good hypothesis explains all of the evidence, including the recovery: when packets flow again, waiting requests complete within milliseconds and the slots drain, which is the 40-second recovery in the note. This one does. The root cause is not \"Redis was down\" (it was not) but a design in which **the API cannot answer without the cache and waits for it without limit**. A cache that is required is no longer a cache: it is a single point of failure in front of the source of truth."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"Add a second Redis replica.\"** B: primary and replica were both behind the dropped packets, and Redis was healthy, so Sentinel had nothing to fail over. Replicas protect against one Redis node dying. They do nothing for a network change, a slow command, a full connection pool on the client, or a misconfigured client, and even a successful failover takes seconds, while the slots fill in under one.",
            "**\"Run 12 API instances.\"** A: traffic was normal. Twice the slots are full in 2 s instead of 1 s, at twice the cost. Capacity does not fix a request that waits 30 s for nothing.",
            "**\"PostgreSQL could not have taken the load anyway.\"** A shows PostgreSQL at 34% CPU with the cache working and 10% without it. A session lookup is a primary-key read; the load test run for this review measured about 1,500 such reads/s at p95 4 ms. It has headroom, and the fix below limits what it receives.",
        ]),

        h2("5. Choose the fix"),
        p("Write the requirements down first, from the evidence and from the SLOs of lesson 1 (p95 300 ms for reads):"),
        bullets([
            "With Redis refusing **or hanging**, catalog and session reads still answer, within the 300 ms p95.",
            "PostgreSQL gets bounded extra load: no more than one query per key at a time, and well under the pool of 20 connections per instance.",
            "When Redis comes back, even empty, reads move back to it without a deploy.",
            "When Redis is healthy, nothing gets slower.",
        ]),
        p("Then the fix, piece by piece, each tied to a requirement:"),
        bullets([
            "**A 50 ms timeout on every Redis call on the request path**, the same budget lesson 9 set for the progress path: about forty times Redis's healthy p99 (about 1.2 ms), far below the 300 ms read budget. A hang becomes a fast error.",
            "**A fallback to PostgreSQL** for both the catalog and the sessions table, so the cache is optional on the read path. A miss reads PostgreSQL and writes the value back to Redis **without waiting** for that write.",
            "**A circuit breaker per Redis client**: after 3 consecutive failures, skip Redis for 1 s, then try again. Without it every request still pays the 50 ms during an outage; with it the outage costs almost nothing after the first few requests.",
            "**Single-flight per key** in front of PostgreSQL: when the exam course page is requested 300 times a second, concurrent misses share one query instead of sending 300.",
            "**A readiness probe that reflects real dependencies** stays out of scope here: lesson 13 covers it. Note it as a follow-up.",
        ]),
        callout("info", "Why not just catch the error?",
            "The first pull request for this incident wrapped redis.get in try/catch and fell back to PostgreSQL. It would have changed nothing on Thursday: a dropped packet is not an error, it is silence, and the catch only runs when the 30 s timeout expires. A dependency is optional only when you bound how long you wait for it."),

        challenge("chal_quiz_sdc_431"),

        h2("6. The challenge: make the read path survive the cache"),
        p("The challenge contains `CatalogReader.get` as it shipped: it awaits Redis with the client's default timeout, then PostgreSQL on a miss, then awaits the write-back. The file also contains the two helpers the team already had, `withTimeout` and `CircuitBreaker` (correct, but not wired in), and fakes with a fake clock: Redis answers in 2 ms when up, refuses in 1 ms when down and hangs until 30 s when hanging; PostgreSQL answers in 20 ms. The runner sends requests while Redis goes down, comes back empty and hangs, and prints each request's result and latency and how many PostgreSQL loads each key caused."),
        p("Run the starter first: you will see every request fail while Redis is down, and 30,000 ms latencies while it hangs, the same picture as evidence A."),
        challenge("chal_coding_sdc_432"),

        h2("7. How to verify the fix"),
        p("Board question 4 asks for proof before exam day. \"The unit tests pass\" is necessary, not sufficient. The plan:"),
        bullets([
            "**Unit tests with a fake clock**, as in the challenge: refuse, hang, come back empty, a hot key during an outage. They prove the logic in milliseconds and run on every commit.",
            "**A chaos test in staging at exam-day load** (340 submissions/s plus about 250 API reads/s), in two modes: stop the Redis process (connections refused) and drop its packets with a firewall rule (connections hang, as on Thursday). Each for 10 minutes, then restore Redis empty.",
            "**Pass criteria the board can check**: read success >= 99.9%, read p95 <= 300 ms, PostgreSQL connections in use below 20 per instance, and after restore the cache hit rate back above 90% within 2 minutes.",
            "**Watch the right signals**: breaker state per instance, Redis timeouts per second, PostgreSQL queries per second split by cache-fallback and normal, single-flight joins. The incident would have been visible at 14:02:01 as \"breaker open\" instead of at 14:03 as an error rate.",
        ]),
        code("bash", `
# staging chaos run, hang mode: drop packets to Redis for 10 minutes
sudo iptables -I OUTPUT -d 10.20.8.0/24 -p tcp --dport 6379 -j DROP
k6 run --env PROFILE=exam-day load/exam-day.js        # reads + submissions, 10 min
sudo iptables -D OUTPUT -d 10.20.8.0/24 -p tcp --dport 6379 -j DROP
redis-cli -h redis-main.staging FLUSHALL               # come back empty, then watch the hit rate recover`, "chaos-redis-hang.sh"),

        h2("8. Common mistakes in a review like this"),
        bullets([
            "**Naming the trigger as the root cause.** \"The security group change\" will happen again in another form. Spot it: the action items only fix the trigger (\"review security group changes\") and nothing changes in how the API depends on Redis.",
            "**Adding redundancy to the component instead of removing the dependency.** Spot it: a fix that adds nodes, replicas or instances while the request path still cannot answer without the cache.",
            "**A fallback without a time limit, or without a limit on the fallback.** The first does nothing against a hang; the second moves the outage to PostgreSQL. Spot it: try/catch around a call with a 30 s timeout, or a fallback query per request with no single-flight or concurrency limit.",
            "**Testing only the easy failure.** Stopping Redis tests connection refused, which fails in 1 ms. Spot it: a chaos plan with no hang or packet-loss mode.",
            "**Health checks that cannot see the failure.** `/health/live` stayed green, so nothing was taken out of rotation and nobody noticed from the load balancer. Spot it: a single health endpoint with no dependencies used for both liveness and readiness.",
        ]),

        h2("9. Summary"),
        numbered([
            "A cache that the request path cannot do without, combined with long timeouts, is a single point of failure: shared request slots spread one slow dependency to every route in under a second.",
            "Use the evidence to rule fixes out: replicas do not help when the path to every node fails, and more instances do not help when requests are waiting rather than working.",
            "Make the cache optional on the read path (50 ms timeout, fallback to PostgreSQL, a breaker, single-flight per key) and prove it with a chaos test that both kills and hangs Redis, against SLO-based pass criteria.",
        ]),

        h2("Sources"),
        bullets([
            "Google SRE book: Addressing Cascading Failures - sre.google/sre-book/addressing-cascading-failures/",
            "AWS Builders' Library: Using load shedding to avoid overload - aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/",
            "Martin Fowler: CircuitBreaker - martinfowler.com/bliki/CircuitBreaker.html",
        ]),
        callout("tip", "Self-practice (not graded): present the design to a review board",
            "Prepare a 10-minute presentation of this incident and its fix for a review board, then give it to a colleague who plays the board. Use at most five slides: what learners saw and for how long; the evidence (A to C) and the hypothesis in one sentence; the two fixes you ruled out and why; the fix with its cost for PostgreSQL in numbers; and the chaos test with its pass criteria. Ask your colleague to interrupt with the four questions in D and with \"what happens if PostgreSQL is the one that hangs?\". Every answer should point at one piece of evidence or one number."),
    ],
});
