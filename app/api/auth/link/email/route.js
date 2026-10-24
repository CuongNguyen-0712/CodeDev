import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/error/apiError";
import { readLinkCookie } from "@/lib/authCookies";
import { assertSameOrigin } from "@/lib/requestGuard";
import { maskEmail } from "@/lib/utils";

import { accountLinkService } from "@/services/accountLink.service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/auth/link/email — "Resend" on /auth/link (plan 11.1): mails the account owner a new
 * confirmation link for the pending claim (the first one went out from the OAuth callback). No
 * session: the pending claim is in the sealed cd_link cookie. 3 mails / 15 min per account.
 */
export async function POST(req) {
    try {
        assertSameOrigin(req);

        const link = await readLinkCookie();
        if (!link) {
            return NextResponse.json({ success: false, message: "This link request expired." }, { status: 404, headers: NO_STORE });
        }

        const result = await accountLinkService.requestLinkEmail(link);
        if (result.retryAfter) {
            return NextResponse.json(
                { success: false, message: "We already sent a few links. Check your inbox, or try again in a few minutes.", retryAfter: result.retryAfter },
                { status: 429, headers: { ...NO_STORE, "Retry-After": String(result.retryAfter) } }
            );
        }

        return NextResponse.json(
            { success: true, message: "Link sent.", data: { email: maskEmail(link.targetEmail), minutes: 30 } },
            { headers: NO_STORE }
        );
    } catch (error) {
        return errorResponse(error, "api/auth/link/email");
    }
}
