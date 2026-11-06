// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-jrm-3-2",
    title: "Trace context across services",
    slug: { _type: "slug", current: "java-trace-context-across-services" },
    description:
        "One Rice Rocket checkout appeared as three unrelated traces: a hand-written HTTP client dropped the context, the sampling flag said no, and Kafka records carried no headers. Learn the W3C traceparent header, how Spring Boot with Micrometer Tracing propagates it over HTTP and Kafka, and where it silently stops - then continue a trace by hand where no library does it for you.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "A slow checkout ticket: the tracing backend shows the order-service span, but the payment call, the card processor and the courier-matcher appear as separate traces, so nobody can see where the 4 seconds went.",
    },

    content: [
        h2("Situation"),
        p("What the team found when they lined up the logs of one request:"),
        code("text", `
order-service    traceId=4bf92f3577b34da6a3ce929d0e0e4736 spanId=00f067aa0ba902b7  POST /checkout 4,212 ms
payment-service  traceId=4bf92f3577b34da6a3ce929d0e0e4736 spanId=53995c3f42cd8ad8  POST /payments 3,904 ms
card-processor   traceId=9c1e0d7a2b4f6e8d0a1c3e5f7b9d1f3a                          POST /authorize 3,850 ms
courier-matcher  traceId=e2a4c6b8d0f1a3c5e7b9d1f3a5c7e9b1                          OrderPlaced handled`, "correlated logs"),
        bullets([
            "payment-service called the card processor with an old `HttpURLConnection` helper: no `traceparent` left the service.",
            "The courier-matcher's consumer started a new trace for every record: the producer wrote no Kafka headers.",
            "Earlier, at 10 % sampling, many requests showed matching ids in logs but no spans in the backend.",
        ]),

        h2("The core you need"),
        bullets([
            "**`traceparent`** (W3C Trace Context) is `version-traceid-parentid-flags`: `00`, 32 lowercase hex digits, 16 lowercase hex digits, 2 hex digits whose bit `01` means sampled. All-zero ids and version `ff` are invalid; a receiver that cannot parse the header starts a new trace. `tracestate` carries vendor data alongside it.",
            "**Each hop rewrites one field.** The trace id stays the same for the whole request; the parent id becomes the id of the span that makes the outgoing call; the sampled flag is passed on.",
            "**Libraries propagate, plain code does not.** In Spring Boot, Micrometer Tracing (with the OpenTelemetry or Brave bridge) instruments the `RestClient`, `RestTemplate` and `WebClient` built from the auto-configured builders, and Kafka when observation is enabled on the template and listener. A client you build by hand, or `new RestTemplate()`, sends nothing.",
            "**Sampling is decided once, at the root.** With the default parent-based sampler, services follow the caller's flag; `management.tracing.sampling.probability` applies only where a trace starts.",
            "**Baggage is not a place for personal data.** It is copied to every downstream call and often into logs.",
        ]),

        h2("Apply it in the project"),
        code("yaml", `
management:
  tracing:
    sampling:
      probability: 0.2          # where a trace starts (the gateway); children follow the parent
    propagation:
      type: w3c
spring:
  kafka:
    template:
      observation-enabled: true # writes traceparent into record headers
    listener:
      observation-enabled: true # continues the trace in @KafkaListener methods`, "application.yaml"),
        code("java", `
@Bean
RestClient cardProcessor(RestClient.Builder builder) {       // the auto-configured, instrumented builder
    return builder.baseUrl("https://processor.example.vn").build();
}`, "PaymentClientConfig.java"),
        p("Where a library cannot help (a vendor SDK, a raw socket protocol), build the header yourself from the current span, as the challenge does."),
        callout("info", "Logs and traces together",
            "With Micrometer Tracing on the classpath, recent Spring Boot versions put `traceId` and `spanId` into the log pattern (logging.pattern.correlation), so a log line links straight to its trace. Check your version's docs for the exact property."),

        h2("Verify"),
        code("bash", `
# the header the payment-service sends (point the processor URL at a local echo server)
curl -s -X POST localhost:8081/payments -H 'traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' -d @payment.json
# echo server log: traceparent: 00-0af7651916cd43dd8448eb211c80319c-<new span id>-01
# Kafka records now carry the header
kafka-console-consumer --bootstrap-server kafka:9092 --topic orders.v1 --property print.headers=true --max-messages 1
# traceparent:00-0af7651916cd43dd8448eb211c80319c-...-01	{"orderId":"o-90412"}`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Forwarding the incoming header unchanged.** The trace id matches, but every downstream span claims the caller as its parent and the waterfall in the backend is wrong. Check that the parent id in the outgoing header is a span of this service.",
            "**Being liberal with bad headers.** Accepting uppercase hex or all-zero ids glues unrelated requests into one trace (a broken proxy sending zeros joins everything). Validate strictly and restart the trace.",
            "**Async boundaries.** Work handed to an `ExecutorService` or `CompletableFuture.supplyAsync` without context propagation loses the current span; use the context-propagating executors (or virtual threads with the observation API) and check a span created inside the task.",
        ]),

        challenge("chal_quiz_jrm_181"),
        p("Now continue the trace by hand. The editor holds `Main.java` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run sends a list of incoming headers, valid and broken, and checks the line printed for each."),
        challenge("chal_coding_jrm_182"),
    ],
});
