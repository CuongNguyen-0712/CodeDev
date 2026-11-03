import { ApiError } from "@/lib/error/apiError";
import { setLinkIntentCookie } from "@/lib/authCookies";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { PROVIDER_LABEL } from "@/services/accountLink.service";

/**
 * POST /api/auth/link/start { provider }: "Connect" in Settings (plan 10.4). Remembers the
 * signed-in user and session for 10 minutes; the client then runs the provider's sign-in and the
 * next-auth signIn callback links the account to them, keeping the current session.
 */
export const POST = apiRoute(async ({ req, userId, session }) => {
    const body = await req.json().catch(() => ({}));
    const provider = String(body?.provider || "");
    if (!PROVIDER_LABEL[provider]) throw new ApiError("Unknown sign-in method.", 400, { expose: true });

    await setLinkIntentCookie({ userId, sessionId: String(session.user.sessionId), provider });
    return null;
}, { context: "api/auth/link/start", csrf: true, limiter: rateLimiters.profile });
