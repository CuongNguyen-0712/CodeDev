// One-command load run:
//   node scripts/loadtest/run.mjs --env .env.loadtest --profile smoke --inngest inline [--n N] [--max-vus 3000] [--sessions K] [--build] [--yes]
// Steps: 1 reset DB, 2 start app, 3 actions, 4 sessions, 5 reset statements + sampler, 6 k6, 7 stop sampler + snapshot + meta.
// Step 8 (report.mjs) is added by the report task. A failing step keeps the run directory and exits non-zero.
import fs from "node:fs";
import path from "node:path";
import { execFile, execFileSync, spawn } from "node:child_process";
import { parseArgs, promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { assertSafeTarget, loadEnvFile } from "./target.mjs";
import { startSampler } from "./sample.mjs";
import { inngestMode, needsN, peakSessions } from "./samplePure.mjs";

const execFileP = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { values: a } = parseArgs({
    options: {
        env: { type: "string", default: ".env.loadtest" },
        profile: { type: "string" },
        inngest: { type: "string", default: "inline" },
        n: { type: "string" },
        "max-vus": { type: "string", default: "3000" },
        sessions: { type: "string" },
        build: { type: "boolean", default: false },
        yes: { type: "boolean", default: false },
    },
});
const die = (msg) => {
    console.error(msg);
    process.exit(1);
};
if (!a.profile) die("usage: run.mjs --env .env.loadtest --profile smoke|stress|soak|spike --inngest inline|server [--n N] [--max-vus 3000] [--sessions K] [--build] [--yes]");
if (!["inline", "server"].includes(a.inngest)) die("--inngest must be inline or server");

const env = loadEnvFile(a.env);
// Before anything is reset: only a local loadtest* database (or an explicit --yes target) may be dropped and recreated.
try {
    assertSafeTarget(env.LOADTEST_DATABASE_URL, { confirmed: a.yes });
} catch (e) {
    die(e.message);
}
const base = `http://localhost:${env.APP_PORT || "3000"}`;
const users = JSON.parse(fs.readFileSync(path.join(root, "tests/loadtest/users.json"), "utf8")).length;
// k6 reads N for soak/spike (default there = all sessions, which would make spike peak 2x too high) and MAX_VUS for stress.
if (needsN(a.profile, a.n)) die("--n <N> required for soak/spike (the capacity measured by stress)");
const n = a.n === undefined ? null : Number(a.n);
const inngest = inngestMode(env);
if (a.inngest !== inngest) die(`Refusing: --inngest ${a.inngest} but ${a.env} says ${inngest} (INNGEST_DEV / INNGEST_EVENT_KEY); change one so they agree`);
const maxVus = Number(a["max-vus"]);
const peak = peakSessions(a.profile, { n, maxVus });
const sessions = Number(a.sessions ?? peak);
if (sessions > users) die(`Refusing: ${sessions} sessions requested but only ${users} users are seeded (tests/loadtest/users.json)`);
if (sessions < peak) die(`Refusing: profile ${a.profile} peaks at ${peak} VUs but only ${sessions} sessions requested`);

const pad = (x) => String(x).padStart(2, "0");
const d = new Date();
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const envName = path.basename(a.env).replace(/^\.?env\.?/, "") || "env";
const name = `${stamp}-${envName}-${a.profile}`;
const dir = path.join(root, "tests/loadtest/runs", name);
fs.mkdirSync(dir, { recursive: true });

const compose = (...args) => ["compose", "-f", "compose.yml", "-f", "compose.loadtest.yml", "--env-file", a.env, "--profile", "app", "--profile", "dev", "--profile", "loadtest", ...args];
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
const psql = async (sql, database = "postgres") =>
    (await execFileP("docker", compose("exec", "-T", "postgres-load", "psql", "-U", "postgres", "-d", database, "-At", "-c", sql), { cwd: root, maxBuffer: 64 << 20 })).stdout;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const k6Name = `k6-${name}`;

let step = "";
let stop = null;
const meta = {
    env: envName, profile: a.profile, commit: "", users, sessions, startedAt: new Date().toISOString(), endedAt: null,
    inngest, prometheus: false, n, maxVus, k6ExitCode: null,
};
const writeMeta = () => fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));

async function main() {
    meta.commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
    writeMeta();
    console.log(`run dir: ${dir}`);

    step = "1 reset database";
    sh("docker", compose("stop", "app")); // the app holds connections to loadtest_run
    await psql("DROP DATABASE IF EXISTS loadtest_run WITH (FORCE);");
    await psql("CREATE DATABASE loadtest_run TEMPLATE loadtest_base;");

    step = "2 start app";
    sh("docker", compose("up", "-d", ...(a.build ? ["--build"] : []), "minio", "app"));
    const deadline = Date.now() + 180000;
    for (;;) {
        if (await fetch(`${base}/api/health`).then((r) => r.status === 200, () => false)) break;
        if (Date.now() > deadline) throw new Error(`${base}/api/health did not return 200 within 180 s`);
        await sleep(2000);
    }

    step = "3 actions";
    sh("docker", compose("cp", "app:/app/.next/server/server-reference-manifest.json", "tests/loadtest/"));
    sh("npm", ["run", "load:actions", "--", "tests/loadtest/server-reference-manifest.json"], { shell: true });

    step = "4 sessions";
    sh("npm", ["run", "load:sessions", "--", "--env", a.env, "--base", base, "--count", String(sessions)], { shell: true });

    step = "5 sampler";
    await psql("SELECT pg_stat_statements_reset();", "loadtest_run");
    stop = startSampler({ dir, containers: ["codedev-app-1", "codedev-postgres-load-1", k6Name], dbQuery: (sql) => psql(sql, "loadtest_run") });

    step = "6 k6";
    // Only a prometheus started through the overlay (npm run monitoring:up) accepts remote write; a plain one answers 404.
    meta.prometheus = await execFileP("docker", ["inspect", "-f", "{{.State.Running}} {{.Config.Cmd}}", "codedev-prometheus-1"]).then(
        (r) => r.stdout.startsWith("true") && r.stdout.includes("remote-write-receiver"),
        () => false,
    );
    const rel = `/data/runs/${name}`;
    const k6Args = compose(
        "run", "--rm", "--name", k6Name, "-e", `PROFILE=${a.profile}`, "-e", `MAX_VUS=${maxVus}`, "-e", `N=${n ?? sessions}`,
        "k6", "run", "--out", `json=${rel}/k6.json.gz`, "--summary-export", `${rel}/summary.json`,
        ...(meta.prometheus ? ["--out", "experimental-prometheus-rw"] : []),
        "/scripts/k6/main.js",
    );
    const code = await new Promise((resolve) => spawn("docker", k6Args, { cwd: root, stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } }).on("close", resolve));
    meta.k6ExitCode = code;
    // 99 = a threshold failed: the data is still a valid run.
    if (code !== 0 && code !== 99) throw new Error(`k6 exited with ${code}`);

    step = "7 snapshot";
    await stop();
    stop = null;
    await snapshot();
    meta.endedAt = new Date().toISOString();
    writeMeta();
    console.log(`done: ${dir}`);
}

async function snapshot() {
    const rows = await psql(
        `SELECT COALESCE(json_agg(t), '[]'::json) FROM (SELECT query, calls, mean_exec_time, total_exec_time, rows FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = 'loadtest_run') ORDER BY total_exec_time DESC LIMIT 20) t;`,
        "loadtest_run",
    );
    fs.writeFileSync(path.join(dir, "statements.json"), JSON.stringify(JSON.parse(rows.trim()), null, 2));
}

// Shared by failure and signal exits: keep what was measured so far.
async function wrapUp() {
    if (stop) await stop().catch(() => {});
    stop = null;
    await snapshot().catch(() => {});
    meta.endedAt = new Date().toISOString();
    writeMeta();
}

let interrupted = false; // the signal handler owns the exit once set
for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, async () => {
        interrupted = true;
        console.error(`${sig}: stopping k6 and saving the run`);
        await execFileP("docker", ["stop", k6Name]).catch(() => {});
        await wrapUp();
        process.exit(130);
    });
}

try {
    await main();
} catch (e) {
    if (interrupted) await new Promise(() => {}); // the handler finishes and exits 130
    await wrapUp();
    console.error(`load run failed at step ${step}: ${e.message}\nrun directory kept: ${dir}`);
    process.exit(1);
}
