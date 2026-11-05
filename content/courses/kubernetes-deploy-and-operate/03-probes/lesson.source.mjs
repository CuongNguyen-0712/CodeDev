// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-k8s-1-3",
    title: "Readiness, liveness and startup probes that tell the truth",
    slug: { _type: "slug", current: "kubernetes-readiness-liveness-startup-probes" },
    description:
        "A liveness probe on the database check restarted every Rice Rocket api pod during a 40 second Postgres failover, missing readiness sent traffic to pods still booting, and a short initial delay killed slow starts into CrashLoopBackOff. Learn what each probe kind does when it fails, how its timing adds up, and fix the api's probes.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api exposes `GET /health` (the process is up) and `GET /ready` (it can also reach Postgres). It needs about 20 seconds to load its price cache, up to 50 on a fresh node. Three probe setups in a row each caused an incident.",
    },

    content: [
        h2("Situation"),
        p("This is the probe the api shipped with, and what happened:"),
        code("yaml", `
          livenessProbe:
            httpGet:
              path: /ready          # runs SELECT 1 against Postgres
              port: http
            periodSeconds: 10
            failureThreshold: 3`, "k8s/api-deployment.yaml"),
        bullets([
            "The managed Postgres failed over for 40 seconds. Every api pod failed liveness three times, all restarted together, and each spent 20 seconds booting after Postgres was back: a two-minute outage from a 40-second blip.",
            "With no readiness probe, a new pod joined the Service the moment its container started. Every rollout produced a burst of 502s from pods still loading the cache.",
            "A later attempt used `livenessProbe` on `/health` with `initialDelaySeconds: 5`. On a fresh node the cache took 44 seconds: the pod was killed at about 35 seconds, again and again, into `CrashLoopBackOff`.",
        ]),

        h2("The core you need"),
        bullets([
            "**Three probes, three consequences.** A failing **readiness** probe takes the pod out of the Service's endpoints and puts it back when it passes again; it never restarts anything. A failing **liveness** probe restarts the container. A **startup** probe holds the other two off until the app has started, and restarts the container if it never does.",
            "**Liveness asks one question: is this process stuck?** Point it at an endpoint that depends only on the process (`/health`). Anything that depends on another system (database, queue, another service) belongs in readiness: when that system is down, a restart fixes nothing and every pod fails at once.",
            "**The timing is arithmetic.** A probe runs every `periodSeconds` (default 10) and acts after `failureThreshold` failures in a row (default 3). Liveness restarts a hung process after about `failureThreshold x periodSeconds`; a startup probe allows `failureThreshold x periodSeconds` for the boot. `timeoutSeconds` defaults to 1 second, short for an endpoint that touches a database.",
            "**Readiness gates traffic in both directions.** A new pod gets no requests until readiness succeeds, so rollouts stop sending traffic to booting pods. A pod that loses Postgres leaves the Service after `failureThreshold x periodSeconds` and comes back on the first success.",
            "**Probe types.** `httpGet` passes on a status from 200 to 399; `tcpSocket` passes as soon as the port accepts connections, even when the app behind it hangs; `exec` runs a command in the container. `port` can be the container port's name (`http`).",
        ]),

        h2("Apply it in the project"),
        p("Give the api all three probes: startup for the slow cache load, readiness on the dependency check, liveness on the process alone:"),
        code("yaml", `
      containers:
        - name: api
          image: ghcr.io/rice-rocket/api:1.4.0
          ports:
            - name: http
              containerPort: 3000
          startupProbe:              # up to 30 x 2 s = 60 s to boot
            httpGet:
              path: /health
              port: http
            periodSeconds: 2
            failureThreshold: 30
          readinessProbe:            # out of the Service 10 s after Postgres stops answering
            httpGet:
              path: /ready
              port: http
            periodSeconds: 5
            failureThreshold: 2
          livenessProbe:             # a hung process is restarted after about 30 s
            httpGet:
              path: /health
              port: http
            periodSeconds: 10
            timeoutSeconds: 2
            failureThreshold: 3`, "k8s/api-deployment.yaml"),
        callout("info", "Keep /health cheap",
            "`/health` should answer from memory: no database query, no call to another service, no work that grows with load. If it needs a lock or a queue the request handlers also use, a busy pod can look hung and get restarted at the worst moment."),

        h2("Verify"),
        code("bash", `
kubectl apply -f k8s/api-deployment.yaml
kubectl -n rice-rocket rollout status deployment/api
kubectl -n rice-rocket get pods -l app=api -w
# api-6c5f9d7b8f-2xk4p   0/1   Running   0   12s   (startup probe still failing: no traffic)
# api-6c5f9d7b8f-2xk4p   1/1   Running   0   24s   (readiness passed: in the Service)
kubectl -n rice-rocket describe pod -l app=api | grep -E "Liveness|Readiness|Startup"
#   Liveness:   http-get http://:http/health delay=0s timeout=2s period=10s #success=1 #failure=3
#   Readiness:  http-get http://:http/ready delay=0s timeout=1s period=5s #success=1 #failure=2
#   Startup:    http-get http://:http/health delay=0s timeout=1s period=2s #success=1 #failure=30
kubectl -n rice-rocket get endpointslices -l kubernetes.io/service-name=api
# a pod that fails /ready drops out of ENDPOINTS within about 10 s; RESTARTS stays 0`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Same endpoint for readiness and liveness.** If both hit `/ready`, a database outage restarts every pod; if both hit `/health`, pods that cannot reach Postgres keep getting traffic. Check `kubectl describe pod`: the two lines should show different paths.",
            "**`initialDelaySeconds` as a boot budget.** A fixed delay is either too short on a cold node or wastes time on a warm one. Use a startup probe; detect the problem as `Liveness probe failed` events followed by `Back-off restarting failed container`.",
            "**A `tcpSocket` readiness probe on an HTTP api.** It passes while the event loop is stuck or the database is gone, because the kernel still accepts connections. Use `httpGet` on an endpoint that does real work.",
        ]),

        challenge("chal_quiz_k8s_131"),
        p("Now fix the probes. The editor starts from the api Deployment with its three probes missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are the probes that caused the incidents. Run plays a slow boot, a cold boot, a Postgres failover and a hung process on a one-pod timeline."),
        challenge("chal_coding_k8s_132"),
    ],
});
