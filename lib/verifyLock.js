/**
 * Unverified accounts are locked once their 7-day grace period ends (docs/email-verification-plan.md
 * 12.3). The session JWT carries `verifyLockAt` (epoch ms, null once verified), set at sign-in and
 * re-read from PostgreSQL on refresh and on useSession().update(), so proxy.js needs no database.
 */
export const VERIFY_REQUIRED_PATH = "/auth/verify-required";

export const isVerifyLocked = (token, now = Date.now()) => Number(token?.verifyLockAt) > 0 && now >= Number(token.verifyLockAt);

/**
 * `next` for the lock page: same-origin paths only, so it cannot become an open redirect. /auth
 * pages (sign-in, this page) are where a 403 lands right after signing in: go home instead.
 */
export const safeNextPath = (value) => (typeof value === "string" && /^\/(?![/\\])/.test(value) && !/^\/auth(\/|\?|$)/.test(value) ? value : "/home");

/**
 * Client: an API answered 403 EMAIL_VERIFICATION_REQUIRED. Never from /auth pages: the lock page
 * itself, and /auth/verify-email must finish verifying (proxy.js handles the rest of them).
 */
export function goToVerifyRequired() {
    if (typeof window === "undefined" || /^\/auth(\/|$)/.test(window.location.pathname)) return;
    const next = window.location.pathname + window.location.search;
    // Called from the API clients, outside React: a full load also drops stale React Query data.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${VERIFY_REQUIRED_PATH}?next=${encodeURIComponent(next)}`);
}
