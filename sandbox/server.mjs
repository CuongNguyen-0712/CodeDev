/**
 * CodeDev code runner (codedev_sandbox).
 *
 * Executes untrusted JavaScript challenge code for the app, one throw-away Node process per test
 * case (runner.cjs). It only returns what the code produced; the app keeps the expected outputs
 * and grades. The container is the outer boundary (compose.yml: read-only root, no capabilities,
 * internal network without egress, memory/CPU/PID limits); this server adds per-process limits.
 *
 *   GET  /health        -> 200 { status: "ok", running, queued }
 *   POST /v1/execute    -> 200 { results: { [testId]: { ok, output, error, timedOut, timeMs, logs } } }
 *        Authorization: Bearer <CODE_RUNNER_TOKEN>
 *        body: { language: "javascript", code, harness?, entry?, tests: [{ id, input }], timeLimitMs, memoryLimitMb }
 *
 * Environment: CODE_RUNNER_TOKEN (required), PORT (4100), MAX_CONCURRENCY (2), MAX_QUEUE (16).
 */
import http from "node:http";
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
const MAX_CONCURRENCY = intEnv("MAX_CONCURRENCY", 2, 1);
const MAX_QUEUE = intEnv("MAX_QUEUE", 16, 0);

const RUNNER = fileURLToPath(new URL("./runner.cjs", import.meta.url));
const MAX_BODY_BYTES = 512 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_TESTS = 50;
const MAX_INPUT_BYTES = 128 * 1024;
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
let running = 0;
const waiting = [];

function acquire() {
    if (running < MAX_CONCURRENCY) {
        running++;
        return Promise.resolve();
    }
    if (waiting.length >= MAX_QUEUE) throw new HttpError(503, "Code runner is busy, try again shortly");
    return new Promise((resolve) => waiting.push(resolve));
}

function release() {
    const next = waiting.shift();
    if (next) next();
    else running--;
}

// ------------------------------------------------------------ validation
function clamp(value, [min, max], name) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new HttpError(400, `${name} must be a number`);
    return Math.min(max, Math.max(min, Math.round(n)));
}

function validate(body) {
    if (!body || typeof body !== "object") throw new HttpError(400, "JSON body required");
    if (body.language !== "javascript") throw new HttpError(400, "Only javascript is supported");
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
    return {
        code: body.code,
        harness: body.harness || null,
        entry: body.entry || null,
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

async function execute(job) {
    await acquire();
    try {
        const results = {};
        for (const test of job.tests) {
            results[test.id] = await runTest({ ...job, input: test.input });
        }
        return results;
    } finally {
        release();
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
            return send(res, 200, { status: CONFIGURED ? "ok" : "unconfigured", running, queued: waiting.length });
        }
        if (req.method !== "POST" || req.url !== "/v1/execute") throw new HttpError(404, "Not found");
        if (!CONFIGURED) throw new HttpError(503, "Code runner token is not configured");
        if (!authorized(req)) throw new HttpError(401, "Unauthorized");

        const job = validate(await readJson(req));
        const results = await execute(job);
        return send(res, 200, { results });
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        if (status === 500) console.error("[sandbox] execute failed:", error?.message);
        return send(res, status, { error: status === 500 ? "Internal error" : error.message }, status === 503 ? { "retry-after": "2" } : {});
    }
});

server.requestTimeout = 120_000;
server.listen(PORT, () => console.log(`[sandbox] listening on :${PORT} (concurrency ${MAX_CONCURRENCY}, queue ${MAX_QUEUE})`));

// Graceful shutdown: stop accepting, let running jobs finish (compose stop_grace_period).
for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
        console.log(`[sandbox] ${signal}: draining`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 10_000).unref();
    });
}
