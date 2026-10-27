import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { headers } from "next/headers";

import { ApiError } from "@/lib/error/apiError";
import { RateLimiter, rateLimiters, failureGuards } from "@/lib/rateLimit";
import { AUTH } from "@/lib/authConfig";
import { encodeAuthJwt, decodeAuthJwt, tokenAccessExpiresAt, tokenSessionId } from "@/lib/authJwt";
import {
    setRefreshCookie, clearRefreshCookie, setLinkCookie,
    readLinkIntentCookie, clearLinkIntentCookie, setLinkConflictCookie,
} from "@/lib/authCookies";
import { auditAuth } from "@/lib/authAudit";
import { invalidateUserCache } from "@/lib/cacheKeys";
import { readAuthToken } from "@/lib/session";
import { verifiedProviderEmail } from "@/lib/oauthEmail";
import { splitDisplayName, usernameBase } from "@/lib/username";

import { accountLinkService } from "@/services/accountLink.service";
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

const authError = (code) => `/auth/error?error=${code}`;
const settingsResult = (query) => `/settings?${query}#settings-signin`;

// 23505: a concurrent link inserted the same account; a second pass sees who owns it (CD409).
const linkWithRetry = (args) =>
    authService.linkProviderAccount(args).catch((err) => (err?.code === "23505" ? authService.linkProviderAccount(args) : Promise.reject(err)));

/**
 * "Connect" from Settings (plan 10.4): links the provider account to the user in the intent
 * cookie and redirects back to Settings. Returning a URL means next-auth writes no new session,
 * so the current one (cookies, `sid`, other tabs) stays exactly as it was.
 */
async function connectFromSettings({ intent, account, profile, meta }) {
    await clearLinkIntentCookie();
    const provider = account.provider;

    let active = null;
    try {
        active = await authService.getSessionStatus(intent.sessionId);
    } catch {
        return settingsResult(`linkError=Callback&provider=${provider}`);
    }
    if (!active || active.userId !== intent.userId) return settingsResult(`linkError=LinkExpired&provider=${provider}`);

    // Ownership is proven by the OAuth round trip itself; the email is only shown and audited.
    const providerEmail = await verifiedProviderEmail({ provider, account, profile }).catch(() => null);

    try {
        // One account per provider (accounts_user_provider_uq): a second one is refused.
        const { providers } = await accountLinkService.listMethods(intent.userId);
        if (providers.some((p) => p.provider === provider)) return settingsResult(`linkError=AlreadyConnected&provider=${provider}`);

        await linkWithRetry({ userId: intent.userId, provider, providerAccountId: account.providerAccountId, providerEmail });
    } catch (err) {
        if (err?.code === "CD409") {
            // Unverified account (plan 12.4): offer to switch to the owner, who signed in just now.
            const conflict = await accountLinkService.linkConflict({ userId: intent.userId, provider, providerAccountId: account.providerAccountId }).catch(() => null);
            if (conflict && !conflict.email_verified) {
                await setLinkConflictCookie({
                    userId: intent.userId, sessionId: intent.sessionId, provider,
                    ownerUsername: conflict.owner_username, deletable: conflict.deletable, purgeAfter: conflict.purge_after,
                });
            }
            return settingsResult(`linkError=OAuthAccountInUse&provider=${provider}`);
        }
        console.error("[auth] Connecting from Settings failed:", err);
        return settingsResult(`linkError=Callback&provider=${provider}`);
    }

    auditAuth("account.linked", { userId: intent.userId, sessionId: intent.sessionId, ip: meta.ip, provider, reason: "settings" });
    await invalidateUserCache(intent.userId);
    await accountLinkService.notify({ userId: intent.userId, provider, action: "connected", ip: meta.ip });
    return settingsResult(`linked=${provider}`);
}

/**
 * OAuth sign-in decision (docs/email-verification-plan.md 10.3, 11). Returns true with the signed-in
 * user stored on `user.codedev` (next-auth hands the same object to the jwt callback when there
 * is no adapter), or a URL to redirect to.
 */
async function providerSignIn({ user, account, profile }) {
    const provider = account.provider;
    const meta = await requestMeta();

    // Connect only when the browser still carries the session that pressed "Connect"; a stale
    // intent (signed out, another account since) is dropped and this is an ordinary sign-in.
    const intent = await readLinkIntentCookie();
    if (intent) {
        const current = await readAuthToken();
        if (intent.provider === provider && current?.id === intent.userId && String(tokenSessionId(current)) === intent.sessionId) {
            return connectFromSettings({ intent, account, profile, meta });
        }
        await clearLinkIntentCookie();
    }

    let email;
    try {
        email = await verifiedProviderEmail({ provider, account, profile });
    } catch (err) {
        console.error(`[auth] ${provider} email lookup failed:`, err?.message);
        return authError("OAuthCallback");
    }
    if (!email) {
        auditAuth("login.failed", { ip: meta.ip, provider, reason: "email_unverified" });
        return authError("OAuthEmailUnverified");
    }

    const fallbackName = provider === "github" ? profile?.login : email.split("@")[0];
    const names = provider === "google" && profile?.given_name
        ? { surname: profile.family_name || profile.given_name, name: profile.given_name }
        : splitDisplayName(profile?.name, fallbackName);

    try {
        const { result, user: dbUser } = await authService.signInWithProvider({
            username: usernameBase(fallbackName),
            email,
            image: user.image || null,
            accountProvider: provider,
            providerAccountId: account.providerAccountId,
            surname: names.surname,
            name: names.name,
            userAgent: meta.userAgent,
            ip: meta.ip,
        });

        if (result === "blocked") {
            auditAuth("login.failed", { userId: dbUser.id, ip: meta.ip, provider, reason: "blocked" });
            return authError("AccessDenied");
        }

        // Pending OAuth claim (plan 11.1 / 11.3 B): an account with this email exists. No session;
        // the owner confirms by the link mailed right now. The cookie only feeds /auth/link.
        if (result === "link_required" || result === "confirm_required") {
            const link = {
                provider,
                providerAccountId: account.providerAccountId,
                providerEmail: email,
                targetUserId: dbUser.id,
                targetUsername: dbUser.username,
                targetEmail: dbUser.email,
                mode: result === "confirm_required" ? "confirm" : "claim",
            };
            await setLinkCookie(link);
            auditAuth("account.link_required", { userId: dbUser.id, ip: meta.ip, provider, reason: link.mode });
            await accountLinkService.requestLinkEmail(link);
            return "/auth/link";
        }

        auditAuth("login.succeeded", { userId: dbUser.id, sessionId: dbUser.session.sessionId, ip: meta.ip, provider });

        user.codedev = dbUser;
        return true;
    } catch (err) {
        console.error(`[auth] ${provider} sign-in failed:`, err);
        return authError("Callback");
    }
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
        verifyLockAt: user.verifyLockAt ?? null,
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
        // Decides who signs in; jwt only turns the result into a session.
        async signIn({ user, account, profile }) {
            if (account?.provider === "credentials") return true;
            return providerSignIn({ user, account, profile });
        },

        async jwt({ token, user, account, trigger }) {
            // ---- Sign in: the session was committed to PostgreSQL by authService.createSession.
            if (account && user) {
                return startSession(token, account.provider === "credentials" ? user : user.codedev);
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

            // useSession().update() after the email was verified (plan 12.3): the lock comes from
            // PostgreSQL, never from the data the client sends with update().
            if (trigger === "update") {
                try {
                    token = { ...token, verifyLockAt: await authService.getVerifyLockAt(token.id) };
                } catch (err) {
                    console.error("[auth] Lock check failed:", err?.message);
                }
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
                verifyLockAt: token.verifyLockAt ?? null,
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
