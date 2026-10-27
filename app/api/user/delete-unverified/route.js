import { NextResponse } from "next/server";

import { ApiError, errorResponse } from "@/lib/error/apiError";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { assertSameOrigin } from "@/lib/requestGuard";
import { requireAuthSession } from "@/lib/session";
import { clearLinkConflictCookie, clearRefreshCookie, readLinkConflictCookie } from "@/lib/authCookies";

import { accountLinkService } from "@/services/accountLink.service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// The conflict of this very session, from a Connect just refused (plan 12.4).
async function sessionConflict(session) {
    const conflict = await readLinkConflictCookie();
    if (!conflict || conflict.userId !== session.user.id || String(conflict.sessionId) !== String(session.user.sessionId)) return null;
    return conflict;
}

/**
 * GET /api/user/delete-unverified — the "This Google account already belongs to @username" dialog
 * (docs/email-verification-plan.md 12.4): `{ conflict: { provider, ownerUsername, deletable, purgeAfter } | null }`.
 */
export async function GET() {
    try {
        const session = await requireAuthSession();
        const conflict = await sessionConflict(session);
        if (!conflict) return NextResponse.json({ success: true, data: { conflict: null } }, { headers: NO_STORE });

        const { provider, ownerUsername, deletable, purgeAfter } = conflict;
        return NextResponse.json({ success: true, data: { conflict: { provider, ownerUsername, deletable, purgeAfter } } }, { headers: NO_STORE });
    } catch (error) {
        return errorResponse(error, "api/user/delete-unverified");
    }
}

/**
 * POST /api/user/delete-unverified `{ confirm: <own username> }` — "Delete and switch": deletes the
 * signed-in, never-verified account for good. Only right after that refused Connect (the
 * conflict cookie), so it cannot be offered by a crafted link. The client then signs in with the
 * provider, i.e. as its owner.
 */
export async function POST(req) {
    try {
        assertSameOrigin(req);
        const session = await requireAuthSession();
        const userId = session.user.id;

        const limit = await rateLimiters.profile.limitRequest(req, userId);
        if (!limit.allowed) return limit.response;

        if (!(await sessionConflict(session))) {
            throw new ApiError("This request expired. Connect the account again from Settings.", 409, { code: "LINK_EXPIRED", expose: true });
        }
        const body = await req.json().catch(() => ({}));
        if (typeof body?.confirm !== "string" || body.confirm.trim() !== session.user.username) {
            throw new ApiError("Type your username to confirm.", 422, { code: "CONFIRMATION_REQUIRED", expose: true });
        }

        await accountLinkService.deleteUnverified({ userId, sessionId: session.user.sessionId, ip: RateLimiter.getClientIp(req.headers) });
        await clearLinkConflictCookie();
        await clearRefreshCookie();

        return NextResponse.json({ success: true }, { headers: { ...NO_STORE, ...limit.headers } });
    } catch (error) {
        return errorResponse(error, "api/user/delete-unverified");
    }
}
