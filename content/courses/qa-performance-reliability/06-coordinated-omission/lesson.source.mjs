// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-2-3",
    title: "Spot the AI mistake: a load generator with coordinated omission",
    slug: { _type: "slug", current: "spot-the-ai-mistake-load-generator-coordinated-omission" },
    description:
        "An AI assistant wrote the report script for the fixed-rate load test. It measured each request from the moment it was sent, and the report said p99 30 ms while the API stalled for 2.4 s every 30 seconds. Learn what coordinated omission is, why a closed-loop tool omits the slow samples and a fixed-rate tool that measures from the actual send time hides them, why latency must be measured from the intended send time, why corrections after the fact are only approximations, and how to review AI-written measurement code with an injected stall.",
    estimatedTime: 30,

    scenario: {
        role: "QA / performance engineer and code reviewer, CodeDev learning platform",
        problem:
            "The fixed-rate load test of POST /api/submissions at 340 requests per second came back green: p99 29.8 ms, 480 requests over 2 s out of 306,000. A week later, in a rehearsal with 300 proctors acting as learners, several of them reported that Submit \"hangs for two or three seconds every half minute\". The API logs show the leaderboard recompute job holding a lock on the scores table for 2.4 s every 30 s. The load test ran with the same job enabled. The report script that computed the green numbers had been written by an AI assistant.",
    },

    content: [
        h2("1. The incident: a report that agreed with itself"),
        p("The generator is a small in-house tool with a fixed schedule (an open model, lesson 2.1): request seq is due at start + seq x interval, it uses a pool of 16 connections, and it logs one row per request when the response arrives. The developer asked an assistant for the analysis:"),
        code("text", `
Write analyze(run) in Python for the log of our fixed-rate load test. The generator sends
request seq (0, 1, 2, ...) at start_ms + seq * interval_ms and logs [seq, sent_ms, done_ms]
for each request when its response arrives. Report the number of requests, p50, p95, p99
and max latency in ms (nearest-rank percentiles, rounded to 1 decimal), and how many
requests took longer than target_ms. Reject an interval_ms or target_ms that is not > 0.`, "prompt to the AI assistant"),
        p("The answer was clean, with a docstring for the percentile and a validation the prompt asked for:"),
        code("python", `
def latencies_ms(run):
    # Latency of a request = when its response arrived - when it was sent.
    return [done_ms - sent_ms for _seq, sent_ms, done_ms in run["requests"]]


def analyze(run):
    if run["interval_ms"] <= 0 or run["target_ms"] <= 0:
        return {"error": "interval_ms and target_ms must be > 0"}
    values = sorted(latencies_ms(run))
    return {
        "requests": len(values),
        "p50": one_decimal(percentile(values, 50)),
        "p95": one_decimal(percentile(values, 95)),
        "p99": one_decimal(percentile(values, 99)),
        "max": one_decimal(values[-1] if values else None),
        "over_target": sum(1 for v in values if v > run["target_ms"]),
    }`, "AI-generated report script (excerpt)"),
        p("The reviewer checked the percentile against the course definition, ran the script on two earlier logs, compared p50 with the API's own histogram and approved. Every check passed because every check looked at runs without a stall. The comment on the first function states the mistake in plain words, and it reads like a definition."),

        h2("2. Reproduce it and read the evidence"),
        p("The run: 340 requests per second for 15 minutes (306,000 requests), 16 connections, and the leaderboard job pausing every submission for 2.4 s every 30 s. The report, and the same log analysed from the time each request was **due**:"),
        code("text", `
                     requests    p50       p95         p99        max        over 2 s
done - sent          306,000   21.0 ms    29.1 ms     29.8 ms   2,429.9 ms      480
done - intended      306,000   22.5 ms  1,596.2 ms  2,259.6 ms  2,429.9 ms    7,825`, "same log, two clocks"),
        p("The max is identical: the requests in flight when the lock was taken really did take 2.4 s. Everything between p50 and max differs, and the conclusion flips from \"far under the 2 s target\" to \"p99 over target\". To see why, look at a few rows around one pause (interval 2.94 ms, pause from 12,000 to 14,400 ms):"),
        code("text", `
  seq | due (intended) |  sent_ms  |  done_ms  | done - sent | done - due
 4080 |      12000.0   |  12000.0  |  14418.3  |    2418.3   |   2418.3   <- 16 of these: every connection is stuck
 4096 |      12047.1   |  14411.6  |  14431.0  |      19.4   |   2383.9   <- due during the pause, sent after it
 4500 |      13235.3   |  14931.6  |  14953.3  |      21.7   |   1718.0
 4900 |      14411.8   |  15462.5  |  15484.9  |      22.4   |   1073.1   <- due after the pause, still in the backlog`, "excerpt of the log, with the due time added"),
        p("Once the 16 connections are stuck, the generator cannot send. When the lock is released it sends the backlog as fast as connections free up, and the server answers each in about 20 ms. Measured from the send time, those hundreds of requests look fast. A learner who clicked Submit at 12,047 ms waited until 14,431 ms: 2.4 s."),

        h2("3. Core idea: coordinated omission"),
        p("Gil Tene named the effect **coordinated omission**: the measuring system coordinates with the system under test and omits exactly the measurements that would show the problem. It comes in two forms."),
        bullets([
            "**Closed-loop tools omit the samples.** wrk, ab, a VU loop: each connection sends its next request only after the previous response. During a stall nobody sends, so the tool records a handful of slow samples (one per connection) instead of the hundreds of requests that real users would have sent and waited on. Its percentiles describe the tool's experience, not the users'.",
            "**Fixed-rate tools that start the clock late hide the queueing.** The schedule is right, the samples are there, but each request's clock starts when the tool managed to send it. The time spent waiting for a free connection is queueing delay that a real user would feel, and it disappears from the numbers. That is the assistant's script.",
        ]),
        p("The fix is the same for both: **measure each request from its intended send time**, the time the schedule (the arrival process) says it exists. In an open model the request is a learner who has clicked Submit; that learner's wait starts at the click, whether or not your tool's connection pool was free."),
        h3("What the tools do (check current docs)"),
        bullets([
            "**wrk2** keeps a constant request rate and records latency from the time each request should have been sent, which is the reason it was forked from wrk.",
            "**k6 arrival-rate executors** start iterations on schedule as long as a VU is free. When none is, the iteration is not run late: it is counted in dropped_iterations. A non-zero dropped_iterations means missing samples, so treat it as an invalid run, not a footnote.",
            "**HdrHistogram** offers a correction after the fact (recording with an expected interval), which adds synthetic samples for the gaps. It assumes a constant rate and a closed-loop pattern, so it is an approximation; recording the intended time is exact.",
        ]),
        callout("info", "When done - sent is the honest number",
            "In a truly closed system the client really does wait before sending more: CodeDev's grader workers pull one job, run it, then pull the next. For them, time per job from the moment it is pulled is the right metric, and the queue delay belongs to a separate metric (job age at pull time, lesson 3.2). The mistake is applying the closed-system clock to an open system of independent learners."),

        challenge("chal_quiz_qpr_231"),

        h2("4. Worked example: record the intended time where it is known"),
        p("The most reliable fix is in the generator: it knows the schedule, so it can log the due time next to the send time. A minimal fixed-rate sender with asyncio (an example, not a replacement for a real tool):"),
        code("python", `
import asyncio, time

async def fixed_rate(send, rate_per_s, duration_s, connections):
    pool = asyncio.Semaphore(connections)
    t0 = time.monotonic()
    rows, tasks = [], []

    async def one(seq, due):
        async with pool:                      # may wait here: that wait is part of the latency
            sent = time.monotonic()
            status = await send()
            done = time.monotonic()
        rows.append({"seq": seq, "due_ms": (due - t0) * 1000, "sent_ms": (sent - t0) * 1000,
                     "done_ms": (done - t0) * 1000, "status": status})

    for seq in range(int(rate_per_s * duration_s)):
        due = t0 + seq / rate_per_s
        await asyncio.sleep(max(0.0, due - time.monotonic()))
        tasks.append(asyncio.create_task(one(seq, due)))   # never waits for earlier responses
    await asyncio.gather(*tasks)
    return rows`, "fixed_rate.py"),
        p("Two details carry the whole idea. The loop schedules each request at its due time and never waits for responses, so a stall cannot slow the schedule. And the row keeps the due time, so any analysis can start the clock there. The gap sent_ms - due_ms is worth plotting on its own: it shows when the generator itself was the bottleneck."),

        h2("5. Reviewing AI-written measurement code"),
        p("An analysis script never fails loudly: it always prints plausible numbers. Review it with this list:"),
        numbered([
            "**Where does the clock start?** Find the subtraction that defines latency. For an open-model test the start must be the intended (due) time, not the actual send time and not the time the row was logged.",
            "**Which input fields are ignored?** The assistant validated interval_ms, then never used it in the latency. An input the prompt describes but the code ignores is a question to ask.",
            "**Does it assume an order?** Logs are written on completion, so rows are not in seq order. Code that uses the row position as the sequence number works only on runs without slow requests.",
            "**Test it on a run with a known stall.** Healthy runs cannot tell the two clocks apart. Inject a pause and check that the report shows it: with a pause of P seconds at a rate of r per second, about r x P requests are due during it, and they wait on average about P / 2 or more.",
            "**Count against the schedule.** The number of rows should equal rate x duration; fewer means omitted samples (closed loop or dropped iterations), and no percentile computed from them is valid.",
        ]),
        p("The challenge gives you the assistant's script. Its public tests are runs where every request was sent on time, and they pass. The hidden tests replay recorded runs with stalls: one connection behind a slow response, a 1.2 s server pause with 8 connections, and a run whose rows are logged in completion order with a start time that is not 0."),

        challenge("chal_coding_qpr_232"),

        h2("6. How to verify the fix"),
        bullets([
            "**An injected stall in staging.** Hold the lock on purpose (for example a transaction that locks the scores table for 2 s, or a latency fault in a proxy such as Toxiproxy) at a known time, and check that the corrected report puts roughly rate x pause requests above the normal latency.",
            "**Two clocks side by side.** Report done - sent and done - due together for one run. On a healthy run they agree; when they diverge, the difference is generator-side queueing that users would have felt.",
            "**Cross-check with the server.** The API's own latency histogram does not see client-side waiting either, so it agrees with done - sent. A gap between the corrected client numbers and the server numbers is expected under stalls and tells you the delay happened before the request reached the API: in the generator, the load balancer or the connection pool.",
            "**Rows against schedule, and dropped_iterations at zero,** before any percentile goes into a report.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Starting the clock at the actual send time in an open-model test.** Spot it: p99 is close to p50 while the max is in seconds, and the server logs show pauses.",
            "**Trusting a closed-loop tool's percentiles for user-facing latency.** Spot it: request count well below rate x duration, or requests per second that dip exactly during the stalls.",
            "**Using the row position as the sequence number.** Spot it: the log is written on completion; sort a stalled run by done time and the positions no longer match the seq column.",
            "**Patching the numbers after the fact.** Spot it: synthetic samples added to a histogram change the request count; prefer recording the due time, and if you must correct, say so in the report.",
            "**Reviewing measurement code only on healthy runs.** Spot it: no test in the review contains a stall, so the two clocks were never different.",
        ]),

        h2("8. Summary"),
        numbered([
            "Coordinated omission is a measuring system that slows down with the system under test: closed-loop tools omit the slow samples, fixed-rate tools that start the clock at the actual send time hide the queueing delay.",
            "In an open-model test, measure each request from its intended send time; keep the due time in the log, keep dropped iterations at zero, and treat corrections after the fact as approximations.",
            "Review AI-written measurement code by finding where the clock starts, which inputs it ignores and which order it assumes, and by running it on a log with a known injected stall.",
        ]),

        h2("Sources"),
        bullets([
            "wrk2 README: constant throughput and latency measured from the intended start time - https://github.com/giltene/wrk2",
            "Gil Tene: How NOT to Measure Latency (talk), and the HdrHistogram documentation on recording with an expected interval",
            "Grafana k6 documentation: arrival-rate executors and dropped_iterations - https://grafana.com/docs/k6/latest/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the load tool your team uses and find out, from its docs and from a test, where its latency clock starts. Run it against a local endpoint that sleeps 2 s once every 20 s, at a fixed rate, and compare its p99 with what you expect from rate x pause. If it falls short, add the due time to the log and redo the analysis, or switch to a tool that measures from the intended time."),
    ],
});
