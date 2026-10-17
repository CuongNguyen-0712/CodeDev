import { ApiError } from "@/lib/error/apiError";
import { allowedOrigins } from "@/lib/authConfig";
import { AUTH_ERROR } from "@/constants/auth";

/**
 * CSRF guard for cookie-authenticated state changes (refresh, logout, session revocation).
 *
 * Accepts the request only when the browser says it comes from our own origin:
 *   - `Origin` equals NEXTAUTH_URL's origin, an AUTH_ALLOWED_ORIGINS entry, or the request's own
 *     origin (a cross-site page cannot make the browser send our Host with its own Origin);
 *   - without `Origin`, `Sec-Fetch-Site: same-origin` is required.
 * Combined with SameSite cookies and the custom headers these endpoints require, a cross-site
 * form or fetch cannot trigger them.
 */
export function assertSameOrigin(req) {
    const headers = req.headers;
    const origin = headers.get("origin");
    const allowed = allowedOrigins();

    let requestOrigin = null;
    try {
        requestOrigin = new URL(req.url).origin;
    } catch {
        requestOrigin = null;
    }
    if (requestOrigin) allowed.add(requestOrigin);

    if (origin) {
        if (origin !== "null" && allowed.has(origin)) return;
        throw new ApiError("Cross-origin request rejected", 403, { code: AUTH_ERROR.ORIGIN_REJECTED });
    }

    if (headers.get("sec-fetch-site") === "same-origin") return;

    throw new ApiError("Cross-origin request rejected", 403, { code: AUTH_ERROR.ORIGIN_REJECTED });
}

export default assertSameOrigin;
