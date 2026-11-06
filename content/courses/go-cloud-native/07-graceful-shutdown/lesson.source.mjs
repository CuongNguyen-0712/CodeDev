// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gcn-3-1",
    title: "Graceful shutdown behind Kubernetes probes",
    slug: { _type: "slug", current: "go-gateway-graceful-shutdown-kubernetes" },
    description:
        "Every rollout of Rice Rocket's gateway produced a burst of 502s, and once a stuck request kept a pod alive until SIGKILL. Learn what Kubernetes does when it stops a pod, how http.Server.Shutdown drains requests, and how to fit a drain delay, the request wait, the workers and the logs into the grace period, then write the gateway's SIGTERM handler.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The gateway runs as a Deployment with rolling updates. Each rollout showed a few hundred 502s at the ingress in the first seconds after an old pod got SIGTERM, and one rollout ended with a pod killed mid-way: its last logs never reached the log pipeline and a half-sent push notification batch was lost.",
    },

    content: [
        h2("Situation"),
        p("The handler the gateway shipped with, and what the ingress logged during a rollout:"),
        code("go", `
sig := make(chan os.Signal, 1)
signal.Notify(sig, syscall.SIGTERM)
<-sig
log.Println("bye")
os.Exit(0)`, "cmd/gateway/main.go (before)"),
        code("text", `
10:04:00.000 gateway-7c9f  SIGTERM, exiting
10:04:00.412 ingress  upstream=10.8.1.14:8080 status=502 connect() failed (111: Connection refused)
10:04:00.413 ingress  upstream=10.8.1.14:8080 status=502 upstream prematurely closed connection
10:04:02.950 ingress  upstream=10.8.1.14:8080 status=502 connect() failed (111: Connection refused)`, "ingress log"),
        bullets([
            "Requests in flight at SIGTERM were cut (`prematurely closed connection`).",
            "For about three seconds after SIGTERM, new connections still arrived and were refused.",
            "A later fix waited for every request without a limit; a stuck export kept the pod alive until the kubelet killed it.",
        ]),

        h2("The core you need"),
        bullets([
            "**What deleting a pod starts.** The kubelet runs the `preStop` hook and then sends SIGTERM; at the same time the pod is marked terminating and removed from the Service's EndpointSlices. kube-proxy, the ingress controller and cloud load balancers apply that removal at their own pace, so new connections can keep arriving for a few seconds.",
            "**The grace period.** `terminationGracePeriodSeconds` (default 30) counts from the start of termination. When it runs out, the kubelet sends SIGKILL: no code runs after that.",
            "**`http.Server.Shutdown(ctx)`** closes the listeners, closes idle connections and waits for active requests to finish, until `ctx` expires (then it returns the context's error). `Close` cuts everything at once. Long-lived hijacked connections need `RegisterOnShutdown`.",
            "**Budget the shutdown.** Drain delay (keep serving while traffic moves away) + request wait + stopping workers + a margin must stay under the grace period, so the wait gets a deadline: grace - drain - workers - margin.",
            "**Workers and logs.** Background goroutines get a context to cancel and a WaitGroup to wait on; buffered logs and metrics are flushed last. The exit code says whether the shutdown was clean.",
        ]),

        h2("Apply it in the project"),
        code("go", `
func main() {
    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
    defer stop()

    workers, cancelWorkers := context.WithCancel(context.Background())
    var wg sync.WaitGroup
    startWorkers(workers, &wg)                       // push batches, cache warmers

    srv := &http.Server{Addr: ":8080", Handler: router()}
    go func() {
        if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
            slog.Error("listen", "err", err)
            os.Exit(1)
        }
    }()

    <-ctx.Done()                                     // SIGTERM
    slog.Info("draining", "delay", drainDelay)
    time.Sleep(drainDelay)                           // 5 s: let the load balancers forget this pod

    budget := grace - drainDelay - workerStop - margin
    sctx, cancel := context.WithTimeout(context.Background(), budget)
    defer cancel()
    err := srv.Shutdown(sctx)                        // stop accepting, wait for in-flight requests

    cancelWorkers()
    wg.Wait()
    flushLogs()
    if err != nil {
        slog.Error("shutdown cut requests", "err", err)
        os.Exit(1)
    }
}`, "cmd/gateway/main.go"),
        code("yaml", `
spec:
  terminationGracePeriodSeconds: 30
  containers:
    - name: gateway
      readinessProbe:
        httpGet: { path: /readyz, port: http }
        periodSeconds: 5`, "k8s/gateway.yaml (excerpt)"),
        callout("info", "In the app or in preStop",
            "The drain delay can live in the app (as above) or in a `preStop` hook (`sleep 5` needs a shell in the image; Kubernetes 1.30+ also has a built-in sleep action, check your cluster version). Either way it counts against the same grace period."),

        h2("Verify"),
        code("bash", `
# continuous traffic while rolling out
hey -z 60s -c 30 https://gateway.staging.ricerocket.vn/menu/rr-118 > hey.txt &
kubectl -n rice-rocket rollout restart deployment/gateway
kubectl -n rice-rocket rollout status deployment/gateway
grep -A5 "Status code distribution" hey.txt
#   [200] 52310 responses          <- no 502 or 503 during the rollout
kubectl -n rice-rocket logs gateway-7c9f --previous | tail -3
# {"level":"INFO","msg":"draining","delay":"5s"}
# {"level":"INFO","msg":"workers stopped"}
# {"level":"INFO","msg":"shutdown complete","code":0}`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Closing the listener at SIGTERM.** Refused connections in the first seconds of every rollout show up as 502 `Connection refused` at the ingress. Add the drain delay before `Shutdown`.",
            "**A `Shutdown` context as long as the grace period.** Anything after it (workers, log flush) never runs once a request is stuck. Check that drain + budget + workers + margin is below `terminationGracePeriodSeconds`.",
            "**PID 1 that does not forward signals.** A shell script as the entrypoint (`sh -c ./gateway`) receives SIGTERM and does not pass it on, so the app only ever sees SIGKILL. Use the exec form `ENTRYPOINT [\"/gateway\"]`, as in the Docker course.",
        ]),

        challenge("chal_quiz_gcn_171"),
        p("Now write the SIGTERM handler. The editor holds `shutdown.go` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run replays rollouts (requests in flight, requests still routed to the pod, a slow export, a stuck request) on a simulated pod with a virtual clock."),
        challenge("chal_coding_gcn_172"),
    ],
});
