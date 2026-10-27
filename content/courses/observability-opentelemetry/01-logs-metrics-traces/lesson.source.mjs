// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-1-1",
    title: "Logs, metrics & traces: which question each one answers",
    slug: { _type: "slug", current: "logs-metrics-traces-which-question" },
    description:
        "POST /submissions went from 180 ms to 2.6 s at p95 and the on-call engineer spent two hours grepping 40,000 log lines that could not say which request they belonged to. Learn which question each signal answers - metrics: is something wrong and how much; traces: where in the request; logs: what exactly happened - what each costs to keep, how a trace id joins them, and why OpenTelemetry and the collector are the vendor-neutral way to produce all three.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform (NestJS API, grading queue and worker, PostgreSQL)",
        problem:
            "On Thursday at 19:42 the alert \"POST /submissions 5xx > 2%\" fired for https://api.codedev.test. The dashboard showed p95 latency at 2.6 s instead of 180 ms and 4.2% of submissions failing with 504 from the gateway. The engineer on call searched the logs for \"error\" in the API, the grading worker and grading-service, got 40,000 lines with no request id, and spent two hours guessing. The cause - every API request waiting for a database connection because a new leaderboard job held most of the pool - was found the next morning, in a single trace.",
    },

    content: [
        h2("1. The incident: a dashboard that says \"bad\" and logs that say everything"),
        p("The submit path of CodeDev has four steps. The API validates the code, inserts a row in `submission`, puts a grading job on the queue and answers `202 Accepted`. A worker takes the job, sends the code to grading-service to run the tests, stores the result and updates the leaderboard. On Thursday evening the first step became slow:"),
        code("text", `
Alert  19:42  POST /submissions 5xx ratio 4.2% (threshold 2%) - api.codedev.test

Dashboard  http.server.request.duration, route POST /submissions
  19:30-19:40   p50 0.11 s   p95 0.18 s   p99 0.31 s   5xx 0.1%
  19:40-19:50   p50 0.14 s   p95 2.6 s    p99 3.1 s    5xx 4.2%`, "on-call notes"),
        p("The metric did its job in seconds: something is wrong, on this route, since 19:40, this badly. Then the investigation stalled. The logs looked like this, in three services:"),
        code("text", `
2026-10-15 19:41:07 ERROR Timeout
2026-10-15 19:41:07 WARN  Slow query
2026-10-15 19:41:08 ERROR Grading failed for submission
2026-10-15 19:41:08 ERROR Timeout
... 40,112 lines between 19:40 and 20:00`, "api + worker logs"),
        p("No request id, no submission id, no duration, no service name on half of them. Which `Timeout` belongs to which request? Was the slow query in the API or in the worker? The next morning a teammate opened one slow request in the tracing UI and saw this:"),
        code("text", `
POST /submissions                          2,540 ms   codedev-api
  ├─ validate body                             2 ms
  ├─ pg-pool.connect                       2,410 ms   <- waiting for a free connection
  ├─ pg.query INSERT submission                 6 ms
  └─ queue.publish grading                      4 ms`, "trace 4bf92f35..."),
        p("Two seconds and a half spent **before** the query, waiting for a connection. The pool has 20 connections; a leaderboard refresh job deployed that afternoon held 18 of them. The query itself was fast, which is why the \"slow query\" warnings pointed nowhere. Each signal answered one question, and the team had the wrong signal for the second one."),

        h2("2. Three signals, three questions"),
        p("OpenTelemetry calls logs, metrics and traces **signals**. They are not three copies of the same data: each one is shaped for a different question, and each is bad at the others' questions."),
        bullets([
            "**Metrics: is something wrong, and how much?** A metric is a number aggregated over time and a few attributes: a counter of submissions, a histogram of request durations per route and status. It is cheap to store, fast to query over months, and the right input for alerts and SLOs (module 4). It cannot tell you which request was slow: the individual requests are gone, only counts per bucket remain.",
            "**Traces: where in the request did the time go?** A trace is the tree of **spans** one request created as it crossed the gateway, the API, the queue, the worker and grading-service. Each span has a name, a start, a duration, attributes and a parent. A trace shows the path and the slow step of one request. One trace says nothing about how common that path is: for that you go back to metrics.",
            "**Logs: what exactly happened?** A log record is an event with as much detail as you choose: the validation error with the field name, the exception with its stack frame, the job id that was retried. Logs answer \"why did this specific thing fail\", and they are the most expensive signal per request, because every line is stored.",
        ]),
        p("The order of an investigation follows from this: **metric to notice, trace to locate, log to explain**. The alert came from a metric. A trace would have located the 2.4 s in `pg-pool.connect` in minutes. A log line on the leaderboard job (\"refresh started, 18 connections, 45,000 rows\") would have explained it. What made the evening long was not a missing signal - all three existed - but that nothing joined them."),
        callout("info", "When not to add a signal",
            "Not every question needs all three. A nightly batch job that either finishes or not needs a metric (last success timestamp) and logs; a trace of one long job adds little. A cron that runs once an hour does not need a latency histogram. Start from the question you will ask during an incident, and add the signal that answers it."),

        h2("3. What each signal costs to keep"),
        p("Cost is the reason you cannot \"just log everything\" or \"trace every request forever\". The three signals grow with different things:"),
        bullets([
            "**Metrics grow with the number of time series, not with traffic.** One histogram for `POST /submissions` with status 202, 400 and 504 is three series whether you serve ten requests or ten million. Add an attribute with a million values (a user id) and it is a million series: the bill and the query time explode. That is lesson 8.",
            "**Traces grow with requests times spans, divided by sampling.** Keeping 100% of traces of a busy API is rarely worth it. **Sampling** keeps a fraction - for example 10% of normal traces - and a collector can keep every trace that contains an error or is slower than a threshold (tail sampling).",
            "**Logs grow with bytes.** Every line at every level is stored and indexed. Debug logging left on in production, full request bodies, stack traces repeated on every retry: this is where log bills come from. Levels (lesson 2) are a cost control as much as a noise control.",
        ]),
        p("Retention follows the same logic. As an example, this is the policy CodeDev wrote down after the incident - a team decision, not a standard; your backend's pricing and your incident history decide yours:"),
        code("yaml", `
# observability/retention.yaml - CodeDev policy (example values)
metrics:
  resolution: 15s
  retention: 13 months      # compare this November with last November
traces:
  sampling: 10% of new traces, plus every trace with an error or > 2 s (tail sampling)
  retention: 7 days         # long enough to debug last week's incident
logs:
  level: info and above in production
  retention: 14 days, then archived for 90 days (security and audit lines only)`, "retention.yaml"),

        challenge("chal_quiz_otl_111"),

        h2("4. The join key: one trace id everywhere"),
        p("Three signals become one investigation only if they share a key. That key is the **trace id**: a 16-byte random id, written as 32 lowercase hex characters, created when a request enters the system and carried to every service it touches (the `traceparent` header, lesson 3). With it:"),
        numbered([
            "**Metric to trace.** Many backends store **exemplars**: next to a histogram bucket, the trace ids of a few requests that fell into it. Click the spike at 2.6 s, open one of those traces.",
            "**Trace to logs.** If every log line carries `trace_id` and `span_id`, the tracing UI can show the log lines of a span, and a log query `trace_id:\"4bf92f35...\"` returns the lines of every service for that request.",
            "**Logs to trace.** The reverse also works: a log line with an exception gives you the trace id, and the trace shows what the request did before it failed.",
        ]),
        p("This is why the next lesson is about the shape of a log line. A line without the trace id is an orphan: it can be counted, not joined."),

        h2("5. OpenTelemetry: one standard, many backends"),
        p("Before OpenTelemetry, every observability vendor shipped its own agent and its own API; changing vendor meant re-instrumenting the code. **OpenTelemetry** (OTel) is the vendor-neutral standard from the CNCF that splits the problem in layers:"),
        bullets([
            "**API**: what your code and libraries call (`trace.getTracer()`, `metrics.getMeter()`, `context`). Without an SDK it does nothing and costs almost nothing, so libraries can depend on it safely.",
            "**SDK**: the implementation you install in the application: samplers, processors, the resource (service name, version, environment) and exporters.",
            "**Instrumentations**: packages that create spans and metrics for HTTP, NestJS, PostgreSQL, Redis and so on, so you do not write `pg-pool.connect` spans by hand.",
            "**OTLP**: the protocol the SDK uses to send all three signals, over gRPC (port 4317) or HTTP (port 4318).",
            "**The collector**: a separate process that receives OTLP, processes it (batching, memory limits, sampling, dropping attributes) and exports it to one or more backends.",
        ]),
        p("A minimal setup for the CodeDev API. It is loaded before the NestJS app so the instrumentations can patch `http` and `pg` before they are imported. Package names and options change between releases: check the current OpenTelemetry JS docs before you copy it."),
        code("typescript", `
// src/telemetry.ts - start with: node --require ./dist/telemetry.js dist/main.js
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

const sdk = new NodeSDK({
    serviceName: "codedev-api",
    // no URL: the exporters read OTEL_EXPORTER_OTLP_ENDPOINT (here http://otel-collector:4318)
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: 15_000,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();

process.on("SIGTERM", () => {
    // flush what is still buffered, or the last seconds before a deploy are lost
    sdk.shutdown().finally(() => process.exit(0));
});`, "telemetry.ts"),
        p("Business metrics are a few lines with the API. The meter and instruments are created once, at module load, not per request:"),
        code("typescript", `
// src/submissions/submissions.metrics.ts
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("codedev-submissions");

export const submissionsCreated = meter.createCounter("codedev.submissions.created", {
    description: "Submissions accepted by POST /submissions",
});
export const gradingQueueWait = meter.createHistogram("codedev.grading.queue_wait", {
    description: "Time between enqueue and the worker picking the job",
    unit: "s",
});

// in the service: a small, fixed set of attribute values - never ids
submissionsCreated.add(1, { "codedev.language": dto.language });`, "submissions.metrics.ts"),
        h3("Why a collector, and not export straight to the vendor?"),
        p("The SDK can export directly to a backend. A collector in between is worth it as soon as you have more than one service: the applications only know one local endpoint, credentials for the backend live in one place, you can sample, filter and redact centrally, and switching or adding a backend is a config change, not a deploy of every service. A minimal pipeline:"),
        code("yaml", `
# otel-collector.yaml - check the collector docs for the components in your distribution
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }
processors:
  memory_limiter: { check_interval: 1s, limit_percentage: 80, spike_limit_percentage: 20 }
  batch: {}
exporters:
  otlphttp:
    endpoint: https://otlp.observability.codedev.test   # your backend
  debug: { verbosity: basic }                           # prints a summary, for local runs
service:
  pipelines:
    traces:  { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlphttp] }
    metrics: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlphttp] }
    logs:    { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlphttp] }`, "otel-collector.yaml"),
        callout("warning", "When not to start with a collector",
            "A single small service on a managed platform can export directly and add a collector later; the code does not change, only the endpoint. And a collector is one more thing that can fall over: give it a memory limit, watch its own metrics (dropped spans, queue size) and do not make the application wait on it - the SDK exports in the background and drops data rather than blocking requests."),

        h2("6. How to verify the signals before the next incident"),
        bullets([
            "**Run the collector with the debug exporter locally**, send one `POST /submissions`, and check that one trace arrives with spans from the API and the worker, and that the metric points carry `service.name = codedev-api`.",
            "**Open one trace and one log line for the same request** and check that the `trace_id` is identical in both. If the log line has no trace id, the join is broken before an incident proves it.",
            "**Check a metric's series count** in your backend after a deploy that adds attributes. A number that grows with users or requests is a cardinality bug (lesson 8).",
            "**Kill the collector for a minute** in staging and check that the API's latency does not change: telemetry must fail open.",
            "**Replay the incident**: hold most pool connections with a test job and check that the dashboard, a trace and the logs all show it, and that you can go from one to the others by trace id.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Using logs as metrics.** Counting `ERROR` lines to compute an error rate breaks the moment someone changes a message or a level, and costs the price of every line. Spot it: an alert defined as a log query count. Use a counter or the HTTP duration histogram instead.",
            "**Using metrics as logs.** Adding `submission_id` or `user_id` as a metric attribute to \"find the slow ones\". Spot it: a series count that grows with traffic. Put ids on spans and log lines, never on metrics.",
            "**Traces without logs, or logs without trace ids.** The tracing UI shows the slow span but not the error message, or the error line cannot be tied to a request. Spot it: a log line without `trace_id` on the request path.",
            "**Sampling metrics away.** Computing request rates from sampled spans undercounts by the sampling ratio. Spot it: the request count on the dashboard drops by 90% the day trace sampling goes to 10%.",
            "**A vendor SDK in every service.** Instrumentation tied to one backend makes the next migration a rewrite. Spot it: vendor package imports in business code. Instrument with the OpenTelemetry API and choose the backend in the collector.",
        ]),

        h2("8. Summary"),
        bullets([
            "Metrics say whether something is wrong and how much, traces say where in the request, logs say what exactly happened: notice with a metric, locate with a trace, explain with a log.",
            "Metrics cost per time series, traces per sampled span, logs per byte; retention and sampling follow from the questions you need to answer and for how long.",
            "The trace id is the join key between all three, and OpenTelemetry (API, SDK, instrumentations, OTLP, collector) produces them without tying your code to one vendor.",
        ]),

        h2("Sources"),
        bullets([
            "OpenTelemetry, Signals: opentelemetry.io/docs/concepts/signals/",
            "OpenTelemetry Collector documentation: opentelemetry.io/docs/collector/",
            "W3C Trace Context (the traceparent header, lesson 3): www.w3.org/TR/trace-context/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the last incident of your own team and write, for each question you asked during it, which signal answered it and how long it took to find. Then run the collector with the debug exporter next to a small NestJS app, send ten requests, and find one request in all three signals by its trace id."),
    ],
});
