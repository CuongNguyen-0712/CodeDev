import { requireAuthSession, getAuthSession, getRequestMeta } from "@/lib/session";
import { toSafeError } from "@/lib/error/apiError";
import { RateLimiter } from "@/lib/rateLimit";

/**
 * Shared wrapper for server actions.
 *
 * Server actions return `{ success, data }` or `{ success: false, status, message }` instead of
 * throwing: errors thrown from an action are redacted in production builds, so the UI would
 * never see the real reason. Pair with `unwrapActionResult` on the client.
 *
 * @param {(ctx: { userId: string|null, session: object|null }) => Promise<any>} handler
 * @param {{ auth?: boolean, allowLocked?: boolean, limiter?: RateLimiter, context?: string }} [options]
 *   - auth (default true): require a valid session
 *   - allowLocked: also run for an account past its verify grace period (plan 12.3)
 *   - limiter: rate limiter keyed by user id (or client IP for guests)
 */
export async function runAction(handler, { auth = true, allowLocked = false, limiter = null, context = "action" } = {}) {
    try {
        const session = auth ? await requireAuthSession({ allowLocked }) : await getAuthSession({ allowLocked });
        const userId = session?.user?.id ?? null;

        if (limiter) {
            const identifier = userId || RateLimiter.getClientIp((await getRequestMeta()).headers);
            const rate = await limiter.check(identifier);

            if (!rate.success) {
                return {
                    success: false,
                    status: 429,
                    message: `Too many requests. Please retry in ${rate.retryAfter} seconds.`,
                    retryAfter: rate.retryAfter,
                };
            }
        }

        const data = await handler({ userId, session });

        // Server action results must be plain serializable data.
        return { success: true, data: JSON.parse(JSON.stringify(data ?? null)) };
    } catch (error) {
        const { status, message, code, retryAfter, details } = toSafeError(error, context);
        return {
            success: false, status, message,
            ...(code ? { code } : {}),
            ...(retryAfter ? { retryAfter } : {}),
            ...(details ? { details } : {}),
        };
    }
}
