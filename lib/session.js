import { cookies, headers } from "next/headers";
import { getToken } from "next-auth/jwt";

import { ApiError } from "@/lib/error/apiError";
import { decodeAuthJwt, tokenAccessExpiresAt, tokenSessionId } from "@/lib/authJwt";
import { AUTH_ERROR, isFatalSessionError } from "@/constants/auth";
import { authService } from "@/services/auth.service";

/**
 * Server-side authentication for route handlers, server actions and server components.
 *
 * The next-auth session cookie is the access credential: an encrypted JWT carrying the user,
 * the session id (`sid`) and `accessExpiresAt` (15 min). This module only *reads* it:
 *   1. decrypt + verify iss/aud (lib/authJwt);
 *   2. reject an expired access state with 401 ACCESS_TOKEN_EXPIRED — the client refreshes
 *      through POST /api/auth/refresh and retries once;
 *   3. check the session is still active (Redis, PostgreSQL on miss). If neither can answer the
 *      request fails with 503 AUTH_UNAVAILABLE instead of pretending the user is signed out.
 * Identity always comes from the verified token, never from request parameters.
 */

export async function readAuthToken() {
    const cookieStore = await cookies();
    const headerList = await headers();

    try {
        return await getToken({
            req: { cookies: cookieStore, headers: Object.fromEntries(headerList) },
            secret: process.env.NEXTAUTH_SECRET,
            decode: decodeAuthJwt,
        });
    } catch {
        return null;
    }
}

function toSession(token) {
    return {
        user: {
            id: token.id,
            username: token.username,
            image: token.image,
            email: token.email,
            provider: token.provider,
            role: token.role,
            permissions: token.permissions,
            sessionId: tokenSessionId(token),
        },
        accessExpiresAt: tokenAccessExpiresAt(token),
    };
}

/**
 * @param {Object} [options]
 * @param {boolean} [options.validate=true]           check revocation in Redis / PostgreSQL
 * @param {boolean} [options.allowExpiredAccess=false] accept an expired access state (logout)
 * @param {boolean} [options.soft=false]               never throw: expired / unverifiable -> null
 *   (server components rendering optional personalisation)
 * @returns {Promise<{ user: object, accessExpiresAt: number } | null>} null when signed out
 * @throws ApiError 401 ACCESS_TOKEN_EXPIRED, 503 AUTH_UNAVAILABLE
 */
export async function getAuthSession({ validate = true, allowExpiredAccess = false, soft = false } = {}) {
    const token = await readAuthToken();
    const sessionId = tokenSessionId(token);

    if (!token?.id || !sessionId) return null;
    if (isFatalSessionError(token.error)) return null;

    if (!allowExpiredAccess && tokenAccessExpiresAt(token) <= Date.now()) {
        if (soft) return null;
        throw new ApiError("Your access token has expired.", 401, { code: AUTH_ERROR.ACCESS_TOKEN_EXPIRED });
    }

    if (validate) {
        let active;
        try {
            active = await authService.getSessionStatus(sessionId);
        } catch (error) {
            if (soft) return null;
            throw error;
        }

        if (!active) return null;
        if (active.userId && String(active.userId) !== String(token.id)) return null;
    }

    return toSession(token);
}

/** Like `getAuthSession` but throws `ApiError(401, UNAUTHENTICATED)` when signed out. */
export async function requireAuthSession(options) {
    const session = await getAuthSession(options);

    if (!session?.user?.id) {
        throw new ApiError("Unauthorized: please sign in to continue.", 401, { code: AUTH_ERROR.UNAUTHENTICATED });
    }

    return session;
}

/** Headers + user agent of the current request (server actions have no `req`). */
export async function getRequestMeta() {
    const headerList = await headers();

    return {
        headers: headerList,
        userAgent: headerList.get("user-agent") || null,
    };
}
