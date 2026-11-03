import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { accountLinkService } from "@/services/accountLink.service";

/**
 * DELETE /api/user/accounts/:provider: disconnects GitHub / Google (plan 10.5). Refused with
 * 409 LAST_SIGN_IN_METHOD when nothing else (password or another provider) could sign in.
 */
export const DELETE = apiRoute(async ({ req, userId, params }) => {
    await accountLinkService.unlink({ userId, provider: params.provider, ip: RateLimiter.getClientIp(req.headers) });
    return null;
}, { context: "api/user/accounts/[provider]", csrf: true, limiter: rateLimiters.profile });
