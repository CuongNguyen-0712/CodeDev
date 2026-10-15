import { userDb } from "@/db/user.db";
import bycrypt from "bcryptjs";
import { ApiError } from "@/lib/error/apiError";
import { generateSonyflake } from "@/lib/sonyflake";
import { hashRefreshToken, generateRefreshToken, compareTokenHash, sealToken, openToken } from "@/lib/auth.util";
import { ulid } from "ulid";
import { TOKEN } from "@/constants/auth";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL } from "@/lib/cacheKeys";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const INACTIVE_CACHE_TTL_SEC = 60;
const CONCURRENT_POLL_ATTEMPTS = 6;
const CONCURRENT_POLL_DELAY_MS = 150;

// Per-instance dedupe of refreshes for the same token (several tabs / requests at once).
const pendingRefreshPromises = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sessionTtlSeconds(expiresAt) {
    const remaining = Math.floor((Number(expiresAt) - Date.now()) / 1000);
    return Math.max(1, Math.min(remaining, TTL.SESSION));
}

async function cacheActiveSession({ sessionId, userId, expiresAt }) {
    const data = { sessionId: String(sessionId), userId, status: "active", expiresAt: Number(expiresAt) };
    await redis.set(cacheKeys.session(sessionId), data, { ex: sessionTtlSeconds(expiresAt) });
}

/** Removes every cached trace of a session and remembers it as inactive for a short while. */
async function purgeSession(sessionId) {
    pendingRefreshPromises.forEach((_, key) => {
        if (key.startsWith(`${sessionId}:`)) pendingRefreshPromises.delete(key);
    });

    try {
        await redis.del(cacheKeys.sessionRotation(sessionId));
        await redis.set(cacheKeys.session(sessionId), { sessionId: String(sessionId), status: "inactive" }, { ex: INACTIVE_CACHE_TTL_SEC });
    } catch (error) {
        console.error("[Session] purge failed:", error?.message);
    }
}

/**
 * Rotation grace cache: lets concurrent refreshes with the *previous* token receive the token
 * that was just issued. The new refresh token is stored sealed (AES-GCM) and is only released
 * to a caller that proves possession of the old refresh token.
 */
async function readRotation({ sessionId, tokenId, refreshToken }) {
    const cached = await redis.get(cacheKeys.sessionRotation(sessionId));
    if (!cached || String(cached.oldTokenId) !== String(tokenId)) return null;
    if (!compareTokenHash(hashRefreshToken(refreshToken), cached.oldTokenHash)) return null;

    const plain = openToken(cached.sealed);
    if (!plain) return null;

    return {
        sessionId: cached.sessionId,
        tokenId: cached.tokenId,
        refreshToken: plain,
        status: TOKEN.REFRESH,
    };
}

function describeUserAgent(userAgent) {
    const ua = String(userAgent || "");
    if (!ua) return { browser: "Unknown browser", os: "Unknown device" };

    const browser =
        /Edg\//.test(ua) ? "Edge" :
            /OPR\/|Opera/.test(ua) ? "Opera" :
                /Firefox\//.test(ua) ? "Firefox" :
                    /Chrome\//.test(ua) ? "Chrome" :
                        /Safari\//.test(ua) ? "Safari" : "Browser";

    const os =
        /Windows/.test(ua) ? "Windows" :
            /Android/.test(ua) ? "Android" :
                /iPhone|iPad|iPod/.test(ua) ? "iOS" :
                    /Mac OS X/.test(ua) ? "macOS" :
                        /Linux/.test(ua) ? "Linux" : "Unknown device";

    return { browser, os };
}

export const authService = {
    login: async (data) => {
        const { username, password, userAgent = null } = data;

        const response = await userDb.login({ username });

        if (!response || response.rowCount === 0) {
            throw new ApiError("Invalid credentials, try again", 401);
        }

        const user = response.rows[0];

        const isValid = await bycrypt.compare(password, user.password);

        if (!isValid) {
            throw new ApiError("Invalid credentials, try again", 401);
        }

        delete user.password;

        const permissions = await userDb.getPermissions({ userId: user.id });

        if (!permissions || permissions.rowCount === 0) {
            throw new ApiError("No permissions found for the user", 403);
        }

        user.permissions = permissions.rows.map(p => p.permissions);

        const session = await authService.createSession({ userId: user.id, userAgent });

        user.sessionId = session.sessionId;
        user.tokenId = session.tokenId;
        user.refreshToken = session.refreshToken;

        return user;
    },

    signUpWithProvider: async (data) => {
        const { userAgent = null, ...profile } = data;
        const id = generateSonyflake();
        const public_id = ulid();

        const response = await userDb.signUpWithProvider({ ...profile, id, public_id });

        if (!response || response.rowCount === 0) {
            throw new ApiError("Authentication failed, try again", 500);
        }

        const user = response.rows[0];

        const permissions = await userDb.getPermissions({ userId: user.id });

        if (!permissions || permissions.rowCount === 0) {
            throw new ApiError("No permissions found for the user", 403);
        }

        user.permissions = permissions.rows.map(p => p.permissions);

        const session = await authService.createSession({ userId: user.id, userAgent });

        user.sessionId = session.sessionId;
        user.refreshToken = session.refreshToken;
        user.tokenId = session.tokenId;

        return user;
    },

    createSession: async (data) => {
        const { userId, userAgent = null } = data;
        const sessionId = generateSonyflake();
        const tokenId = generateSonyflake();

        const refreshToken = generateRefreshToken();
        const refreshTokenHash = hashRefreshToken(refreshToken);

        const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

        const response = await userDb.createSession({
            sessionId,
            tokenId,
            userId,
            refreshTokenHash,
            expiresAt,
            userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
        });

        if (!response || response.rowCount === 0) {
            throw new ApiError("Failed to create session, try again", 500);
        }

        const session = response.rows[0];

        await cacheActiveSession({ sessionId: session.sessionId, userId, expiresAt: expiresAt.getTime() });

        return {
            sessionId: String(session.sessionId),
            tokenId: String(session.tokenId),
            refreshToken: refreshToken,
        };
    },

    /**
     * Rotates the refresh token. Safe to call concurrently for the same token:
     * - same instance: requests share one in-flight promise;
     * - other instances: the DB row lock serializes them and the loser reads the freshly
     *   issued token from the sealed rotation cache (CONCURRENT -> REFRESH).
     * Replaying a rotated token after the grace window revokes the whole session.
     */
    refreshSession: async (data) => {
        const { sessionId, tokenId, userId, refreshToken } = data;

        // 1. Another request already rotated this exact token.
        try {
            const rotated = await readRotation({ sessionId, tokenId, refreshToken });
            if (rotated) return rotated;
        } catch (err) {
            console.error("[Session] Rotation cache read failed:", err?.message);
        }

        // 2. Same-instance dedupe.
        const flightKey = `${sessionId}:${tokenId}`;
        if (pendingRefreshPromises.has(flightKey)) {
            return pendingRefreshPromises.get(flightKey);
        }

        // 3. Atomic refresh in the DB (row-level locks).
        const refreshPromise = (async () => {
            const updatedSession = await userDb.refreshSession({ sessionId, tokenId, userId, refreshToken });

            if (!updatedSession) {
                return { status: TOKEN.FAILED };
            }

            if (updatedSession.status === TOKEN.REFRESH) {
                const result = {
                    sessionId: String(updatedSession.sessionId),
                    tokenId: String(updatedSession.tokenId),
                    refreshToken: updatedSession.refreshToken,
                    status: TOKEN.REFRESH,
                };

                await redis.set(cacheKeys.sessionRotation(sessionId), {
                    sessionId: result.sessionId,
                    tokenId: result.tokenId,
                    sealed: sealToken(result.refreshToken),
                    oldTokenId: String(tokenId),
                    oldTokenHash: hashRefreshToken(refreshToken),
                    timestamp: Date.now(),
                }, { ex: TTL.SESSION_ROTATION });

                // Keep the cached session alive with its real expiry.
                const cached = await redis.get(cacheKeys.session(sessionId));
                await cacheActiveSession({
                    sessionId: result.sessionId,
                    userId,
                    expiresAt: cached?.expiresAt || Date.now() + SESSION_LIFETIME_MS,
                });

                return result;
            }

            if (updatedSession.status === TOKEN.CONCURRENT) {
                // The winner may not have written the rotation cache yet: poll briefly.
                for (let attempt = 0; attempt < CONCURRENT_POLL_ATTEMPTS; attempt++) {
                    const rotated = await readRotation({ sessionId, tokenId, refreshToken }).catch(() => null);
                    if (rotated) return rotated;
                    await sleep(CONCURRENT_POLL_DELAY_MS);
                }

                return { sessionId: String(sessionId), status: TOKEN.CONCURRENT };
            }

            if ([TOKEN.REVOKED, TOKEN.INVALID, TOKEN.EXPIRED].includes(updatedSession.status)) {
                await purgeSession(sessionId);
            }

            if (updatedSession.reuseDetected) {
                console.warn(`[Session] Refresh token reuse detected, session ${sessionId} revoked.`);
                publishToUser(userId, events.SESSION_REVOKED, {
                    sessionIds: [String(sessionId)],
                    reason: "reuse",
                });
            }

            return { status: updatedSession.status };
        })().finally(() => {
            pendingRefreshPromises.delete(flightKey);
        });

        pendingRefreshPromises.set(flightKey, refreshPromise);
        return refreshPromise;
    },

    logout: async (data) => {
        const { userId, sessionId } = data;

        await purgeSession(sessionId);

        const response = await userDb.logout({ userId, sessionId });

        if (!response || response.rowCount === 0) {
            return null;
        }

        // Other tabs of this session sign out immediately.
        publishToUser(userId, events.SESSION_REVOKED, {
            sessionIds: [String(sessionId)],
            reason: "logout",
        });

        return response.rows[0];
    },

    /**
     * @returns {Promise<object|null>} the active session, or null when it is revoked / expired / unknown.
     * @throws when neither Redis nor PostgreSQL can answer (callers decide whether to fail open).
     */
    getSessionStatus: async (sessionId) => {
        if (!sessionId) return null;

        const cached = await redis.get(cacheKeys.session(sessionId));
        if (cached?.status === "inactive") return null;
        if (cached?.status === "active") {
            if (!cached.expiresAt || cached.expiresAt > Date.now()) return cached;
            return null;
        }

        // Cache miss (evicted, Redis restarted or down): PostgreSQL is the source of truth.
        const response = await userDb.getSessionById({ sessionId });
        const row = response?.rows?.[0];

        const expiresAt = row ? new Date(row.expires_at).getTime() : 0;
        if (!row || row.is_revoked || expiresAt <= Date.now()) {
            await redis.set(cacheKeys.session(sessionId), { sessionId: String(sessionId), status: "inactive" }, { ex: INACTIVE_CACHE_TTL_SEC });
            return null;
        }

        const active = {
            sessionId: String(row.session_id),
            userId: row.public_id,
            status: "active",
            expiresAt,
        };

        await cacheActiveSession(active);
        return active;
    },

    listSessions: async ({ userId, currentSessionId }) => {
        const response = await userDb.listSessions({ userId });

        return (response?.rows || []).map((row) => ({
            id: row.session_id,
            ...describeUserAgent(row.user_agent),
            createdAt: row.created_at,
            lastActiveAt: row.updated_at,
            expiresAt: row.expires_at,
            current: String(row.session_id) === String(currentSessionId),
        }));
    },

    revokeSession: async ({ userId, sessionId }) => {
        const response = await userDb.revokeSession({ userId, sessionId });

        if (!response || response.rowCount === 0) {
            throw new ApiError("Session not found or already signed out", 404);
        }

        await purgeSession(sessionId);
        publishToUser(userId, events.SESSION_REVOKED, {
            sessionIds: [String(sessionId)],
            reason: "revoked",
        });

        return true;
    },

    revokeOtherSessions: async ({ userId, currentSessionId }) => {
        const response = await userDb.revokeOtherSessions({ userId, keepSessionId: currentSessionId });
        const revoked = (response?.rows || []).map((row) => String(row.session_id));

        await Promise.all(revoked.map((id) => purgeSession(id)));

        if (revoked.length > 0) {
            publishToUser(userId, events.SESSION_REVOKED, {
                sessionIds: revoked,
                reason: "revoked",
            });
        }

        return revoked.length;
    },
};

export default authService;
