// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-5-1",
    title: "From load test results to SLOs",
    slug: { _type: "slug", current: "slos-from-load-test-results" },
    description:
        "A release ticket read \"load test PASS: submit p95 1.42 s < 2 s\" and proposed promising learners that 99.9% of submissions are accepted within 2 s. The same run rejected 0.30% of valid submissions. Learn what a load test can and cannot tell an SLO: a percentile target is a ratio in disguise, the SLI must be computed from the steady-state samples with the SLO's own definition of valid and good, a test result is a ceiling for production rather than a forecast, and a failure at exam-day peak spends the error budget many times faster than the same minutes at night.",
    estimatedTime: 20,

    scenario: {
        role: "QA engineer owning performance tests, CodeDev learning platform",
        problem:
            "The exam on 2026-11-12 will be the busiest hour CodeDev has seen: the forecast is 340 submissions per second at peak. After the pool fix from module 3, the team re-ran the exam-day load test against staging and ticket CD-2291 now reads: \"Load test PASS - POST /api/submissions p95 1.42 s < 2 s at 340/s. Proposed SLO for the status page: 99.9% of submissions accepted within 2 s.\" The product lead wants to publish that promise before the exam. Further down in the same ticket, the summary also shows http_req_failed 0.30%, which nobody commented on.",
    },

    content: [
        h2("1. The incident: a PASS that promised 99.9%"),
        p("This is the part of the k6 end-of-test summary that was pasted into CD-2291. The format is abbreviated, and the exact layout depends on the k6 version (check current docs); the numbers are the ones the run produced:"),
        code("text", `
scenarios: warmup  ramping-arrival-rate   0 -> 340 req/s over 5m
           peak    constant-arrival-rate  340 req/s for 30m

submit_duration (POST /api/submissions, all scenarios)
  avg=618ms  min=4ms  med=402ms  max=10s  p(90)=1.21s  p(95)=1.42s
http_req_failed (all requests, all scenarios; 413 marked expected)
  0.30%  (1,989 of 663,000)`, "CD-2291 k6 summary"),
        p("Two claims were made from it. The first, \"p95 1.42 s < 2 s\", is a true statement about this run. The second, \"we can promise 99.9% within 2 s\", does not follow from it, and the same summary already contradicts it: 0.30% of the requests failed outright, three times more than a 99.9% objective allows, before a single slow request is counted."),
        p("Nobody lied. The summary answered the question the test was written for (\"is p95 under 2 s?\"), and the ticket reused it to answer a different one (\"what can we promise learners?\"). This lesson is about translating between the two honestly: which numbers a load test gives you, how to compute the SLI an SLO needs from the same run, and how much margin to leave."),

        h2("2. Read the evidence: the samples, not the summary"),
        p("The summary mixes the warm-up with the peak (lesson 3.1 showed why that hides the steady state) and counts every non-2xx response as a failure, including requests the service was right to reject. Export the raw samples instead (k6 can write every metric point with `--out json` or `--out csv`; Locust and wrk2 have their own exports) and split the **peak scenario only** by outcome:"),
        code("text", `
POST /api/submissions, scenario=peak (30 min at 340/s)        612,000 requests
  413 payload too large  (deliberate 0.5% of the mix)          3,060
  503 admission limit reached                                  1,836
  202 accepted, slower than 2 s                                  980
  202 accepted within 2 s                                    606,124

valid = 612,000 - 3,060 = 608,940     good = 606,124
SLI   = 606,124 / 608,940 = 99.54%    bad = 2,816 (0.46% of valid)`, "peak-breakdown.txt"),
        p("Now the run says something useful. In the steady state at 340/s, 99.54% of valid submissions were accepted within 2 s. The 413 responses are not failures of the platform (the test sends a few oversized payloads on purpose, because learners do); the 503 responses are. They came from the admission limiter in front of the submit handler, which was set to 350 requests per second. With an open-model generator, arrivals are not perfectly even, so short bursts above 350/s were rejected although the average was 340/s."),
        callout("info", "Use an open model for SLO evidence",
            "The numbers above come from a constant-arrival-rate scenario: requests are sent on schedule whether or not earlier ones have returned. A closed-model generator (a fixed number of virtual users that wait for each response) slows down when the server does and under-reports slow requests, the coordinated omission of lesson 2.3. An SLI computed from such a run looks better than what learners will get."),

        h2("3. What a load test can and cannot tell an SLO"),
        h3("A percentile target is a ratio in disguise"),
        p("With the nearest-rank definition used in this course (`rank = ceil(p/100 x n)`, value = `sorted[rank - 1]`), \"p95 is at most 2 s\" is exactly the same statement as \"at least 95% of the samples took at most 2 s\". So p95 = 1.42 s proves that 95% of requests met the threshold. It says nothing about the remaining 5%: they could all be 2.1 s or all be timeouts."),
        p("An SLO of \"99.9% within 2 s\" is the statement \"p99.9 is at most 2 s, and failures count as slower than 2 s\". You cannot get there from p95. Write SLOs as a ratio of good events to valid events, the form used in the observability course: ratios can be summed across instances, minutes and load generators (add the good counts, add the valid counts, divide), while percentiles cannot be averaged or added at all."),
        h3("Compute the SLI exactly as the SLO defines it"),
        p("The SLI in the load test must use the same definitions as the SLO in production, or the two numbers cannot be compared:"),
        bullets([
            "**Valid events:** every submit request except those rejected because of the request itself (`400`, `401`, `403`, `413`, `422`). A `429` or `503` from your own limiter **is** valid: the learner sent a correct request and the platform refused it.",
            "**Good events:** a valid request answered `202 Accepted` within 2 s, measured from send time on the generator. A timeout with no response is bad, not missing.",
            "**Window:** the steady state of the peak scenario only. Ramp-up and warm-up are excluded because they do not describe the load you are promising to hold (lesson 3.1).",
        ]),
        h3("The load test is a ceiling, not a forecast"),
        p("Staging under a synthetic mix is the best case for production: no deploys during the run, no noisy neighbour on the database, no dependency that fails for three minutes, no learner pasting 200 KB of code at 23:59. A run that reached 99.54% says production at the same load is unlikely to do better than about 99.5%. It does not say production will reach it."),
        p("So set the objective **below** what the test measured, and fix what the test found before you promise more. For CD-2291 that means two things: do not publish 99.9% (the run cannot support it), and treat the 503 responses as a finding. The limiter at 350/s leaves no room for bursts at a forecast peak of 340/s; lesson 5.3 sizes it from evidence. A reasonable outcome of the review was: publish 99.0% for exam day now, rerun after the limiter change, and raise the objective to 99.5% only if the rerun reaches at least 99.8% at peak."),
        h3("Exam day: judge the event window, not only the month"),
        p("A rolling 28-day SLO dilutes a bad exam hour with 27 quiet days. That is fine for release decisions, but the exam is the hour learners remember. Count the error budget in **requests**, and the arithmetic shows why the peak deserves its own check:"),
        code("text", `
SLO 99.5% of valid submits, rolling 28 days; last 28 days: 12,400,000 valid
error budget         = 0.005 x 12,400,000           = 62,000 bad requests

5-minute outage at 03:00 (20 submits/s)  = 20 x 300  =  6,000 bad  (9.7% of the budget)
the same 5 minutes at an exam-day peak                  ... many times more`, "budget-at-peak.txt"),
        p("The same minutes cost far more at peak, which is why a load test at the forecast peak is the right evidence for an SLO, and why many teams add an event objective next to the 28-day one, for example \"during the exam, every 5-minute window has at least 99% good submits\". A load test measures exactly that kind of short window."),
        h3("When not to derive an SLO from a load test"),
        bullets([
            "**When the test environment is not representative.** A staging database with 1% of production's rows or a cache that is always warm gives an SLI with no meaning for production (lesson 4.3). Fix the benchmark first.",
            "**As the only source.** Production history tells you what learners already experience; the load test tells you whether the planned peak keeps it there. Use both: the target comes from what learners need and history supports, and the load test confirms it holds at peak.",
            "**For journeys nobody acts on.** An objective without an error budget policy is one more dashboard. Start with the journeys that matter on exam day: submit, open a lesson, read the leaderboard.",
        ]),

        h2("4. Worked example: the SLI from recorded samples"),
        p("The arithmetic is small enough to keep in a script next to the test, so the SLI in the ticket comes from the same code every time instead of from a hand-filtered spreadsheet. It reads samples with the send time `t` (ms since the start of the run), the HTTP `status` (`0` for a client timeout) and the duration `ms`:"),
        code("python", `
import math

INVALID = {400, 401, 403, 413, 422}   # the request's own fault: not a valid event


def percentile(values, p):
    """Nearest-rank: rank = ceil(p/100 * n), value = sorted[rank - 1]."""
    if not values:
        return None
    ordered = sorted(values)
    return ordered[math.ceil(p / 100 * len(ordered)) - 1]


def submit_sli(samples, start_ms, end_ms, threshold_ms=2000):
    """SLI of POST /api/submissions over the steady-state window [start_ms, end_ms)."""
    window = [s for s in samples if start_ms <= s["t"] < end_ms]
    valid = [s for s in window if s["status"] not in INVALID]
    good = [s for s in valid if s["status"] == 202 and s["ms"] <= threshold_ms]
    return {
        "valid": len(valid),
        "good": len(good),
        "sli": len(good) / len(valid) if valid else None,
        "p95_ms": percentile([s["ms"] for s in valid], 95),
    }


# ten recorded samples: t = send time in ms since the start, status 0 = client timeout
samples = [
    {"t": 1_000, "status": 202, "ms": 3_900},     # warm-up: outside the window
    {"t": 300_100, "status": 202, "ms": 410},
    {"t": 300_103, "status": 202, "ms": 380},
    {"t": 300_106, "status": 413, "ms": 12},      # 3 MB payload: not valid
    {"t": 300_109, "status": 202, "ms": 2_350},   # accepted, but too slow: bad
    {"t": 300_112, "status": 503, "ms": 4},       # admission limit: bad, still valid
    {"t": 300_115, "status": 202, "ms": 1_220},
    {"t": 300_118, "status": 0, "ms": 10_000},    # no answer within 10 s: bad
    {"t": 300_121, "status": 202, "ms": 640},
    {"t": 300_124, "status": 202, "ms": 1_980},
]
report = submit_sli(samples, start_ms=300_000, end_ms=2_100_000)
print(report)
assert report["valid"] == 8 and report["good"] == 5   # 5 / 8 = 62.5%`, "submit_sli.py"),
        p("Notice what the tiny example shows: the 503 is fast (4 ms), so it pulls the latency percentiles **down** while it is a failure for the learner. A latency-only threshold rewards a service for rejecting requests quickly. The SLI counts it as bad."),
        p("Then make the load test enforce the objective itself, so a run that would break it fails in CI instead of being reinterpreted in a ticket. In k6 that is a custom `Rate` metric fed by the same rule, with a threshold on the peak scenario only. Option names below follow the k6 docs at the time of writing; check current docs before you copy them:"),
        code("javascript", `
import http from "k6/http";
import { Rate } from "k6/metrics";

const submitGood = new Rate("submit_good");          // good / valid, as the SLO defines it
const INVALID = [400, 401, 403, 413, 422];
http.setResponseCallback(http.expectedStatuses(202, 413));   // what http_req_failed treats as success

export const options = {
    scenarios: {
        warmup: { executor: "ramping-arrival-rate", startRate: 0, timeUnit: "1s",
                  preAllocatedVUs: 400, maxVUs: 2000, stages: [{ target: 340, duration: "5m" }] },
        peak:   { executor: "constant-arrival-rate", rate: 340, timeUnit: "1s", duration: "30m",
                  startTime: "5m", preAllocatedVUs: 800, maxVUs: 3000 },
    },
    thresholds: {
        // the objective proposed for exam day, judged on the steady state only
        "submit_good{scenario:peak}": ["rate>=0.99"],
    },
};

// payload() picks a body from the recorded production mix, including 0.5% oversized ones
export default function () {
    const res = http.post("https://api.codedev.test/api/submissions", payload(), { timeout: "10s" });
    if (!INVALID.includes(res.status)) {
        submitGood.add(res.status === 202 && res.timings.duration <= 2000);
    }
}`, "exam-day.k6.js"),
        callout("warning", "Know what the timing includes",
            "res.timings.duration in k6 covers sending, waiting and receiving, not DNS lookup or connection setup. That is usually right for a server-side objective, but if learners pay for new TLS connections on exam day (no keep-alive through a proxy), include them or measure them separately. Whatever you choose, use the same definition in production and in the test."),

        challenge("chal_quiz_qpr_511"),

        h2("5. How to verify the translation"),
        bullets([
            "**Recompute the SLI from raw samples.** Run the script over the exported samples of the peak scenario and compare with the k6 threshold result. They must agree exactly, because they apply the same rule to the same samples; a difference means a filter differs (often the scenario tag or the invalid statuses).",
            "**Check the window.** The first sample counted should be sent after the ramp ends, and the count should be close to rate x duration (340 x 1,800 = 612,000). Far fewer means the generator could not keep up and the run is not evidence of 340/s at all.",
            "**Break it on purpose.** Lower the limiter in staging until it rejects 1% and rerun: the SLI must drop by about 1% while p95 barely moves. If p95 is all you watch, this test shows you why it is not enough.",
            "**Compare with production.** After the exam, compute the same SLI from production access logs for the peak hour. A production SLI well below the test's means the test environment or the mix is missing something; fix the test before the next plan.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Promising the percentile you measured as a success ratio.** p95 under 2 s means at least 95% within 2 s, nothing more. Spot it: the proposed objective has more nines than the percentile in the evidence.",
            "**Leaving failures out of the latency SLI.** Fast 503s and timeouts dropped from the samples make the latency look better while learners fail. Spot it: the sample count is lower than the number of requests sent; count failures as bad events.",
            "**Counting the warm-up.** A summary over all scenarios mixes a cold ramp with the peak (lesson 3.1). Spot it: the first minutes have a different distribution from the rest; filter by scenario or by time.",
            "**Setting the objective at the test result.** 99.54% in staging becomes \"SLO 99.5%\" with no margin, and the first deploy during the exam breaks it. Spot it: the objective is within a few hundredths of a percent of the best run; leave room or fix the findings first.",
            "**Averaging percentiles across generators.** Two machines reporting p95 = 1.1 s and 1.9 s do not have a combined p95 of 1.5 s. Spot it: the report combines percentiles with arithmetic; merge the raw samples or add good and valid counts instead.",
        ]),

        h2("7. Summary"),
        numbered([
            "A percentile target is a ratio in disguise: p95 at most 2 s means at least 95% of requests within 2 s. Write SLOs as good events / valid events, which can be added across instances and windows; percentiles cannot.",
            "Compute the SLI from the steady-state samples of an open-model run, with the SLO's own definition of valid (the request's own 4xx excluded) and good (accepted within 2 s; limiter 503s and timeouts are bad).",
            "A load test result is a ceiling for production: set the objective below it, fix what the run found first, and check the exam peak on its own, because a failure at 340/s spends the error budget far faster than the same minutes at night.",
        ]),

        h2("Sources"),
        bullets([
            "Grafana k6 documentation: scenarios and executors (constant-arrival-rate, ramping-arrival-rate), custom metrics, thresholds - grafana.com/docs/k6/latest/",
            "wrk2 README: constant throughput load and coordinated omission - github.com/giltene/wrk2",
            "Google SRE Workbook, chapter \"Implementing SLOs\" - sre.google/workbook/implementing-slos/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the exam-day objective for GET /api/leaderboard, whose target is p95 300 ms: restate it as a ratio of good to valid reads, decide which statuses are invalid, add an availability part, and turn both into k6 thresholds on the peak scenario. Then take a recorded run (any steady-state export from k6, Locust or wrk2), compute the SLI with the script above, and write one paragraph that says which objective the run supports, with how much margin, and what you would fix before promising more."),
    ],
});
