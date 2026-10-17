/**
 * Authentication policy. Every duration can be overridden per environment.
 *
 *   AUTH_ACCESS_TOKEN_TTL_SECONDS        access state in the session JWT        (default 15 min)
 *   AUTH_SESSION_IDLE_TTL_SECONDS        session ends after this much inactivity (default 14 days)
 *   AUTH_SESSION_ABSOLUTE_TTL_SECONDS    hard session lifetime, never extended   (default 30 days)
 *   AUTH_REFRESH_RECOVERY_TTL_SECONDS    how long a lost refresh response can be replayed with
 *                                        the same Idempotency-Key                (default 2 min)
 *   AUTH_SESSION_CACHE_MAX_TTL_SECONDS   longest a Redis session entry is trusted before
 *                                        PostgreSQL is asked again               (default 5 min)
 *   AUTH_JWT_ISSUER / AUTH_JWT_AUDIENCE  claims stamped on and required from session JWTs
 *   AUTH_ALLOWED_ORIGINS                 extra origins (comma separated) allowed to call
 *                                        refresh / logout, besides NEXTAUTH_URL
 *   AUTH_ACCEPT_LEGACY_JWT               "false" rejects session JWTs minted before iss/aud
 *                                        were added (safe once 30 days have passed)
 */

const seconds = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

export const AUTH = {
    ACCESS_TTL_SEC: seconds("AUTH_ACCESS_TOKEN_TTL_SECONDS", 15 * 60),
    SESSION_IDLE_TTL_SEC: seconds("AUTH_SESSION_IDLE_TTL_SECONDS", 14 * 24 * 60 * 60),
    SESSION_ABSOLUTE_TTL_SEC: seconds("AUTH_SESSION_ABSOLUTE_TTL_SECONDS", 30 * 24 * 60 * 60),
    REFRESH_RECOVERY_TTL_SEC: seconds("AUTH_REFRESH_RECOVERY_TTL_SECONDS", 120),
    SESSION_CACHE_MAX_TTL_SEC: seconds("AUTH_SESSION_CACHE_MAX_TTL_SECONDS", 5 * 60),
    // How often the session JWT callback re-checks revocation (on /api/auth/session).
    SESSION_CHECK_INTERVAL_MS: 60 * 1000,
    ISSUER: process.env.AUTH_JWT_ISSUER || "codedev",
    AUDIENCE: process.env.AUTH_JWT_AUDIENCE || "codedev-web",
    ACCEPT_LEGACY_JWT: process.env.AUTH_ACCEPT_LEGACY_JWT !== "false",
};

/** HTTPS deployments get `Secure` cookies and the `__Host-` / `__Secure-` prefixes. */
export function isSecureDeployment() {
    return (process.env.NEXTAUTH_URL || "").startsWith("https://") || Boolean(process.env.VERCEL);
}

// `__Host-` requires Secure + Path=/ + no Domain, so plain-http development uses a bare name.
export const refreshCookieName = () => (isSecureDeployment() ? "__Host-cd_refresh" : "cd_refresh");

// Must match next-auth's own session cookie name.
export const sessionCookieName = () => (isSecureDeployment() ? "__Secure-next-auth.session-token" : "next-auth.session-token");

export function allowedOrigins() {
    const origins = new Set();
    for (const value of [process.env.NEXTAUTH_URL, ...(process.env.AUTH_ALLOWED_ORIGINS || "").split(",")]) {
        try {
            if (value && value.trim()) origins.add(new URL(value.trim()).origin);
        } catch {
            // ignore malformed entries
        }
    }
    return origins;
}
