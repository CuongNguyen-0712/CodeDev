// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-3-2",
    title: "Cardinality: labels that don't explode",
    slug: { _type: "slug", current: "cardinality-labels-that-dont-explode" },
    description:
        "A release labelled the request counter with the raw URL path. Traffic stayed the same, but Prometheus went from 140k to 1.2M series, ran out of memory twice and every dashboard timed out. Learn what a time series is, why the number of series is the product of the values of each label, which labels are bounded and which are not, where high-cardinality detail belongs instead (traces, logs, events), and how to normalise and cap labels at the source so a new URL can never create a new series.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "Tuesday 09:20: the Prometheus server that scrapes the CodeDev API is OOMKilled, restarts, and is killed again at 10:05. While it is down, every Grafana panel shows \"No data\" and the SLO alerts are silent. Its memory had grown from 3 GB to 11 GB since Friday's release, whose changelog says: \"metrics: add path label to http_server_requests_total so product can see traffic per page\". The number of requests per day did not change.",
    },

    content: [
        h2("1. The incident: same traffic, eight times the series"),
        p("Prometheus exports metrics about itself. The one that matters here counts the **series** it keeps in memory (its \"head\"):"),
        code("text", `
prometheus_tsdb_head_series
  Thu 2026-10-22   138,904
  Fri 2026-10-23   141,220    <- release codedev-api 2026.10.23 at 17:00
  Sat 2026-10-24   402,881
  Mon 2026-10-26   1,180,447
  Tue 2026-10-27   OOMKilled at 09:20 and 10:05 (limit 12 GB)

http requests per day (load balancer): 2.1M Thu, 2.1M Mon`, "Prometheus self-monitoring"),
        p("The release added one label to one counter. That was enough to multiply the series of the whole server by eight in three days, and the curve was still going up when it crashed. To see why, you need one definition and one multiplication."),

        h2("2. Reproduce it and read the evidence"),
        p("Find which metric owns the series, then which label. These queries are cheap enough to run on a struggling server (the TSDB status page in the Prometheus UI, under Status, shows the same top lists):"),
        code("text", `
topk(5, count by (__name__) ({__name__=~".+"}))
  http_server_requests_total                         1,043,112
  http_server_request_duration_seconds_bucket          27,540
  process_cpu_seconds_total                                 6
  ...

count(count by (path) (http_server_requests_total))      347,038
count(count by (method) (http_server_requests_total))          5
count(count by (status) (http_server_requests_total))         19`, "PromQL"),
        p("Then look at what the API actually exports. One instance's `/metrics` endpoint shows the shape of the problem:"),
        code("text", `
$ curl -s http://api-1:9464/metrics | grep -c '^http_server_requests_total'
61873
$ curl -s http://api-1:9464/metrics | grep '^http_server_requests_total' | shuf -n 5
http_server_requests_total{method="GET",path="/courses/42/lessons/7",status="200"} 3
http_server_requests_total{method="GET",path="/courses/react-hooks?utm_source=newsletter&utm_campaign=oct",status="200"} 1
http_server_requests_total{method="POST",path="/password-reset/3f2b8c1e-9a4d-4e7b-8c21-0d5e6f7a8b9c",status="204"} 1
http_server_requests_total{method="GET",path="/users/88231/progress",status="200"} 2
http_server_requests_total{method="GET",path="/leaderboard?page=118",status="304"} 1`, "terminal"),
        p("Every lesson id, every learner id, every reset token and every tracking parameter is a new value of `path`, and every new value is a new series. Most of them were seen once and will never be seen again, but Prometheus keeps them in memory until they stop being scraped, and keeps their samples on disk for the whole retention."),

        h2("3. Core idea: a series is one combination of label values"),
        p("A **time series** is a metric name plus one exact set of label values: `http_server_requests_total{method=\"GET\",route=\"/courses/:id\",status=\"2xx\"}` is one series, and changing any value makes another. In OpenTelemetry the same idea is an **attribute set** on a data point; each distinct set becomes its own stream, and its own series once exported. The backend pays per series: an index entry, a chunk of memory, a sample on every scrape, often a line on the bill. A series costs about the same whether its counter is 1 or 1,000,000."),
        h3("The multiplication"),
        p("The series of one metric are bounded by the **product** of the number of values of each label:"),
        code("text", `
route (templates)   40
method               5
status class         5     40 x 5 x 5        =     1,000 series at most
+ raw path      347,000    replaces route    =  8,675,000 at most
+ user_id       120,000    on top of route   = 120,000,000 at most`, "back-of-the-envelope"),
        p("Real numbers are lower, because not every combination occurs, but the bound grows with whatever the label is tied to. A **histogram** multiplies again: each label combination has one series per bucket plus `_sum` and `_count`, so a histogram with 14 boundaries is 17 series per combination (lesson 7)."),
        h3("Bounded and unbounded labels"),
        p("Ask one question about every label: **how many values will it have next year, and does that number grow with users, content or time?**"),
        bullets([
            "**Bounded, safe:** HTTP method, route template, status code or status class, service, region, deployment environment, a feature flag variant, a programming language from a fixed list, an error *type* from a fixed enum.",
            "**Bounded but large, check the budget:** course slug (grows with the catalog), customer plan, Kubernetes pod name (changes at every deploy, so old series pile up for the retention).",
            "**Unbounded, never a label:** user id, email, session id, request or trace id, raw URL or query string, IP address, free-text error messages, timestamps, durations or sizes as label values.",
        ]),
        h3("Where the detail goes instead"),
        p("Removing `user_id` from a metric does not mean giving up per-user answers. It means asking the signal that is built for them:"),
        bullets([
            "**Traces** keep per-request attributes such as `url.full` or a user id (respecting your privacy rules, lesson 6) and are sampled, so one request's detail does not cost a series.",
            "**Logs and analytics events** are one record per occurrence; a `GROUP BY user_id` over a week of events is a normal query for a warehouse.",
            "**Exemplars** attach a trace id to some metric samples, so a slow bucket on the latency panel links to an example trace without a trace id label. Support depends on the SDK and the backend: check both.",
        ]),
        p("When is a high-cardinality label acceptable? When the number of values is known and small enough for your budget, and someone decided it on purpose: \"50 courses x 5 status classes = 250 series for the course-level SLO, approved\". Not when it happens to be small today."),

        challenge("chal_quiz_otl_321"),

        h2("4. Normalise at the source, cap as a safety net"),
        p("Fix the labels where the metric is recorded, before anything is exported. Three tools, from the most to the least preferred:"),
        numbered([
            "**Record the right value.** Use the route template the router matched (`/courses/:courseId/lessons/:lessonId`), not the URL. HTTP instrumentation for most Node.js frameworks sets `http.route` from the router; check that it is filled for your framework, because a missing route makes some setups fall back to the path. Reduce status codes to classes when you only alert on classes.",
            "**Drop what must never be there.** An OpenTelemetry View can keep only an allow-list of attribute keys for an instrument, and the OpenTelemetry Collector can delete attributes in a processor before export. The option names have changed between SDK and collector versions, so look them up for yours. Drop identity labels (`user_id`, `email`, `session_id`) unconditionally: besides the cost, a metrics backend is the wrong place for personal data, with wide read access, long retention and no way to delete one user's rows.",
            "**Cap what you could not foresee.** Rules miss things: a slug, a new id format, a bot hitting random URLs. A cap per metric and per label keeps the first N values and maps the rest to `other`, so an unknown value can never create unbounded series. The OpenTelemetry metrics SDK specification defines a similar cardinality limit per metric stream (2,000 by default in the spec), after which new attribute sets go to one overflow series marked `otel.metric.overflow=true`; check whether your SDK version implements it and with which default.",
        ]),
        p("A normaliser for a label you do want, browser family for the web client's metrics, shows the pattern: map an unbounded input to a short, fixed list, with a catch-all."),
        code("typescript", `
// web client metrics: "which browsers do our learners use?" without one series per user agent string
const FAMILIES = ["edge", "chrome", "firefox", "safari"] as const;

export function browserFamily(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (ua.includes("edg/")) return "edge";                 // Edge also says "chrome": test it first
    if (ua.includes("firefox/")) return "firefox";
    if (ua.includes("chrome/") || ua.includes("crios/")) return "chrome";
    if (ua.includes("safari/")) return "safari";
    return "other";                                          // bots, new browsers, empty strings
}

pageLoad.record(seconds, { "browser.family": browserFamily(navigator.userAgent) });   // 5 values, ever`, "browserFamily.ts"),
        p("Now build the guard the API needed on Friday: route templates for raw paths, status classes, forbidden labels dropped, and a cap per metric and per label that reports what it capped, so the next surprise shows up in a log line instead of in Prometheus's memory."),
        challenge("chal_coding_otl_322"),

        h2("5. How to verify cardinality"),
        bullets([
            "**Test the bound, not the values.** In a unit test, record 10,000 requests from 10,000 fake users on random ids, then assert the number of distinct label sets is below the bound you designed (for example 40 x 5 x 5). This test fails the day someone adds an unbounded label.",
            "**Count series per metric after every deploy.** `topk(10, count by (__name__) ({__name__=~\".+\"}))` before and after, in staging with replayed traffic. A metric whose count grows with traffic replay is a bug.",
            "**Alert on growth.** An alert on `prometheus_tsdb_head_series` growing more than, say, 30% in a day (or your vendor's active-series usage) would have fired on Saturday, three days before the crash.",
            "**Read `/metrics` in code review.** `curl -s localhost:9464/metrics | grep -c '^my_metric'` after clicking through the app for a minute: the number should stop growing.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Raw paths or URLs as labels.** Spot it: a label named `path`, `url` or `endpoint` whose values contain digits, UUIDs or `?`.",
            "**Identity labels.** Spot it: `user_id`, `email`, `session`, `ip`, `trace_id` among the attribute keys; `count(count by (user_id) (...))` close to the number of users.",
            "**\"It's fine, we aggregate it away in the query.\"** Spot it: dashboards full of `sum without (user_id)`. The series are still stored and billed; the query only hides them (lesson 9).",
            "**Free text as a value.** Spot it: a label `error` with values like `timeout after 3012 ms on job 8812`. Use a fixed error type and put the message in the log or span.",
            "**Forgetting that histograms multiply.** Spot it: a new label on a duration histogram with 14 boundaries; the series grow 17 times faster than on a counter.",
        ]),

        h2("7. Summary"),
        numbered([
            "A series is one combination of label values, and the cost of a metric follows its number of series, which is bounded by the product of the values of each label, not by traffic.",
            "Labels must have a small, fixed set of values: route templates, methods, status classes. Ids, URLs, emails and free text go to traces, logs or events.",
            "Normalise at the source, drop identity labels, cap the rest with an `other` value, and test the bound with thousands of fake users.",
        ]),

        h2("Sources"),
        bullets([
            "Prometheus documentation: Instrumentation, Use labels (do not use labels for high-cardinality dimensions) - prometheus.io/docs/practices/instrumentation/ and Metric and label naming - prometheus.io/docs/practices/naming/",
            "OpenTelemetry specification: Metrics SDK, cardinality limits - opentelemetry.io/docs/specs/otel/metrics/sdk/",
            "OpenTelemetry semantic conventions: HTTP metrics (http.route on server metrics) - opentelemetry.io/docs/specs/semconv/http/http-metrics/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run topk(10, count by (__name__) ({__name__=~\".+\"})) on a Prometheus you can read. For the top three metrics, list every label with count(count by (<label>) (<metric>)) and classify each one as bounded, bounded but large, or unbounded. For each unbounded label, write where its detail should live instead (trace attribute, log field, analytics event) and which query of which dashboard would have to change."),
    ],
});
