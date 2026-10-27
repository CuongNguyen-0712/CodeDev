// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-4-2",
    title: "Little's Law: concurrency from throughput & latency",
    slug: { _type: "slug", current: "littles-law-concurrency-from-throughput-and-latency" },
    description:
        "A capacity-review run, cr-200, was summarised as 200 virtual users, 340 requests per second and a mean latency of 105 ms - three numbers that cannot all describe the same test. Learn Little's Law (L = X x W) and its closed-loop form N = X x (R + Z), the conditions under which they hold, how to use them to catch a report whose numbers contradict each other, and how to size connection pools and grader sandboxes for exam day from throughput and time held, with a utilisation cap and without mistaking the law for a prediction.",
    estimatedTime: 25,

    scenario: {
        role: "QA / performance engineer in the exam-day capacity review, CodeDev learning platform",
        problem:
            "The capacity review for exam day starts from the summary of run cr-200, a closed-model k6 run of POST /api/submissions on staging: \"200 VUs, no think time, 5 minutes steady state, 102,000 requests, 340 req/s, mean latency 105 ms, p95 380 ms, 0.2% errors.\" The draft plan sizes the API at 105 ms per submit. Before anyone signs, you are asked a simple question: do these numbers fit together? And if they do not, which one is wrong, and what should the database pool and the grader fleet be sized for at the exam-day design load of 408 submissions per second?",
    },

    content: [
        h2("1. The incident: three numbers that cannot all be true"),
        p("This is the summary that went into the capacity plan:"),
        code("text", `
Run cr-200  POST /api/submissions  staging, capacity review
executor        constant-vus, 200 VUs, no sleep() between iterations
steady state    5 min (ramp-up excluded)
requests        102,000      throughput   340 req/s
latency         mean 105 ms   p95 380 ms
errors          0.2%`, "cr-200 summary"),
        p("Each line looks reasonable. Now combine them. A virtual user in a closed loop without think time always has exactly one request outstanding: it sends, waits for the answer, and sends again. So 200 VUs keep 200 requests in flight. If each took 105 ms, every VU would complete about 1 / 0.105 = 9.5 requests per second, and 200 VUs would complete about **1,905 requests per second** - not 340."),
        p("Something in the report is wrong, and finding out which number is wrong takes one line of arithmetic. That arithmetic is Little's Law."),

        h2("2. Read the evidence: where was each number measured?"),
        p("The author of the summary took the numbers from two tools. The raw k6 output, the load balancer's log and the API's tracing tell the rest:"),
        code("text", `
k6 end-of-test summary (steady state only)
  http_reqs ............: 102000  340.0/s
  http_req_duration ....: avg=588.4ms med=541ms p(95)=1.21s
  vus ..................: 200

load balancer access log, same 5 minutes
  time queued before an instance accepted the request ......: mean 452 ms

APM, same 5 minutes, span of POST /api/submissions inside the API process
  submit.handle   (from the moment an instance accepted the request)
                  count 101,812   mean 105 ms   p95 380 ms`, "evidence"),
        p("Now the numbers fit. k6 measured the whole request from the client: **588 ms** on average. 340/s x 0.588 s = 200, exactly the number of VUs. The 105 ms came from the APM span inside the API, which starts only after the request has waited about 452 ms in the load balancer's queue for an instance to accept it - so the summary copied the time the server **worked** and dropped the time the learners **waited**. The draft plan sized the API on the wrong number."),
        callout("info", "Same law, same boundary",
            "Little's Law relates three numbers measured at the same boundary over the same window. Concurrency at the client, throughput at the client and latency at the client fit together; concurrency at the client and latency inside the handler do not. Most \"impossible\" reports mix boundaries."),

        h2("3. The core idea: L = X x W"),
        p("For any system that is stable over a window - as many requests leave as arrive, queues are not growing or draining - the long-run averages satisfy:"),
        code("text", `
L  =  X  x  W

L   average number of requests inside the system (in flight, in the pool, in the queue)
X   throughput: requests per second that complete (= arrival rate when the system is stable)
W   average time a request spends inside the system, in SECONDS

Closed loop with N virtual users and think time Z (the time a user spends outside the system):
N  =  X  x  (R + Z)        R = mean response time`, "Little's Law"),
        p("The law needs no assumption about the distribution of arrivals or of service times, and it works for any box you can draw: the whole API, one instance, one connection pool, the grader queue. That is what makes it useful in a capacity review: you can apply it to every resource on the request path."),
        h3("Three things you can do with it"),
        numbered([
            "**Size a resource.** Anything a request holds while it works - a database connection, a worker thread, a grader sandbox - is busy on average for X x (time held). At 408 submissions/s, each holding a connection for 38 ms, the fleet keeps 408 x 0.038 = 15.5 connections busy on average.",
            "**Check a report.** Given any two of the three numbers, the third is fixed. If a report gives all three and they disagree by more than the measurement noise, at least one is wrong or measured at another boundary - as in cr-200.",
            "**Bound throughput.** A resource with a fixed number of slots caps throughput at slots / (time held), whatever the CPU says. This is the exam rehearsal of lesson 3.2: 2 instances x 6 = 12 connections, each held 38 ms, serve at most 12 / 0.038 = 316 submissions per second. During the 80 s spike at 340/s, (340 - 316) x 80 = 1,920 requests joined the line for a connection, and the last of them waited about 1,920 / 316 = 6 s - while API CPU sat at 40%. Moving the storage PUT out of the transaction cut the hold time to about 10 ms, and the same 12 connections serve about 1,200 per second.",
        ]),
        h3("When it does not apply, or does not help"),
        bullets([
            "**Transients.** During ramp-up, or while a queue is growing, arrivals and departures differ and the averages do not settle. Use the steady-state window only, and check that the queue length is flat in it.",
            "**Percentiles.** The law is about means. p95 x throughput is not a concurrency. Use mean latency for sizing, and the p95 for the user-facing objective.",
            "**Prediction.** L = X x W is an identity, not a model: it does not say which number moves when you add load. At saturation, more VUs raise W, not X (lesson 3.3). Use the law to check and to size, and a step test to learn how the system responds.",
            "**Averages hide bursts.** 15.5 busy connections on average does not mean 16 are enough: arrivals are bursty, and a pool at 97% utilisation has a long wait queue. Size with headroom, then confirm with the pool's wait time in a validation run.",
        ]),

        challenge("chal_quiz_qpr_421"),

        h2("4. Worked example: exam-day sizing for POST /api/submissions"),
        p("The capacity review uses the numbers measured for the exam-day plan: the design load is **408 submissions/s** (a forecast of 340/s plus 20% for forecast error), each submit holds a database connection for **38 ms** on average (from traces), and grading runs asynchronously in a sandbox for **1.6 s** per submission. The utilisation cap is 80%, taken from the knee of the step test, not from a rule of thumb. Exact arithmetic keeps the ceilings honest:"),
        code("python", `
import math
from fractions import Fraction

DESIGN_RPS = 408
CAP_PCT = 80                        # at most 80% busy: the knee of the step test


def busy(rps, held_ms):
    """Little's Law: mean number of busy slots = throughput x time held (in seconds)."""
    return Fraction(rps) * held_ms / 1000


def slots_for(rps, held_ms, cap_pct=CAP_PCT):
    return math.ceil(busy(rps, held_ms) * 100 / cap_pct)


for name, held_ms in [("db connections", 38), ("grader sandboxes", 1600)]:
    print(f"{name:17} busy {float(busy(DESIGN_RPS, held_ms)):7.1f}   "
          f"slots at {CAP_PCT}%: {slots_for(DESIGN_RPS, held_ms)}")

# check run cr-200: closed loop, N = X x (R + Z)
vus, x, r_ms, z_ms = 200, Fraction(102_000, 300), 105, 0
print("closed-loop limit:", round(vus * 1000 / (r_ms + z_ms), 1), "req/s; measured", float(x))
print("latency the VUs must have seen:", round(float(vus / x * 1000), 1), "ms")`, "exam_day_sizing.py"),
        code("bash", `
$ python3 exam_day_sizing.py
db connections    busy    15.5   slots at 80%: 20
grader sandboxes  busy   652.8   slots at 80%: 816
closed-loop limit: 1904.8 req/s; measured 340.0
latency the VUs must have seen: 588.2 ms`, "terminal"),
        p("Read the results one by one:"),
        bullets([
            "**Database connections: 20 across the fleet at a 38 ms hold.** 15.5 busy on average is already more than the 12 connections that capped the rehearsal in lesson 3.2, so the rehearsal's pools could never carry the design load at 38 ms. With the PUT moved out of the transaction (about 10 ms), the same arithmetic gives about 4 busy connections. Either way the division is not the evidence: the validation run must show a small, flat pool wait (the db.pool.acquire span). Lesson 3.2 shows what the opposite looks like: a p95 wait of 5.79 s in the spike that no CPU graph revealed.",
            "**Grader sandboxes: 816.** Grading is asynchronous, so a slow grader never shows up in the submit latency. It shows up as a queue: with 400 sandboxes the fleet finishes at most 400 / 1.6 = 250 gradings per second, and at 408 submissions/s the backlog grows by 158 per second for as long as the peak lasts. The async design moved the bottleneck; it did not remove it.",
            "**cr-200: the VUs saw 588 ms, not 105 ms.** The closed-loop arithmetic gives the latency the report should have shown, and the raw k6 output confirms it.",
        ]),
        callout("warning", "Count the slots in the same units",
            "Little's Law gives busy slots for the whole box you measured. If the 408/s is spread over 6 API instances, each instance's pool sees about a sixth of it - and the sum of all pools must still fit the database's own connection limit. Write down which box each number belongs to."),
        p("The checker the team now runs on every load test report does this systematically: it recomputes throughput from the raw counts, applies L = X x W and N = X x (R + Z), sizes each resource against a utilisation target, and labels the report consistent, suspicious or impossible. You write it in the exercise."),

        challenge("chal_coding_qpr_422"),

        h2("5. How to verify"),
        bullets([
            "**Measure L directly and compare.** Most systems expose a concurrency gauge: the in-use count of the connection pool, a PgBouncer pool's active server connections, the OpenTelemetry metric http.server.active_requests, k6's vus metric. Average it over the same steady-state window; it must match X x W within the noise.",
            "**Recompute throughput from counts.** Requests in the window divided by the window length, not the summary line, which may include ramp-up or count failed requests differently.",
            "**Check the boundary of every latency.** For each latency in a report, write where it was measured: the client (k6), the load balancer, the handler span. Only numbers from the same boundary go into the same equation.",
            "**Confirm sizing with waits, not averages.** After resizing, run the validation test and read the pool wait time (the db.pool.acquire span) and the grader queue length. Flat and small means the size holds; growing means the arithmetic used the wrong hold time.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Milliseconds in the formula.** Spot it: 408 x 38 = 15,504 connections. Fix: W in seconds, always; write the unit next to every number.",
            "**p95 instead of the mean.** Spot it: the pool size was computed as throughput x p95 hold time and came out twice as large as the measured in-use gauge. Fix: Little's Law uses means; handle bursts with a utilisation cap and a validation run.",
            "**Mixing boundaries.** Spot it: client-side VUs with a server-side handler time, as in cr-200. Fix: take all three numbers at one boundary, or say which box each belongs to.",
            "**Including ramp-up.** Spot it: throughput computed over the whole run, while the in-flight gauge was still climbing for the first minute. Fix: steady-state window only.",
            "**Sizing to 100%.** Spot it: pool size = ceil(X x W) exactly. Fix: divide by a cap taken from the measured knee (80% here), then validate.",
        ]),

        h2("7. Summary"),
        bullets([
            "L = X x W ties concurrency, throughput and time in the system for any stable box; in a closed loop, N = X x (R + Z). All three numbers must come from the same boundary and the same steady window.",
            "Use it to catch reports whose numbers cannot all be true, and to size anything a request holds: busy slots = throughput x time held, then divide by a utilisation cap from the measured knee.",
            "It is an identity, not a prediction: at saturation more concurrency buys latency, not throughput. Confirm every size with the wait times of a validation run.",
        ]),

        h2("Sources"),
        bullets([
            "Marc Brooker, \"Telling Stories About Little's Law\" - brooker.co.za/blog/2018/06/20/littles-law.html",
            "John D. C. Little, \"A Proof for the Queuing Formula: L = lambda W\", Operations Research 9(3), 1961.",
            "Grafana k6 documentation: built-in metrics (http_reqs, http_req_duration, vus) - grafana.com/docs/k6/latest/ (check the names for your version)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the last load test report of a service you own and write, for each latency in it, the boundary where it was measured. Check the report with L = X x W and N = X x (R + Z). Then list every resource a request holds (pools, workers, locks, sandboxes), with its size and mean hold time, and compute its busy count at your peak load."),
    ],
});
