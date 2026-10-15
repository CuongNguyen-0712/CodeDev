import { NextResponse } from "next/server";

import { requireAuthSession } from "@/lib/session";
import { ApiError, errorResponse } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";

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
 * Body: `{ sessionId }` for one session, or `{ others: true }` for every session except this one.
 * The current session is ended through PATCH /api/user/logout instead.
 */
export async function DELETE(req) {
    try {
        const session = await requireAuthSession();
        const { id: userId, sessionId: currentSessionId } = session.user;

        const limit = await rateLimiters.session.limitRequest(req, userId);
        if (!limit.allowed) return limit.response;

        const body = await req.json().catch(() => ({}));

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
