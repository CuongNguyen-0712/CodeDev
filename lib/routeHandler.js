import { NextResponse } from "next/server";

import { getAuthSession, requireAuthSession } from "@/lib/session";
import { errorResponse } from "@/lib/error/apiError";
import { assertSameOrigin } from "@/lib/requestGuard";

/**
 * Route handler wrapper for the onboarding / commerce / admin APIs:
 *   - auth (default true): the user always comes from the verified session, never the request;
 *   - csrf: same-origin check for cookie-authenticated writes;
 *   - limiter: RateLimiter keyed by user id (client IP for guests);
 *   - responses are `{ success: true, data }` with Cache-Control: no-store, errors go through
 *     errorResponse (5xx details are logged, not returned).
 *
 * @param {(ctx: { req: Request, userId: string|null, session: object|null, params: object }) => Promise<any>} handler
 */
export function apiRoute(handler, { context, auth = true, csrf = false, limiter = null, status = 200 } = {}) {
    return async (req, routeContext) => {
        try {
            if (csrf) assertSameOrigin(req);

            const session = auth ? await requireAuthSession() : await getAuthSession({ soft: true });
            const userId = session?.user?.id ?? null;

            if (limiter) {
                const limit = await limiter.limitRequest(req, userId);
                if (!limit.allowed) return limit.response;
            }

            const params = (await routeContext?.params) || {};
            const data = await handler({ req, userId, session, params });
            if (data instanceof Response) return data;

            return NextResponse.json({ success: true, data: data ?? null }, {
                status,
                headers: { "Cache-Control": "private, no-store" },
            });
        } catch (error) {
            return errorResponse(error, context);
        }
    };
}
