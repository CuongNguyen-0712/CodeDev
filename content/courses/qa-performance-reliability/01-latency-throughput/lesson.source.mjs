// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-1-1",
    title: "Latency, throughput & concurrency: three different numbers",
    slug: { _type: "slug", current: "latency-throughput-concurrency-three-numbers" },
    description:
        "A rehearsal for exam day ran the submit endpoint with 50 and then 200 virtual users, and the summary said the API \"handled 4x the users\". It did not: throughput stayed at 340 requests per second and every request waited four times longer. Learn what latency, throughput and concurrency each measure, how they are tied together in a steady system, why fast errors inflate throughput, and how to check a load test summary against itself before you trust it.",
    estimatedTime: 20,

    scenario: {
        role: "QA engineer preparing the exam-day load test, CodeDev learning platform",
        problem:
            "Exam day on CodeDev brings a peak of about 340 submissions per second to POST /api/submissions on https://api.codedev.test, and the target is that a submission is accepted within 2 s. The team rehearsed with k6: one run with 50 virtual users, one with 200. The message posted in the release channel said: \"Run 2: 4x the users, throughput 341 req/s, no errors - we can take 200 concurrent learners, scale by adding users.\" A product manager is about to plan the exam schedule from that sentence. Before anyone does, you are asked to say what the two runs actually show.",
    },

    content: [
        h2("1. The incident: \"4x the users, and it handled it\""),
        p("Here are the two k6 summaries that the message was written from, trimmed to the lines that matter. Both runs used a closed loop: each virtual user (VU) sends a submission, waits for the response, and sends the next one at once, with no pause in between."),
        code("text", `
# run 1 - 50 VUs, no think time, 120 s steady state
http_req_duration....: avg=147.2ms med=140.3ms p(90)=171.0ms p(95)=183.6ms
http_req_failed......: 0.00%  0 out of 40620
http_reqs............: 40620  338.5/s
vus..................: 50     min=50   max=50

# run 2 - 200 VUs, no think time, 120 s steady state
http_req_duration....: avg=586.9ms med=584.8ms p(90)=640.2ms p(95)=662.5ms
http_req_failed......: 0.00%  0 out of 40920
http_reqs............: 40920  341.0/s
vus..................: 200    min=200  max=200`, "k6 end-of-test summaries"),
        p("Read the numbers instead of the headline. Four times the virtual users produced **0.7% more** completed requests per second, and the median request took **four times longer**. The API did not take more load in run 2; it took the same load and made everybody wait in line for it. \"No errors\" is true and beside the point: a queue is not an error until it gets long enough to time out."),
        callout("info", "About the output format",
            "The summary above follows the shape of k6's end-of-test summary. The exact layout (dots, thresholds, how http_req_failed is printed) changes between k6 versions and output options, so check the current k6 docs for your version. The reasoning in this lesson does not depend on the layout."),

        h2("2. Three numbers that answer three different questions"),
        p("Most confusion in load testing comes from using one of these words for another. Each answers its own question and has its own unit:"),
        bullets([
            "**Latency** (also called response time): how long **one** request took, from the moment the client sent it until it received the last byte of the answer. Unit: milliseconds. It is a property of each request, so a run does not have one latency, it has tens of thousands of them: a distribution (lesson 1.2 shows how to summarise it).",
            "**Throughput**: how many requests **completed** per unit of time. Unit: requests per second. Say which ones you count: all responses, or only successful ones. The successful rate is often called **goodput**.",
            "**Concurrency**: how many requests are **in flight** at a given moment: sent, not yet answered. Unit: a plain count. Over a window you report its average.",
        ]),
        p("Latency itself has two parts that matter for everything later in this course. **Service time** is the time the server actually works on the request. **Waiting time** is the time the request spends queued before anyone works on it: in the load balancer, in the connection pool, in a worker queue. A client only ever sees the sum. When a system is saturated, service time stays the same and waiting time grows."),
        h3("How the three are tied together"),
        p("In a system that is in a steady state (the load is not ramping and the queues are not growing or emptying), the three numbers are linked by a simple relation, Little's Law, which lesson 4.2 covers in depth:"),
        code("text", `
average concurrency  =  throughput  x  average latency
       (requests)       (requests/s)      (seconds)

run 1:   338.5/s x 0.1472 s  =  49.8   ~ 50 VUs
run 2:   341.0/s x 0.5869 s  = 200.1   ~ 200 VUs`, "Little's Law on the two runs"),
        p("In a closed-loop test without think time, every VU always has exactly one request in flight, so the concurrency is the number of VUs. Both runs check out: the summaries are consistent with each other. And now the story is plain. The API completes about 340 submissions per second, no matter how many are waiting. Run 1 kept 50 in flight; run 2 kept 200 in flight. With throughput fixed at the server's capacity, the only number that can grow when concurrency grows is latency: 200 / 341 = 0.587 s."),
        callout("tip", "The pattern to recognise",
            "Concurrency goes up, throughput stays flat, latency goes up in proportion: the system is at its capacity and the extra requests are queueing. Lesson 3.3 finds this saturation knee on a curve; here it is enough to see it in two runs."),
        h3("When the relation does not hold"),
        bullets([
            "**During ramp-up and ramp-down**: queues are filling or draining, so the window is not in a steady state. Compute these numbers on the steady part only (lesson 2.1).",
            "**Over short windows**: in a 1-second window, requests that started before it or finish after it distort the count. Use windows that are long compared with the latency.",
            "**When the load generator cannot keep up**: if the generator's own CPU is saturated, it sends less than you think and measures time badly (lesson 2.3).",
        ]),

        h2("3. VUs are not learners"),
        p("The message said \"200 concurrent learners\". A VU in a closed loop without think time is a machine that submits again the instant it gets an answer. A learner reads the result, edits code and submits a minute later. The numbers are not comparable:"),
        code("text", `
learners online during the exam      20,000
average time between two submits     60 s    (reading, editing, thinking)
arrival rate                         20,000 / 60  =  333 submissions/s

200 VUs, no think time               341 submissions/s`, "two very different kinds of \"concurrent users\""),
        p("Twenty thousand learners and 200 VUs create about the same request rate, but they are not the same test. Real learners do not wait for each other: when the server slows down, the next learner submits anyway, so requests keep arriving at 333 per second while the queue grows. The 200 VUs politely slow down with the server, because each one waits for its own answer before sending the next. That is a **closed** model; real traffic is closer to an **open** one. Lesson 2.1 shows how to design both, and lesson 2.3 what happens when a closed loop hides a stall."),
        p("So when someone reports a capacity, ask for it in requests per second at a stated latency, not in \"users\". \"340 submissions/s with p95 under 200 ms\" can be checked. \"200 users\" cannot."),

        h2("4. Fast errors inflate throughput"),
        p("A week later, after a config change, a third run looks like a big win at first sight:"),
        code("text", `
# run 3 - 200 VUs, no think time, 100 s steady state
http_req_duration....: avg=384.6ms med=571.3ms p(90)=638.7ms p(95)=660.9ms
http_req_failed......: 35.00%  18200 out of 52000
http_reqs............: 52000   520.0/s`, "k6 summary, run 3"),
        p("520 requests per second, faster than ever, and the average duration dropped from 587 ms to 385 ms. Then read the second line: 35% of the requests failed. The API now rejects part of the load with `503 Service Unavailable` after a few milliseconds. Those cheap rejections count as requests in `http_reqs` and as very short durations in `http_req_duration`. The goodput is 52,000 x 0.65 / 100 s = **338 successful submissions per second**: the same capacity as before, with a third of the learners getting an error."),
        p("Rejecting load quickly can be the right design (it protects the server, lesson 5.1), but it is not extra capacity. Report throughput and goodput separately, and never compare latencies of runs with different error rates without splitting them by status."),

        challenge("chal_quiz_qpr_111"),

        h2("5. Worked example: the three numbers from a request log"),
        p("Load tools print these numbers for you, but you should be able to compute them from raw records, because that is how you check a tool and how you analyse logs that no tool summarised. Each record is one request: when it started, when it finished, and its status. All times are in milliseconds."),
        code("python", `
def window_stats(requests, t0, t1):
    """requests: list of (start_ms, end_ms, status); window is [t0, t1) in ms."""
    seconds = (t1 - t0) / 1000
    # throughput counts requests that COMPLETED inside the window
    done = [r for r in requests if t0 <= r[1] < t1]
    ok = [r for r in done if 200 <= r[2] < 400]
    # concurrency: total time requests spent in flight inside the window, divided by its length
    busy_ms = sum(max(0, min(end, t1) - max(start, t0)) for start, end, _ in requests)
    return {
        "throughput_rps": len(done) / seconds,
        "goodput_rps": len(ok) / seconds,
        "avg_concurrency": busy_ms / (t1 - t0),
        "latencies_ms": sorted(end - start for start, end, _ in done),
    }


log = [
    (0, 400, 201), (100, 700, 201), (250, 980, 201),
    (300, 1300, 201), (600, 650, 503), (720, 1150, 201),
]
print(window_stats(log, 0, 1000))`, "window_stats.py"),
        code("text", `
{'throughput_rps': 4.0, 'goodput_rps': 3.0, 'avg_concurrency': 2.76, 'latencies_ms': [50, 400, 600, 730]}`, "output"),
        p("Check each number by hand once, because each one has a trap:"),
        bullets([
            "**Throughput 4.0**: four requests finished before 1000 ms. The request that started at 300 ms is still running at the end of the window, so it is not counted, even though the server was working on it.",
            "**Goodput 3.0**: the `503` finished in the window, but it is not a successful submission.",
            "**Concurrency 2.76**: the in-flight time inside the window is 400 + 600 + 730 + 700 + 50 + 280 = 2,760 ms, over a 1,000 ms window. The two requests that cross the end of the window count only for their part inside it.",
            "**Latencies**: one value per completed request. The fastest one is the `503` (50 ms): mix it with the successful requests and it pulls every summary down.",
        ]),
        p("Multiply throughput by the mean latency here and you get 4 x 0.445 = 1.78, not 2.76. That is the short-window problem from section 2: two requests are still running at the end, and their time counts towards concurrency but their latency does not appear yet. Over two minutes of steady state, edge effects like this shrink to nothing and the relation holds, which is exactly why it is a good consistency check."),

        h2("6. How to verify a load test summary"),
        numbered([
            "**Check it against itself.** In a closed loop without think time, `VUs ~ http_reqs/s x avg duration`. With think time T, `VUs ~ rate x (avg duration + T)`. If the numbers do not agree within a few percent, something is off: errors, a generator at 100% CPU, a ramp included in the window.",
            "**Split by status.** Look at the failure rate before any latency. In k6, the `http_req_failed` rate; in Locust, the failures column; in raw logs, a count per status code. Report goodput next to throughput.",
            "**Count from the server side too.** The API's access log or request counter gives throughput independently of the generator. OpenTelemetry's HTTP semantic conventions define an in-flight request metric for servers (check the current spec for its exact name in your SDK); its average should match the concurrency you computed.",
            "**Compare client latency with server latency.** If the client sees 585 ms and the server's handler span sees 145 ms, about 440 ms was spent waiting before the handler ran: in a queue, not in your code.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Reading VUs as capacity.** \"We handled 200 users\" says how many requests were in flight, not how many the system can complete. Spot it: throughput is flat across runs while VUs grow, and latency grows in step with VUs.",
            "**Counting fast failures as throughput.** Errors that return in milliseconds raise requests per second and lower average latency. Spot it: a run that gets \"faster\" at the same time as its failure rate rises.",
            "**Not saying where latency was measured.** Client latency includes the network and every queue; a handler span does not. Spot it: two teams quote numbers that differ by a factor of three for the same endpoint.",
            "**Counting sent instead of completed requests.** A generator that sends 500 requests per second while the server completes 340 is building a queue, not measuring throughput. Spot it: the number of responses per second is lower than the send rate, and in-flight requests keep growing.",
            "**Mixing windows.** A rate measured over the peak second is compared with an average over ten minutes, or a ramp-up is included in the steady-state numbers. Spot it: state the window next to every number you report.",
        ]),

        h2("8. Summary"),
        bullets([
            "Latency is per request (a distribution, in ms), throughput is completed requests per second (say whether you count only successes), concurrency is requests in flight. They answer different questions.",
            "In a steady state, concurrency = throughput x latency. When throughput stops growing, extra concurrency only becomes waiting time: the system is at capacity.",
            "Check every summary against itself and split it by status before you draw a conclusion; report capacity in requests per second at a stated latency, never in \"users\".",
        ]),

        h2("Sources"),
        bullets([
            "Grafana k6 documentation: built-in metrics (http_reqs, http_req_duration, http_req_failed) and the end-of-test summary - grafana.com/docs/k6/latest/",
            "Marc Brooker, \"Little's Law\" - brooker.co.za/blog/2018/06/20/littles-law.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Export the raw results of any load test you have (k6 can write per-request results with its JSON or CSV output; check the docs for your version) and compute throughput, goodput and average concurrency for one minute of steady state with window_stats. Then check Little's Law on your own numbers and explain any gap larger than a few percent."),
    ],
});
