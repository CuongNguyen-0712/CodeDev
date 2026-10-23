import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/error/apiError";
import { readLinkCookie } from "@/lib/authCookies";
import { rateLimiters } from "@/lib/rateLimit";
import { assertSameOrigin } from "@/lib/requestGuard";
import { maskEmail } from "@/lib/utils";

import { accountLinkService } from "@/services/accountLink.service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/auth/link/email — "Don't know this password?" on /auth/link (plan 10.3, case 5b):
 * mails the owner of the account a link that confirms the pending link. No session: the pending
 * link is in the sealed cd_link cookie. `emailVerify` limit per target user, in its own bucket.
 */
export async function POST(req) {
    try {
        assertSameOrigin(req);

        const link = await readLinkCookie();
        if (!link) {
            return NextResponse.json({ success: false, message: "This link request expired." }, { status: 404, headers: NO_STORE });
        }

        // Own bucket: a cd_link holder must not use up the owner's verification resends.
        const limit = await rateLimiters.emailVerify.limitRequest(req, `link:${link.targetUserId}`);
        if (!limit.allowed) return limit.response;

        await accountLinkService.requestLinkEmail(link);

        return NextResponse.json(
            { success: true, message: "Link sent.", data: { email: maskEmail(link.targetEmail), minutes: 30 } },
            { headers: { ...limit.headers, ...NO_STORE } }
        );
    } catch (error) {
        return errorResponse(error, "api/auth/link/email");
    }
}
