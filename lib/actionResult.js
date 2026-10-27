import { AUTH_ERROR } from "@/constants/auth";
import { refreshSession } from "@/lib/authRefresh";
import { goToVerifyRequired } from "@/lib/verifyLock";

/**
 * Client side of `runAction`: turns `{ success: false, status, message, code }` back into a
 * thrown Error (with `.status` / `.code`) so React Query `onError` handlers keep working.
 */
export function unwrapActionResult(result) {
    if (!result?.success) {
        if (result?.status === 403 && result.code === AUTH_ERROR.EMAIL_VERIFICATION_REQUIRED) goToVerifyRequired();
        const error = new Error(result?.message || "Request failed, please try again.");
        error.status = result?.status || 500;
        if (result?.code) error.code = result.code;
        if (result?.retryAfter) error.retryAfter = result.retryAfter;
        throw error;
    }
    return result.data;
}

/**
 * Runs a server action; if it reports ACCESS_TOKEN_EXPIRED, refreshes the session and runs it
 * exactly once more. Safe for mutations: the first call was rejected before doing any work.
 *   unwrapActionResult(await callWithAuthRetry(() => someAction(args)))
 */
export async function callWithAuthRetry(run) {
    const startedAt = Date.now();
    const first = await run();

    if (
        typeof window !== "undefined" &&
        first?.success === false &&
        first.status === 401 &&
        first.code === AUTH_ERROR.ACCESS_TOKEN_EXPIRED
    ) {
        try {
            await refreshSession({ ifOlderThan: startedAt });
        } catch {
            return first;
        }
        return run();
    }

    return first;
}
