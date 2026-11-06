// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gcn-2-2",
    title: "Health checks and circuit breaking",
    slug: { _type: "slug", current: "go-gateway-health-checks-circuit-breaking" },
    description:
        "One menu-service instance hung, and Rice Rocket's gateway kept sending it a third of the traffic: every one of those requests waited for the full timeout. Learn per-call timeouts, active health checks, and a circuit breaker with closed, open and half-open states, and build the breaker the gateway uses for each upstream.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The gateway spreads menu requests over three menu-service instances. At 11:40 instance menu-2 stopped answering without closing its connections. Its health check still passed for a while, the gateway kept routing to it, and the lunch rush saw 2-second waits and a pile of goroutines on every gateway pod.",
    },

    content: [
        h2("Situation"),
        p("What the on-call engineer saw on one gateway pod during the incident:"),
        code("text", `
11:40:03 level=WARN msg="upstream timeout" route=/menu/{restaurant} upstream=menu-2 waited=2s
11:40:03 level=WARN msg="upstream timeout" route=/menu/{restaurant} upstream=menu-2 waited=2s
...
11:40:20 level=INFO msg="health check failed" upstream=menu-2 consecutive=3 action=remove

go_goroutines{pod="gateway-7c9f"}         3,904   (normally ~400)
gateway_request_seconds{route="/menu/{restaurant}",quantile="0.99"}  2.0`, "gateway logs and metrics"),
        bullets([
            "Every request routed to menu-2 waited for the whole 2 s client timeout before failing.",
            "The active health check needed three failed probes, 5 s apart, before it took menu-2 out: about 17 seconds of real traffic hit a dead instance.",
            "When menu-2 came back half-warm, the gateway sent it full traffic at once and it fell over again.",
        ]),

        h2("The core you need"),
        bullets([
            "**Every upstream call has a deadline.** `http.Client{Timeout: 2 * time.Second}` or `context.WithTimeout` per request. Without one, a hung upstream holds a goroutine and two connections for as long as the client is willing to wait.",
            "**Active health checks** probe each instance on a schedule (`GET /healthz` every 5 s) and move it out after N failures in a row, back in after M successes. They are slow to notice a hang and they test the probe path, not the real one.",
            "**Passive checks react to real traffic.** A circuit breaker per upstream counts the outcomes of real calls: timeouts, connection errors and 5xx are failures; a 4xx is the client's fault and says nothing about the upstream's health.",
            "**Three states.** Closed: calls go through, failures in a row are counted. Open: calls are refused at once (`503` with `Retry-After`) for a cool-down. Half-open: after the cool-down a few trial calls go through; one failure reopens for a new cool-down, enough successes close it.",
            "**Failing fast is the point.** An open breaker answers in microseconds, frees the gateway's goroutines and connections, and gives the upstream room to recover instead of a retry storm.",
        ]),

        h2("Apply it in the project"),
        p("The gateway keeps one breaker per upstream instance and wraps every proxied call:"),
        code("go", `
func (g *Gateway) proxyMenu(w http.ResponseWriter, r *http.Request) {
    up := g.pool.Pick(r)                        // consistent hashing, lesson 4
    br := g.breakers[up.Name]
    if !br.Allow(time.Now()) {
        w.Header().Set("Retry-After", "10")
        problem(w, http.StatusServiceUnavailable, "menu service unavailable, try again shortly")
        return
    }
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()
    resp, err := up.Client.Do(up.NewRequest(ctx, r)) // same method, path and headers, instance URL
    failed := err != nil || resp.StatusCode >= 500 // 4xx is the caller's problem
    br.Record(time.Now(), failed)
    if err != nil {
        problem(w, http.StatusGatewayTimeout, "menu service did not answer in time")
        return
    }
    defer resp.Body.Close()
    copyResponse(w, resp)
}`, "gateway/menu.go"),
        p("Breaker settings live next to the upstream definition, so each service gets thresholds that fit its traffic:"),
        code("yaml", `
upstreams:
  menu:
    instances: [menu-1:8080, menu-2:8080, menu-3:8080]
    timeout: 2s
    breaker:
      failureThreshold: 3      # failures in a row
      openFor: 10s             # cool-down before trial calls
      successThreshold: 2      # successful trials to close
    healthCheck: { path: /healthz, interval: 5s, unhealthyThreshold: 3, healthyThreshold: 2 }`, "gateway/config.yaml"),
        callout("info", "Libraries",
            "`github.com/sony/gobreaker` implements the same state machine (with counts and an `OnStateChange` hook), and service meshes such as Envoy offer it as outlier detection. Writing it once yourself makes their settings easy to read."),

        h2("Verify"),
        code("bash", `
# make menu-2 hang (a test build that sleeps on every request), then send traffic
hey -z 30s -c 20 https://gateway.staging.ricerocket.vn/menu/rr-118
# Status code distribution:
#   [200] 9120 responses
#   [503] 1874 responses      <- breaker open for menu-2, answered at once
#   [504] 6 responses         <- the 3 timeouts per pod that opened it
curl -s localhost:9090/debug/breakers | jq
# {"menu-1":"closed","menu-2":"open","menu-3":"closed"}`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Counting 4xx as failures.** One client sending bad ids opens the breaker for everybody. Check what your `failed` condition includes; only timeouts, connection errors and 5xx belong there.",
            "**A total failure count instead of failures in a row** (or in a window). Scattered errors over an hour open the breaker during normal traffic. Reset the count on success, or use a sliding window with a minimum number of calls.",
            "**No cool-down before trials.** Sending full traffic to an instance the moment its breaker closes knocks a recovering service over again. Keep the half-open trials small and the cool-down long enough for a restart.",
        ]),

        challenge("chal_quiz_gcn_151"),
        p("Now build the breaker. The editor holds `breaker.go` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run replays request timelines (hung calls, 5xx, 404s, recovery) and compares the statuses, the upstream calls and the breaker's transitions."),
        challenge("chal_coding_gcn_152"),
    ],
});
