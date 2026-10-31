/**
 * CodeDev code runner (codedev_sandbox).
 *
 * Executes untrusted challenge code for the app. It only returns what the code produced; the app
 * keeps the expected outputs and grades. The container is the outer boundary (compose.yml:
 * read-only root, internal network without egress, memory/CPU/PID limits).
 *
 * Two back ends:
 *   - RUN_JOB set (the codedev_sandbox image, sandbox/vercel/Dockerfile target `docker`): every
 *     language goes through run-job, the same grader as the Vercel Sandbox. Learner code runs as
 *     a per-slot user (run01..run08), one slot per concurrent job. javascript keeps the runner.cjs
 *     harness contract ("function" mode); python, c, cpp, java, go, rust, php, typescript, kotlin and
 *     csharp read stdin and write stdout ("stdio" mode).
 *   - RUN_JOB unset (host, tests): javascript only, one throw-away Node process per test (runner.cjs).
 *
 *   GET  /health        -> 200 { status: "ok", running, queued, languages }
 *   POST /v1/execute    -> 200 { results: { [testId]: { ok, output, error, timedOut, timeMs, logs } } }
 *        Authorization: Bearer <CODE_RUNNER_TOKEN>
 *        body: { language, code, harness?, entry?, tests: [{ id, input }], timeLimitMs, memoryLimitMb }
 *
 * Environment: CODE_RUNNER_TOKEN (required), PORT (4100), MAX_CONCURRENCY (2), MAX_QUEUE (16), RUN_JOB.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

// `0` is a valid MAX_QUEUE (reject instead of queueing), so missing/invalid values fall back explicitly.
const intEnv = (name, fallback, min) => {
    const n = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(n) ? Math.max(min, n) : fallback;
};

const PORT = intEnv("PORT", 4100, 1);
const TOKEN = process.env.CODE_RUNNER_TOKEN || "";
const RUN_JOB = process.env.RUN_JOB || "";
// run-job has 8 slot users; each running job holds one.
const MAX_CONCURRENCY = Math.min(intEnv("MAX_CONCURRENCY", 2, 1), RUN_JOB ? 8 : Infinity);
const MAX_QUEUE = intEnv("MAX_QUEUE", 16, 0);
const LANGUAGES = RUN_JOB ? ["javascript", "python", "c", "cpp", "java", "go", "rust", "php", "typescript", "kotlin", "csharp"] : ["javascript"];
const JOBS_DIR = "/vercel/jobs";
const COMPILE_BUDGET_MS = 60_000; // run-job's longest compile limit (kotlin)

const RUNNER = fileURLToPath(new URL("./runner.cjs", import.meta.url));
const MAX_BODY_BYTES = 512 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_TESTS = 50;
const MAX_INPUT_BYTES = 128 * 1024;
const MAX_TOTAL_INPUT_BYTES = 384 * 1024; // lib/challenges/limits.js
const MAX_JOB_MS = 120_000;               // lib/challenges/limits.js: compile + every test
const LIMITS = { timeLimitMs: [100, 10_000], memoryLimitMb: [32, 256] };
const STARTUP_OVERHEAD_MS = 1000; // process start, not counted against the challenge time limit
const MAX_RESULT_BYTES = 512 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;
const IDENTIFIER = /^[A-Za-z_$][\w$]{0,63}$/;

// Without a proper token the runner stays up (no restart loop under compose) but runs nothing.
const CONFIGURED = TOKEN.length >= 16;
if (!CONFIGURED) {
    console.error("[sandbox] CODE_RUNNER_TOKEN is not set (16+ characters): every execution is refused.");
}

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// ------------------------------------------------------------ concurrency (backpressure)
// One slot per running job: run01..run0N (run-job's slot users; only a counter without RUN_JOB).
const freeSlots = Array.from({ length: MAX_CONCURRENCY }, (_, i) => `run0${i + 1}`);
const slotCount = freeSlots.length;
const waiting = [];
// Average job time, for a Retry-After that matches the real wait.
let avgJobMs = 5000;

function retryAfterSeconds() {
    return String(Math.max(1, Math.ceil(((waiting.length + 1) / slotCount) * avgJobMs / 1000)));
}

/** A free slot, or a place in the queue. A caller that gives up (signal aborted) leaves the queue. */
function acquire(signal) {
    if (freeSlots.length) return Promise.resolve(freeSlots.pop());
    if (waiting.length >= MAX_QUEUE) throw new HttpError(503, "Code runner is busy, try again shortly");
    return new Promise((resolve, reject) => {
        const entry = { resolve, signal };
        waiting.push(entry);
        signal.addEventListener("abort", () => {
            const index = waiting.indexOf(entry);
            if (index >= 0) waiting.splice(index, 1);
            reject(new HttpError(499, "Client closed the request"));
        }, { once: true });
    });
}

function release(slot) {
    let next;
    while ((next = waiting.shift()) && next.signal.aborted) { /* skip callers that left */ }
    if (next) next.resolve(slot);
    else freeSlots.push(slot);
}

// ------------------------------------------------------------ validation
function clamp(value, [min, max], name) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new HttpError(400, `${name} must be a number`);
    return Math.min(max, Math.max(min, Math.round(n)));
}

function validate(body) {
    if (!body || typeof body !== "object") throw new HttpError(400, "JSON body required");
    if (!LANGUAGES.includes(body.language)) throw new HttpError(400, `language must be one of: ${LANGUAGES.join(", ")}`);
    if (typeof body.code !== "string" || body.code.length === 0) throw new HttpError(400, "code is required");
    if (Buffer.byteLength(body.code) > MAX_SOURCE_BYTES) throw new HttpError(413, "code is too large");
    if (body.harness != null && (typeof body.harness !== "string" || Buffer.byteLength(body.harness) > MAX_SOURCE_BYTES)) {
        throw new HttpError(400, "harness must be a string up to 64KB");
    }
    if (body.entry != null && (typeof body.entry !== "string" || !IDENTIFIER.test(body.entry))) {
        throw new HttpError(400, "entry must be an identifier");
    }
    if (!Array.isArray(body.tests) || body.tests.length === 0 || body.tests.length > MAX_TESTS) {
        throw new HttpError(400, `tests must contain 1-${MAX_TESTS} items`);
    }
    const tests = body.tests.map((t) => {
        if (!t || typeof t.id !== "string" || t.id.length === 0 || t.id.length > 64) throw new HttpError(400, "every test needs a string id");
        const input = t.input === undefined ? null : t.input;
        if (Buffer.byteLength(JSON.stringify(input)) > MAX_INPUT_BYTES) throw new HttpError(413, `input of test ${t.id} is too large`);
        return { id: t.id, input };
    });
    if (tests.reduce((sum, t) => sum + Buffer.byteLength(JSON.stringify(t.input)), 0) > MAX_TOTAL_INPUT_BYTES) {
        throw new HttpError(413, "test inputs are too large together");
    }
    const javascript = body.language === "javascript";
    return {
        language: body.language,
        code: body.code,
        // The harness contract is javascript only; other languages read stdin.
        harness: javascript ? body.harness || null : null,
        entry: javascript ? body.entry || null : null,
        tests,
        timeLimitMs: clamp(body.timeLimitMs ?? 2000, LIMITS.timeLimitMs, "timeLimitMs"),
        memoryLimitMb: clamp(body.memoryLimitMb ?? 128, LIMITS.memoryLimitMb, "memoryLimitMb"),
    };
}

// ------------------------------------------------------------ execution
function runTest({ code, harness, entry, input, timeLimitMs, memoryLimitMb }) {
    return new Promise((resolve) => {
        const nonce = randomBytes(24).toString("hex");
        const started = Date.now();
        const child = spawn(process.execPath, [
            "--permission",
            `--allow-fs-read=${RUNNER}`,
            `--max-old-space-size=${memoryLimitMb}`,
            "--max-semi-space-size=4",
            "--stack-size=984",
            "--disable-proto=delete",
            RUNNER,
        ], {
            env: {}, // nothing from this process (token, PATH, ...) reaches user code
            stdio: ["pipe", "ignore", "pipe", "pipe"],
            detached: false,
            windowsHide: true,
        });

        let result = "";
        let stderr = "";
        let settled = false;

        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
            resolve({ timeMs: Date.now() - started, ...value });
        };

        const timer = setTimeout(() => {
            finish({ ok: false, timedOut: true, error: `Time limit exceeded (${timeLimitMs}ms)`, logs: [] });
        }, timeLimitMs + STARTUP_OVERHEAD_MS);

        child.stdio[3].on("data", (chunk) => {
            if (result.length < MAX_RESULT_BYTES) result += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk) => {
            if (stderr.length < MAX_STDERR_BYTES) stderr += chunk.toString("utf8");
        });
        child.on("error", (error) => finish({ ok: false, error: `Runner failed to start: ${error.message}`, logs: [] }));
        child.on("close", (exitCode, signal) => {
            // Only the line carrying our nonce is the result; anything else was written by user code.
            const line = result.split("\n").find((l) => l.startsWith(nonce));
            if (line) {
                try {
                    const parsed = JSON.parse(line.slice(nonce.length));
                    return finish({
                        ok: Boolean(parsed.ok),
                        output: parsed.ok ? parsed.output ?? null : undefined,
                        error: parsed.ok ? null : String(parsed.error || "Error").slice(0, 1000),
                        logs: Array.isArray(parsed.logs) ? parsed.logs.slice(0, 50) : [],
                        timeMs: Number(parsed.timeMs) || Date.now() - started,
                    });
                } catch { /* fall through */ }
            }
            const outOfMemory = /heap out of memory|Allocation failed/i.test(stderr);
            finish({
                ok: false,
                error: outOfMemory
                    ? `Memory limit exceeded (${memoryLimitMb}MB)`
                    : `Process exited without a result (${signal || `exit ${exitCode}`})`,
                logs: [],
            });
        });

        child.stdin.on("error", () => { /* child died before reading its input */ });
        child.stdin.end(JSON.stringify({ code, harness, entry, input, nonce }));
    });
}

/** One job through run-job in `slot`: compile once, run every test (see sandbox/vercel/run-job). */
function runJob(job, slot, signal) {
    return new Promise((resolve, reject) => {
        const jobId = randomBytes(12).toString("hex");
        fs.writeFileSync(path.join(JOBS_DIR, `${jobId}.json`), JSON.stringify({
            language: job.language,
            mode: job.language === "javascript" ? "function" : "stdio",
            code: job.code,
            harness: job.harness,
            entry: job.entry,
            tests: job.tests,
            timeLimitMs: job.timeLimitMs,
            memoryLimitMb: job.memoryLimitMb,
        }), { mode: 0o600 });

        const child = spawn(RUN_JOB, [jobId, slot], {
            env: { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8" },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        // run-job kills each test at its own limit; this only catches a stuck run-job.
        const budget = Math.min(MAX_JOB_MS, COMPILE_BUDGET_MS + job.tests.length * (job.timeLimitMs + 2 * STARTUP_OVERHEAD_MS) + 5000);
        const timer = setTimeout(() => child.kill("SIGKILL"), budget);
        // Nobody is waiting for the answer any more: free the slot now (run-job cleans it on the next job).
        signal.addEventListener("abort", () => child.kill("SIGKILL"), { once: true });

        child.stdout.on("data", (chunk) => { if (stdout.length < 4 * MAX_RESULT_BYTES) stdout += chunk.toString("utf8"); });
        child.stderr.on("data", (chunk) => { if (stderr.length < MAX_STDERR_BYTES) stderr += chunk.toString("utf8"); });
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(new Error(`run-job failed to start: ${error.message}`));
        });
        child.on("close", (exitCode, signal) => {
            clearTimeout(timer);
            fs.rmSync(path.join(JOBS_DIR, `${jobId}.json`), { force: true });
            let response = null;
            try { response = JSON.parse(stdout.trim().split("\n").pop()); } catch { /* below */ }
            if (!response || response.error || !response.results) {
                return reject(new Error(`run-job ${response?.error || signal || `exit ${exitCode}`}: ${stderr.slice(0, 300)}`));
            }
            // A compile error is the learner's to fix: show it on every test.
            const compileError = response.compile && !response.compile.ok
                ? `Compilation failed:\n${String(response.compile.error || "").slice(0, 4000)}`
                : null;
            resolve(Object.fromEntries(job.tests.map((t) => {
                const r = response.results[t.id] || { ok: false, error: "No result" };
                return [t.id, {
                    ok: Boolean(r.ok),
                    output: r.ok ? r.output ?? null : undefined,
                    error: r.ok ? null : compileError || String(r.error || "Error").slice(0, 1000),
                    timedOut: Boolean(r.timedOut),
                    timeMs: Number(r.timeMs) || 0,
                    logs: Array.isArray(r.logs) ? r.logs.slice(0, 50) : [],
                }];
            })));
        });
    });
}

async function execute(job, signal) {
    const slot = await acquire(signal);
    const startedAt = Date.now();
    try {
        if (RUN_JOB) return await runJob(job, slot, signal);
        const results = {};
        for (const test of job.tests) {
            if (signal.aborted) throw new HttpError(499, "Client closed the request");
            results[test.id] = await runTest({ ...job, input: test.input });
        }
        return results;
    } finally {
        avgJobMs = Math.round(0.8 * avgJobMs + 0.2 * (Date.now() - startedAt));
        release(slot);
    }
}

// ------------------------------------------------------------ HTTP
function authorized(req) {
    const header = String(req.headers.authorization || "");
    const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
    const expected = Buffer.from(TOKEN);
    return given.length === expected.length && timingSafeEqual(given, expected);
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new HttpError(413, "Request body too large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch {
                reject(new HttpError(400, "Invalid JSON"));
            }
        });
        req.on("error", reject);
    });
}

function send(res, status, body, headers = {}) {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
    res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
    try {
        if (req.method === "GET" && req.url === "/health") {
            return send(res, 200, {
                status: CONFIGURED ? "ok" : "unconfigured",
                running: slotCount - freeSlots.length,
                queued: waiting.length,
                languages: LANGUAGES,
            });
        }
        if (req.method !== "POST" || req.url !== "/v1/execute") throw new HttpError(404, "Not found");
        if (!CONFIGURED) throw new HttpError(503, "Code runner token is not configured");
        if (!authorized(req)) throw new HttpError(401, "Unauthorized");

        const job = validate(await readJson(req));
        // The app gave up (its own timeout) or went away: stop queueing / running this job.
        const gone = new AbortController();
        res.on("close", () => { if (!res.writableFinished) gone.abort(); });
        const results = await execute(job, gone.signal);
        return send(res, 200, { results });
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        if (status === 499 || res.destroyed) return undefined;
        if (status === 500) console.error("[sandbox] execute failed:", error?.message);
        return send(res, status, { error: status === 500 ? "Internal error" : error.message }, status === 503 ? { "retry-after": retryAfterSeconds() } : {});
    }
});

server.requestTimeout = 120_000;
server.listen(PORT, () => console.log(`[sandbox] listening on :${PORT} (concurrency ${MAX_CONCURRENCY}, queue ${MAX_QUEUE}, ${LANGUAGES.join(" ")})`));

// Graceful shutdown: stop accepting, let running jobs finish (compose stop_grace_period).
for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
        console.log(`[sandbox] ${signal}: draining`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 10_000).unref();
    });
}
