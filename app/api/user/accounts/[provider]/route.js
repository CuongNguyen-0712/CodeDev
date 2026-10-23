import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/error/apiError";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { assertSameOrigin } from "@/lib/requestGuard";
import { requireAuthSession } from "@/lib/session";

import { accountLinkService } from "@/services/accountLink.service";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/user/accounts/:provider — disconnects GitHub / Google (plan 10.5). Refused with
 * 409 LAST_SIGN_IN_METHOD when nothing else (password or another provider) could sign in.
 */
export async function DELETE(req, { params }) {
    try {
        assertSameOrigin(req);
        const session = await requireAuthSession();
        const userId = session.user.id;

        const limit = await rateLimiters.profile.limitRequest(req, userId);
        if (!limit.allowed) return limit.response;

        const { provider } = await params;
        await accountLinkService.unlink({ userId, provider, ip: RateLimiter.getClientIp(req.headers) });

        return NextResponse.json({ success: true }, { headers: { ...limit.headers, "Cache-Control": "no-store" } });
    } catch (error) {
        return errorResponse(error, "api/user/accounts/[provider]");
    }
}
