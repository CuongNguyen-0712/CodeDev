// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-jrm-1-3",
    title: "Bulkheads and virtual threads",
    slug: { _type: "slug", current: "java-bulkheads-virtual-threads" },
    description:
        "On the last evening of the month, finance's report exports held every database connection and checkout failed, on a service that already ran on virtual threads. Learn what bulkheads isolate, semaphore vs thread-pool bulkheads in Resilience4j, how long a call should wait for a permit, and why virtual threads move the limit instead of removing it.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "order-service serves checkout, courier lookups and finance's CSV exports. After moving to virtual threads the team assumed a slow endpoint could no longer hurt the others. At 18:00 on the last day of the month, ten exports were running and checkout returned 500s for 20 minutes.",
    },

    content: [
        h2("Situation"),
        code("text", `
18:01:40 GET  /reports/orders.csv   started   (finance, ~4 min each, holds one DB connection)
...       10 exports running
18:02:11 POST /checkouts  500  HikariPool-1 - Connection is not available, request timed out after 30000ms
         (total=10, active=10, idle=0, waiting=184)
18:02:11 GET  /orders/ORD-90412/status  500  same error`, "order-service logs"),
        bullets([
            "Virtual threads did their job: no request thread was missing. The 10 connections of the pool were the shared resource, and the exports took all of them.",
            "Every endpoint waited up to 30 s for a connection, so one slow feature turned into a full outage.",
        ]),

        h2("The core you need"),
        bullets([
            "**A bulkhead caps the concurrent calls to one dependency,** so a slow or busy dependency can only use its own share: two exports at a time leave eight connections for checkout.",
            "**One bulkhead per dependency.** A single limit on \"the HTTP client\" lets the slowest dependency take every slot. Give payments, couriers and reports their own limits, sized from what each downstream can take.",
            "**Wait briefly, or not at all.** A call that finds no free permit may wait up to `maxWaitDuration` for one, first come first served; after that, or immediately with a wait of 0, it is rejected with `BulkheadFullException`. Long waits turn the bulkhead into a slow queue that holds requests and memory.",
            "**Always give the permit back.** A failed call must release its permit like a successful one; a leak shrinks the bulkhead until nothing passes.",
            "**Semaphore vs thread pool.** A semaphore bulkhead (the default) runs the call on the caller's thread and only counts. A thread-pool bulkhead runs it on its own bounded pool and returns a `CompletionStage`. With virtual threads, blocking the caller is cheap, so the semaphore type is usually the right one.",
            "**Virtual threads move the limit.** They remove the platform-thread ceiling; the database pool, a partner's rate limit or memory become the limit instead, and that is what the bulkhead must protect.",
        ]),

        h2("Apply it in the project"),
        code("yaml", `
spring:
  threads:
    virtual:
      enabled: true
  datasource:
    hikari:
      maximum-pool-size: 10

resilience4j:
  bulkhead:
    instances:
      payments:
        max-concurrent-calls: 6
        max-wait-duration: 100ms
      couriers:
        max-concurrent-calls: 4
        max-wait-duration: 200ms
      reports:
        max-concurrent-calls: 2       # leaves 8 connections for everything else
        max-wait-duration: 0`, "order-service/src/main/resources/application.yml"),
        code("java", `
@RestController
class ReportController {
    @GetMapping("/reports/orders.csv")
    @Bulkhead(name = "reports", fallbackMethod = "busy")
    ResponseEntity<StreamingResponseBody> export(@RequestParam YearMonth month) {
        return ResponseEntity.ok(out -> reports.writeCsv(month, out));
    }

    ResponseEntity<StreamingResponseBody> busy(YearMonth month, BulkheadFullException e) {
        return ResponseEntity.status(503).header("Retry-After", "120").build();
    }
}`, "order-service/src/main/java/com/ricerocket/order/report/ReportController.java"),
        callout("info", "Size from the downstream, not from the threads",
            "Start from the resource the calls share: with 10 connections, checkout at peak needs about 6. Exports get 2, couriers' calls do not touch the database, and the pool keeps 2 spare. Revisit the numbers with the pool metrics (`hikaricp.connections.pending`) after a busy week."),

        h2("Verify"),
        code("bash", `
# Start 5 exports at once, then a checkout
for i in 1 2 3 4 5; do curl -s -o /dev/null -w '%{http_code} ' localhost:8080/reports/orders.csv?month=2026-10 & done; wait
# 200 200 503 503 503
curl -s -o /dev/null -w '%{http_code} %{time_total}\\n' -X POST localhost:8080/api/checkouts -d @checkout.json
# 201 0.212
curl -s 'localhost:8080/actuator/metrics/resilience4j.bulkhead.available.concurrent.calls?tag=name:reports' | jq '.measurements[0].value'
# 0.0   <- both export permits in use`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A permit leaked on errors.** Releasing only after success shrinks the bulkhead with every failure until all calls are rejected. Watch `available.concurrent.calls` at idle: it must return to the maximum.",
            "**A wait as long as the request timeout.** A 30 s `max-wait-duration` keeps users waiting on a page that will fail anyway. Keep waits short and let the fallback answer.",
            "**One limit for unrelated dependencies.** A shared bulkhead on the HTTP client lets reports block payments again. Look at the bulkhead names in the metrics: there should be one per dependency.",
        ]),

        challenge("chal_quiz_jrm_131"),
        p("Now isolate the dependencies. The editor holds `Main.java` with semaphore bulkheads modelled on Resilience4j's, their key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the month-end mistakes on purpose. The test runner replays timed calls to payments, couriers and reports and prints when each started, finished or was rejected."),
        challenge("chal_coding_jrm_132"),
    ],
});
