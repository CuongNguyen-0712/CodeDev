import { NextResponse } from "next/server";

import { getAuthSession, requireAuthSession } from "@/lib/session";
import { ApiError, errorResponse } from "@/lib/error/apiError";
import { assertSameOrigin } from "@/lib/requestGuard";

/**
 * Route handler wrapper (docs/api-conventions.md):
 *   - auth: "required" (default; `true` too) -> 401 when signed out; "optional" -> guests get
 *     userId null, an expired access token still gets 401 so the client refreshes; "none" -> the
 *     session is not read (the only mode that may send a public Cache-Control);
 *   - allowLocked: also for an account past its verify grace period (plan 12.3);
 *   - csrf: same-origin check for cookie-authenticated writes;
 *   - limiter: RateLimiter keyed by user id (client IP for guests);
 *   - responses are `{ success: true, data }` with `cacheControl` (default private, no-store);
 *     errors go through errorResponse (5xx details are logged, not returned).
 *
 * @param {(ctx: { req: Request, userId: string|null, session: object|null, params: object }) => Promise<any>} handler
 */
export function apiRoute(handler, {
    context, auth = "required", allowLocked = false, csrf = false, limiter = null, status = 200,
    cacheControl = "private, no-store",
} = {}) {
    const mode = auth === true ? "required" : auth;

    return async (req, routeContext) => {
        try {
            if (csrf) assertSameOrigin(req);

            const session = mode === "required"
                ? await requireAuthSession({ allowLocked })
                : mode === "optional" ? await getAuthSession({ allowLocked }) : null;
            const userId = session?.user?.id ?? null;

            let limitHeaders = {};
            if (limiter) {
                const limit = await limiter.limitRequest(req, userId);
                if (!limit.allowed) return limit.response;
                limitHeaders = limit.headers || {};
            }

            const params = (await routeContext?.params) || {};
            const data = await handler({ req, userId, session, params });
            if (data instanceof Response) return data;

            return NextResponse.json({ success: true, data: data ?? null }, {
                status,
                headers: { ...limitHeaders, "Cache-Control": cacheControl },
            });
        } catch (error) {
            return errorResponse(error, context);
        }
    };
}

// Public ids in query strings (course slugs, ULIDs, UUIDs); searchParams already decoded them.
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;

/** `value` when it is a public id, else ApiError 400. */
export function requirePublicId(value, label = "id") {
    if (!value || !PUBLIC_ID.test(value)) throw new ApiError(`Invalid ${label}`, 400);
    return value;
}
