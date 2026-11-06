// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gcn-3-2",
    title: "Structured logs with log/slog and latency histograms",
    slug: { _type: "slug", current: "go-gateway-slog-latency-histograms" },
    description:
        "Customers said checkout was slow, Rice Rocket's dashboards showed a 120 ms average, and the logs were free text without request ids. Learn structured logging with log/slog, Prometheus histograms and histogram_quantile, why averages hide tails, and label cardinality, then build the gateway's latency histogram and route labels.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Support had a dozen complaints of checkouts hanging for seconds. The gateway's dashboard showed one average latency per path, around 120 ms; the logs were fmt.Printf lines nobody could join to a request; and the metrics endpoint had grown to 180,000 series because every order id was a label value.",
    },

    content: [
        h2("Situation"),
        p("What the team had to work with:"),
        code("text", `
2026/11/06 11:42:07 checkout ok
2026/11/06 11:42:07 calling momo
2026/11/06 11:42:10 checkout ok

gateway_request_seconds_avg{path="/checkout"}         0.121
gateway_request_seconds_avg{path="/orders/88123"}     0.034
gateway_request_seconds_avg{path="/orders/88124"}     0.029
... 183,644 more lines ...`, "logs and /metrics"),
        bullets([
            "No request id, no fields: which `checkout ok` belongs to which `calling momo`?",
            "An average per path: a few 3-second checkouts disappear among thousands of fast ones.",
            "One series per order: the scrape takes seconds and Prometheus memory keeps climbing.",
        ]),

        h2("The core you need"),
        bullets([
            "**`log/slog`** (standard library since Go 1.21) writes records with typed attributes. `slog.NewJSONHandler` emits one JSON object per line; `logger.With(\"request_id\", id)` returns a logger that adds the field to every record; `LogValuer` lets a type redact itself (a card number, a token).",
            "**Histograms, not averages.** A Prometheus histogram counts observations per bucket of upper bounds (`le`, inclusive) plus `_sum` and `_count`; buckets are exposed cumulatively. Averages hide tails; percentiles show them.",
            "**`histogram_quantile(q, ...)`** estimates a percentile: rank = q x count, find the bucket holding the rank, interpolate linearly inside it (the first bucket starts at 0; a rank in `+Inf` returns the highest finite bound). The estimate is only as good as the bucket bounds around it.",
            "**Cardinality.** Every distinct combination of label values is a separate time series. Label with bounded values: the route template (`/orders/{id}`, `r.Pattern` in Go 1.23+), the method, the status class. Ids belong in logs and traces.",
        ]),

        h2("Apply it in the project"),
        p("One middleware does both: a request-scoped logger and a latency observation per route template:"),
        code("go", `
var requestSeconds = prometheus.NewHistogramVec(prometheus.HistogramOpts{
    Name:    "gateway_request_seconds",
    Help:    "Time to answer a request.",
    Buckets: prometheus.ExponentialBuckets(0.125, 2, 6), // 0.125 .. 4 s
}, []string{"route", "method", "code"})

func observe(next http.Handler, base *slog.Logger) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        rid := r.Header.Get("X-Request-Id")
        log := base.With("request_id", rid, "route", r.Pattern)
        ctx := withLogger(r.Context(), log)
        rec := &statusRecorder{ResponseWriter: w, code: 200}
        start := time.Now()
        next.ServeHTTP(rec, r.WithContext(ctx))
        elapsed := time.Since(start)
        requestSeconds.WithLabelValues(r.Pattern, r.Method, strconv.Itoa(rec.code/100)+"xx").Observe(elapsed.Seconds())
        log.Info("request", "status", rec.code, "ms", elapsed.Milliseconds())
    })
}`, "gateway/observe.go"),
        code("text", `
# PromQL: p99 of checkout over 5 minutes, across all gateway pods
histogram_quantile(0.99, sum by (le) (rate(gateway_request_seconds_bucket{route="POST /checkout"}[5m])))`, "dashboard query"),
        callout("info", "Pattern needs a match first",
            "`r.Pattern` is set by `http.ServeMux` when it routes the request, so read it in a handler the mux calls (or inside the middleware after `next.ServeHTTP`). Unmatched requests have an empty pattern: label them `unmatched`, never with the raw path."),

        h2("Verify"),
        code("bash", `
curl -s localhost:8080/metrics | grep 'gateway_request_seconds_bucket{code="2xx",method="POST",route="POST /checkout"'
# ...,le="2"} 9800
# ...,le="4"} 10000
# ...,le="+Inf"} 10000
curl -s localhost:8080/metrics | grep -c '^gateway_request_seconds_bucket'
# 336      (routes x methods x status classes x 8 buckets, no order ids)
kubectl -n rice-rocket logs deploy/gateway | jq -c 'select(.request_id=="8f3a1c")'
# {"level":"INFO","msg":"payment call","request_id":"8f3a1c","provider":"momo","ms":2870}
# {"level":"INFO","msg":"request","request_id":"8f3a1c","route":"POST /checkout","status":200,"ms":3012}`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Averaging percentiles across pods.** `avg(histogram_quantile(...))` of each pod is not the fleet's p99. Sum the bucket rates first (`sum by (le)`), then take the quantile.",
            "**Buckets that miss your SLO.** With buckets at 1 s and 5 s, a p99 of \"somewhere in between\" is all you get. Put bounds around the latencies you promise (for example 0.25 s, 0.5 s, 1 s for checkout).",
            "**Unbounded labels sneaking in.** User agents, ids, error messages. Watch `count by (__name__)({__name__=~\"gateway_.*\"})` after each release; a jump means a new label value source.",
        ]),

        challenge("chal_quiz_gcn_181"),
        p("Now build the histogram and the route labels. The editor holds `metrics.go` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run records request timings per path and compares the cumulative buckets, p50, p99 and the number of series."),
        challenge("chal_coding_gcn_182"),
    ],
});
