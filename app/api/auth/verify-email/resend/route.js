import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { assertSameOrigin } from "@/lib/requestGuard";
import { requireAuthSession } from "@/lib/session";

import { emailVerificationService } from "@/services/emailVerification.service";

export const dynamic = "force-dynamic";

/** POST /api/auth/verify-email/resend — sends a new verification link to the signed-in user. */
export async function POST(req) {
    try {
        assertSameOrigin(req);
        const session = await requireAuthSession({ allowLocked: true }); // the lock page sends it (plan 12.3)

        const limit = await rateLimiters.emailVerify.limitRequest(req, session.user.id);
        if (!limit.allowed) return limit.response;

        await emailVerificationService.request(session.user.id);

        return NextResponse.json(
            { success: true, message: "Verification email sent." },
            { headers: { ...limit.headers, "Cache-Control": "no-store" } }
        );
    } catch (error) {
        return errorResponse(error, "api/auth/verify-email/resend");
    }
}
