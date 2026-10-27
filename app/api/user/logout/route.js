import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { errorResponse } from "@/lib/error/apiError";
import { assertSameOrigin } from "@/lib/requestGuard";
import { clearRefreshCookie, clearSessionCookie } from "@/lib/authCookies";

import { authService } from "@/services/auth.service";

/**
 * Logout of the current session: revoke in PostgreSQL (+ outbox for Redis), then expire the
 * refresh and session cookies with the attributes they were set with.
 * Idempotent: signing out of a session that is already gone (revoked elsewhere, expired, access
 * token expired) still succeeds so the client can always finish.
 */
export async function PATCH(req) {
    try {
        assertSameOrigin(req);

        const session = await getAuthSession({ validate: false, allowExpiredAccess: true, allowLocked: true });

        const userId = session?.user?.id;
        const sessionId = session?.user?.sessionId;

        if (userId && sessionId) {
            await authService.logout({ userId, sessionId });
        }

        await clearRefreshCookie();
        await clearSessionCookie();

        return NextResponse.json({ success: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return errorResponse(error, "api/user/logout");
    }
}
