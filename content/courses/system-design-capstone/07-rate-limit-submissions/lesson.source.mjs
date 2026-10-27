// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-3-1",
    title: "Per-user rate limits on submissions",
    slug: { _type: "slug", current: "per-user-rate-limits-on-submissions" },
    description:
        "On the mock exam day a per-IP limit on POST /submissions returned 1,870 responses 429 to a university lab of 118 learners, while one learner's userscript re-submitted every 200 ms and was never limited. Learn what a rate limit protects (fairness, not total capacity), why the key must be the signed-in learner and only falls back to the IP for anonymous traffic, how to size a token bucket from the capacity estimates, how an exam-day override and Retry-After work, and why forgetting an idle bucket is only safe once it is full.",
    estimatedTime: 30,

    scenario: {
        role: "Backend engineer owning the submission path, CodeDev learning platform",
        problem:
            "During the mock exam on Saturday, 10:00-10:10, support received 40 tickets from one university: \"Too many requests, try again later\" on every Run, for a whole room. In the same ten minutes the grading queue grew past 30,000 jobs (lesson 8), and 2,960 of the 41,000 submissions came from a single learner, learner-8812, whose userscript pressed Run every 200 ms. The only limit on POST /submissions is a gateway rule of 10 requests per second per client IP address. The real exam is in two weeks, at the planned peak of 340 submissions per second.",
    },

    content: [
        h2("1. The incident: a limit that punished a room and missed a script"),
        p("The gateway in front of the CodeDev API (https://api.codedev.test) has had one rule for submissions since the platform launched:"),
        code("text", `
# gateway.conf - POST /submissions
limit_req_zone $binary_remote_addr zone=submit_ip:10m rate=10r/s;
location = /submissions {
    limit_req zone=submit_ip burst=20 nodelay;     # 429 when the IP is over 10 r/s (+20 burst)
    proxy_pass http://api;
}`, "gateway.conf"),
        p("The rule looks reasonable: nobody types code fast enough to submit ten times a second. The access log of the mock exam, grouped by address and by learner, shows why it failed in both directions:"),
        code("text", `
10:00-10:10 POST /submissions, grouped by client_ip
client_ip        learners  requests   429s   per learner per second
203.0.113.40          118     7,412  1,870   0.10      <- university lab behind one NAT address
198.51.100.23           1     2,960      0   4.93      <- learner-8812, userscript every 200 ms
(19,840 other IPs)  19,310    30,628    112   0.003`, "access log, mock exam"),
        p("The lab's learners submitted about once every ten seconds each, a normal pace for an exam, but 118 of them share one public address, so the gateway added them up to 12 requests per second and rejected a quarter of them. learner-8812 sent five requests a second from an address of its own, under 10 r/s, and every one reached the queue. The limit counted the wrong thing."),

        h2("2. What a rate limit is for"),
        p("Before choosing numbers, separate two jobs that are easy to confuse:"),
        bullets([
            "**Fairness and abuse control (this lesson).** No single client may take more than its share: a script, a stuck retry loop or a bug in the editor that re-submits on every keystroke should hit a wall long before it hurts anyone else. The limit is **per client**, and it should never be reached by a person using the product normally.",
            "**Capacity protection (lesson 8).** The graders can only grade so many jobs per second. That limit is **global**, and it must hold even when every client behaves well. A per-learner limit cannot do this job: 20,000 daily active learners x 0.2 submissions per second is 4,000 per second, more than ten times the exam-day peak the platform is built for.",
        ]),
        p("So the per-learner limit is a **guard rail**, sized well above normal use, and backpressure on the submission queue (next lesson) is the **capacity** control. A design that relies on a rate limit to protect the graders will either be so strict that real learners hit it, or so loose that it protects nothing."),
        h3("Key on who, not where"),
        p("The API already knows who is calling: the access token is verified before the handler runs. Use that identity as the key. An IP address identifies a network path, not a person: campus and corporate NAT put hundreds of people behind one address, mobile carriers rotate addresses, and a determined script can use many. Keep an IP-keyed limit only where the IP is all you have, which on CodeDev means **anonymous** traffic (the public playground on course landing pages), and make it stricter, because anonymous clients cost the same to grade and are cheap to multiply."),
        callout("info", "Where this was taught in depth",
            "The Redis Patterns course (lesson \"Rate limits with Redis: fixed & sliding windows\") compares fixed windows, sliding windows and their Redis commands, and API Design for Production (lesson \"Rate limit headers & Retry-After\") covers the response contract. This lesson reuses both and focuses on the design decisions: the key, the numbers, the exam day and the state's lifetime."),

        h2("3. A token bucket, sized from the estimates"),
        p("A **token bucket** gives each key `capacity` tokens and adds `refillPerSec` tokens per second, never above `capacity`. Each request takes one token; with no whole token left the request gets `429`. Two numbers express two different promises: **capacity** is the burst a learner may send at once (running the tests three times in a row after fixing a typo), **refill** is the sustained rate over minutes. A fixed window cannot say both, and it lets a client send twice its limit across a window boundary."),
        p("Size the numbers from data, not taste. Lesson 2's planning number is about 5 submissions per active learner per day; on exam day the peak is 340 submissions per second. A query on the submissions table of the mock exam gives the human pace:"),
        code("sql", `
-- seconds between consecutive submissions of the same learner, mock exam window
SELECT percentile_cont(ARRAY[0.01, 0.05, 0.5])
         WITHIN GROUP (ORDER BY gap_s) AS gaps
FROM (
  SELECT EXTRACT(EPOCH FROM created_at - lag(created_at) OVER (PARTITION BY user_id ORDER BY created_at)) AS gap_s
  FROM submissions
  WHERE created_at >= '2026-10-24 10:00' AND created_at < '2026-10-24 10:10'
    AND user_id <> 'learner-8812'
) g
WHERE gap_s IS NOT NULL;

--  gaps
-- {1.8, 6.4, 58.0}      p1 = 1.8 s, p5 = 6.4 s, median = 58 s`, "psql"),
        p("Half of the gaps are about a minute; 5% are under 6.4 s and those come in short bursts. The CodeDev limit for a signed-in learner: **capacity 5, refill 0.2 per second** (one token every 5 s, 12 per minute). A burst of five passes, and a learner submitting once a minute never sees a 429. For anonymous traffic per IP: **capacity 2, refill 0.05 per second** (one every 20 s). Check the choice against the log before shipping: replay the mock exam's requests through the limiter (exactly what the exercise below does) and count the 429s per learner. A good limit rejects learner-8812 and almost nobody else."),
        h3("The exam-day override"),
        p("During an exam window the grader fleet scales up on a schedule, but it is still finite, and a burst of re-submissions in the last minute is the most expensive traffic of the month. CodeDev tightens every bucket for the window: **capacity 3, refill 0.1 per second**. Two details make the override safe:"),
        bullets([
            "**It takes the lower of each value**, it does not replace the limits: min(5, 3) for learners, but anonymous buckets keep their stricter min(2, 3) = 2. An override that replaced every limit would *loosen* anonymous traffic during the exam.",
            "**It applies at the moment of the request.** A bucket holding 5 tokens when the window opens is cut to 3 at its next request, and when the window closes the normal capacity applies again and the bucket refills up to it. The window is half-open, `fromMs <= now < toMs`, so the boundaries are not ambiguous.",
        ]),

        challenge("chal_quiz_sdc_311"),

        h2("4. Worked example: the limiter on a fake clock"),
        p("The limiter takes `now` as an argument instead of reading the clock, so tests can replay a whole exam in milliseconds. It keeps tokens as integer **micro-tokens**: with a rate like 0.3 per second, adding `elapsed * 0.3 / 1000` in floating point drifts (`0.1 + 0.2` is not `0.3`), and a bucket that should hold exactly 1 token holds 0.9999999 and rejects a request it should allow. With 1 token = 1,000,000 micro-tokens, a rate of r per second is exactly `r * 1000` micro-tokens per millisecond:"),
        code("typescript", `
const TOKEN = 1_000_000;                        // micro-tokens per token

function refill(b: { tokens: number; last: number }, now: number, capacity: number, perSec: number): number {
  const rate = Math.round(perSec * 1000);       // micro-tokens per millisecond (0.2/s -> 200)
  return Math.min(capacity * TOKEN, b.tokens + (now - b.last) * rate);
}

// learner-8812, capacity 5, refill 0.2/s: five requests at 0..800 ms empty the bucket
const b = { tokens: 0, last: 800 };
b.tokens = refill(b, 1000, 5, 0.2);             // 200 ms later: 40,000 micro-tokens (0.04 token)
const waitMs = Math.ceil((TOKEN - b.tokens) / 200);   // 4,800 ms until one whole token
const retryAfterSec = Math.ceil(waitMs / 1000);       // 5: round UP, or the client is rejected again`, "tokenBucket.ts"),
        p("The response carries what the client needs to back off correctly:"),
        code("text", `
HTTP/1.1 429 Too Many Requests
Retry-After: 5
Content-Type: application/problem+json

{"type":"https://api.codedev.test/problems/rate-limited","title":"Too many submissions",
 "code":"SUBMISSION_RATE_LIMITED","retryAfterSec":5,"traceId":"4bf92f3577b34da6"}`, "response"),
        p("Rounding matters more than it looks. `Retry-After` is in whole seconds; if 4.8 s is rounded to 4, a well-behaved client comes back 0.8 s early, is rejected again, and the 429 count doubles exactly when the system is busiest. Round **up**."),

        h2("5. The state's lifetime: when may a bucket be forgotten?"),
        p("200,000 registered learners means up to 200,000 buckets, plus one per anonymous IP. Forgetting idle buckets is necessary, and it has a trap: a forgotten bucket comes back **full**. Forgetting a bucket that was half empty hands the learner tokens they have not earned. The rule that makes eviction invisible is simple: **evict only a bucket that would be full anyway**. In Redis that is a key TTL of at least `capacity / refill` after the last request (25 s for a learner, 40 s for an anonymous IP, 30 s for an exam bucket), plus a margin; in memory, a sweep that checks both the idle time and the refilled tokens."),
        code("typescript", `
// sweep before each decision: idle long enough AND full at the limits in force now
for (const [key, bucket] of buckets) {
  const { capacity, rate } = limitsInForce(bucket.limit, now);
  const full = Math.min(capacity, bucket.tokens + (now - bucket.last) * rate) >= capacity;
  if (now - bucket.last >= idleTtlMs && full) buckets.delete(key);
}`, "sweep.ts"),
        callout("warning", "One limiter, not one per instance",
            "The exercise keeps buckets in memory to stay testable. The API runs on several instances behind a load balancer; a limiter in each instance's memory multiplies the limit by the number of instances and lets a client pick the instance with tokens left. In production the same arithmetic runs in one place: a Lua script on the Redis that the API already uses (Redis Patterns), with the TTL rule above. If that Redis is unreachable, fail **open** for signed-in learners (backpressure still protects the graders) and keep counting in local memory as a weaker fallback."),

        h2("6. Build it"),
        p("Implement the limiter with all three keys of the design: a bucket per signed-in learner, a stricter bucket per anonymous IP, the exam-day override, Retry-After rounded up, the remaining tokens, and a sweep that forgets idle buckets without changing a single decision. The runner replays the mock exam's requests in time order."),
        challenge("chal_coding_sdc_312"),

        h2("7. How to verify it"),
        numbered([
            "**Replay a real window.** Export one exam window's requests (time, user id, client IP) and run them through the limiter offline. Count 429s per learner: the target is \"the scripted clients and nobody else\". Compare with the gateway's per-IP log of the same window.",
            "**Unit tests on a fake clock** for each rule: a burst of capacity + 2 (two 429s with the exact Retry-After), a request 1 ms before and at the moment a token is complete, both edges of the exam window, an idle bucket that is not full yet surviving a sweep.",
            "**An eviction invariant.** Run the same request log twice, once with idleTtlMs = Infinity and once with the production TTL. The decisions must be identical; only the bucket count may differ.",
            "**Metrics in production**: 429s per minute split by key type (`user`, `ip`) and by route, and the number of distinct keys rejected. A spike in distinct learners rejected means the limit is hurting real people; a spike from a few keys means it is working.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Keying signed-in traffic on the IP.** Shared networks get 429s while single-address scripts pass. Spot it: the 429 log shows a few addresses with many distinct user ids.",
            "**Using the rate limit as capacity protection.** Sum the per-learner limit over active learners and compare with grader throughput; if the sum is far above it, the limit protects nothing globally. Spot it: the queue still grows on exam day while 429s stay rare.",
            "**Rounding Retry-After down or to the nearest second.** Clients return early and are rejected again. Spot it: a second 429 for the same key within one second of the advertised time.",
            "**A TTL shorter than the refill time.** Every expired bucket comes back full, so the effective rate is capacity / TTL. Spot it: replay with and without eviction gives different decisions.",
            "**An override that replaces limits instead of taking the lower one.** Anonymous traffic gets looser during the exam. Spot it: anonymous 429s drop when the exam window opens.",
        ]),

        h2("9. Summary"),
        bullets([
            "A per-client rate limit is about fairness: key it on the signed-in learner, fall back to a stricter per-IP bucket only for anonymous traffic, and size it from measured gaps so normal use never reaches it.",
            "A token bucket states a burst (capacity) and a sustained rate (refill); compute it lazily on a fake clock in integer units, answer 429 with Retry-After rounded up, and tighten it on exam day with the lower of each value.",
            "Idle buckets may be forgotten only once they would be full; protecting the graders' total capacity is a different control, backpressure, in the next lesson.",
        ]),

        callout("tip", "Practice on your own (not graded)",
            "Port your limiter to a Redis Lua script (one HGET/HSET of tokens and last_ms, PEXPIRE of at least capacity / refill), then replay the same request log against both versions and diff the decisions. Then click Run six times quickly in the browser and check the 429 and its Retry-After in the Network tab."),
    ],
});
