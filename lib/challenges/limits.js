import { ApiError } from "@/lib/error/apiError";

/**
 * Size and time limits for running learner code, shared by both runner clients (codeRunner.js,
 * vercelRunner.js). sandbox/server.mjs enforces the same numbers on its side; it cannot import app code.
 */
export const MAX_SOURCE_BYTES = 64 * 1024;
// Every test input of one job together, so the request stays under the sandbox's 512 KB body limit.
export const MAX_TOTAL_INPUT_BYTES = 384 * 1024;
// Compile + every test of one job. Fits one Vercel Function step (300s) with room to spare.
export const MAX_JOB_MS = 120_000;

const COMPILE_BUDGET_MS = 60_000; // run-job's longest compile limit (kotlin)
const PER_TEST_OVERHEAD_MS = 2000; // process start-up on top of the challenge's own limit

/** Wall-clock budget for one job, capped at MAX_JOB_MS. */
export function jobBudgetMs(testCount, timeLimitMs) {
    return Math.min(MAX_JOB_MS, COMPILE_BUDGET_MS + testCount * (timeLimitMs + PER_TEST_OVERHEAD_MS) + 5000);
}

/**
 * How many runs may wait or run at once: what `slots` finish within a run's deadline at the
 * recent average job time (at least 3s, 5s with no history), never below 2 per slot nor above `hardCap`.
 */
export function queueCapacity({ slots, avgJobSec, deadlineSec, hardCap }) {
    const perJob = Math.max(3, Number(avgJobSec) || 5);
    return Math.min(hardCap, Math.max(slots * 2, Math.floor((slots * deadlineSec) / perJob)));
}

/** Rejects a job whose test inputs would not fit the sandbox request (a challenge authoring problem). */
export function assertJobSize(tests) {
    const bytes = tests.reduce((sum, t) => sum + Buffer.byteLength(JSON.stringify(t.input ?? null)), 0);
    if (bytes > MAX_TOTAL_INPUT_BYTES) {
        console.error(`[limits] test inputs are ${bytes} bytes, over ${MAX_TOTAL_INPUT_BYTES}`);
        throw new ApiError("This challenge's tests are too large to run. Please report it; no attempt was used.", 422);
    }
}
