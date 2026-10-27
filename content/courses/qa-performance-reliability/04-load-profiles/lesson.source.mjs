// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-2-1",
    title: "Load profiles: ramp-up, steady state & ramp-down",
    slug: { _type: "slug", current: "load-profiles-ramp-up-steady-state-ramp-down" },
    description:
        "The exam-day rehearsal passed with \"340 users\", and on exam day the submit endpoint queued learners for seconds. The test had ramped virtual users, not arrivals, and never offered 340 submissions per second. Learn the difference between a closed and an open load model, what each part of a profile (ramp-up, steady state, ramp-down) is for, how long the steady state must be, how to size the generator, and how to check that it really ran the profile you wrote.",
    estimatedTime: 25,

    scenario: {
        role: "QA / performance engineer, CodeDev learning platform",
        problem:
            "Two weeks before exam day the team ran the rehearsal load test for POST /api/submissions: \"340 users for 10 minutes, p95 1.21 s, under the 2 s target\". The ticket was closed. On exam day 340 submissions per second arrived at 09:00, the p95 of submit acceptance climbed past 6 s within four minutes, and support received 180 messages about a spinning Submit button. Nobody had changed the code since the rehearsal.",
    },

    content: [
        h2("1. The incident: a test that passed and a morning that did not"),
        p("The ticket that closed the rehearsal had the script and the summary attached:"),
        code("javascript", `
// load/exam-day.js - rehearsal, 2026-10-12
export const options = {
  scenarios: {
    exam_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 340 },   // "ramp up to the exam-day peak"
        { duration: '10m', target: 340 },  // "hold the peak"
        { duration: '1m', target: 0 },
      ],
    },
  },
};

export default function () {
  http.post('https://api.codedev.test/api/submissions', payload(), params());
  sleep(1);
}`, "k6 script (option names as in current k6 releases; check current docs)"),
        code("text", `
http_req_duration..........: avg=571ms  p(95)=1.21s
http_reqs..................: 129840  216.4/s     (10-minute hold only)
vus........................: 340`, "k6 output, filtered to the hold"),
        p("And the exam-day dashboard, two weeks later:"),
        code("text", `
time   | arrivals POST /api/submissions | p95 submit acceptance | submit queue depth
09:00  | 338/s                          | 0.9 s                 |    40
09:02  | 341/s                          | 2.7 s                 |   910
09:04  | 340/s                          | 6.2 s                 |  2140`, "Grafana, exam day"),
        p("The rehearsal did not lie about what it measured. It measured something else: **216 requests per second**, not 340. The number 340 in the script is a count of virtual users (VUs), and nothing in the script says how many requests per second 340 VUs produce."),

        h2("2. Read the evidence: where 216/s comes from"),
        p("A VU in `ramping-vus` is a loop: send a request, wait for the response, sleep 1 s, repeat. One iteration takes the response time plus the sleep, so the rate one VU produces is 1 / (R + Z), where R is the response time and Z the think time. For N VUs:"),
        code("text", `
throughput = N / (R + Z) = 340 / (0.571 s + 1 s) = 216.4 requests/s`, "closed model, response time law"),
        p("The arithmetic matches http_reqs exactly. It also shows the deeper problem: R is in the denominator. If the API slows down to R = 3 s, the same 340 VUs send only 340 / 4 = 85 requests per second. The test **backs off exactly when the system struggles**, so the queue that grew on exam day could never grow in the rehearsal."),
        p("Learners do not behave like that. At 09:00 each of thousands of learners clicks Submit when they are done, independently; nobody waits for someone else's submission to finish before clicking. The arrival rate is set by the exam, not by the API's latency."),

        h2("3. Core idea: a load profile is a model, a shape and a duration"),
        h3("Closed or open model"),
        bullets([
            "**Closed model:** a fixed population of clients, each waits for its response before the next request. Throughput is an output: N / (R + Z). In k6: `ramping-vus`, `constant-vus`, `per-vu-iterations`. Also wrk, ab, and most \"threads in a loop\" tools.",
            "**Open model:** requests arrive on a schedule (a rate), whatever the latency. Throughput offered is an input; latency and queue length are outputs. In k6: `constant-arrival-rate` and `ramping-arrival-rate`; wrk2 for single endpoints.",
        ]),
        p("Use the model that matches who sends the traffic. Learners submitting answers, visitors opening a page, webhooks from a payment provider: open. A fixed pool of grader workers that pull jobs one at a time, a batch job with 8 threads: closed, because those clients really do wait. When in doubt for public traffic, choose open: a closed test of an open system hides queueing, which is exactly what fails first under a peak."),
        callout("info", "Open-model generators need enough VUs",
            "An arrival-rate executor still runs iterations on VUs. If every pre-allocated VU is busy waiting for slow responses, k6 cannot start the next iteration on time; it reports the missed starts in the dropped_iterations metric (names and behaviour as in current k6 docs; check them for your version). Size preAllocatedVUs with Little's Law: rate x expected iteration time, plus headroom for the slow case you want to see (lesson 4.2)."),

        h3("The shape: what each part is for"),
        bullets([
            "**Ramp-up.** Raises the rate gradually so caches warm, connection pools fill and autoscaling can react the way it would before a real peak. It also lets you see at which rate latency starts to bend (the saturation knee, lesson 3.3). A ramp from 0 to 340/s in one second measures a cold start, not the peak.",
            "**Steady state (the hold).** The only part you compare with the target. At a constant arrival rate, a healthy system settles to a stable latency and queue length; a system that cannot keep up shows latency rising minute after minute. You can only tell the two apart if the hold is long enough.",
            "**Ramp-down.** Watches recovery: does latency return to the baseline, does the submit queue drain, do error rates fall back to zero? A system that stays slow after the load drops has a leak, a stuck pool or a backlog.",
        ]),
        p("When **not** to use this shape: a spike test deliberately jumps to the peak to test the rate limiter and autoscaling, and a soak test holds a moderate rate for hours to find leaks. Both are separate tests with their own question; they do not replace the steady-state test of the target."),

        h3("How long is steady?"),
        p("Long enough for the slowest thing you care about to repeat many times. Rules that hold up in practice:"),
        bullets([
            "at least 10 minutes for an interactive endpoint, and longer than any periodic job that runs in production during the peak (a 5-minute cache refresh must happen at least twice);",
            "many times the slowest acceptable response: with a 2 s target, a 15-minute hold contains hundreds of target-length intervals;",
            "enough samples for the percentile you report: p99 from 300 samples rests on the 3 slowest, so a hold of minutes at hundreds of requests per second is fine, a hold of 20 s is not.",
        ]),
        p("The k6 summary at the end of the test covers the whole run, ramps included. Ramps run at lower rates and are mostly fast, so they pull the percentiles down. Compare the target with the steady-state window only: a dashboard filtered by time, or the log analysis of the next lesson."),

        challenge("chal_quiz_qpr_211"),

        h2("4. Worked example: the rehearsal as an open-model profile"),
        p("The corrected script keeps the shape and changes the model. The targets are now arrivals per second:"),
        code("javascript", `
// load/exam-day.js - open model
export const options = {
  scenarios: {
    exam_day: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',          // targets are iterations (= requests) per second
      preAllocatedVUs: 800,
      maxVUs: 1500,
      stages: [
        { duration: '5m', target: 340 },   // ramp-up
        { duration: '15m', target: 340 },  // steady state: compare with the target here
        { duration: '2m', target: 0 },     // ramp-down: watch recovery
      ],
    },
  },
};

export default function () {
  http.post('https://api.codedev.test/api/submissions', payload(), params());
  // no sleep(): the schedule decides when the next request starts
}`, "k6 script (check current docs for option names)"),
        p("Before running it, compute what the profile asks for. This helper is plain Python and works for any stage list; it uses the area under the rate line, which is exact for straight ramps:"),
        code("python", `
def profile_summary(stages, start_rate=0, expected_iteration_s=0.6, slow_iteration_s=3.0):
    """stages: [(duration_s, target_rate), ...] with straight-line ramps between targets."""
    rate, total, duration = start_rate, 0.0, 0
    for seconds, target in stages:
        total += seconds * (rate + target) / 2     # trapezoid under the ramp or hold
        duration += seconds
        rate = target
    peak = max([start_rate] + [target for _, target in stages])
    return {
        "duration_min": duration / 60,
        "requests": round(total),
        "peak_rate": peak,
        # Little's Law: busy VUs = arrival rate x time per iteration
        "vus_expected": round(peak * expected_iteration_s),
        "vus_if_slow": round(peak * slow_iteration_s),
    }

print(profile_summary([(300, 340), (900, 340), (120, 0)]))
# {'duration_min': 22.0, 'requests': 377400, 'peak_rate': 340, 'vus_expected': 204, 'vus_if_slow': 1020}`, "profile_summary.py"),
        p("The numbers drive two decisions. 377,400 submissions need 377,400 test answers and enough test accounts that no rate limit per user interferes (lesson 4.3 covers test data). And at 3 s per iteration, the slow case you want to observe, the generator needs about 1,020 busy VUs: with only 800 it would drop iterations and quietly turn the open model into a capped one. Hence maxVUs 1500."),

        h2("5. How to verify the profile ran as written"),
        p("A load profile is a plan. Check that the generator executed it before you trust any latency it reports:"),
        numbered([
            "**Achieved rate per second against the schedule.** Plot requests started per second next to the planned rate. In the hold, the achieved rate should sit on the target line; a sag means the generator, not the API, set the pace.",
            "**dropped_iterations is zero** (or k6's equivalent warning in your version). Any dropped iteration in the hold means missing samples, and they are the ones that would have waited longest (lesson 2.3).",
            "**The generator is not the bottleneck.** CPU of the load machine under about 70-80%, no network saturation, no \"too many open files\". A saturated generator stalls and produces the same symptoms as a slow API.",
            "**The steady-state window comes from timestamps.** Take the hold's start and end from the run's own clock (the test started at a known time plus the ramp duration), and use only that window for the comparison with the target.",
        ]),
        p("The challenge below builds the planned schedule that step 1 compares against: the per-second target rate of a profile, its totals and its steady-state window."),

        challenge("chal_coding_qpr_212"),

        h2("6. Common mistakes"),
        bullets([
            "**Reading a VU target as a request rate.** Spot it: http_reqs per second in the output is well below the number in the script, and it falls when latency rises.",
            "**Comparing the whole-run summary with the target.** Spot it: the report quotes the end-of-test p95 of a run with ramps; the same percentile computed over the hold alone is higher.",
            "**A hold too short to show a trend.** Spot it: two or three minutes at the peak, and latency still rising when the ramp-down starts; you cannot tell \"stable\" from \"not yet failed\".",
            "**An undersized generator.** Spot it: dropped_iterations above zero, or achieved rate below the planned rate in the hold, while the API's CPU and pools look relaxed.",
            "**A ramp that is really a spike.** Spot it: a stage like 0 to 340 in 10 s; errors and latency in the first seconds come from cold caches and pools that a real exam morning (with traffic building from 08:45) would have warmed.",
        ]),

        h2("7. Summary"),
        numbered([
            "Choose the load model from who sends the traffic: independent learners arrive at a rate whatever the latency (open model, arrival-rate executors); a closed test of an open system hides queueing.",
            "Ramp-up warms the system and shows where latency bends, the steady state is the only window you compare with the target, ramp-down shows recovery; hold long enough for trends and periodic jobs to show.",
            "Verify the generator ran the profile: achieved rate against the schedule, no dropped iterations, a generator with headroom, and a steady-state window taken from timestamps.",
        ]),

        h2("Sources"),
        bullets([
            "Grafana k6 documentation: Scenarios and executors (ramping-vus, constant-arrival-rate, ramping-arrival-rate), dropped_iterations - https://grafana.com/docs/k6/latest/",
            "wrk2, a constant throughput HTTP load generator - https://github.com/giltene/wrk2",
            "Schroeder, Wierman, Harchol-Balter: Open Versus Closed: A Cautionary Tale (NSDI 2006)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the last load test script your team ran. Write down whether it is a closed or an open model, what each stage is for, and how long the hold is compared with the slowest target and with the periodic jobs that run in production. Compute the offered rate of a closed script with N / (R + Z) from its own output, and size the VUs of an open one with rate x slow iteration time."),
    ],
});
