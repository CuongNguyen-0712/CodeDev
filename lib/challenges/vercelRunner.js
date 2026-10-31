import { randomBytes } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";

import { redis } from "@/lib/cache";
import { ApiError } from "@/lib/error/apiError";
import { jobBudgetMs } from "@/lib/challenges/limits";

/**
 * Code runner on Vercel Sandbox (production): the codedev-runner image (sandbox/vercel/Dockerfile)
 * in a named, persistent microVM, graded by the same run-job as the Docker runner.
 *
 * One shared sandbox serves every language by default; CODE_RUNNER_SANDBOXES can move a language
 * to its own sandbox without code changes. Each sandbox has one job slot per vCPU (run01..run0N),
 * leased in Redis; run-job also refuses a slot that is already running a job.
 *
 *   CODE_RUNNER_PROVIDER=vercel
 *   CODE_RUNNER_SANDBOX    shared sandbox name (default codedev-runner-v2; bump with the image)
 *   CODE_RUNNER_SANDBOXES  optional JSON { "java": "codedev-runner-java-v2", ... }
 *   CODE_RUNNER_IMAGE      VCR image (default codedev-runner:v2)
 *   CODE_RUNNER_VCPUS      vCPUs = job slots per sandbox (default 2, max 8)
 *
 * Auth: OIDC on Vercel (automatic); locally VERCEL_OIDC_TOKEN from `vercel env pull`.
 */

const IMAGE = () => process.env.CODE_RUNNER_IMAGE || "codedev-runner:v2";
const VCPUS = () => Math.min(8, Math.max(1, Number.parseInt(process.env.CODE_RUNNER_VCPUS || "2", 10) || 2));
const SESSION_MS = 10 * 60 * 1000;   // an idle sandbox stops (and snapshots) after this
const JOBS_DIR = "/vercel/jobs";

export function vercelRunnerEnabled() {
    return process.env.CODE_RUNNER_PROVIDER === "vercel";
}

function sandboxName(language) {
    let overrides = {};
    try {
        overrides = JSON.parse(process.env.CODE_RUNNER_SANDBOXES || "{}");
    } catch {
        console.error("[vercelRunner] CODE_RUNNER_SANDBOXES is not valid JSON; using the shared sandbox");
    }
    return overrides[language] || process.env.CODE_RUNNER_SANDBOX || "codedev-runner-v2";
}

/**
 * The sandbox one run uses. With CODE_RUNNER_POOL_SIZE=N (default 1) each name gets N microVMs
 * (`<name>-0` .. `<name>-N-1`), picked by a hash of `seed` (the run id). The name is also the
 * Inngest concurrency key, so a microVM never gets more jobs than it has slots.
 */
export const vercelPoolSize = () => Math.max(1, Number.parseInt(process.env.CODE_RUNNER_POOL_SIZE || "1", 10) || 1);

export function vercelSandboxFor(language, seed) {
    const name = sandboxName(language);
    const size = vercelPoolSize();
    if (size === 1) return name;
    let hash = 0;
    for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return `${name}-${hash % size}`;
}

/** Job slots per microVM: the concurrency limit per sandbox. */
export const vercelSlots = () => VCPUS();

// One handle per sandbox per function instance; the SDK resumes a stopped sandbox on use.
const handles = new Map();
function getSandbox(name) {
    if (!handles.has(name)) {
        const created = Sandbox.getOrCreate({
            name,
            image: IMAGE(),
            resources: { vcpus: VCPUS() },
            timeout: SESSION_MS,
            networkPolicy: "deny-all",
            keepLastSnapshots: { count: 1, deleteEvicted: true },
            tags: { app: "codedev", role: "code-runner" },
        }).catch((error) => {
            handles.delete(name);
            throw error;
        });
        handles.set(name, created);
    }
    return handles.get(name);
}

async function leaseSlot(name, ttlSeconds, skip = new Set()) {
    for (let i = 1; i <= VCPUS(); i++) {
        const slot = `run0${i}`;
        if (skip.has(slot)) continue;
        const release = await redis.acquireLock(`code-runner:${name}:${slot}`, ttlSeconds);
        if (release) return { slot, release };
    }
    throw new ApiError("The code runner is busy. Try again in a few seconds; no attempt was used.", 503);
}

/** Same result shape as sandbox/server.mjs: { [testId]: { ok, output, error, timedOut, timeMs } }. */
function toResults(tests, response) {
    const compileError = response.compile && !response.compile.ok
        ? `Compilation failed:\n${String(response.compile.error || "").slice(0, 4000)}`
        : null;
    return Object.fromEntries(tests.map((t) => {
        const r = response.results?.[t.id] || { ok: false, error: "No result" };
        return [t.id, {
            ok: Boolean(r.ok),
            output: r.ok ? r.output ?? null : null,
            error: r.ok ? null : compileError || String(r.error || "Error").slice(0, 1000),
            timedOut: Boolean(r.timedOut),
            timeMs: Number(r.timeMs) || 0,
        }];
    }));
}

/**
 * Runs one job (compile once, every test) and returns per-test results.
 * Throws ApiError 503 when no slot is free or the sandbox cannot be reached.
 */
export async function runOnVercel({ language, sandbox: sandboxNameOverride = null, code, harness, entry, tests, timeLimitMs, memoryLimitMb }) {
    const name = sandboxNameOverride || sandboxName(language);
    const budgetMs = jobBudgetMs(tests.length, timeLimitMs);
    const job = JSON.stringify({
        language,
        mode: language === "javascript" ? "function" : "stdio",
        code,
        harness: language === "javascript" ? harness || null : null,
        entry: language === "javascript" ? entry || null : null,
        tests,
        timeLimitMs,
        memoryLimitMb,
    });

    let sandbox;
    try {
        sandbox = await getSandbox(name);
    } catch (error) {
        console.error("[vercelRunner] sandbox unavailable:", name, error?.message);
        throw new ApiError("The code runner is unavailable right now. Try again shortly; no attempt was used.", 503);
    }

    const tried = new Set();
    for (let attempt = 0; attempt < 2; attempt++) {
        const { slot, release } = await leaseSlot(name, Math.ceil(budgetMs / 1000) + 30, tried);
        tried.add(slot);
        try {
            // Keep a busy sandbox alive for this job; an idle one stops on its own.
            await sandbox.extendTimeout(budgetMs).catch(() => {});
            const jobId = randomBytes(12).toString("hex");
            await sandbox.writeFiles([{ path: `${JOBS_DIR}/${jobId}.json`, content: Buffer.from(job) }]);
            const finished = await sandbox.runCommand({
                cmd: "/opt/codedev/run-job",
                args: [jobId, slot],
                sudo: true,
                signal: AbortSignal.timeout(budgetMs + 15_000),
            });
            const stdout = (await finished.stdout()).trim();
            const response = JSON.parse(stdout.split("\n").pop() || "{}");
            if (response.error === "slot is busy") continue; // a lease was lost (Redis down): try another slot
            if (response.error || !response.results) throw new Error(`run-job: ${response.error || `exit ${finished.exitCode}`}`);
            return toResults(tests, response);
        } catch (error) {
            if (error instanceof ApiError) throw error;
            console.error("[vercelRunner] job failed:", name, slot, error?.message);
            handles.delete(name); // fetch a fresh handle next time
            throw new ApiError("The code runner could not run this submission. Try again; no attempt was used.", 503);
        } finally {
            await release().catch(() => {});
        }
    }
    throw new ApiError("The code runner is busy. Try again in a few seconds; no attempt was used.", 503);
}
