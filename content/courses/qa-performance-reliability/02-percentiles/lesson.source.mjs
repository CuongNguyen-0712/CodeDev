// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-1-2",
    title: "Percentiles done right: p50, p95 & p99 from samples",
    slug: { _type: "slug", current: "percentiles-p50-p95-p99-from-samples" },
    description:
        "The weekly load test report marked the leaderboard green with an average of 264 ms against a 300 ms target, while learners waited one to two seconds on every tenth page load. Learn why an average can describe no request at all, how to compute nearest-rank percentiles from raw samples, why tools disagree on the same data, why percentiles cannot be averaged, how many samples a p99 needs, and what to do with failed and invalid samples.",
    estimatedTime: 25,

    scenario: {
        role: "QA engineer owning the weekly load test report, CodeDev learning platform",
        problem:
            "Every Monday the load test of the CodeDev API produces a one-page report. This week it says GET /api/leaderboard: average 264 ms, target p95 300 ms, PASS. Support has a different story: during the Sunday evening contest, learners reported that the leaderboard \"spins for a second or two\" on about one page load in ten. Nobody changed the code. The report and the learners cannot both be right, and the load generator kept every raw sample of the run.",
    },

    content: [
        h2("1. The incident: a green report and a slow leaderboard"),
        p("This is the part of the report that matters:"),
        code("text", `
Weekly load test - week 43 - steady state 20 min, staging, 1x exam-day profile
endpoint                 requests   avg      target         result
GET /api/leaderboard     612,400    264 ms   p95 <= 300 ms  PASS
POST /api/submissions    408,200    412 ms   p95 <= 2 s     PASS`, "load-test-report-week-43.txt"),
        p("Look at the two columns next to each other: the target is a **p95**, the measured value is an **average**. The report compares two different statistics and calls the result a pass. That alone is a reason to distrust it. To see how far off it is, go back to the raw samples."),

        h2("2. Read the raw samples"),
        p("Here are 20 consecutive leaderboard requests from the middle of the run, sorted by duration. Twenty samples are too few to report from (section 4 explains why), but they are enough to see the shape:"),
        code("text", `
GET /api/leaderboard - 20 consecutive successful requests, sorted (ms)
  38   41   44   47   49   52   55   58   61   63
  66   70   74   79   85   91   98 1180 1420 1610

    0-100 ms   #################   17
  100-1000 ms                       0
 1000-2000 ms  ###                  3

mean = 5,281 / 20 = 264.05 ms`, "raw samples"),
        p("The mean is 264 ms, and **no request took anything close to 264 ms**. Seventeen requests took under 100 ms; three took over a second; nothing happened in between. The latency is **bimodal**: two groups with a gap. In this case the cause was easy to find once someone looked: the leaderboard is cached for 30 seconds, and a request that arrives after the entry expired rebuilds the ranking from the submissions table, which takes over a second. During the contest that happened on roughly one page load in ten."),
        p("The average blended a 60 ms experience and a 1.4 s experience into a 264 ms number that nobody had. Under the 300 ms line it looked like a pass; for one learner in ten it was a 1 to 2 second wait."),

        h2("3. Percentiles: answers about requests"),
        p("A percentile answers a question you can say to a learner: \"95% of leaderboard loads took at most X ms.\" This course uses one definition everywhere, the **nearest-rank** method, because every value it returns is a real sample:"),
        numbered([
            "Take the successful samples of **one** endpoint and sort them in ascending order. Call the count n.",
            "For a percentile p between 0 (excluded) and 100, compute the rank: `rank = ceil(p / 100 * n)`.",
            "The percentile is the sample at that rank, counting from 1: `sorted_ms[rank - 1]`. With no samples there is no percentile: report null, not 0.",
        ]),
        code("text", `
n = 20
p50: rank = ceil(0.50 * 20) = 10  ->  63 ms
p95: rank = ceil(0.95 * 20) = 19  ->  1,420 ms
p99: rank = ceil(0.99 * 20) = ceil(19.8) = 20  ->  1,610 ms
mean: 264 ms`, "the 20 samples"),
        p("Now the report reads very differently: the median learner waits 63 ms, which is excellent, and the p95 is 1,420 ms, almost five times the target. The mean sits between the two groups and says nothing about either."),
        p("Read a nearest-rank percentile as two promises: at least p% of the requests took this long **or less**, and at least (100 - p)% took this long **or more**. Rounding the rank **up** is what keeps the first promise: with 10 samples, ceil(9.5) = 10, because 9 requests are only 90%."),
        h3("Why not the average, and when the average is right"),
        bullets([
            "**One slow request moves the mean; it barely moves the median.** Make the slowest request 10 times slower and the mean of 20 samples jumps by hundreds of milliseconds, while p50 does not change at all.",
            "**Latency is skewed.** It cannot go below the service time, but it can be many times higher: queues, retries, cache misses, garbage collection. In skewed data the mean is pulled towards the tail and describes neither the typical request nor the slow ones.",
            "**But the mean is right for totals.** How much work did the servers do? Mean latency x number of requests. How many requests are in flight on average? Throughput x mean latency (Little's Law, lessons 1.1 and 4.2). Capacity math uses the mean. User experience and SLOs use percentiles. Report both, labelled, and never compare one with a target set for the other.",
        ]),

        h2("4. Same samples, different p95"),
        p("Not every tool computes percentiles the way this course does. Many interpolate between two neighbouring samples, and there are several interpolation rules. Python's standard library shows the problem on the same 20 samples:"),
        code("python", `
import math
import statistics

samples = [38, 41, 44, 47, 49, 52, 55, 58, 61, 63,
           66, 70, 74, 79, 85, 91, 98, 1180, 1420, 1610]


def nearest_rank(sorted_ms, p):
    if not sorted_ms:
        return None
    return sorted_ms[math.ceil(p / 100 * len(sorted_ms)) - 1]


exclusive = statistics.quantiles(samples, n=100)                       # the default method
inclusive = statistics.quantiles(samples, n=100, method="inclusive")
print("p95 nearest-rank:", nearest_rank(samples, 95))
print("p95 exclusive:   ", exclusive[94])
print("p95 inclusive:   ", inclusive[94])
print("p99 exclusive:   ", exclusive[98], " max:", max(samples))`, "percentile_methods.py"),
        code("text", `
p95 nearest-rank: 1420
p95 exclusive:    1600.5
p95 inclusive:    1429.5
p99 exclusive:    1760.1  max: 1610`, "output"),
        p("Three \"p95\" values for the same data, and an exclusive p99 that is **higher than the slowest request**: the method extrapolates past the data when there are too few samples. None of these methods is wrong; they answer slightly different questions. What is wrong is comparing a number from one method with a number from another, or with a target that was set using a third. Prometheus's `histogram_quantile` adds another layer: it interpolates inside histogram buckets, so its answer also depends on the bucket boundaries (see the observability course)."),
        callout("info", "Say how the number was computed",
            "Next to every percentile in a report, state the method (nearest-rank on raw samples, a histogram with given buckets, the load tool's built-in summary) and the number of samples. Load tools compute their summaries in their own way and some keep only an approximation of the distribution, so check your tool's current documentation before you compare its p95 with yours."),
        h3("How many samples does a p99 need?"),
        p("With fewer than 100 samples, p99 is the maximum: one unlucky request decides it. The percentile is only stable when there are enough samples **beyond** it. A common rule of thumb is to have at least about 10 samples in the tail you report: roughly 200 samples for a p95 and 1,000 for a p99. The leaderboard run had 612,400 samples, so its percentiles are solid; a 50-request smoke test can give you a median and nothing more."),

        h2("5. Merge samples, never average percentiles"),
        p("Load tests are often split: per generator machine, per minute, per API instance. It is tempting to compute a p95 for each part and average them. That number is not the p95 of anything:"),
        code("text", `
instance   requests   p95
api-1        9,000    210 ms
api-2        1,000    2,900 ms
average of the two p95s  ->  1,555 ms   (not a percentile of the 10,000 requests)`, "two instances"),
        p("The true p95 of all 10,000 requests needs the rank 9,500 of all samples together. With 9,000 fast requests on api-1, it could be well below 1,555 ms, or close to 2,900 ms if many of api-1's requests were also slow: the two summaries cannot tell you which. Keep the raw samples (or a histogram you can merge bucket by bucket) and compute the percentile once, on all of them."),
        p("The same goes the other way: do **not** merge what should stay apart. The leaderboard (a read with a 300 ms target) and the submit endpoint (a write with a 2 s target) have different distributions and different targets. One percentile over both describes neither. Group by endpoint first."),

        challenge("chal_quiz_qpr_121"),

        h2("6. Failed and invalid samples"),
        p("Raw samples are messy, and what you do with the messy ones changes the answer:"),
        bullets([
            "**Fast failures.** A `503` returned in 3 ms is not a fast request; it is a refused one. Mixed into the latencies, a run that rejects a third of its load looks faster than a healthy one (lesson 1.1). Keep failed requests out of the latency distribution and report their count next to it.",
            "**Timeouts.** When no response arrives, the generator records a status of 0 and a duration equal to its timeout, say 10,000 ms. That number is not the request's latency, only a lower bound of it. Count it as a failure, not as a sample at 10 s. If many requests time out, the percentiles of the successful ones are no longer the story: the failure count is.",
            "**Invalid records.** A negative duration (a wall clock adjusted during the run: generators should measure with a monotonic clock), a missing field, a duration written as a string. Skip them, but count them: a run with many invalid records is a broken measurement, and the report should say so.",
        ]),
        p("The rule behind all three: **never drop data silently**. Every sample ends up in exactly one place: in the latencies, in the failures or in the invalid count, and the report shows all three."),
        p("Time to build the report the leaderboard deserved. You get the raw samples of a run, several endpoints mixed, with failures and a few broken records, and you produce p50, p95 and p99 per endpoint, with the mean next to them so the gap stays visible:"),
        challenge("chal_coding_qpr_122"),

        h2("7. How to verify a percentile report"),
        bullets([
            "**Recompute from the raw export.** Take the per-request output of the load tool (k6, Locust and wrk2 can all write raw or detailed results; check the docs of your version) and compute the percentiles yourself. Large differences mean a different method, different filtering, or a different window.",
            "**Sanity checks that must always hold.** p50 <= p95 <= p99 <= max, and with nearest-rank every percentile is a value that appears in the samples. A p99 above the maximum means an extrapolating method.",
            "**Compare the mean with the median.** A mean far above p50 means a skewed or bimodal distribution. Plot a histogram before you explain anything: two humps usually mean two code paths (cache hit and miss, warm and cold, one healthy instance and one sick one).",
            "**Check the counts.** count + failed + invalid must equal the number of records. State the sample count next to every percentile so a reader can tell a p99 from 50 requests from one from 600,000.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Comparing an average with a percentile target.** The week-43 report did exactly that. Spot it: the statistic in the result column differs from the one in the target column.",
            "**Averaging percentiles.** Across instances, generators or minutes. Spot it: a dashboard query like `avg(p95_ms)`, or a \"p95\" that equals the mean of other p95 values.",
            "**Rounding the rank down.** `int(0.95 * n)` used without care lands one rank too low when 0.95 x n is not a whole number. Spot it: with 10 samples, a p95 that is not the maximum.",
            "**Reporting p99 from too few samples.** Spot it: p99 equals the maximum, or it jumps by a factor of two between two identical runs.",
            "**Mixing endpoints or statuses.** One percentile over reads and writes, or over successes and fast 503s. Spot it: the report has fewer rows than the system has endpoints with targets, or no failure count.",
        ]),

        h2("9. Summary"),
        bullets([
            "Latency is skewed and often bimodal, so its mean can describe no real request. Report p50, p95 and p99 per endpoint, with the sample count and the failure count, and keep the mean for capacity math.",
            "Nearest-rank: sort, rank = ceil(p / 100 * n), take sorted_ms[rank - 1]. State the method; other tools interpolate and give different values on the same data.",
            "Merge raw samples or histograms before computing a percentile; never average percentiles. Keep failures and invalid records out of the latencies, but always count them.",
        ]),

        h2("Sources"),
        bullets([
            "Python documentation: statistics.quantiles (methods \"exclusive\" and \"inclusive\") - docs.python.org/3/library/statistics.html",
            "Grafana k6 documentation: trend metrics and the end-of-test summary - grafana.com/docs/k6/latest/",
            "wrk2 README: why latency should be recorded per request and reported as a distribution - github.com/giltene/wrk2",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the raw results of any load test you have and compute p50, p95 and p99 per endpoint with nearest-rank and with statistics.quantiles. Then split the run into ten parts, average the ten p95 values, and compare that with the p95 of the whole run. Write two sentences on why they differ."),
    ],
});
