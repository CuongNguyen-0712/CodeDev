// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-4-3",
    title: "Observability: event loop lag, p99 & load shedding",
    slug: { _type: "slug", current: "observability-event-loop-lag-p99-load-shedding" },
    description:
        "The dashboard says checkout averages 92 ms while customers time out. Learn why averages lie, compute percentiles yourself, measure event loop delay, instrument RED metrics and request-scoped logs, and protect the service with a load shedder that fails fast instead of queueing.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer on call for the checkout service of an e-commerce platform",
        problem:
            "Black Friday, 20:00. The Grafana board shows checkout latency at a calm 92 ms average and CPU at 60%. Meanwhile support is flooded: \"Payment spinner, then error\". The mobile app gives up after 2.5 s and retries, and every retry adds load. By 20:20 the instances are so busy that even the 92 ms average climbs to 4 s, health checks fail and the autoscaler restarts pods in the middle of the peak. Nobody could see it coming from the metrics on the board.",
    },

    content: [
        h2("1. The incident"),
        p("Afterwards, the raw request logs tell a different story than the dashboard. Out of 10,000 checkouts in the five minutes before the collapse, 9,850 were fast - and 150 took about 3 seconds, waiting behind CPU-heavy cart recalculations on the same event loop. Those 150 customers hit the app timeout, retried, and doubled the load on exactly the instances that were already behind."),
        p("Three things were missing: a latency number that shows the slow tail, a signal that the event loop itself is falling behind, and a mechanism that says \"no\" quickly when the instance is overloaded instead of letting requests queue until they time out."),
        callout("info", "What you will build",
            "A nearest-rank percentile function, an event loop delay monitor, RED metrics with request-scoped logs, and a load shedder that returns 503 before an overloaded instance makes things worse."),

        h2("2. Why the average lies"),
        p("An average blends every request into one number. When latency has two populations - a fast majority and a slow minority - the average describes neither: it sits close to the fast group and hides how slow the slow group is."),
        image("latency-distribution", {
            alt: "Histogram of 10,000 checkout latencies: most requests between 25 and 100 ms, 150 requests between 2.5 and 5 seconds. avg 92 ms, p50 45 ms, p95 90 ms, p99 3,000 ms, app timeout at 2.5 s.",
            caption: "avg and p95 sit in the fast group. Only p99 lands in the tail where the timeouts happen.",
        }),
        p("A **percentile** answers a better question: \"what latency did the slowest X% of requests reach?\" p50 (the median) is the typical request, p95 and p99 are the tail. With 1,000 requests per second, a bad p99 means ten unhappy customers **every second**."),
        h3("The nearest-rank definition"),
        p("There are several ways to compute a percentile from raw samples. The simplest, and the one used in this course, is **nearest rank**: sort the n samples in ascending order and take the sample at 1-based rank `ceil(p / 100 * n)` (at least rank 1). The result is always a value that was actually observed."),
        p("Worked example with five samples `[40, 310, 55, 48, 62]`: sorted they are `40, 48, 55, 62, 310`. For p50 the rank is `ceil(2.5) = 3`, so p50 is 55. For p99 the rank is `ceil(4.95) = 5`, so p99 is 310 - one slow request out of five is exactly what p99 is supposed to surface."),
        callout("warning", "Sort numbers as numbers",
            "Array.prototype.sort() without a comparator compares strings, so [1200, 35, 400].sort() gives [1200, 35, 400]. Always pass (a, b) => a - b - and sort a copy, because the caller may still need the samples in arrival order."),
        challenge("chal_coding_nhp_422"),
        p("In production you rarely keep every sample. Metrics libraries record **histograms** - counters per latency bucket - and estimate percentiles from the buckets. Bucket counts can be summed across instances; percentiles cannot."),

        h2("3. Measure the event loop itself"),
        p("Request latency tells you that users wait. **Event loop delay** tells you why: it measures how late timers and I/O callbacks run compared to when they were due. When it grows, every request on that process waits before its handler even starts - no matter how fast the handler is."),
        code("javascript", `
const { monitorEventLoopDelay, performance } = require("node:perf_hooks");

const delay = monitorEventLoopDelay({ resolution: 10 }); // samples every 10 ms
delay.enable();

let lastElu = performance.eventLoopUtilization();
let lagP99Ms = 0; // read by the load shedder (section 5)

setInterval(() => {
    const elu = performance.eventLoopUtilization(lastElu); // busy fraction since last tick
    lastElu = performance.eventLoopUtilization();

    lagP99Ms = delay.percentile(99) / 1e6;                 // histogram values are in nanoseconds
    logger.info({
        msg: "event_loop",
        lagP50Ms: +(delay.percentile(50) / 1e6).toFixed(1),
        lagP99Ms: +lagP99Ms.toFixed(1),
        lagMaxMs: +(delay.max / 1e6).toFixed(1),
        utilization: +elu.utilization.toFixed(2),          // 0..1, 1 = never idle
    });
    delay.reset();
}, 5_000).unref();

module.exports.getLagP99Ms = () => lagP99Ms;`, "src/observability/eventLoop.js"),
        bullets([
            "**Delay p99 under ~20 ms** is normal for an API. Sustained values of 100 ms and more mean CPU work, GC pressure or synchronous calls on the main thread (lesson 4.1).",
            "**Event loop utilization** close to 1 means the loop is never idle: the process is saturated even if machine CPU looks moderate.",
            "`prom-client`'s `collectDefaultMetrics()` exports the same data as `nodejs_eventloop_lag_p99_seconds`, plus GC and heap metrics.",
        ]),
        challenge("chal_quiz_nhp_421"),

        h2("4. RED metrics and logs you can join"),
        p("For every service, three request metrics answer most on-call questions - the **RED** method: **R**ate (requests per second), **E**rrors (failed requests per second) and **D**uration (a latency histogram). Record them once, in middleware, labelled by route and status:"),
        code("javascript", `
const client = require("prom-client");

const httpDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration",
    labelNames: ["method", "route", "status"],
    buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], // include your client timeout as a bucket edge
});

app.use((req, res, next) => {
    const stop = httpDuration.startTimer();
    res.on("finish", () => {
        // route template, never the raw URL: /orders/:id, not /orders/8f3a... (label cardinality!)
        stop({ method: req.method, route: req.route?.path ?? "unmatched", status: res.statusCode });
    });
    next();
});

app.get("/metrics", async (req, res) => {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
});`, "src/observability/metrics.js"),
        code("bash", `
# Rate and error ratio per route
sum by (route) (rate(http_request_duration_seconds_count[5m]))
sum by (route) (rate(http_request_duration_seconds_count{status=~"5.."}[5m]))
  / sum by (route) (rate(http_request_duration_seconds_count[5m]))

# Fleet-wide p99: sum the buckets of all instances first, then take the quantile
histogram_quantile(0.99, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))`),
        h3("Structured logs with a request id"),
        p("Metrics tell you **that** p99 is bad; logs tell you **which** requests were slow and why. Log JSON, give every request an id (reuse the incoming `x-request-id` from the gateway if there is one), and attach it to every log line written while handling that request. `AsyncLocalStorage` carries it across awaits without passing it through every function."),
        code("javascript", `
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const pino = require("pino");

const als = new AsyncLocalStorage();
const logger = pino({ mixin: () => als.getStore() ?? {} }); // adds { requestId } to every line

app.use((req, res, next) => {
    const requestId = req.get("x-request-id") ?? randomUUID();
    res.set("x-request-id", requestId);
    const started = process.hrtime.bigint();
    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        logger.info({ msg: "request", method: req.method, route: req.route?.path, status: res.statusCode, durationMs });
    });
    als.run({ requestId }, next);
});`, "src/observability/logging.js"),
        code("json", `
{"level":30,"time":1792195200123,"requestId":"5b1e0c2a-9f7d-4a5e-b1c3-2f8e6d4a9c10","msg":"request","method":"POST","route":"/checkout","status":200,"durationMs":3012.4}`),
        callout("tip", "Log the slow ones in detail",
            "Logging every request at full detail is expensive at peak traffic. A common compromise: one compact line per request, plus a detailed line (timings of DB calls, payment provider, cart recalculation) only when durationMs exceeds the p99 target."),

        h2("5. Load shedding: fail fast instead of queueing"),
        p("When an instance is overloaded, every extra request makes all the others slower. Queued requests still time out on the client - after consuming CPU and memory - and the client retries. Rejecting some requests **immediately** with `503 Service Unavailable` and a `Retry-After` header keeps latency bounded for the ones you accept and gives the load balancer and the clients a clear signal."),
        p("Two cheap signals are enough to decide:"),
        numbered([
            "**Event loop lag** above a threshold (for example p99 delay over 100 ms): the process is already behind, a new request will wait before it even starts.",
            "**In-flight requests** above a limit: a hard cap on concurrency per instance, set from load tests (the point where p99 starts to climb steeply).",
        ]),
        code("javascript", `
const { getLagP99Ms } = require("./observability/eventLoop");

const shedder = createLoadShedder({ maxInFlight: 200, maxLagMs: 100 }, getLagP99Ms);
const shedCounter = new client.Counter({ name: "http_shed_total", help: "Shed requests", labelNames: ["reason"] });

// Register before body parsing and auth: rejecting must cost almost nothing.
app.use((req, res, next) => {
    if (req.path === "/livez") return next(); // never shed the liveness probe

    const decision = shedder.admit();
    if (!decision.accepted) {
        shedCounter.inc({ reason: decision.reason });
        return res.status(503).set("Retry-After", "1").json({ error: "OVERLOADED" });
    }
    res.on("close", decision.release); // "close" fires for finished and aborted responses
    next();
});`, "src/middleware/shed.js"),
        bullets([
            "Shed **early** in the middleware chain - before JSON parsing, authentication or any database call.",
            "Release the slot exactly once, even when both an error handler and the `close` event fire.",
            "Count shed requests by reason and alert on them: shedding is a symptom that capacity or code needs attention, not a fix.",
            "Clients must honour `Retry-After` and retry with backoff and jitter (lesson 2.2), otherwise shedding just reshapes the retry storm.",
        ]),
        challenge("chal_coding_nhp_423", "Decide before you count: a rejected request must never change the in-flight counter. Give each accepted request its own released flag."),

        h2("6. Checklist"),
        bullets([
            "Alert on p95/p99 per route, never on the average; put your client timeout on a histogram bucket edge.",
            "Aggregate histograms (bucket counts) across instances, then compute quantiles - never average percentiles.",
            "Export event loop delay p99 and utilization per instance; investigate sustained lag above ~100 ms.",
            "Record RED metrics in one middleware with route templates as labels to keep cardinality low.",
            "Log JSON with a request id carried by AsyncLocalStorage and returned in `x-request-id`.",
            "Shed load early with 503 + `Retry-After` on high lag or too many in-flight requests, count it, and never shed the liveness probe.",
        ]),
    ],
});
