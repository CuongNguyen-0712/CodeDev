import { NextResponse } from "next/server";

import { ApiError, errorResponse } from "@/lib/error/apiError";
import { setLinkIntentCookie } from "@/lib/authCookies";
import { rateLimiters } from "@/lib/rateLimit";
import { assertSameOrigin } from "@/lib/requestGuard";
import { requireAuthSession } from "@/lib/session";

import { PROVIDER_LABEL } from "@/services/accountLink.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/link/start { provider } — "Connect" in Settings (plan 10.4). Remembers the
 * signed-in user and session for 10 minutes; the client then runs the provider's sign-in and the
 * next-auth signIn callback links the account to them, keeping the current session.
 */
export async function POST(req) {
    try {
        assertSameOrigin(req);
        const session = await requireAuthSession();
        const { id: userId, sessionId } = session.user;

        const limit = await rateLimiters.profile.limitRequest(req, userId);
        if (!limit.allowed) return limit.response;

        const body = await req.json().catch(() => ({}));
        const provider = String(body?.provider || "");
        if (!PROVIDER_LABEL[provider]) throw new ApiError("Unknown sign-in method.", 400, { expose: true });

        await setLinkIntentCookie({ userId, sessionId: String(sessionId), provider });

        return NextResponse.json({ success: true }, { headers: { ...limit.headers, "Cache-Control": "no-store" } });
    } catch (error) {
        return errorResponse(error, "api/auth/link/start");
    }
}
