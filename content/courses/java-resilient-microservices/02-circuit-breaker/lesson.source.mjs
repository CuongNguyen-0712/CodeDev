// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-jrm-1-2",
    title: "A circuit breaker that opens for the right reasons",
    slug: { _type: "slug", current: "java-circuit-breaker-resilience4j" },
    description:
        "When courier-matching degraded, every order waited 3 s on it; the hand-written breaker that followed opened on a single error and on customers' typos. Learn how a Resilience4j circuit breaker decides: a window of recent calls, a minimum number of calls, failure and slow-call rates, the open wait and the half-open trial, and which errors it must ignore.",
    estimatedTime: 17,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "order-service asks courier-matching for a courier on every placed order. When courier-matching degraded, order-service kept waiting 3 s per call and the order page timed out. A breaker added in a hurry then opened at night after one error, and during the day whenever a customer sent an invalid address.",
    },

    content: [
        h2("Situation"),
        p("Two incidents a week apart, from order-service's logs:"),
        code("text", `
# Monday: courier-matching degraded, no breaker
11:52:10 POST /orders  503  3,012 ms  courier-matching: timeout
11:52:10 POST /orders  503  3,008 ms  courier-matching: timeout
... 4,180 orders in 6 minutes, each waiting 3 s for an answer that never came

# Friday: hand-written breaker "open after an error, retry after 60 s"
02:14:33 courier-matching 400 Bad Request (address outside delivery zone)   -> breaker OPEN
02:14:41 POST /orders  503  2 ms  courier-matching circuit open
... 58 s without couriers for any order, after one customer typo`, "order-service logs"),
        bullets([
            "Without a breaker, a degraded dependency makes every caller slow; the breaker's job is to fail fast while it is sick.",
            "With a breaker that judges one call, any single error (even the caller's own mistake) cuts off a healthy dependency.",
        ]),

        h2("The core you need"),
        bullets([
            "**Three states.** CLOSED: calls go through and are recorded. OPEN: calls fail at once (`CallNotPermittedException`) without touching the dependency. HALF_OPEN: a few trial calls go through to test whether it recovered.",
            "**A window and a minimum.** A count-based window keeps the last N recorded calls (a time-based one, the last N seconds). No decision is made before `minimumNumberOfCalls` calls are recorded, so one error at 2 a.m. is 1 call, not a 100% failure rate.",
            "**Two rates.** The breaker opens when the failure rate or the slow-call rate (calls longer than `slowCallDurationThreshold`) reaches its threshold. Slow successes count: a dependency answering in 3 s is as harmful to callers as one that fails.",
            "**Not every error is the dependency's fault.** A 400 for an invalid address is the caller's mistake; list such exceptions under `ignoreExceptions` so they pass through without being recorded.",
            "**Open, then probe.** After `waitDurationInOpenState` the next call moves the breaker to HALF_OPEN; after `permittedNumberOfCallsInHalfOpenState` trial calls it closes, or opens again if the rates are still bad. Each change of state starts a new, empty window.",
            "**A fallback is part of the design.** While open, order-service queues the order for matching later instead of failing it.",
        ]),

        h2("Apply it in the project"),
        code("yaml", `
resilience4j:
  circuitbreaker:
    instances:
      courierMatching:
        sliding-window-type: COUNT_BASED
        sliding-window-size: 10
        minimum-number-of-calls: 5
        failure-rate-threshold: 50              # %
        slow-call-duration-threshold: 1s
        slow-call-rate-threshold: 80            # %
        wait-duration-in-open-state: 5s
        permitted-number-of-calls-in-half-open-state: 3
        ignore-exceptions:
          - com.ricerocket.order.matching.InvalidAddressException   # mapped from 400`, "order-service/src/main/resources/application.yml"),
        code("java", `
@Service
class CourierMatchingClient {
    @CircuitBreaker(name = "courierMatching", fallbackMethod = "matchLater")
    MatchResult match(Order order) {
        return restClient.post().uri("/v1/matches").body(order).retrieve()
            .onStatus(s -> s.value() == 400, (req, res) -> { throw new InvalidAddressException(order.id()); })
            .body(MatchResult.class);
    }

    // Called while the breaker is open (and for recorded failures): the order waits for a courier.
    MatchResult matchLater(Order order, Throwable cause) {
        pendingMatches.enqueue(order.id());
        return MatchResult.pending(order.id());
    }
}`, "order-service/src/main/java/com/ricerocket/order/matching/CourierMatchingClient.java"),
        callout("info", "Retry and breaker together",
            "When both wrap a call, the retry of lesson 1 should sit outside the breaker in the decision chain, so retries stop as soon as the breaker opens (`CallNotPermittedException` is not in `retry-exceptions`). Check the aspect order your Resilience4j version applies by default."),

        h2("Verify"),
        code("bash", `
# Make the stub fail 3 of 5 calls, then watch the breaker
curl -s localhost:8080/actuator/health | jq '.components.circuitBreakers.details.courierMatching.details'
# { "state": "OPEN", "failureRate": "60.0%", "slowCallRate": "0.0%", "bufferedCalls": 0, ... }
curl -s 'localhost:8080/actuator/metrics/resilience4j.circuitbreaker.not.permitted.calls?tag=name:courierMatching' | jq '.measurements[0].value'
# 37.0   <- calls answered by the fallback while open, without waiting 3 s`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A minimum below the traffic you see at night.** With `minimum-number-of-calls: 1` one error opens the breaker. Pick a minimum that a real outage reaches within a few seconds at your quietest hour.",
            "**Business errors recorded as failures.** 4xx answers that depend on the request (validation, not found, conflict) do not say anything about the dependency's health. Check `bufferedCalls` against failed requests in the logs to spot them.",
            "**A breaker per instance, decided per instance.** Each order-service pod has its own breaker and window; with 10 pods and a low minimum, some pods open while others do not. Look at the state per pod in the metrics, not only the total.",
        ]),

        p("Now write the breaker's decisions. The editor holds `Main.java` with a breaker modelled on Resilience4j's count-based CircuitBreaker, its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the hurried breaker's mistakes on purpose. The test runner replays timed calls and prints the state before each call and every change of state."),
        challenge("chal_coding_jrm_122"),
    ],
});
