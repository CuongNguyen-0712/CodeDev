import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { headers } from "next/headers";

import { ApiError } from "@/lib/error/apiError";
import { RateLimiter, rateLimiters, failureGuards } from "@/lib/rateLimit";

import { authService } from "@/services/auth.service";

import { TOKEN, SESSION_ERROR, isFatalSessionError } from "@/constants/auth";

const ACCESS_TOKEN_LIFETIME = 15 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_BUFFER = 30 * 1000;
// How often the jwt callback re-checks that the session was not revoked elsewhere.
const SESSION_CHECK_INTERVAL = 60 * 1000;
// Retry delay after a refresh that could not complete (DB hiccup / lost concurrent race).
const REFRESH_RETRY_DELAY = 5 * 1000;

const LOGIN_ERROR = {
    INVALID: "Invalid username or password.",
    UNAVAILABLE: "Sign-in is temporarily unavailable, please try again.",
};

async function currentUserAgent() {
    try {
        return (await headers()).get("user-agent");
    } catch {
        return null;
    }
}

function readHeader(req, name) {
    const h = req?.headers;
    if (!h) return null;
    return typeof h.get === "function" ? h.get(name) : h[name];
}

function applySession(token, user) {
    token.id = user.id;
    token.username = user.username;
    token.provider = user.provider;
    token.image = user.image;
    token.email = user.email;
    token.role = user.role;
    token.permissions = user.permissions;
    token.sessionId = String(user.sessionId);
    token.tokenId = String(user.tokenId);
    token.refreshToken = user.refreshToken;
    token.expiresAt = Date.now() + ACCESS_TOKEN_LIFETIME;
    token.checkedAt = Date.now();
    token.error = undefined;
    return token;
}

export const authOptions = {
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days, same as the server-side session
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
                    throw new Error(`Too many sign-in attempts. Try again in ${ipCheck.retryAfter} seconds.`);
                }

                const lock = await failureGuards.login.status(username);
                if (lock.locked) {
                    const minutes = Math.ceil(lock.retryAfter / 60);
                    throw new Error(`This account is temporarily locked after several failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
                }

                try {
                    const user = await authService.login({
                        username,
                        password,
                        userAgent: readHeader(req, "user-agent"),
                    });

                    await failureGuards.login.reset(username);
                    return user;
                } catch (err) {
                    if (err instanceof ApiError && err.status === 401) {
                        await failureGuards.login.fail(username);
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
            // ---- Sign in
            if (account && user) {
                if (account.provider === "credentials") {
                    return applySession(token, user);
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
                    const response = await authService.signUpWithProvider({
                        username: user.username || user.name,
                        email,
                        image: user.image || null,
                        accountProvider: account.provider,
                        providerAccountId: account.providerAccountId,
                        userAgent: await currentUserAgent(),
                    });

                    return applySession(token, response);
                } catch (err) {
                    console.error(`[auth] ${account.provider} sign-in failed:`, err);
                    throw new Error("Authentication failed, try again");
                }
            }

            // ---- Existing session
            if (isFatalSessionError(token.error)) {
                return token;
            }

            if (!token.sessionId || !token.refreshToken || !token.tokenId) {
                return { ...token, error: SESSION_ERROR.INVALID };
            }

            const now = Date.now();
            const expiresAt = Number(token.expiresAt) || 0;

            if (expiresAt > 0 && now < expiresAt - ACCESS_TOKEN_REFRESH_BUFFER) {
                // Access token still valid: periodically make sure the session was not
                // revoked from another device (Redis fast path, PostgreSQL fallback).
                if (now - (Number(token.checkedAt) || 0) > SESSION_CHECK_INTERVAL) {
                    try {
                        const active = await authService.getSessionStatus(token.sessionId);
                        if (!active) {
                            return { ...token, error: SESSION_ERROR.REVOKED };
                        }
                        return { ...token, checkedAt: now };
                    } catch (err) {
                        // Cannot verify right now; try again on the next poll.
                        console.error("[auth] Session check failed:", err?.message);
                    }
                }
                return token;
            }

            try {
                const response = await authService.refreshSession({
                    userId: token.id,
                    sessionId: token.sessionId,
                    tokenId: token.tokenId,
                    refreshToken: token.refreshToken
                });

                switch (response?.status) {
                    case TOKEN.REFRESH:
                        return {
                            ...token,
                            sessionId: String(response.sessionId),
                            tokenId: String(response.tokenId),
                            refreshToken: response.refreshToken,
                            expiresAt: now + ACCESS_TOKEN_LIFETIME,
                            checkedAt: now,
                            error: undefined,
                        };

                    case TOKEN.INVALID:
                        return { ...token, error: SESSION_ERROR.INVALID };

                    case TOKEN.EXPIRED:
                        return { ...token, error: SESSION_ERROR.EXPIRED };

                    case TOKEN.REVOKED:
                        return { ...token, error: SESSION_ERROR.REVOKED };

                    // Another request rotated this token but its result is not readable yet.
                    // Keep the current token and retry shortly: it stays valid during the grace
                    // window, and extending it to a full lifetime would make the next refresh a
                    // replay (which revokes the session).
                    case TOKEN.CONCURRENT:
                    case TOKEN.FAILED:
                    default:
                        return {
                            ...token,
                            expiresAt: now + REFRESH_RETRY_DELAY + ACCESS_TOKEN_REFRESH_BUFFER,
                        };
                }
            } catch (err) {
                console.error("[auth] JWT refresh failed:", err);

                return {
                    ...token,
                    expiresAt: now + REFRESH_RETRY_DELAY + ACCESS_TOKEN_REFRESH_BUFFER,
                };
            }
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
                    sessionId: token.sessionId,
                },
                error: token.error,
            };
        },
    },
    pages: {
        signIn: "/auth",
        error: "/auth/error",
    }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
