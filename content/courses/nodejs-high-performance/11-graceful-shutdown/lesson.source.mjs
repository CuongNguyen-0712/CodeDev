// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-4-2",
    title: "Graceful shutdown & health checks",
    slug: { _type: "slug", current: "graceful-shutdown-health-checks" },
    description:
        "Every deploy fails a handful of payments. Follow a pod from SIGTERM to exit, build a shutdown that stops accepting traffic, drains in-flight requests under a deadline and only then closes the pools, and wire readiness and liveness probes that help instead of hurt.",
    estimatedTime: 20,

    scenario: {
        role: "Backend engineer, platform team of an e-wallet",
        problem:
            "The payments API is deployed to Kubernetes ten times a day. After each rolling update, support receives a few tickets: \"My top-up failed but the money left my bank\". The logs show the same pattern every time - a burst of \"Error: Cannot use a pool after calling end on the pool\" and a few 502s from the ingress in the same second the old pods receive SIGTERM. The deploy itself is reported as successful.",
    },

    content: [
        h2("1. The incident"),
        p("The current SIGTERM handler looks responsible - it even closes the server first:"),
        code("javascript", `
process.on("SIGTERM", async () => {
    server.close();      // returns immediately - it does not wait for anything
    await db.end();      // in-flight requests still need the pool
    process.exit(0);     // whatever is still running is cut off mid-flight
});`, "src/server.js"),
        p("`server.close()` only stops the server from accepting **new** connections. It returns at once; the requests already running continue in the background. One line later the database pool is closed under them, and `process.exit(0)` kills anything that survived. A top-up that already charged the bank card but had not yet credited the wallet is lost halfway."),
        callout("error", "Half-done payments are worse than failed ones",
            "A request that never started can be retried safely. A request cut off between two side effects (card charged, wallet not credited) needs manual reconciliation. Graceful shutdown is part of correctness, not polish."),

        h2("2. What happens when a pod is terminated"),
        p("During a rolling update Kubernetes marks the old pod as Terminating and then, **in parallel**:"),
        bullets([
            "removes the pod from the Service endpoints, so kube-proxy, the ingress and any load balancer stop sending it new traffic - this takes a few seconds to propagate;",
            "runs the `preStop` hook if there is one, then sends `SIGTERM` to PID 1 of the container;",
            "waits `terminationGracePeriodSeconds` (default 30 s) and then sends `SIGKILL`, which cannot be caught.",
        ]),
        p("Two consequences. First, requests can still arrive for a few seconds **after** SIGTERM, because the routing update races with the signal. Second, your whole shutdown must finish inside the grace period."),
        h3("Make sure Node.js actually receives the signal"),
        code("dockerfile", `
# Bad: npm becomes PID 1 and does not forward SIGTERM reliably to node
CMD ["npm", "start"]

# Good: node is PID 1 and receives the signal itself
CMD ["node", "src/server.js"]

# Also good: a tiny init forwards signals and reaps zombies (or docker run --init)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]`, "Dockerfile"),
        callout("warning", "PID 1 ignores signals it has no handler for",
            "The Linux kernel does not apply the default 'terminate' action to PID 1. A Node.js process running as PID 1 without a SIGTERM listener keeps running until SIGKILL arrives 30 seconds later - every deploy then takes 30 s per pod and still ends with a hard kill."),

        h2("3. The shutdown sequence"),
        p("A graceful shutdown is a fixed order of steps. Each one only starts when nothing that comes before it can still need the resource it releases."),
        image("shutdown-sequence", {
            alt: "Timeline after SIGTERM: become unready, wait a few seconds, server.close, drain in-flight requests with a 20 second deadline, close database and Redis pools, exit 0 - all before SIGKILL at 30 seconds.",
            caption: "Stop new work, finish old work, then release resources - and be done before the grace period ends.",
        }),
        code("javascript", `
const { setTimeout: sleep } = require("node:timers/promises");

let shuttingDown = false;
const isShuttingDown = () => shuttingDown; // read by the /readyz handler (section 5)

async function onSignal(signal) {
    if (shuttingDown) return;           // second SIGTERM / Ctrl+C: already on it
    shuttingDown = true;
    logger.info({ signal }, "shutdown: started");

    await sleep(5_000);                 // 1-2. unready, let routing catch up

    const { drained } = await drainHttp(server, { deadlineMs: 20_000 }); // 3-4. close + drain
    logger.info({ drained }, "shutdown: http drained");

    await Promise.allSettled([db.end(), redis.quit()]); // 5. pools last
    logger.info("shutdown: done");
    process.exitCode = 0;               // 6. let the loop empty, or process.exit(0) after flushing logs
}

process.on("SIGTERM", onSignal);
process.on("SIGINT", onSignal);`, "src/shutdown.js"),
        p("`drainHttp` is the heart of it and the part that is easy to get wrong - you will fix a broken version in the next section. Budget the timings explicitly: 5 s wait + 20 s drain + pool cleanup must stay below the 30 s grace period."),
        callout("tip", "Sleep in preStop or in the app - not both by accident",
            "A preStop hook such as sleep 5 delays SIGTERM itself, and its time counts against the grace period. Either put the wait in preStop (useful when the app cannot change) or in the handler, and account for it in terminationGracePeriodSeconds."),

        h2("4. Draining in-flight requests with a deadline"),
        p("`server.close(callback)` is the drain primitive in `node:http`: it stops accepting new connections and calls the callback once every existing connection has ended. Waiting for that callback is what keeps the pool alive for the requests that are still running."),
        p("Two things can keep that callback from ever firing:"),
        bullets([
            "**Keep-alive connections.** An idle keep-alive socket counts as an open connection. Since Node.js 19, `server.close()` also closes idle ones; on Node.js 18 call `server.closeIdleConnections()` yourself. Busy keep-alive sockets close after their current response - setting a `Connection: close` header while shutting down tells clients not to reuse them.",
            "**Stuck requests.** A hung upstream call can keep one request alive for minutes. That is why the drain needs a **deadline**: when it expires, `server.closeAllConnections()` destroys whatever is left, the close callback fires and shutdown continues.",
        ]),
        code("javascript", `
// While shutting down, ask clients not to reuse the connection for the next request.
app.use((req, res, next) => {
    if (isShuttingDown()) res.setHeader("Connection", "close");
    next();
});

// Behind an AWS ALB (idle timeout 60 s): keep sockets open longer than the LB does,
// otherwise Node closes a socket the LB is about to reuse -> sporadic 502s.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;`, "src/server.js"),
        p("The deadline timer itself needs care too: when the drain finishes early, clear it - a forgotten timer keeps the process alive and fires `closeAllConnections()` long after the shutdown already completed."),
        challenge("chal_fix_nhp_412", "server.close() returns before anything has drained. Turn its callback into something you can await, and keep db.end() behind it."),

        h2("5. Readiness vs liveness probes"),
        p("Kubernetes asks two different questions, and mixing them up causes outages:"),
        bullets([
            "**Readiness** - should this pod receive traffic right now? Failing it removes the pod from the Service, nothing is restarted. Fail it while starting up, while shutting down and while a hard dependency is unreachable.",
            "**Liveness** - is this process broken beyond repair? Failing it restarts the container. Only check things a restart can fix: the process answers, the event loop is not stuck.",
        ]),
        code("javascript", `
// Liveness: the process is up and its event loop answers. No dependencies here.
app.get("/livez", (req, res) => res.status(200).send("ok"));

// Readiness: can this pod serve a payment right now?
app.get("/readyz", async (req, res) => {
    if (isShuttingDown()) return res.status(503).send("shutting down");
    try {
        await withTimeout(db.query("SELECT 1"), 500); // short timeout: a probe must answer fast
        res.status(200).send("ready");
    } catch {
        res.status(503).send("database unavailable");
    }
});`, "src/health.js"),
        code("yaml", `
spec:
  terminationGracePeriodSeconds: 30
  containers:
    - name: payments-api
      image: registry.example.com/payments-api:1.42.0
      ports:
        - containerPort: 3000
      readinessProbe:
        httpGet: { path: /readyz, port: 3000 }
        periodSeconds: 2
        failureThreshold: 1
      livenessProbe:
        httpGet: { path: /livez, port: 3000 }
        periodSeconds: 10
        failureThreshold: 3      # restart only after ~30 s of no answer
      startupProbe:
        httpGet: { path: /livez, port: 3000 }
        failureThreshold: 30     # up to 60 s to boot before liveness takes over
        periodSeconds: 2`, "k8s/deployment.yaml"),
        callout("warning", "A dependency in liveness restarts the whole fleet",
            "If /livez pings the database, a database failover makes every pod fail liveness at the same moment. Kubernetes restarts all of them, they reconnect at once and the database gets a thundering herd right when it is weakest."),
        challenge("chal_quiz_nhp_411"),

        h2("6. Checklist"),
        bullets([
            "Run `node` as PID 1 (or behind tini / `--init`) and register SIGTERM and SIGINT handlers.",
            "On SIGTERM: fail readiness, wait a few seconds for routing to catch up, then `server.close()`.",
            "Await the close callback before touching the pools; cut stuck requests off with `closeAllConnections()` after a deadline, and clear that timer on a clean drain.",
            "Close DB and Redis pools last, then exit with code 0 - all well inside `terminationGracePeriodSeconds`.",
            "Handle keep-alive: idle sockets closed, `Connection: close` while shutting down, `keepAliveTimeout` above the load balancer's idle timeout.",
            "Readiness checks dependencies with short timeouts; liveness checks only the process. Make the second SIGTERM a no-op.",
        ]),
    ],
});
