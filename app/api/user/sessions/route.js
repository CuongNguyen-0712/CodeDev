import { NextResponse } from "next/server";

import { requireAuthSession } from "@/lib/session";
import { ApiError, errorResponse } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";

import { assertSameOrigin } from "@/lib/requestGuard";
import { clearRefreshCookie, clearSessionCookie } from "@/lib/authCookies";

import { authService } from "@/services/auth.service";

/** Lists the signed-in user's active sessions (devices). */
export async function GET(req) {
    try {
        const session = await requireAuthSession();
        const { id: userId, sessionId } = session.user;

        const limit = await rateLimiters.session.limitRequest(req, userId);
        if (!limit.allowed) return limit.response;

        const data = await authService.listSessions({ userId, currentSessionId: sessionId });

        return NextResponse.json({ success: true, data }, { status: 200, headers: limit.headers });
    } catch (error) {
        return errorResponse(error, "api/user/sessions");
    }
}

/**
 * Signs out other devices.
 * Body: `{ sessionId }` for one session, `{ others: true }` for every session except this one,
 * or `{ all: true }` to sign out everywhere including here (cookies are cleared).
 * The current session alone is ended through PATCH /api/user/logout.
 */
export async function DELETE(req) {
    try {
        assertSameOrigin(req);

        const session = await requireAuthSession();
        const { id: userId, sessionId: currentSessionId } = session.user;

        const limit = await rateLimiters.session.limitRequest(req, userId);
        if (!limit.allowed) return limit.response;

        const body = await req.json().catch(() => ({}));

        if (body?.all === true) {
            const revoked = await authService.revokeAllSessions({ userId });
            await clearRefreshCookie();
            await clearSessionCookie();
            return NextResponse.json({ success: true, data: { revoked, signedOut: true } }, { status: 200, headers: limit.headers });
        }

        if (body?.others === true) {
            const revoked = await authService.revokeOtherSessions({ userId, currentSessionId });
            return NextResponse.json({ success: true, data: { revoked } }, { status: 200, headers: limit.headers });
        }

        const targetId = String(body?.sessionId || "");

        if (!/^\d{1,20}$/.test(targetId)) {
            throw new ApiError("A valid sessionId is required", 400);
        }

        if (targetId === String(currentSessionId)) {
            throw new ApiError("Use sign out to end the current session", 400);
        }

        await authService.revokeSession({ userId, sessionId: targetId });

        return NextResponse.json({ success: true, data: { revoked: 1 } }, { status: 200, headers: limit.headers });
    } catch (error) {
        return errorResponse(error, "api/user/sessions");
    }
}
