// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-4-1",
    title: "SLOs & error budgets for the submit endpoint",
    slug: { _type: "slug", current: "slos-error-budgets-submit-endpoint" },
    description:
        "Three dashboards gave three different answers to \"is submitting code reliable?\" while learners filed tickets about a Run button that spun for ten seconds and failed. Define what a good submit request is (not a 5xx, answered within 2 s), which requests count at all, a target over a rolling 28-day window, and the error budget that follows from it: 0.5% of the requests, or 201.6 minutes at average traffic. Then use the budget to decide whether the next grader release ships.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "Monday's reliability review at CodeDev. The product lead asks one question before approving the next grader release: is POST /submissions reliable enough? The uptime check on GET /health says 100% for the last 28 days. The latency panel says the submit endpoint averages 410 ms. The error panel says 0.9% of submit responses were errors. Meanwhile support has 38 tickets since Friday's release that say the same thing: \"I click Run, it spins for ten seconds, then I get Something went wrong.\" Every number is correct, none of them answers the question, and nobody can say whether shipping another change to the grader this week is a risk the platform can afford.",
    },

    content: [
        h2("1. The incident: three dashboards, three answers"),
        p("This is what the reliability review had on screen, all for `POST /submissions` on https://api.codedev.test over the last 28 days:"),
        code("text", `
Uptime check  GET https://api.codedev.test/health every 60 s       100.00% up
Latency       POST /submissions, mean of http.server.request.duration   410 ms
Errors        POST /submissions, responses with status >= 400          0.90%
Support       tickets tagged "submit" since Friday 2026-10-23           38`, "review-dashboards.txt"),
        p("Each panel answers a question nobody asked. The uptime check calls a handler that returns `200 OK` without touching the grader, so it stays green while submissions fail. The mean hides the shape of the distribution: most requests take 300-600 ms, a few percent take 8-10 s, and the average of the two is a number no learner ever experienced. The error panel counts every 4xx, so it mixes learners who pasted a 3 MB file (rejected with `413`, correctly) with requests the platform failed to serve."),
        p("What the product lead needs is one number that means \"learners can submit code and get an answer in reasonable time\", a target for that number agreed in advance, and a rule for what happens when the target is at risk. That is a **service level indicator (SLI)**, a **service level objective (SLO)** and an **error budget**."),

        h2("2. Read the evidence: what did learners actually get?"),
        p("Start from the requests, not from the panels. The submit endpoint is already instrumented with OpenTelemetry (lesson 7): the HTTP server instrumentation records the histogram `http.server.request.duration` with the attributes `http.request.method`, `http.route` and `http.response.status_code`. Split the last 28 days of `POST /submissions` by outcome:"),
        code("text", `
POST /submissions, rolling 28 days (2026-09-29 .. 2026-10-26)
all requests                                   12,493,000
  4xx  (400 validation, 401, 403, 413 too large, 422)   93,000
  5xx  (500, 502, 503, 504)                          21,000
  2xx/3xx slower than 2 s                            10,500
  2xx/3xx within 2 s                             12,368,500

since Friday's release (2026-10-23 16:00): 5xx 0.4%, slower than 2 s 1.1%`, "submit-breakdown.txt"),
        p("Now the tickets make sense. Since the release, about 1.5% of submit requests either failed with a 5xx or took longer than 2 s, which is when the client shows its spinner long enough for learners to give up. Over the whole 28 days it is far less, and the 0.9% error panel was dominated by 4xx responses that had nothing to do with the incident."),
        callout("info", "Measure as close to the learner as you can",
            "Server-side metrics miss requests that never reached the server (DNS, TLS, a load balancer that dropped them). For a first SLO, the server histogram is the simplest honest source and it is what this lesson uses. If the load balancer or the browser also records request outcomes, compare them with the server's numbers once a month: a large gap means users fail somewhere you are not measuring."),

        h2("3. SLI, SLO, error budget: why and when"),
        h3("SLI: a ratio of good events to valid events"),
        p("An SLI is a proportion: **good events / valid events**, measured over a window. Expressing it as a ratio between 0 and 1 makes it comparable across endpoints and lets you reason about it the same way for availability and latency. For the submit endpoint the team agreed on one combined SLI:"),
        bullets([
            "**Valid event:** a `POST /submissions` request that reached the API and was well formed. 4xx responses caused by the request itself (400, 401, 403, 413, 422) are not valid events: the service did its job by rejecting them.",
            "**Good event:** a valid request answered with a status below 500 **and** within 2 s (the server-side duration). A 5xx is bad; a 200 after 9 s is bad too, because the learner already gave up.",
            "**Excluded:** synthetic checks and load tests (they carry the header `x-codedev-synthetic: 1` and are dropped by the collector before the metric is recorded), and nothing else. Your own outages, deploys and slow dependencies stay in: learners experienced them.",
        ]),
        p("Why one combined SLI rather than an availability SLO and a latency SLO? It is simpler: one budget, one alert policy, one number in the review. Teams that need different targets for the two (for example 99.9% non-5xx but only 99% within 2 s) keep two SLOs; start with one and split only when a decision needs it."),
        h3("SLO: a target over a window"),
        p("The SLO is the target for the SLI over a window: **99.5% of valid submit requests are good, over a rolling 28 days**. Each part is a choice:"),
        bullets([
            "**The target** comes from what learners tolerate and what the platform can deliver, not from a wish. The grader depends on a sandbox pool and a database that are themselves not 100% available; a target above what your dependencies give you will be missed every month. 100% is never a target: it leaves no room for a single deploy.",
            "**A rolling window** (the last 28 days, recomputed every minute) moves smoothly. A calendar month resets the budget on the 1st, which invites risky releases on the 2nd and panic on the 29th. 28 days contain exactly four of each weekday, so weekly traffic patterns do not shift the result.",
            "**The latency threshold** (2 s) must be a bucket boundary of the histogram. Between boundaries the backend can only interpolate (lesson 7), and an SLI that counts \"requests up to 2 s\" from a bucket ending at 2.5 s is quietly wrong.",
        ]),
        h3("Error budget: what the SLO allows you to spend"),
        p("The error budget is `1 - SLO`: the share of valid requests that may be bad in the window, here 0.5%. Expressed in requests, it is 0.5% of the valid requests in the window. Expressed in time at **average** traffic, it is 0.5% of 28 days:"),
        code("text", `
28 days                = 28 x 24 x 60      = 40,320 minutes
error budget (99.5%)   = 0.005 x 40,320    = 201.6 minutes
                       = 3 h 21 min 36 s of total failure at average traffic

valid requests (28 d)  = 12,493,000 - 93,000 = 12,400,000
error budget           = 0.005 x 12,400,000  = 62,000 bad requests`, "budget.txt"),
        p("The two forms answer different questions. Minutes are easy to talk about in a review. Requests are what the SLI actually counts, so a failure at 03:00, when traffic is a fraction of the daytime peak, spends far less budget than the same minutes at 14:00. When the two disagree, the request count is the truth for a request-based SLI."),
        h3("When not to write an SLO"),
        bullets([
            "**When nobody will act on it.** An SLO without an agreed consequence (section 5) is just another dashboard. Write SLOs for the few user journeys that matter (submit code, load a lesson, sign in), not for every endpoint.",
            "**When there is too little traffic to measure.** With 50 requests a day, one failure moves the SLI by 2%. Use longer windows, synthetic traffic, or group several endpoints into one journey (lesson 11 comes back to this for alerts).",
            "**For work no user waits for.** A nightly leaderboard rebuild needs a freshness or completion objective (\"done by 06:00\"), not a request success ratio.",
        ]),

        h2("4. Worked example: the SLI from the histogram"),
        p("With the OpenTelemetry histogram exported to Prometheus, the SLI needs two recording rules: valid requests and good requests per second. Metric and label names below follow the usual OpenTelemetry-to-Prometheus translation (dots become underscores, seconds get a suffix); check the names your exporter actually produces before you copy them."),
        code("yaml", `
# prometheus/rules/slo-submit.yml
groups:
  - name: slo-submit
    rules:
      # valid: every POST /submissions except the 4xx caused by the request
      - record: slo:submit_valid:rate5m
        expr: |
          sum(rate(http_server_request_duration_seconds_count{
            http_request_method="POST", http_route="/submissions",
            http_response_status_code!~"4.."}[5m]))
      # good: valid, not 5xx, and in the le="2" bucket (answered within 2 s)
      - record: slo:submit_good:rate5m
        expr: |
          sum(rate(http_server_request_duration_seconds_bucket{
            http_request_method="POST", http_route="/submissions",
            http_response_status_code!~"[45]..", le="2"}[5m]))`, "slo-submit.yml"),
        p("The `le=\"2\"` series exists only if 2 s is a configured bucket boundary, which is why the SLO and the histogram buckets are decided together. If the query returns nothing, fix the buckets first; do not switch to a neighbouring boundary and call it the same SLO."),
        p("The budget arithmetic is small enough to keep in code with a test, so the review numbers come from one place instead of a spreadsheet:"),
        code("typescript", `
type Window = { valid: number; good: number };

function budgetReport(w: Window, slo: number) {
    const allowedBad = (1 - slo) * w.valid;           // the budget, in requests
    const bad = w.valid - w.good;
    return {
        sli: w.good / w.valid,
        allowedBad: Math.round(allowedBad),
        bad,
        spent: Math.round((bad / allowedBad) * 1000) / 10,   // % of the budget used
    };
}

// a window with an easy answer: 1,000,000 valid, 2,000 bad, SLO 99.5%
const r = budgetReport({ valid: 1_000_000, good: 998_000 }, 0.995);
console.assert(r.allowedBad === 5000 && r.spent === 40, "40% of a 5,000-request budget");`, "budget.ts"),

        h2("5. Using the budget to decide releases"),
        p("The point of the budget is that it turns \"is it reliable enough?\" into arithmetic, and \"should we ship?\" into a rule agreed before anyone is under pressure. CodeDev's error budget policy for the submit endpoint, signed off by the product lead and the platform team:"),
        code("text", `
Error budget policy - POST /submissions (SLO 99.5%, rolling 28 days)
budget left >= 50%   ship as usual (canary 10% for 30 min, then everyone)
budget left 25-50%   ship, but only with a canary of 60 min and the on-call engineer watching
budget left < 25%    feature releases of the grader wait; reliability fixes and rollbacks only
budget exhausted     freeze grader changes until the 28-day SLI is back above 99.5%;
                     the postmortem names the change that spent the budget`, "error-budget-policy.txt"),
        p("Read it both ways. A full budget is permission to take risks: ship faster, run the database migration, try the new sandbox runtime. An empty budget is not a punishment; it says the service has already used up the unreliability learners will tolerate this month, so the next hour of engineering time is better spent on reliability than on features. The policy works only because it was agreed before the incident; negotiating it during one never ends well."),
        callout("tip", "Spend the budget on purpose",
            "Teams that never spend their budget usually have a target that is too loose or release too cautiously. If the submit endpoint ends every month with 90% of its budget left, that is a reason to ship more often, or to tighten the SLO the learners actually feel."),

        challenge("chal_quiz_otl_411"),

        h2("6. How to verify an SLO"),
        bullets([
            "**Recompute one hour by hand.** Take one hour of access logs or traces for `POST /submissions`, count valid and good requests with the same rules, and compare with the recording rules for that hour. They should agree to within a fraction of a percent; a larger gap means a filter differs (often the route label or the 4xx exclusion).",
            "**Check that the latency boundary exists.** Query `http_server_request_duration_seconds_bucket{le=\"2\"}` for the route. No series means the SLI is silently zero or interpolated.",
            "**Break it on purpose in staging.** Make the grader return 503 for one minute and add a 3 s delay for another: the bad count must move by exactly those requests, and a request rejected with 413 must not move it.",
            "**Unit-test the arithmetic.** The budget function above runs under `tsc --strict` with asserts on a window whose answer you know; the review deck reads its numbers from it.",
            "**Compare with the tickets.** Over a month, weeks with many \"submit\" support tickets should be weeks where the SLI dipped. If learners complain while the SLI stays perfect, the SLI measures the wrong thing.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**An SLI from a health check.** `GET /health` exercises the web server, not the grader. Spot it: the SLI stays at 100% during an incident with support tickets; the fix is an SLI on the real `POST /submissions` requests.",
            "**Averages instead of thresholds.** A mean latency of 410 ms hides 1% of requests at 9 s. Spot it: the mean barely moves during an incident that learners notice; count requests over the threshold instead.",
            "**Counting every 4xx as bad.** A learner pasting a 3 MB file is not an outage, and their retries would spend your budget. Spot it: the SLI drops when a single user or a bot sends invalid requests; check the breakdown by status code. Track a 4xx caused by your own bug (for example, a validation change that rejects valid code) as an incident, not as noise.",
            "**A target tighter than the dependencies.** 99.99% on top of a sandbox pool that delivers 99.9% is missed every month. Spot it: the budget is exhausted every window regardless of what the team does; set the target from measured history and dependencies.",
            "**Excluding the outages you caused.** \"Planned maintenance\" and \"bad deploy\" windows silently removed from the SLI make it look great and useless. Spot it: the exclusion list grows after every incident; exclude only traffic no learner sent (synthetic checks, load tests).",
        ]),

        h2("8. Summary"),
        numbered([
            "An SLI is good events / valid events where users feel it; for the submit endpoint a request is good when it is not a 5xx and is answered within 2 s, and 4xx caused by the request are not valid events.",
            "An SLO is a target over a rolling window (99.5% over 28 days), and the error budget is 1 - SLO: 0.5% of valid requests, or 201.6 minutes of total failure at average traffic. Count budget in requests, not minutes.",
            "The budget is a decision tool: an error budget policy agreed in advance says when releases ship normally, slow down or stop, and the next lesson turns the same budget into alerts.",
        ]),

        h2("Sources"),
        bullets([
            "Google SRE Workbook, chapter \"Implementing SLOs\" and chapter \"Alerting on SLOs\" - sre.google/workbook/alerting-on-slos/",
            "OpenTelemetry semantic conventions for HTTP metrics: http.server.request.duration - opentelemetry.io/docs/concepts/signals/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the SLO document for another CodeDev journey, \"open a lesson\" (GET /lessons/:id plus the Sanity content it needs): the SLI with its valid and good events, what you exclude and why, the target and window, the budget in requests for last month's traffic, and the error budget policy you would propose. Then recompute one hour of the SLI from the access log and compare it with your recording rule."),
    ],
});
