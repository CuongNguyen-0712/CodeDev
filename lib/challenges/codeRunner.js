import { ApiError } from "@/lib/error/apiError";
import { assertJobSize, jobBudgetMs } from "@/lib/challenges/limits";
import { runOnVercel, vercelPoolSize, vercelRunnerEnabled, vercelSandboxFor, vercelSlots } from "@/lib/challenges/vercelRunner";

/**
 * Server-only client of the code runner (codedev_sandbox, sandbox/server.mjs).
 *
 * When CODE_RUNNER_URL is set, coding submissions are graded from outputs produced by the runner
 * instead of outputs reported by the browser (which a learner can forge). The runner only sees
 * code and inputs; expected outputs never leave the app.
 *
 *   CODE_RUNNER_URL    e.g. http://sandbox-gateway:4100 (compose app) or http://127.0.0.1:4100 (next dev)
 *   CODE_RUNNER_TOKEN  shared secret, 16+ characters, also given to the sandbox service
 *
 * CODE_RUNNER_PROVIDER=vercel runs the same jobs on Vercel Sandbox instead (vercelRunner.js).
 */

const MAX_MEMORY_MB = 256;

export function serverExecutionEnabled() {
    return Boolean(process.env.CODE_RUNNER_URL) || vercelRunnerEnabled();
}

/** Which sandbox runs this job: the queue's concurrency key (one Docker runner, or a Vercel microVM). */
export function sandboxKey(language, seed) {
    return vercelRunnerEnabled() ? vercelSandboxFor(language, seed) : "docker";
}

/** Jobs one sandbox runs at a time: the Vercel microVM's vCPUs, or the Docker runner's MAX_CONCURRENCY. */
export function sandboxSlots() {
    return vercelRunnerEnabled() ? vercelSlots() : Math.max(1, Number.parseInt(process.env.CODE_RUNNER_CONCURRENCY || "2", 10) || 2);
}

/** Jobs every sandbox together runs at a time (the pool's microVMs, or the one Docker runner). */
export function totalSlots() {
    return sandboxSlots() * (vercelRunnerEnabled() ? vercelPoolSize() : 1);
}

/**
 * Runs every test once. Limits come from the challenge config (never from the client).
 * @returns {Promise<Record<string, { output: any, error: string|null, timeMs: number, timedOut: boolean }>>}
 *   the same shape the browser reports, so grading stays in one place (gradeTests).
 */
export async function executeTests({ language = "javascript", sandbox = null, code, harness, entry, tests, timeLimitMs, memoryLimitMb }) {
    if (!tests.length) return {};
    assertJobSize(tests);

    const limitMs = Math.max(100, Number(timeLimitMs) || 2000);
    if (vercelRunnerEnabled()) {
        const results = await runOnVercel({
            language,
            sandbox,
            code,
            harness,
            entry,
            tests: tests.map((t) => ({ id: String(t.id), input: t.input ?? null })),
            timeLimitMs: Math.min(10_000, limitMs),
            memoryLimitMb: Math.min(MAX_MEMORY_MB, Number(memoryLimitMb) || 128),
        });
        return toReport(tests, results);
    }

    const url = new URL("/v1/execute", process.env.CODE_RUNNER_URL);
    // A little over the sandbox's own budget, so its answer (even a timeout) arrives first.
    const budget = jobBudgetMs(tests.length, limitMs) + 5000;

    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                authorization: `Bearer ${process.env.CODE_RUNNER_TOKEN || ""}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                language,
                code,
                harness: harness || null,
                entry: entry || null,
                tests: tests.map((t) => ({ id: String(t.id), input: t.input ?? null })),
                timeLimitMs: limitMs,
                memoryLimitMb: Math.min(MAX_MEMORY_MB, Number(memoryLimitMb) || 128),
            }),
            signal: AbortSignal.timeout(budget),
            cache: "no-store",
        });
    } catch (error) {
        console.error("[codeRunner] unreachable:", error?.name, error?.message);
        throw new ApiError("The code runner is unavailable right now. Try again shortly; no attempt was used.", 503);
    }

    if (response.status === 503) {
        throw new ApiError("The code runner is busy. Try again in a few seconds; no attempt was used.", 503);
    }
    if (response.status === 413) {
        throw new ApiError("This submission is too large to run. Shorten the code and try again; no attempt was used.", 413);
    }
    if (!response.ok) {
        console.error("[codeRunner] rejected:", response.status, (await response.text().catch(() => "")).slice(0, 200));
        throw new ApiError("The code runner could not run this submission.", 502);
    }

    const { results = {} } = await response.json();
    return toReport(tests, results);
}

// Runner results -> the browser report shape graded by challenge.service gradeTests().
function toReport(tests, results) {
    return Object.fromEntries(tests.map((t) => {
        const r = results[String(t.id)];
        if (!r) return [String(t.id), { output: null, error: "No result from the code runner", timeMs: 0, timedOut: false }];
        return [String(t.id), {
            output: r.ok ? (r.output ?? null) : null,
            error: r.ok ? null : String(r.error || "Error"),
            timeMs: Number(r.timeMs) || 0,
            timedOut: Boolean(r.timedOut),
        }];
    }));
}
