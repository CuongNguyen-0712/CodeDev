import { ApiError } from "@/lib/error/apiError";
import { runOnVercel, vercelRunnerEnabled } from "@/lib/challenges/vercelRunner";

/**
 * Server-only client of the code runner (codedev_sandbox, sandbox/server.mjs).
 *
 * When CODE_RUNNER_URL is set, coding submissions are graded from outputs produced by the runner
 * instead of outputs reported by the browser (which a learner can forge). The runner only sees
 * code and inputs; expected outputs never leave the app.
 *
 *   CODE_RUNNER_URL    e.g. http://sandbox:4100 (compose network) or http://127.0.0.1:4100 (next dev)
 *   CODE_RUNNER_TOKEN  shared secret, 16+ characters, also given to the sandbox service
 *
 * CODE_RUNNER_PROVIDER=vercel runs the same jobs on Vercel Sandbox instead (vercelRunner.js).
 */

const REQUEST_OVERHEAD_MS = 1500; // per test: process start-up on top of the challenge limit
const MAX_REQUEST_MS = 110_000;
const COMPILE_BUDGET_MS = 60_000; // run-job's longest compile limit (kotlin)
const MAX_MEMORY_MB = 256;

export function serverExecutionEnabled() {
    return Boolean(process.env.CODE_RUNNER_URL) || vercelRunnerEnabled();
}

/**
 * Runs every test once. Limits come from the challenge config (never from the client).
 * @returns {Promise<Record<string, { output: any, error: string|null, timeMs: number, timedOut: boolean }>>}
 *   the same shape the browser reports, so grading stays in one place (gradeTests).
 */
export async function executeTests({ language = "javascript", code, harness, entry, tests, timeLimitMs, memoryLimitMb }) {
    if (!tests.length) return {};

    const limitMs = Math.max(100, Number(timeLimitMs) || 2000);
    if (vercelRunnerEnabled()) {
        const results = await runOnVercel({
            language,
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
    const budget = Math.min(MAX_REQUEST_MS, COMPILE_BUDGET_MS + tests.length * (limitMs + REQUEST_OVERHEAD_MS) + 5000);

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
