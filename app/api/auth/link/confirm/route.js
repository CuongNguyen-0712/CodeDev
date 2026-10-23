import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/error/apiError";
import { clearLinkCookie } from "@/lib/authCookies";
import { rateLimiters } from "@/lib/rateLimit";

import { accountLinkService } from "@/services/accountLink.service";

export const dynamic = "force-dynamic";

const RESULT = {
    linked: { status: 200, message: "Account linked." },
    expired: { status: 410, message: "This link has expired." },
    invalid: { status: 400, message: "This link is not valid." },
    in_use: { status: 409, message: "This account is already linked to another CodeDev account." },
};

/**
 * POST /api/auth/link/confirm { token } — consumes a link confirmation (plan 10.3, case 5b).
 * Like /api/auth/verify-email: no session needed, never a plain GET (link scanners).
 */
export async function POST(req) {
    const limit = await rateLimiters.verifyEmail.limitRequest(req);
    if (!limit.allowed) return limit.response;

    try {
        const body = await req.json().catch(() => ({}));
        const { status, provider } = await accountLinkService.confirmLink(body?.token);
        if (status === "linked") await clearLinkCookie();
        const result = RESULT[status];

        return NextResponse.json(
            { success: result.status === 200, message: result.message, data: { status, provider } },
            { status: result.status, headers: { ...limit.headers, "Cache-Control": "no-store" } }
        );
    } catch (error) {
        return errorResponse(error, "api/auth/link/confirm", limit.headers);
    }
}
