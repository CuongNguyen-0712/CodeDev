import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { emailVerificationService } from "@/services/emailVerification.service";

/** POST /api/auth/verify-email/resend: sends a new verification link to the signed-in user. */
export const POST = apiRoute(async ({ userId }) => {
    await emailVerificationService.request(userId);
    return { sent: true };
}, {
    context: "api/auth/verify-email/resend",
    csrf: true,
    allowLocked: true, // the lock page sends it (plan 12.3)
    limiter: rateLimiters.emailVerify,
});
