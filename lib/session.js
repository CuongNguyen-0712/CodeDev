import { cookies, headers } from "next/headers";
import { getToken } from "next-auth/jwt";

import { ApiError } from "@/lib/error/apiError";
import { isFatalSessionError } from "@/constants/auth";
import { authService } from "@/services/auth.service";

/**
 * Server-side session access for route handlers, server actions and server components.
 *
 * Use this instead of `getServerSession(authOptions)`: that one runs the `jwt` callback, which
 * may rotate the refresh token, but outside the NextAuth route the new cookie is never written
 * (next-auth's RSC path has a no-op `setCookie`), so the client keeps a token the server has
 * already retired. Here we only *decode* the JWT and check the session against Redis/PostgreSQL;
 * rotation happens exclusively in `/api/auth/session`, whose response persists the cookie.
 */

async function readToken() {
    const cookieStore = await cookies();
    const headerList = await headers();

    try {
        return await getToken({
            req: { cookies: cookieStore, headers: Object.fromEntries(headerList) },
            secret: process.env.NEXTAUTH_SECRET,
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
            sessionId: token.sessionId,
        },
    };
}

/**
 * @param {{ validate?: boolean }} [options] - `validate: false` skips the revocation check
 *   (only for paths that must work on a dying session, e.g. logout).
 * @returns {Promise<{ user: object } | null>}
 */
export async function getAuthSession({ validate = true } = {}) {
    const token = await readToken();

    if (!token?.id || !token.sessionId) return null;
    if (isFatalSessionError(token.error)) return null;

    if (validate) {
        try {
            const active = await authService.getSessionStatus(token.sessionId);
            if (!active) return null;
            if (active.userId && String(active.userId) !== String(token.id)) return null;
        } catch (error) {
            // Redis and PostgreSQL both unreachable: the JWT itself is signed and unexpired,
            // so keep serving the user rather than logging everyone out during an outage.
            console.error("[Session] Could not verify session, trusting signed token:", error?.message);
        }
    }

    return toSession(token);
}

/** Like `getAuthSession` but throws `ApiError(401)` when signed out. */
export async function requireAuthSession(options) {
    const session = await getAuthSession(options);

    if (!session?.user?.id) {
        throw new ApiError("Unauthorized: please sign in to continue.", 401);
    }

    return session;
}

/** Client IP + user agent of the current request (server actions have no `req`). */
export async function getRequestMeta() {
    const headerList = await headers();

    return {
        headers: headerList,
        userAgent: headerList.get("user-agent") || null,
    };
}
