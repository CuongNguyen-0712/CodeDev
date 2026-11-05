// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gha-3-1",
    title: "A deploy job with a health gate and rollback",
    slug: { _type: "slug", current: "github-actions-deploy-health-gate-rollback" },
    description:
        "Rice Rocket's deploy job went green while image 1.4.0 crash-looped for ten minutes, and its health check passed on a 502. Learn what makes a step fail, how to wait for the new version to prove itself, how to roll back and still fail the run, and how a step hands its result to later jobs; then assemble the health gate the deploy job runs.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The deploy job from lesson 5 SSHes into the VPS, pulls ghcr.io/rice-rocket/api and runs `docker compose up -d`. Release 1.4.0 read a variable that production does not set, crashed on boot and restarted for ten minutes, while the Actions run showed a green check and nobody was paged.",
    },

    content: [
        h2("Situation"),
        p("This is the deploy job that shipped 1.4.0. Every step passed:"),
        code("yaml", `
  deploy:
    needs: build
    runs-on: ubuntu-24.04
    environment: production
    steps:
      - name: Roll out
        run: |
          ssh deploy@vps.ricerocket.vn "cd /srv/rice-rocket \\
            && TAG=\${{ github.sha }} docker compose pull api \\
            && TAG=\${{ github.sha }} docker compose up -d api"
      - name: Check health
        run: curl -s -o /dev/null -w '%{http_code}\\n' https://api.ricerocket.vn/health`, ".github/workflows/deploy.yml"),
        bullets([
            "`docker compose up -d` returns as soon as the new container is created; it does not wait for the api to listen, so Roll out passes in four seconds.",
            "Check health printed `502` (Nginx had no upstream answering) and still passed.",
            "The old 1.3.2 container was already gone, so ten minutes of orders failed until someone opened the app and saw the error page.",
        ]),

        h2("The core you need"),
        bullets([
            "**A step fails only on a non-zero exit code.** The runner does not read the output. `curl -s` exits 0 on any HTTP answer, 502 included; `curl -fsS` (or `--fail-with-body`) exits 22 on a 4xx or 5xx. A script that detects a problem has to exit non-zero.",
            "**Healthy means the new version, several times in a row.** Right after `up -d` the old container can still answer, Nginx can answer 502, and a crashing container can answer once between restarts. Count consecutive answers with status 200 *and* the version you shipped (the api reports it on `/health`, lesson 5 of the Docker course); any other answer, a refused connection or a timeout resets the count.",
            "**Poll with an interval and a deadline.** Check every few seconds until the streak is complete or the deadline passes; the deadline is what turns \"still starting\" into \"failed\".",
            "**Roll back, then fail.** On failure, put the previous tag back with the same command, then exit non-zero so the run is red, the deployment is marked failed and alerts fire. A rollback that exits 0 hides the incident.",
            "**`$GITHUB_OUTPUT` and `$GITHUB_STEP_SUMMARY`.** A step writes `name=value` lines to `$GITHUB_OUTPUT` (read later as `steps.<id>.outputs.name`) and Markdown to `$GITHUB_STEP_SUMMARY` (shown on the run page). Other jobs see only what the job declares under `outputs:`.",
            "**Steps after a failure are skipped.** A step without `if:` runs as `if: success()`. A cleanup step that must run after a failure needs `if: failure()`; a rollback inside the gate script avoids the question.",
        ]),

        h2("Apply it in the project"),
        p("The gate is a small Node module next to the compose file. Its side effects come in through `io`, so the same code runs on the VPS and in a test with a fake clock:"),
        code("text", `
rice-rocket/app/
  deploy/
    gate.js         gateDeploy(): roll out, wait for health, roll back
    run-gate.mjs    wires io to ssh, fetch, $GITHUB_OUTPUT and $GITHUB_STEP_SUMMARY
  .github/workflows/deploy.yml`, "tree"),
        code("javascript", `
async function gateDeploy({ release, previous, policy }, io) {
    await io.rollout(release);
    const deadline = io.now() + policy.timeoutMs;
    let streak = 0;
    let checks = 0;
    while (streak < policy.okInARow && io.now() < deadline) {
        checks++;
        const answer = await io.health().catch(() => null);   // refused = down
        if (answer && answer.status === 200 && answer.version === release) streak++;
        else streak = 0;
        if (streak < policy.okInARow) await io.sleep(policy.intervalMs);
    }
    if (streak >= policy.okInARow) {
        io.output("deployed", release);
        return { status: "deployed", version: release, checks, exitCode: 0 };
    }
    await io.rollout(previous);
    io.output("rolled_back", "true");
    return { status: "rolled_back", version: previous, checks, exitCode: 1 };
}`, "deploy/gate.js (outline)"),
        p("`run-gate.mjs` turns the `io` calls into real effects and the result into the exit code. In the repository `gate.js` ends with `export { gateDeploy };` (the challenge editor leaves that line out, because the grader loads the function directly):"),
        code("javascript", `
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gateDeploy } from "./gate.js";

const ssh = (cmd) => execFileSync("ssh", ["deploy@vps.ricerocket.vn", cmd], { stdio: "inherit" });
const io = {
    rollout: async (tag) => ssh(\`cd /srv/rice-rocket && TAG=\${tag} docker compose up -d api\`),
    health: async () => {
        const res = await fetch("https://api.ricerocket.vn/health", { signal: AbortSignal.timeout(3000) });
        return { status: res.status, version: res.ok ? (await res.json()).version : null };
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    output: (name, value) => appendFileSync(process.env.GITHUB_OUTPUT, \`\${name}=\${value}\\n\`),
    summary: (line) => appendFileSync(process.env.GITHUB_STEP_SUMMARY, \`\${line}\\n\`),
};
const result = await gateDeploy({
    release: process.env.RELEASE,
    previous: process.env.PREVIOUS || null,
    policy: { intervalMs: 5000, timeoutMs: 120000, okInARow: 3 },
}, io);
process.exitCode = result.exitCode;`, "deploy/run-gate.mjs"),
        p("The deploy job runs it as one step and publishes its outputs for later jobs:"),
        code("yaml", `
  deploy:
    needs: build
    runs-on: ubuntu-24.04
    environment: production
    outputs:
      deployed: \${{ steps.gate.outputs.deployed }}
      rolled_back: \${{ steps.gate.outputs.rolled_back }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - name: Read the running tag
        id: current
        run: echo "tag=$(ssh deploy@vps.ricerocket.vn 'cat /srv/rice-rocket/TAG')" >> "$GITHUB_OUTPUT"
      - name: Roll out behind a health gate
        id: gate
        env:
          RELEASE: \${{ github.sha }}
          PREVIOUS: \${{ steps.current.outputs.tag }}
        run: node deploy/run-gate.mjs`, ".github/workflows/deploy.yml"),
        callout("info", "Why the rollback lives in the script",
            "A separate rollback step needs `if: failure()`, and then it also runs when the build or the SSH key failed and nothing was rolled out. Inside the gate, the rollback runs exactly when the new version was rolled out and did not prove itself, and the step still exits 1."),

        h2("Verify"),
        code("bash", `
# Ship a release that crashes on boot (unset a required variable on staging first)
gh workflow run deploy.yml --ref main
gh run watch --exit-status        # exits non-zero: the run is red
# X deploy  Roll out behind a health gate
#   1.4.0 failed its health gate after 24 checks; rolled back to 1.3.2
#   Error: Process completed with exit code 1.
curl -fsS https://api.ricerocket.vn/health
# {"status":"ok","version":"1.3.2"}
gh run view --log | grep -E 'deployed=|rolled_back='`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Counting any 200 as healthy.** For a few seconds after `up -d` the old container or a cached response can still answer 200, and the gate ships a version that never started. Detect it by logging the version of every answer; fix it by comparing `version` with the release.",
            "**A timeout shorter than a cold start.** Migrations or a JIT warm-up can take longer than the deadline on the first boot after a schema change, and every deploy rolls back. Read the start time from `docker compose logs api` on staging and set `timeoutMs` to two or three times that.",
            "**A green rollback.** A gate that restores the old tag and exits 0 leaves a green run, a deployment marked successful and no alert. Check that a failed gate turns the run red on staging before relying on it.",
        ]),

        challenge("chal_quiz_gha_171"),
        p("Now assemble the gate. The editor holds `deploy/gate.js` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run grades the module against a scripted server and a fake clock: a crash loop, an old container still answering, a flapping restart and a first deploy."),
        challenge("chal_coding_gha_172"),
    ],
});
