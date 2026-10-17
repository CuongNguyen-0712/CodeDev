import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { headers } from "next/headers";

import { ApiError } from "@/lib/error/apiError";
import { RateLimiter, rateLimiters, failureGuards } from "@/lib/rateLimit";
import { AUTH } from "@/lib/authConfig";
import { encodeAuthJwt, decodeAuthJwt, tokenAccessExpiresAt, tokenSessionId } from "@/lib/authJwt";
import { setRefreshCookie, clearRefreshCookie } from "@/lib/authCookies";
import { auditAuth } from "@/lib/authAudit";

import { authService } from "@/services/auth.service";

import { SESSION_ERROR, isFatalSessionError } from "@/constants/auth";

/**
 * Auth model:
 *   - next-auth session cookie = access credential (encrypted JWT: user, `sid`, `accessExpiresAt`,
 *     iss/aud). Valid for AUTH_ACCESS_TOKEN_TTL_SECONDS; renewed only by POST /api/auth/refresh.
 *   - refresh token = opaque random token in its own HttpOnly cookie (lib/authCookies), never in
 *     the JWT, JSON, storage or logs. Rotated only by /api/auth/refresh (one PG transaction).
 *   - This jwt callback therefore never rotates anything; on /api/auth/session it only re-checks
 *     revocation every SESSION_CHECK_INTERVAL_MS and upgrades legacy cookies.
 */

const LOGIN_ERROR = {
    INVALID: "Invalid username or password.",
    UNAVAILABLE: "Sign-in is temporarily unavailable, please try again.",
};

async function requestMeta() {
    try {
        const list = await headers();
        return { userAgent: list.get("user-agent"), ip: RateLimiter.getClientIp(list) };
    } catch {
        return { userAgent: null, ip: null };
    }
}

function readHeader(req, name) {
    const h = req?.headers;
    if (!h) return null;
    return typeof h.get === "function" ? h.get(name) : h[name];
}

// Claims of a freshly signed-in session. The refresh token itself goes to its cookie only.
async function startSession(token, user) {
    const session = user.session;
    await setRefreshCookie(session.refreshToken, session.refreshExpiresAt);

    const now = Date.now();
    return {
        name: token.name,
        email: user.email,
        picture: token.picture,
        id: user.id,
        username: user.username,
        provider: user.provider,
        image: user.image,
        role: user.role,
        permissions: user.permissions,
        sid: session.sessionId,
        accessExpiresAt: now + AUTH.ACCESS_TTL_SEC * 1000,
        checkedAt: now,
    };
}

export const authOptions = {
    session: {
        strategy: "jwt",
        // The session JWT cookie never outlives the session's idle window.
        maxAge: AUTH.SESSION_IDLE_TTL_SEC,
    },

    jwt: {
        encode: encodeAuthJwt,
        decode: decodeAuthJwt,
    },

    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
            authorization: {
                params: {
                    scope: "read:user user:email",
                },
            },
        }),

        GoogleProvider({
            clientId: process.env.GOOGLE_ID,
            clientSecret: process.env.GOOGLE_SECRET,
            authorization: {
                params: {
                    scope: "openid email profile",
                },
            }
        }),

        CredentialsProvider({
            name: "credentials",
            credentials: {
                username: {},
                password: {},
            },
            // Thrown messages are shown to the user (signIn(...).error), so keep them safe.
            async authorize(credentials, req) {
                const username = String(credentials?.username || "").trim();
                const password = String(credentials?.password || "");

                if (!username || !password) {
                    throw new Error("Enter your username and password.");
                }

                const ip = RateLimiter.getClientIp(req);

                const ipCheck = await rateLimiters.auth.check(ip);
                if (!ipCheck.success) {
                    auditAuth("login.failed", { ip, reason: "rate_limited" });
                    throw new Error(`Too many sign-in attempts. Try again in ${ipCheck.retryAfter} seconds.`);
                }

                const lock = await failureGuards.login.status(username);
                if (lock.locked) {
                    auditAuth("login.failed", { ip, reason: "account_locked" });
                    const minutes = Math.ceil(lock.retryAfter / 60);
                    throw new Error(`This account is temporarily locked after several failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
                }

                try {
                    const user = await authService.login({
                        username,
                        password,
                        userAgent: readHeader(req, "user-agent"),
                        ip,
                    });

                    await failureGuards.login.reset(username);
                    auditAuth("login.succeeded", { userId: user.id, sessionId: user.session.sessionId, ip, provider: "credentials" });
                    return user;
                } catch (err) {
                    if (err instanceof ApiError && err.status === 401) {
                        await failureGuards.login.fail(username);
                        auditAuth("login.failed", { ip, reason: "invalid_credentials" });
                        throw new Error(LOGIN_ERROR.INVALID);
                    }

                    if (err instanceof ApiError && err.status < 500) {
                        throw new Error(err.message);
                    }

                    console.error("[auth] Credentials sign-in failed:", err);
                    throw new Error(LOGIN_ERROR.UNAVAILABLE);
                }
            }
        }),
    ],

    callbacks: {
        async jwt({ token, user, account, profile }) {
            // ---- Sign in: the session was committed to PostgreSQL by authService.createSession.
            if (account && user) {
                if (account.provider === "credentials") {
                    return startSession(token, user);
                }

                const email =
                    user.email ||
                    profile?.email ||
                    profile?.emails?.[0]?.value;

                if (!email) {
                    // Surfaces as /auth/error?error=Callback
                    throw new Error("The provider did not share an email address.");
                }

                try {
                    const meta = await requestMeta();
                    const response = await authService.signUpWithProvider({
                        username: user.username || user.name,
                        email,
                        image: user.image || null,
                        accountProvider: account.provider,
                        providerAccountId: account.providerAccountId,
                        userAgent: meta.userAgent,
                        ip: meta.ip,
                    });

                    auditAuth("login.succeeded", { userId: response.id, sessionId: response.session.sessionId, ip: meta.ip, provider: account.provider });
                    return startSession(token, response);
                } catch (err) {
                    console.error(`[auth] ${account.provider} sign-in failed:`, err);
                    throw new Error("Authentication failed, try again");
                }
            }

            // ---- Existing session (GET/POST /api/auth/session)
            if (isFatalSessionError(token.error)) {
                return token;
            }

            // Cookies minted before the refresh token moved out of the JWT: move it to its own
            // cookie once and drop it from the JWT (it is HMAC-hashed in PG, so it keeps working).
            if (token.refreshToken) {
                await setRefreshCookie(token.refreshToken, Date.now() + AUTH.SESSION_IDLE_TTL_SEC * 1000);
                token = {
                    ...token,
                    sid: tokenSessionId(token),
                    accessExpiresAt: tokenAccessExpiresAt(token),
                };
                delete token.refreshToken;
                delete token.tokenId;
                delete token.sessionId;
                delete token.expiresAt;
            }

            const sessionId = tokenSessionId(token);
            if (!sessionId) {
                return { ...token, error: SESSION_ERROR.INVALID };
            }

            const now = Date.now();
            if (now - (Number(token.checkedAt) || 0) > AUTH.SESSION_CHECK_INTERVAL_MS) {
                try {
                    const active = await authService.getSessionStatus(sessionId);
                    if (!active) {
                        return { ...token, error: SESSION_ERROR.REVOKED };
                    }
                    return { ...token, checkedAt: now };
                } catch (err) {
                    // Cannot verify right now (503): keep the session, check again next poll.
                    console.error("[auth] Session check failed:", err?.message);
                }
            }

            return token;
        },

        async session({ token }) {
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
                // When the access state ends; the client refreshes shortly before it.
                accessExpiresAt: tokenAccessExpiresAt(token),
                error: token.error,
            };
        },
    },

    events: {
        // next-auth's own sign-out also ends the server session and drops the refresh cookie,
        // so a client that skips PATCH /api/user/logout cannot leave a live session behind.
        async signOut({ token }) {
            const sessionId = tokenSessionId(token);
            if (token?.id && sessionId) {
                await authService.logout({ userId: token.id, sessionId }).catch((err) => {
                    console.error("[auth] signOut revoke failed:", err?.message);
                });
            }
            await clearRefreshCookie().catch(() => { });
        },
    },

    pages: {
        signIn: "/auth",
        error: "/auth/error",
    }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
