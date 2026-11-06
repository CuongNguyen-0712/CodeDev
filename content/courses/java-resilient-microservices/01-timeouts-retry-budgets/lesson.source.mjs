// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-jrm-1-1",
    title: "Timeouts and retry budgets",
    slug: { _type: "slug", current: "java-timeouts-retry-budgets" },
    description:
        "When Rice Rocket's payment provider slowed down, order-service ran out of threads and its retries turned 95 checkouts a second into 1,400 payment calls. Learn per-attempt timeouts inside a deadline, which failures are worth a retry, exponential backoff and a retry budget, and how they map to Spring Boot and Resilience4j.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "order-service (Spring Boot, Java 21) charges the customer through payment-service, which calls the payment provider. On a Friday lunch the provider answered in 8 seconds instead of 200 ms; within two minutes order-service stopped answering anything, menus and order status included.",
    },

    content: [
        h2("Situation"),
        p("What the dashboards showed between 10:39 and 10:43:"),
        code("text", `
order-service    Tomcat busy threads   12 -> 200 (max)      p99 latency   180 ms -> 30 s
payment-service  requests/s           120 -> 1,410          checkouts/s  95 (unchanged)
provider         p50 latency          210 ms -> 8.1 s
gateway          5xx on GET /menus    0 -> 61%`, "dashboard"),
        bullets([
            "The payment `RestClient` had a connect timeout but no read timeout: every request thread waited as long as the provider did.",
            "The gateway retried order-service 3 times and order-service retried payment-service 3 times: up to 12 payment calls per checkout, against a provider that was already struggling.",
            "One retried charge had already succeeded at the provider: a customer paid twice.",
        ]),

        h2("The core you need"),
        bullets([
            "**A deadline per operation, a timeout per attempt.** The checkout may spend, say, 2 s on payment in total; each attempt gets at most 800 ms and never more than what is left of the 2 s. Without a read timeout, a slow dependency holds your threads hostage.",
            "**Retry only what a retry can fix.** No answer in time, 429 and 5xx are often transient. 400, 404, 409 and 422 will fail the same way again. A timed-out POST is ambiguous (did the charge happen?), so retry it only with an idempotency key (lesson 4).",
            "**Back off exponentially.** Retry n waits `base * 2^(n-1)`, plus random jitter in production so thousands of clients do not retry in lockstep. Skip a retry whose wait would reach the deadline: it can only fail later.",
            "**Retries multiply across layers.** 4 gateway calls x 3 payment attempts = 12 calls for one checkout. Retry in one layer, the one closest to the failing dependency.",
            "**A retry budget caps the total.** Every request adds a fraction of a token (for example 0.1), every retry spends a whole one. In normal times there are always tokens; during an outage retries stop after about 10% extra load instead of tripling it. gRPC and Envoy call this retry throttling; with Resilience4j you add it yourself.",
        ]),

        h2("Apply it in the project"),
        p("The timeouts on the HTTP client and the retry policy, in order-service's configuration (property names as in recent Spring Boot and resilience4j-spring-boot3 versions; check them against yours):"),
        code("yaml", `
spring:
  http:
    client:
      connect-timeout: 300ms
      read-timeout: 800ms          # per attempt

resilience4j:
  retry:
    instances:
      payment:
        max-attempts: 3            # 1 call + 2 retries
        wait-duration: 100ms
        enable-exponential-backoff: true
        exponential-backoff-multiplier: 2
        retry-exceptions:
          - org.springframework.web.client.ResourceAccessException      # timeouts, resets
          - org.springframework.web.client.HttpServerErrorException     # 5xx
        ignore-exceptions:
          - org.springframework.web.client.HttpClientErrorException     # 4xx: never retried`, "order-service/src/main/resources/application.yml"),
        p("The deadline and the budget live in the code that makes the call; the gateway's own retries for this route are switched off:"),
        code("java", `
@Service
class PaymentClient {
    private final RetryBudget budget = new RetryBudget(10, 0.1);  // shared by every checkout

    ChargeResult charge(ChargeRequest request, Instant deadline) {
        budget.onRequest();
        return retry.executeSupplier(() -> {
            Duration left = Duration.between(Instant.now(), deadline);
            if (left.isNegative()) throw new DeadlineExceeded();
            return restClient.post().uri("/v1/charges")
                .header("Idempotency-Key", request.orderId())   // makes the POST safe to retry
                .body(request).retrieve().body(ChargeResult.class);
        });
    }
}`, "order-service/src/main/java/com/ricerocket/order/payment/PaymentClient.java"),
        callout("info", "Why not just a bigger thread pool",
            "With 200 threads and an 8 s provider, the service handles 25 payment calls a second at most; with 2,000 threads, 250. The queue still grows without bound while the provider is slow, and the threads that wait are not serving menus. A timeout makes the slow path fail fast; virtual threads (lesson 3) make waiting cheap but do not make the provider faster."),

        h2("Verify"),
        code("bash", `
# Slow the provider stub down to 5 s and run a checkout
curl -s -X POST localhost:8081/__admin/latency -d '{"ms":5000}'
time curl -s -o /dev/null -w '%{http_code}\\n' -X POST localhost:8080/api/checkouts -d @checkout.json
# 504
# real 0m2.01s        <- the 2 s deadline, not 5 s or 15 s
curl -s localhost:8080/actuator/metrics/resilience4j.retry.calls | jq '.availableTags'
# kind: successful_with_retry, failed_with_retry, failed_without_retry, ...`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Retries in every layer.** Check the gateway, service mesh and client library settings together; the request rate at the dependency during an incident (requests/s per checkout) is the tell.",
            "**Retrying 4xx.** A 409 on a payment that is already captured, or a 422 for an invalid card, fails identically on every attempt and only adds load. Classify by status, not by exception type alone.",
            "**Timeouts longer than the caller's.** If the gateway gives up after 3 s and order-service still retries for 6 s, the work after 3 s is wasted. Pass the deadline down (a header or the request context) and stop when it has passed.",
        ]),

        challenge("chal_quiz_jrm_111"),
        p("Now bound the payment call. The editor holds `Main.java`: the call loop with its key blocks missing, each marked by a `// [ ]` line. Click a piece to fill a line, or drag it onto one; some pieces repeat the outage's mistakes on purpose. The test runner at the bottom replays checkouts against a scripted provider and prints the attempts and elapsed time of each."),
        challenge("chal_coding_jrm_112"),
    ],
});
