// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-3-1",
    title: "Percentiles from histograms",
    slug: { _type: "slug", current: "percentiles-from-histograms" },
    description:
        "The latency panel said the p95 of POST /submissions was 210 ms while learners waited seconds for Run, and the request-rate panel dropped below zero at every deploy. Learn why percentiles describe what users feel and averages do not, why you can add histogram buckets but never percentiles, exactly how histogram_quantile turns buckets into p50/p95/p99 (and how far off it can be), how counters survive a restart, and how to choose bucket boundaries.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "Support has 23 tickets this week that say \"Run spins for 3-4 seconds before anything happens\". The team's latency panel for POST /submissions on https://api.codedev.test says p95 = 210 ms and has said so all week. The panel shows the median of a p95 that each of the six API instances computes for itself, \"so one noisy instance does not skew it\". A second panel, \"submit requests per second\", drops to minus 3,000 for one minute at every deploy. Nobody trusts either panel, and the product lead wants to know how slow submitting really is.",
    },

    content: [
        h2("1. The incident: a p95 that nobody experienced"),
        p("This is the latency panel the team has been looking at, and the query behind it. Each API instance keeps a rolling five-minute window of request durations in memory and exports its own 95th percentile:"),
        code("text", `
Panel: Submit latency p95                      last 7 days: 0.19 - 0.23 s
Query: quantile(0.5, submit_latency_p95_seconds{route="/submissions"})

Panel: Submit requests per second
Query: sum(delta(submit_requests_total[1m])) / 60
       14:02  -3034.3/s   <- deploy of codedev-api 2026.10.22
       14:03   38.9/s`, "Grafana, Platform overview"),
        p("Both queries look reasonable and both are wrong for reasons that have nothing to do with the code that serves submissions. The first one aggregates percentiles; the second one subtracts counter values across a process restart. This lesson replaces them with a histogram and two PromQL functions that are built for exactly these jobs, and shows you what those functions compute, so you can trust (and test) the numbers."),

        h2("2. Reproduce it and read the evidence"),
        p("Split the panel by instance instead of aggregating it. One instance stands out:"),
        code("text", `
submit_latency_p95_seconds{route="/submissions"}     requests in the last 5 min
api-1   0.19 s                                        1,480
api-2   0.20 s                                        1,510
api-3   0.18 s                                        1,450
api-4   0.21 s                                        1,470
api-5   3.40 s                                          460
api-6   0.19 s                                        1,500`, "PromQL, last 5 minutes"),
        p("`api-5` runs on a node shared with a batch job that saturates its CPU. The load balancer sends it fewer requests because it answers slowly, but those 460 requests are almost 6% of all 7,870 submissions, and almost all of them take 3-4 s. One submission in seventeen waiting seconds is exactly what the tickets describe. The median of six p95 values gave `api-5` no say at all: about 0.195 s, the panel's flat line. Averaging them instead would not help: the mean of 0.19, 0.20, 0.18, 0.21, 3.40 and 0.19 is about 0.73 s, which gives an instance with 460 requests the same weight as one with 1,510 and is neither the p95 of all requests nor anything a learner felt."),
        p("The fix is not a better formula on top of six percentiles: you cannot get the right answer from them at all. Each instance has to export **counts**, not percentiles, so the counts of all instances can be added up first."),

        h2("3. Core idea: count requests in buckets, compute percentiles last"),
        h3("Why percentiles, not the average"),
        p("Latency is not spread around an average like heights in a class. Most requests are fast; a few are very slow (a cold cache, a slow node, a lock, a retry). The **mean** mixes both into a number that describes neither. A **percentile** answers a question a user can feel: p95 = 2.1 s means 95% of requests finished within 2.1 s and 5% took longer. At 30 submissions per learner per day, a learner with a p95 of 2.1 s waits more than 2.1 s about one or two times every day."),
        p("When **not** to reach for p99: with 40 requests in a window, the p99 is decided by the single slowest request, and it jumps around with every outlier. Use a longer window, a lower percentile, or look at the slow requests themselves in traces (lesson 5). A percentile is a statistic about many requests; it is not a measurement of one."),
        h3("What a histogram stores"),
        p("A histogram metric does not keep durations. It keeps a **counter per bucket**: how many requests took at most `le` (\"less than or equal\") seconds, since the process started. In the Prometheus text format, one histogram with a route label looks like this:"),
        code("text", `
# TYPE http_server_request_duration_seconds histogram
http_server_request_duration_seconds_bucket{http_route="/submissions",le="0.1"}   18210
http_server_request_duration_seconds_bucket{http_route="/submissions",le="0.25"}  51870
http_server_request_duration_seconds_bucket{http_route="/submissions",le="0.5"}   60455
http_server_request_duration_seconds_bucket{http_route="/submissions",le="1"}     61980
http_server_request_duration_seconds_bucket{http_route="/submissions",le="2"}     62310
http_server_request_duration_seconds_bucket{http_route="/submissions",le="5"}     62390
http_server_request_duration_seconds_bucket{http_route="/submissions",le="+Inf"}  62402
http_server_request_duration_seconds_sum{http_route="/submissions"}   11873.6
http_server_request_duration_seconds_count{http_route="/submissions"} 62402`, "curl -s http://api-1:9464/metrics"),
        bullets([
            "**Buckets are cumulative.** `le=\"0.5\"` includes everything in `le=\"0.25\"`. The requests between 0.25 s and 0.5 s are the difference: 60,455 - 51,870 = 8,585.",
            "**`le=\"+Inf\"` counts every request**, so it always equals `_count`. `_sum` is the total of all durations, which gives the mean (`_sum / _count`) if you ever need it.",
            "**Every number is a counter.** It only grows, until the process restarts and it begins again at 0.",
        ]),
        h3("Why you can add buckets but not percentiles"),
        p("\"Requests on api-1 that took at most 0.5 s\" plus \"requests on api-5 that took at most 0.5 s\" is \"requests on both that took at most 0.5 s\". Counts add up. Percentiles do not: the p95 of the union depends on how many requests each side had and how they were spread, which a single number per instance has thrown away. That is why the rule is **sum the buckets by `le`, then compute the quantile**, never the other way round. It is also why an in-process percentile (a Prometheus *summary*, or the rolling p95 in this incident) is fine for one process and useless as soon as you have two."),
        callout("info", "OpenTelemetry names and Prometheus names",
            "The OpenTelemetry HTTP semantic conventions define the histogram `http.server.request.duration` in seconds, with attributes such as `http.request.method`, `http.route` and `http.response.status_code`. Exported to Prometheus, recent exporter versions turn it into `http_server_request_duration_seconds_bucket`, `_sum` and `_count`, and `http.route` into the label `http_route`. Older instrumentation versions recorded `http.server.duration` in milliseconds. Check what your SDK and exporter actually produce on `/metrics` before you write queries."),

        h2("4. How histogram_quantile computes a percentile"),
        p("`histogram_quantile(q, buckets)` only knows how many requests fell into each bucket, so it estimates. Here is what Prometheus does, on cumulative buckets sorted by `le`:"),
        numbered([
            "Take the total, the count of the `+Inf` bucket. If there is no `+Inf` bucket, or the total is 0 (no requests in the window), the result is `NaN`: there is nothing to estimate. A `q` below 0 gives `-Inf` and above 1 gives `+Inf`.",
            "Compute the **rank** `q x total`: for the p95 of 2,000 requests, the rank is 1,900.",
            "Walk the buckets from the smallest `le` and stop at the first one whose count reaches the rank. The requests with that rank finished somewhere inside this bucket.",
            "**Interpolate linearly** inside it: assume its requests are spread evenly between the bucket's lower edge (the previous `le`, or 0 for the first bucket) and its upper edge (its own `le`).",
            "If the rank is only reached in the `+Inf` bucket, there is no upper edge to interpolate to. Prometheus returns the highest finite `le`: \"at least this slow, we cannot tell more\".",
        ]),
        p("A worked example with different numbers from the exercises: 2,000 requests, buckets `le=0.25` -> 1,500, `le=0.5` -> 1,880, `le=1` -> 1,960, `+Inf` -> 2,000. The p95 rank is 1,900. The first bucket that reaches it is `le=1`, whose lower edge is 0.5 and whose own requests are 1,960 - 1,880 = 80. The rank is 20 requests into that bucket: 0.5 + (1 - 0.5) x 20 / 80 = **0.625 s**. The p99 rank, 1,980, is never reached by a finite bucket, so the p99 is reported as **1 s**, even if those 40 requests took 30 s."),
        h3("How far off can it be?"),
        p("The true p95 in that example is somewhere between 0.5 s and 1 s; 0.625 s assumes the 80 requests of that bucket are spread evenly. **The error is bounded by the width of the bucket**, so put boundaries where decisions are made. The submit SLO in lesson 10 counts requests answered within 2 s, so 2 must be a boundary; a dashboard question \"are we under 500 ms?\" needs a boundary at 0.5. The OpenTelemetry semantic conventions recommend boundaries for HTTP durations (from 5 ms to 10 s); they are a sensible start, not a law. More buckets mean more precision and more series: every boundary is one more counter per label combination (lesson 8)."),
        callout("tip", "Exponential and native histograms",
            "OpenTelemetry also defines an exponential histogram, and Prometheus has native histograms, which pick their own boundaries with a fixed relative error. They avoid the boundary decision at the cost of backend support. Check that your SDK, collector and backend all handle them before switching; the reasoning in this lesson (aggregate counts, then estimate) stays the same."),

        challenge("chal_quiz_otl_311"),

        h2("5. Counters, restarts and rate()"),
        p("Each bucket is a counter that keeps growing for the life of the process. A latency panel for \"the last 5 minutes\" needs the **increase** over the window, and that is where the second panel went wrong. At the deploy, `api-3` restarted: its counter went from 184,220 to 210. `delta()` is meant for gauges and simply subtracts: -184,010 for `api-3`, more than the 1,950 requests the other five instances served in that minute, so the sum is negative."),
        p("`rate()` and `increase()` are written for counters. When a value is lower than the previous one, they treat it as a **reset**: the process began again at 0, so the increase since the reset is the new value itself (210 here), not a negative number. Two rules follow:"),
        bullets([
            "**Use `rate()` or `increase()` on counters, `delta()` only on gauges.** Buckets, `_count` and `_sum` are counters.",
            "**Apply `rate()` first, then `sum`.** Summing raw counters across instances first hides each instance's reset inside a total that just goes down a little, and `rate()` can no longer see it.",
        ]),
        code("text", `
# requests per second, all instances, resets handled per series
sum(rate(http_server_request_duration_seconds_count{http_route="/submissions"}[5m]))

# p50 / p95 / p99 over all instances: rate per bucket, sum by le, then estimate
histogram_quantile(0.95,
  sum by (le) (rate(http_server_request_duration_seconds_bucket{http_route="/submissions"}[5m])))`, "PromQL"),
        p("Keep `le` in the `by` clause, or `histogram_quantile` has no buckets left to read. To keep a per-route panel, add the label: `sum by (le, http_route)`. Prometheus's `rate()` also extrapolates to the edges of the window; the exercise below leaves that out and works on two snapshots."),

        h2("6. Worked example: record it once, query it right"),
        p("Most HTTP instrumentation already records the request duration histogram. For a duration you measure yourself, such as the time a submission waits in the grading queue, create the histogram with boundaries that match your decisions. The OpenTelemetry JavaScript API accepts boundaries as advice when the instrument is created; the option has changed between SDK versions, so check yours, or set them in the SDK with a View:"),
        code("typescript", `
// src/grading/grading.metrics.ts
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("codedev-grading");

// Seconds, with a boundary at every threshold the team reasons about (2 s is the submit SLO).
export const queueWait = meter.createHistogram("codedev.grading.queue_wait", {
    description: "Time a submission waits in the grading queue before a worker picks it up",
    unit: "s",
    advice: { explicitBucketBoundaries: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60] },
});

// in the worker, when a job starts
queueWait.record((Date.now() - job.enqueuedAt) / 1000, { "codedev.language": job.language });`, "grading.metrics.ts"),
        p("Then replace the two broken panels with the queries from section 5. With the six instances added up by bucket, the real p95 of `POST /submissions` that week was about 3.1 s: the requests that `api-5` served are the slowest 6%, so the 95th percentile falls among them. Moving the batch job off that node brought it back under 300 ms, and the panel showed it the same minute."),
        p("Now build the core of what Prometheus does, on recorded data: the increase of each bucket over a window with restarts, buckets merged from several instances, and `histogram_quantile` with its interpolation and its `+Inf` rule."),
        challenge("chal_coding_otl_312"),

        h2("7. How to verify latency numbers"),
        bullets([
            "**Feed it a distribution you know.** Run a load test against staging with a fake endpoint that sleeps a fixed time (for example 90% at 100 ms, 10% at 1.5 s) and check that the p50 is near 0.1 s and the p95 lands in the bucket that contains 1.5 s.",
            "**Cross-check the count.** `sum(increase(..._count[1h]))` should match the number of requests in the access log or the load balancer for the same hour, within a few percent.",
            "**Look at the buckets, not only the quantile.** `sum by (le) (increase(..._bucket[5m]))` must never decrease from one `le` to the next. If it does, instances use different boundaries, which breaks the estimate.",
            "**Watch a deploy.** The request-rate panel must stay positive and smooth while pods restart. A negative value means `delta()` on a counter or a `sum` before `rate()`.",
            "**Read p99 next to the request count.** A p99 over 50 requests is one request. Show the count on the same panel.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Averaging (or taking the max of) per-instance percentiles.** Spot it: `avg(...p95...)`, `max(...p99...)`, or a summary metric with a `quantile` label in a multi-instance service.",
            "**Summing before `rate()`.** Spot it: `rate(sum(...)[5m:])` or a recording rule that sums raw counters; the rate dips at every restart.",
            "**Reading an interpolated value as a measurement.** Spot it: a p95 reported to the millisecond from buckets 0.5 s wide. Report the bucket, or add a boundary where the decision is.",
            "**A p99 that equals the top boundary for hours.** Spot it: the quantile sits flat at the largest finite `le`; the tail is in `+Inf` and you do not know how slow it is. Add a larger boundary or look at slow traces.",
            "**Dropping `le` in an aggregation.** Spot it: `sum by (http_route) (rate(..._bucket[5m]))` inside `histogram_quantile` returns no data or nonsense.",
        ]),

        h2("9. Summary"),
        numbered([
            "Percentiles describe what users feel; averages hide the slow tail. A percentile over very few requests is noise.",
            "Export counts per bucket, add the buckets of all instances by `le`, and only then estimate the percentile: percentiles cannot be averaged or added.",
            "`histogram_quantile` interpolates inside a bucket and stops at the highest finite boundary, so put boundaries at your thresholds; use `rate()`/`increase()` on counters so restarts do not break the numbers.",
        ]),

        h2("Sources"),
        bullets([
            "Prometheus documentation: Histograms and summaries - prometheus.io/docs/practices/histograms/",
            "Prometheus documentation: Query functions (histogram_quantile, rate, increase, delta) - prometheus.io/docs/prometheus/latest/querying/functions/",
            "OpenTelemetry: Metrics concepts - opentelemetry.io/docs/concepts/signals/metrics/ and the HTTP metrics semantic conventions - opentelemetry.io/docs/specs/semconv/http/http-metrics/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Open the /metrics endpoint of a service you run and pick one duration histogram. Write down its boundaries and the thresholds your team cares about (an SLO, a timeout, a UX target): is each threshold a boundary? Then replace one latency panel that averages or takes the max of percentiles with histogram_quantile over sum by (le) (rate(...)), and compare the two for a day that had a slow instance."),
    ],
});
