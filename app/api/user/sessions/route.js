import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { clearRefreshCookie, clearSessionCookie } from "@/lib/authCookies";
import { authService } from "@/services/auth.service";

/** Lists the signed-in user's active sessions (devices). */
export const GET = apiRoute(
    ({ userId, session }) => authService.listSessions({ userId, currentSessionId: session.user.sessionId }),
    { context: "api/user/sessions", limiter: rateLimiters.session }
);

/**
 * Signs out other devices.
 * Body: `{ sessionId }` for one session, `{ others: true }` for every session except this one,
 * or `{ all: true }` to sign out everywhere including here (cookies are cleared).
 * The current session alone is ended through POST /api/auth/logout.
 */
export const DELETE = apiRoute(async ({ req, userId, session }) => {
    const currentSessionId = session.user.sessionId;
    const body = await req.json().catch(() => ({}));

    if (body?.all === true) {
        const revoked = await authService.revokeAllSessions({ userId });
        await clearRefreshCookie();
        await clearSessionCookie();
        return { revoked, signedOut: true };
    }

    if (body?.others === true) {
        return { revoked: await authService.revokeOtherSessions({ userId, currentSessionId }) };
    }

    const targetId = String(body?.sessionId || "");
    if (!/^\d{1,20}$/.test(targetId)) {
        throw new ApiError("A valid sessionId is required", 400);
    }
    if (targetId === String(currentSessionId)) {
        throw new ApiError("Use sign out to end the current session", 400);
    }

    await authService.revokeSession({ userId, sessionId: targetId });
    return { revoked: 1 };
}, { context: "api/user/sessions", csrf: true, limiter: rateLimiters.session });
