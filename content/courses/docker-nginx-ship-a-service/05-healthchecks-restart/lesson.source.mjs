// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-dkn-2-2",
    title: "Healthchecks and restart policies that tell the truth",
    slug: { _type: "slug", current: "docker-healthchecks-restart-policies" },
    description:
        "Rice Rocket's api said it was healthy while Postgres was down, and at the lunch peak its health check hung until Docker marked it unhealthy and a watchdog restarted it in a loop. Learn what Docker's healthcheck and restart policies actually react to, and rewrite the health handler so it checks the database with a timeout, runs checks in parallel and separates critical from optional dependencies.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api, Postgres and the migration job run under Compose on one VPS (lesson 4). Two incidents in one week: during a Postgres outage /health kept answering 200, so the deploy gate and the load balancer kept sending orders to an api that failed every one; at the lunch peak the health handler waited 30 s on the database, the container went unhealthy, and an autoheal watchdog restarted it again and again, dropping the orders in flight each time.",
    },

    content: [
        h2("Situation"),
        p("This is the whole health story of the api today, in the image and in the compose file:"),
        code("typescript", `
// src/health.ts
app.get("/health", async (_req, res) => {
    let db = "up";
    try { await pool.query("select 1"); } catch { /* log and keep serving */ }
    await queue.ping();
    res.status(200).json({ status: "ok", checks: { db } });
});`, "src/health.ts"),
        code("yaml", `
  api:
    image: rice-rocket/api:1.0.0
    restart: always
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
  autoheal:                     # restarts any container Docker marks unhealthy
    image: willfarrell/autoheal
    environment:
      AUTOHEAL_CONTAINER_LABEL: all
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock`, "compose.yaml (excerpt)"),
        p("The handler swallows the database error, so it says 200 while orders fail. When the pool is saturated, `select 1` waits 30 s, the probe times out, and the watchdog restarts a container that was busy serving the peak. Both problems are in what the check measures and who acts on it."),

        h2("The core you need"),
        bullets([
            "**Docker trusts an exit code.** A `healthcheck` runs `test` inside the container every `interval`. Exit 0 is a pass, anything else (or no answer within `timeout`) is a failure. After `retries` failures in a row the status is `unhealthy`; failures during `start_period` do not count. Defaults: 30s interval, 30s timeout, 3 retries, no start period.",
            "**The check is only as honest as /health.** Docker cannot see your database. If the handler returns 200 without asking Postgres, `healthy` means \"the HTTP server answers\" and nothing more.",
            "**Critical vs optional.** The api cannot take an order without Postgres: db down means 503. The notification queue only delays push messages: queue down means 200 with `degraded`, so the api stays in rotation.",
            "**Every check gets a budget, and checks run together.** A ping without a timeout makes /health as slow as the slowest dependency. Race each ping against a timer shorter than the probe `timeout`, and start all of them at once so the total is the slowest check, not the sum.",
            "**Restart policies react to exits, not to health.** `no` (default), `on-failure[:N]` (non-zero exit only), `always`, and `unless-stopped` (like `always`, but a container you stopped by hand stays stopped after a daemon restart). Plain Docker and Compose never restart a container for being unhealthy. Readers of the health status decide: Compose `depends_on: service_healthy`, the deploy gate in lesson 8, or a watchdog you add.",
        ]),

        h2("Apply it in the project"),
        p("Split the work: the handler tells the truth with a budget per check, Docker reads it, and only a process exit triggers a restart. The handler delegates to a `checkHealth(deps, opts)` module, which is the challenge below:"),
        code("typescript", `
// src/health.ts
import { checkHealth } from "./checkHealth.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms).unref());

app.get("/health", async (_req, res) => {
    const { status, body } = await checkHealth(
        { db: { ping: () => pool.query("select 1") }, queue: { ping: () => queue.ping() } },
        { timeoutMs: 1000, sleep },          // well under the 3 s probe timeout
    );
    res.status(status).json(body);
});`, "src/health.ts"),
        p("The responses the deploy gate and the healthcheck will see:"),
        code("json", `
200 {"status":"ok","checks":{"db":"up","queue":"up"}}
200 {"status":"degraded","checks":{"db":"up","queue":"timeout"}}
503 {"status":"down","checks":{"db":"down","queue":"up"}}`, "GET /health"),
        p("In the compose file, give the probe a timeout above the handler's budget, a start period for the boot, and restart only on exits. The autoheal watchdog goes: restarting the api does not bring Postgres back."),
        code("yaml", `
  db:
    restart: unless-stopped
    # healthcheck from lesson 4 (pg_isready)

  api:
    image: rice-rocket/api:1.0.0
    restart: unless-stopped
    healthcheck:
      # node:24-slim has no curl or wget; Node 24 has fetch built in
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 20s
      start_interval: 2s       # probe faster while booting (Docker Engine 25+)

  migrate:
    restart: "no"              # a one-shot job must not loop`, "compose.yaml (excerpt)"),
        callout("info", "Crash on what you cannot recover from",
            "A restart helps when the process is broken, not when a dependency is. Let the api exit on a fatal error (an unhandled rejection, a config error at boot) and `unless-stopped` brings it back; report dependency trouble through /health and let the readers of the status route around it."),

        h2("Verify"),
        code("bash", `
docker compose up -d
docker inspect --format '{{.State.Health.Status}}' rice-rocket-api-1     # healthy
curl -s -w ' %{http_code}\\n' 127.0.0.1:3000/health
# {"status":"ok","checks":{"db":"up","queue":"up"}} 200
docker compose stop db
curl -s -w ' %{http_code}\\n' 127.0.0.1:3000/health
# {"status":"down","checks":{"db":"down","queue":"up"}} 503   (within the 1 s budget, not 30 s)
# about 30 s later (3 failed probes, 10 s apart):
docker inspect --format '{{.State.Health.Status}} restarts={{.RestartCount}}' rice-rocket-api-1
# unhealthy restarts=0
docker compose start db                                                 # healthy again within one interval`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A handler budget longer than the probe timeout.** With 5 s per check and `timeout: 3s`, Docker kills the probe first and you only see `Health check exceeded timeout (3s)`, never the 503 that says which dependency failed. Read `.State.Health.Log` with `docker inspect`; keep the handler budget well under `timeout`.",
            "**`curl` in the healthcheck of a slim image.** `node:24-slim` ships neither curl nor wget, so the probe fails before it reaches the api and the container is unhealthy from the start. The error is in `.State.Health.Log`; probe with `node -e` and fetch, or a small script in the image.",
            "**Every dependency marked critical.** A slow analytics or queue service then takes the whole api out of rotation. List what a request cannot be served without; everything else reports `degraded` with a 200.",
        ]),

        challenge("chal_quiz_dkn_151"),
        p("Now assemble the health check that should have been there. The editor starts from the finished handler with its key blocks missing; fill each `[ ]` line by clicking a piece, or drag it onto the line on desktop. The buggy versions from the incident are among the pieces. Run calls it with fake dependencies on a fake clock and reports the status, the body and how long it took."),
        challenge("chal_coding_dkn_152"),
    ],
});
