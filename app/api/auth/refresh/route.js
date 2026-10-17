import { NextResponse } from "next/server";

import { ApiError, errorResponse } from "@/lib/error/apiError";
import { assertSameOrigin } from "@/lib/requestGuard";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { readAuthToken } from "@/lib/session";
import { readRefreshCookie, setRefreshCookie, clearRefreshCookie, writeSessionCookie } from "@/lib/authCookies";
import { tokenSessionId } from "@/lib/authJwt";
import { AUTH } from "@/lib/authConfig";
import { AUTH_ERROR, TOKEN, isFatalSessionError } from "@/constants/auth";

import { authService } from "@/services/auth.service";

export const dynamic = "force-dynamic";

// Client-generated, reused for every retry of the same refresh (see lib/authRefresh.js).
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/auth/refresh — the only place a refresh token is rotated.
 *
 * Request: refresh cookie + session JWT cookie, `Idempotency-Key` header, same-origin.
 * 200: `{ success, data: { sessionId, accessExpiresAt, refreshExpiresAt, sessionExpiresAt, recovered } }`
 *      + Set-Cookie for the rotated refresh token and the renewed session JWT. The refresh token
 *      is never in the body.
 * 401: `{ success: false, code, message }` (code in TERMINAL_REFRESH_ERRORS) — sign in again.
 * 503: rotation outcome unknown (commit not acknowledged) — retry with the SAME key; if it did
 *      commit, the retry gets the same token back instead of tripping replay detection.
 */
export async function POST(req) {
    try {
        assertSameOrigin(req);

        const idempotencyKey = req.headers.get("idempotency-key") || "";
        if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
            throw new ApiError("An Idempotency-Key header is required.", 400, { code: AUTH_ERROR.IDEMPOTENCY_KEY_REQUIRED });
        }

        const ip = RateLimiter.getClientIp(req);
        const limit = await rateLimiters.refresh.limitRequest(req, ip);
        if (!limit.allowed) return limit.response;

        const token = await readAuthToken();
        const sessionId = tokenSessionId(token);

        if (!token?.id || !sessionId || isFatalSessionError(token.error)) {
            await clearRefreshCookie();
            throw new ApiError("Please sign in again.", 401, { code: AUTH_ERROR.UNAUTHENTICATED });
        }

        // Legacy session JWTs still carry the refresh token until their first upgrade.
        const refreshToken = (await readRefreshCookie()) || token.refreshToken || null;
        if (!refreshToken) {
            throw new ApiError("Please sign in again.", 401, { code: AUTH_ERROR.REFRESH_TOKEN_MISSING });
        }

        let result;
        try {
            result = await authService.rotateRefreshToken({ refreshToken, idempotencyKey, expectedSessionId: sessionId, ip });
        } catch (error) {
            if (error?.commitUncertain) {
                throw new ApiError("The session refresh could not be confirmed. Please retry.", 503, { expose: true, retryAfter: 1 });
            }
            throw error;
        }

        if (!result.ok) {
            await clearRefreshCookie();
            return NextResponse.json(
                { success: false, message: result.message, code: result.code },
                { status: 401, headers: NO_STORE }
            );
        }

        // PostgreSQL has committed: from here on the response must succeed.
        await setRefreshCookie(result.refreshToken, result.refreshExpiresAt);

        const now = Date.now();
        const accessExpiresAt = now + AUTH.ACCESS_TTL_SEC * 1000;
        const renewed = { ...token, sid: result.sessionId, accessExpiresAt, checkedAt: now };
        for (const legacy of ["refreshToken", "tokenId", "sessionId", "expiresAt", "error"]) delete renewed[legacy];
        await writeSessionCookie(renewed);

        return NextResponse.json({
            success: true,
            data: {
                sessionId: result.sessionId,
                accessExpiresAt,
                refreshExpiresAt: result.refreshExpiresAt,
                sessionExpiresAt: result.absoluteExpiresAt,
                recovered: result.status === TOKEN.RECOVERED,
            },
        }, { status: 200, headers: { ...NO_STORE, ...limit.headers } });
    } catch (error) {
        return errorResponse(error, "api/auth/refresh");
    }
}
