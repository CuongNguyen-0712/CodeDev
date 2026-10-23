import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";

import { emailVerificationService } from "@/services/emailVerification.service";

export const dynamic = "force-dynamic";

const RESULT = {
    verified: { status: 200, message: "Email verified." },
    already_verified: { status: 200, message: "Your email is already verified." },
    expired: { status: 410, message: "This link has expired." },
    invalid: { status: 400, message: "This link is not valid." },
};

/**
 * POST /api/auth/verify-email { token } — consumes a verification link. No session needed (the
 * link may be opened on another device). Called from /auth/verify-email, never by a plain GET,
 * so mail scanners that prefetch links do not use the token up.
 */
export async function POST(req) {
    const limit = await rateLimiters.verifyEmail.limitRequest(req);
    if (!limit.allowed) return limit.response;

    try {
        const body = await req.json().catch(() => ({}));
        const { status } = await emailVerificationService.verify(body?.token);
        const result = RESULT[status];

        return NextResponse.json(
            { success: result.status === 200, message: result.message, data: { status } },
            { status: result.status, headers: { ...limit.headers, "Cache-Control": "no-store" } }
        );
    } catch (error) {
        return errorResponse(error, "api/auth/verify-email", limit.headers);
    }
}
