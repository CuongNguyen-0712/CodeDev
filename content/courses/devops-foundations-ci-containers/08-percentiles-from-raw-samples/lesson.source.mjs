// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-devf-4-1",
    title: "Metrics, logs & traces: percentiles from raw samples",
    slug: { _type: "slug", current: "devops-metrics-logs-traces-percentiles" },
    description:
        "Rice Rocket's latency dashboard showed an average of 157 ms, comfortably under the 300 ms target, while 1 in 10 checkouts waited more than 4 seconds for a payment call and customers gave up. A second chart averaged the p95 of each server into a number that matched no request at all. Learn what metrics, logs and traces each answer, counters, gauges and histograms, why averages hide the slow tail, how to compute p50, p95 and p99 from raw samples, why percentiles cannot be averaged, how Prometheus histograms approximate them, and how error rates, SLIs and SLOs turn all of it into a yes or no.",
    estimatedTime: 22,

    scenario: {
        role: "Junior DevOps engineer on the on-call rotation at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "On Friday at lunch, support received 60 complaints in an hour: the checkout button spun for several seconds, and many customers closed the app. The on-call dashboard was green the whole time. Its main panel, API latency, showed the average duration of all requests: 157 ms against a 300 ms target. Next to it, a fleet p95 chart averaged the p95 of four servers and jumped between 300 ms and 1.4 s all day, so people had learned to ignore it. Nothing on the dashboard said that 1 in 10 checkouts was taking more than 4 seconds.",
    },

    content: [
        h2("1. The incident"),
        p("The payment provider had a bad day: some of its calls hung until Rice Rocket's 4-second timeout fired. Those checkouts took over 4 seconds; everything else was normal. The dashboard missed it for three reasons:"),
        bullets([
            "**It showed an average.** One slow request in ten raises an average a little; it does not turn it red. And the panel averaged **all endpoints together**: 1800 fast `/menu` requests per minute buried 200 checkouts.",
            "**It mixed endpoints.** Browsing the menu and paying are different experiences with different targets. Only checkout was broken, and only a per-endpoint number could show it.",
            "**The p95 chart averaged percentiles.** Each server reported its own p95, and the chart showed the mean of the four values. That number does not describe any set of requests, it jumped whenever one quiet server had a few slow calls, and the team had stopped trusting it.",
        ]),
        p("The data to see the problem was there: every request's duration had been measured. It was summarized the wrong way. This lesson is about summarizing it the right way."),

        h2("2. Reproduce it"),
        p("One minute of Friday lunch traffic, simplified: 1800 menu requests at 110 ms, 200 checkouts of which 20 hit the payment timeout. Save as `repro.py` and run `python repro.py`:"),
        code("python", `
from statistics import mean

# one minute of Friday lunch traffic, durations in ms
menu = [110] * 1800
checkout = [180] * 180 + [4200] * 20      # 20 payment calls hit the 4 s timeout

everything = menu + checkout
print(f"dashboard average: {mean(everything):.1f} ms")
print(f"checkout average:  {mean(checkout):.1f} ms")
slow = [ms for ms in checkout if ms > 1000]
print(f"checkouts over 1 s: {len(slow)} of {len(checkout)}")

# Output:
# dashboard average: 157.2 ms
# checkout average:  582.0 ms
# checkouts over 1 s: 20 of 200`, "repro.py"),
        p("157 ms looks healthy. Even the checkout-only average, 582 ms, describes nobody: 180 customers waited 180 ms and 20 waited 4.2 s. **No customer waited 582 ms.** An average answers \"how much time in total\", not \"how long did people wait\"."),

        h2("3. Metrics, logs and traces"),
        p("Observability data comes in three shapes. Each one answers a different question, and an incident usually needs all three, in this order:"),
        bullets([
            "**Metrics** - numbers over time, cheap to store and fast to query: requests per second, error rate, latency percentiles, memory used. They answer **\"is something wrong, and since when?\"** and they drive dashboards and alerts.",
            "**Logs** - one record per event, with details: `level=ERROR service=checkout msg=\"payment timeout\" order=A-1043`. They answer **\"what exactly happened to this request?\"** but are expensive to keep and slow to aggregate.",
            "**Traces** - the path of one request through every service, as a tree of timed **spans**. They answer **\"where did the time go?\"** - which call, in which service, was slow.",
        ]),
        h3("Three kinds of metric"),
        bullets([
            "**Counter**: a number that only goes up - requests served, errors, bytes sent. You never look at the raw value; you look at its **rate** (per second, per minute). A restart resets it to 0, and tools such as Prometheus handle that.",
            "**Gauge**: a value that goes up and down - memory in use, queue length, open connections. You look at the current value.",
            "**Histogram**: counts of observations in **buckets** - how many requests took up to 100 ms, up to 250 ms, up to 1 s. It is the metric for durations and sizes, and the one percentiles come from (section 6).",
        ]),
        p("Two short checklists help you decide what to measure. For every **service**, measure **RED**: **R**ate (requests per second), **E**rrors (failed requests per second), **D**uration (how long requests take, as a distribution). For every **resource** - CPU, disk, a connection pool - measure **USE**: **U**tilization (how busy), **S**aturation (how much work is waiting), **E**rrors."),

        h2("4. Percentiles: how long did people wait?"),
        p("Sort the durations from fastest to slowest. The **p-th percentile** is the value that p percent of the requests did not exceed. **p50** (the median) is the typical request. **p95** and **p99** describe the slow tail - the experience of the unluckiest 5% or 1%."),
        p("There are several ways to compute a percentile. The simplest, and the one this course uses, is the **nearest rank** method: with `n` sorted values, the p-th percentile is the value at **rank `ceil(p x n / 100)`**, counting ranks from 1. It always returns a value that really occurred."),
        image("average-hides-the-tail", {
            alt: "Left panel, Nearest rank: rank = ceil(p x n / 100). Twenty checkout durations in milliseconds, sorted in two rows of ten: 128, 132, 136, 139, 140, 142, 144, 145, 148, 149 (ranks 1 to 10), then 150, 152, 155, 158, 161, 165, 170, 190, 4100, 4300 (ranks 11 to 20). Rank 10, 149, is highlighted blue and labelled p50; rank 19, 4100, and rank 20, 4300, are highlighted red and labelled p95 and p99. A red box says: average = 555 ms; not one request took 555 ms; 18 took under 200 ms, 2 took over 4 s. A green box shows the percentiles for n = 20: p50 is rank ceil(50 x 20 / 100) = 10, value 149 ms, half are faster; p95 is rank 19, value 4100 ms; p99 is rank 20, value 4300 ms; 2 checkouts in 20 waited over 4 seconds and p95 shows it. Right panel, Never average percentiles: server A served 900 requests with p95 = 120 ms, server B served 100 requests with p95 = 4000 ms. A red box: (120 + 4000) / 2 = 2060 ms; the mean of two p95s is not a p95 of anything, it ignores that A served 9 times more requests than B. A green box: merge, then rank, p95 = 200 ms; all 1000 samples sorted, rank 950; B had 50 requests at 4000 ms and 50 at 200 ms, A never went above 180 ms; ranks 951 to 1000 are B's slow 50; keep raw samples or histogram buckets, which can be added up across servers.",
            caption: "Left: the average (555 ms) describes no request, the percentiles point at the slow ones. Right: merge the samples first, then take the percentile.",
        }),
        p("Read the left side of the diagram as a dashboard would: **p50 = 149 ms** says the typical checkout is fine, **p95 = 4100 ms** says that 1 in 20 checkouts or more is taking over 4 seconds. That is the alert the incident needed. Two things to notice:"),
        bullets([
            "**p95 tolerates exactly 5%.** With 20 samples, rank 19 is p95. If only **one** request had been slow, it would sit at rank 20 and p95 would be the fast 190 ms; only p99 would show it. That is why services usually watch both p95 and p99.",
            "**At real traffic, the tail is many people.** At 200 checkouts per minute, a bad p99 means 2 customers every minute - 120 an hour.",
        ]),
        h3("Small samples and other methods"),
        p("Other tools interpolate between neighbouring values instead of picking one. Python's `statistics.quantiles` does, and with its default method it can even return a value larger than the largest sample:"),
        code("python", `
from statistics import quantiles

durations = [128, 132, 136, 139, 140, 142, 144, 145, 148, 149,
             150, 152, 155, 158, 161, 165, 170, 190, 4100, 4300]
cuts = quantiles(durations, n=100)        # 99 cut points; cuts[94] is p95
print(cuts[49], cuts[94], cuts[98])

# Output:
# 149.5 4290.0 4458.0`),
        p("4458 ms never happened - the biggest sample is 4300. With thousands of samples all methods agree closely; with 20 they do not. When two dashboards disagree on a p99, check the method before you check the code. In this course, percentiles are always nearest rank."),

        h2("5. Never average percentiles"),
        p("The second chart in the incident averaged per-server p95s. Look at the right side of the diagram: server A's p95 is 120 ms, server B's is 4000 ms, and their mean is 2060 ms. But B served only 100 of the 1000 requests, and only 50 of those were slow. Merge all 1000 samples, sort them, take rank 950: the fleet p95 is **200 ms**. The averaged number was ten times too high here; with other traffic it can be far too low."),
        p("A percentile depends on **every** sample and on **how many** samples each source had. Once a server has reduced its samples to one p95, that information is gone: there is no formula that combines p95s into a p95. The same holds for averaging p95s over time (\"the mean of the last 60 one-minute p95s\")."),
        p("What does combine: raw samples (merge, then rank) and **histogram buckets** (add the counts, then estimate). That is why monitoring systems store histograms."),

        h2("6. Histograms and buckets"),
        p("Keeping every duration forever is too expensive. A **histogram** keeps one counter per bucket instead. In Prometheus, buckets are cumulative: the bucket `le=\"0.25\"` counts every request that took **less than or equal to** 0.25 seconds. This is what the checkout service exposes for the incident minute:"),
        code("text", `
http_request_duration_seconds_bucket{handler="/checkout",le="0.1"} 0
http_request_duration_seconds_bucket{handler="/checkout",le="0.25"} 180
http_request_duration_seconds_bucket{handler="/checkout",le="0.5"} 180
http_request_duration_seconds_bucket{handler="/checkout",le="1"} 180
http_request_duration_seconds_bucket{handler="/checkout",le="2.5"} 180
http_request_duration_seconds_bucket{handler="/checkout",le="5"} 200
http_request_duration_seconds_bucket{handler="/checkout",le="+Inf"} 200
http_request_duration_seconds_sum{handler="/checkout"} 116.4
http_request_duration_seconds_count{handler="/checkout"} 200`, "/metrics"),
        p("180 requests finished within 0.25 s, all 200 within 5 s, so 20 took between 2.5 and 5 s. `_sum` and `_count` give the average (116.4 / 200 = 0.582 s) for free. To estimate p95 over the last 5 minutes for all servers together, Prometheus adds up the buckets and interpolates:"),
        code("text", `
histogram_quantile(0.95,
  sum by (le, handler) (rate(http_request_duration_seconds_bucket[5m])))`, "PromQL"),
        bullets([
            "**`sum by (le, ...)`** adds the bucket counters of every server first. Buckets can be added; percentiles cannot. This is the correct version of the incident's fleet chart.",
            "**The result is an estimate.** Prometheus only knows that the 190th request fell somewhere in the 2.5-5 s bucket, so it interpolates linearly inside it (about 3.75 s here). The real value was 4.2 s.",
            "**Put bucket boundaries where decisions are made.** If the target is 300 ms, have a bucket at exactly 0.3; then \"how many requests were under 300 ms\" is an exact count, not an estimate.",
            "**Prometheus summaries** compute quantiles inside each process. They are precise per server, but they **cannot be aggregated** across servers - the same problem as averaging p95s.",
        ]),

        h2("7. Errors, SLIs and SLOs"),
        p("Latency is half of the user's experience; the other half is whether the request worked. The **error rate** is failed requests divided by all requests. For HTTP services, count **5xx** responses: they are the server's fault. **4xx** responses (a wrong password, a missing page) are usually the client's, and counting them makes the rate move with user behaviour instead of with your bugs."),
        p("A **service level indicator (SLI)** is a measurement phrased as \"good events / valid events\"; a **service level objective (SLO)** is the target for it:"),
        bullets([
            "**Latency SLI**: the share of checkouts that finished within 300 ms. **SLO**: p95 at or under 300 ms (equivalently, at least 95% within 300 ms).",
            "**Availability SLI**: the share of checkouts that did not fail with a 5xx. **SLO**: at most 1% errors.",
            "**Error budget**: the 1% you are allowed to fail. When the budget is used up, reliability work goes before new features; when there is budget left, you can release faster.",
        ]),
        p("SLOs are measured **per endpoint** (or per user journey), because each journey has its own expectation: browsing the menu in 80 ms is normal, paying in 2 s may be fine, paying in 4 s loses the order."),

        h2("8. Traces: where did the 4 seconds go?"),
        p("Percentiles tell you **that** checkout is slow. A trace tells you **why**. Each request gets a trace id; every service it touches records a span with a start time and a duration, and the spans nest into a waterfall. One slow checkout from the incident:"),
        code("text", `
trace 7f3a9c...  POST /checkout                              4212 ms
├─ api: validate cart                                           8 ms
├─ api: SELECT ... FROM orders (postgres)                      14 ms
├─ checkout: reserve courier (dispatch)                        22 ms
└─ checkout: charge card (payment provider)                  4161 ms
   ├─ attempt 1 ............................ timeout after 4000 ms
   └─ attempt 2                                               158 ms`),
        p("Three numbers are tiny and one is almost the whole request: the first payment attempt waited for the full 4-second timeout before the retry succeeded. No metric or log line alone said that. OpenTelemetry is the common standard for producing traces; most languages, including Python, have an SDK that creates spans for HTTP calls and database queries automatically."),
        callout("tip", "Link the three pillars with one id",
            "Write the trace id into every log line of a request. Then the path is: a percentile alert says checkout is slow, an exemplar or a slow-trace query gives you a trace id, the trace shows the slow span, and the logs with that trace id show the exact error."),

        h2("9. Your turn"),
        p("Build the report the dashboard should have shown. `latency_report(slo, samples)` receives raw request samples from several endpoints and returns one row per endpoint and one `all` row, each with the average, nearest-rank p50, p95 and p99, the 5xx error rate and an SLO verdict."),
        challenge("chal_coding_devf_411", "Group the samples by endpoint into a dict of lists. Write one function that summarizes a list of samples, and call it for every endpoint (in sorted order) and once for the whole list for the all row. For the percentile, sort the durations and compute the rank with integer math, (p * n + 99) // 100, then index with rank - 1."),

        h2("10. Pitfalls"),
        bullets([
            "**Alerting on an average**: one slow request in ten barely moves it. Watch p95 and p99.",
            "**One number for all endpoints**: fast, frequent endpoints hide slow, important ones. Report per endpoint.",
            "**Averaging percentiles** across servers or over time: the result is not a percentile. Merge samples or add histogram buckets first.",
            "**Comparing percentiles from different methods** on small samples: nearest rank, interpolation and histogram estimates differ.",
            "**Counting 4xx as errors**: the error rate then tracks user mistakes instead of your bugs.",
            "**Histogram buckets that miss your SLO**: without a bucket at 0.3 s, \"under 300 ms\" is only an estimate.",
            "**Looking at a counter's raw value**: counters reset on restart; use a rate.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every service exports RED metrics: request rate, error rate and a duration histogram, per endpoint.",
            "Dashboards and alerts use p50, p95 and p99, not the average.",
            "Percentiles across servers come from merged samples or summed histogram buckets, never from averaged percentiles.",
            "Histogram buckets include the SLO thresholds.",
            "The error rate counts 5xx responses only.",
            "Each important user journey has an SLI and an SLO, measured per endpoint.",
            "Traces are collected, and log lines carry the trace id.",
        ]),
    ],
});
