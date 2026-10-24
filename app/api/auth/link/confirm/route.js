import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/error/apiError";
import { clearLinkCookie } from "@/lib/authCookies";
import { rateLimiters } from "@/lib/rateLimit";

import { accountLinkService } from "@/services/accountLink.service";

export const dynamic = "force-dynamic";

const RESULT = {
    linked: { status: 200, message: "Account linked." },
    password_required: { status: 422, message: "Choose a new password to finish." },
    weak_password: { status: 422, message: "The password must be 8 to 72 characters." },
    expired: { status: 410, message: "This link has expired." },
    invalid: { status: 400, message: "This link is not valid." },
    in_use: { status: 409, message: "This account is already linked to another CodeDev account." },
};

/**
 * POST /api/auth/link/confirm { token, password? } — explicit confirmation of a pending OAuth
 * claim (plan 11.1 / 11.3 B). A claim needs the new `password`; the page then signs in with it.
 * Like /api/auth/verify-email: no session needed, never a plain GET (link scanners).
 */
export async function POST(req) {
    const limit = await rateLimiters.verifyEmail.limitRequest(req);
    if (!limit.allowed) return limit.response;

    try {
        const body = await req.json().catch(() => ({}));
        const password = typeof body?.password === "string" && body.password.length > 0 ? body.password : null;
        const { status, mode, provider, username } = await accountLinkService.confirmLink(body?.token, password);
        if (status === "linked") await clearLinkCookie();
        const result = RESULT[status];

        return NextResponse.json(
            { success: result.status === 200, message: result.message, data: { status, mode, provider, username } },
            { status: result.status, headers: { ...limit.headers, "Cache-Control": "no-store" } }
        );
    } catch (error) {
        return errorResponse(error, "api/auth/link/confirm", limit.headers);
    }
}
