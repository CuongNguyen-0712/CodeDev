import { userDb } from "@/db/user.db";
import bycrypt from "bcryptjs";
import { ApiError } from "@/lib/error/apiError";
import { generateSonyflake } from "@/lib/sonyflake";
import { hashRefreshToken, generateRefreshToken } from "@/lib/auth.util";
import { ulid } from "ulid";
import { TOKEN } from "@/constants/auth";
import { redis } from "@/lib/cache";

const ROTATION_CACHE_TTL_MS = 120_000; // 2 minutes (120 seconds)
const ROTATION_CACHE_TTL_SEC = 120;
const SESSION_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

const pendingRefreshPromises = new Map();

// Helper functions for Redis Session Cache
const getRedisSessionKey = (sessionId) => `session:${sessionId}`;
const getRedisRotationKey = (sessionId) => `session:rotation:${sessionId}`;

export const authService = {
    login: async (data) => {
        const { username, password } = data;

        const response = await userDb.login({ username });

        if (!response || response.rowCount === 0) {
            throw new ApiError("Invalid credentials, try again", 401);
        }

        const user = response.rows[0];

        const isValid = await bycrypt.compare(password, user.password);

        if (!isValid) {
            throw new ApiError("Invalid credentials, try again", 401);
        }

        const permissions = await userDb.getPermissions({ userId: user.id });

        if (!permissions || permissions.rowCount === 0) {
            throw new ApiError("No permissions found for the user", 403);
        }

        user.permissions = permissions.rows.map(p => p.permissions);

        const session = await authService.createSession({ userId: user.id });

        user.sessionId = session.sessionId;
        user.tokenId = session.tokenId;
        user.refreshToken = session.refreshToken;

        return user;
    },

    signUpWithProvider: async (data) => {
        const id = generateSonyflake();
        const public_id = ulid();

        const response = await userDb.signUpWithProvider({ ...data, id, public_id });

        if (!response || response.rowCount === 0) {
            throw new ApiError("Authentication failed, try again", 500);
        }

        const user = response.rows[0];

        const permissions = await userDb.getPermissions({ userId: user.id });

        if (!permissions || permissions.rowCount === 0) {
            throw new ApiError("No permissions found for the user", 403);
        }

        user.permissions = permissions.rows.map(p => p.permissions);

        const session = await authService.createSession({ userId: user.id });

        user.sessionId = session.sessionId;
        user.refreshToken = session.refreshToken;
        user.tokenId = session.tokenId;

        return user;
    },

    createSession: async (data) => {
        const { userId } = data;
        const sessionId = generateSonyflake();
        const tokenId = generateSonyflake();

        const refreshToken = generateRefreshToken();
        const refreshTokenHash = hashRefreshToken(refreshToken);

        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        const response = await userDb.createSession({ sessionId, tokenId, userId, refreshTokenHash, expiresAt });

        if (!response || response.rowCount === 0) {
            throw new ApiError("Failed to create session, try again", 500);
        }

        const session = response.rows[0];

        const sessionData = {
            sessionId: session.sessionId,
            tokenId: session.tokenId,
            userId,
            status: "active",
            createdAt: Date.now(),
        };

        // Cache session status in Redis asynchronously
        await redis.set(getRedisSessionKey(session.sessionId), sessionData, { ex: SESSION_CACHE_TTL_SEC });

        return {
            sessionId: session.sessionId,
            tokenId: session.tokenId,
            refreshToken: refreshToken,
        };
    },

    refreshSession: async (data) => {
        const { sessionId, tokenId, userId, refreshToken } = data;

        // 1. Fast path: check distributed Redis rotation cache first (fallback to memory if not set)
        const rotationKey = getRedisRotationKey(sessionId);
        try {
            const cachedRotation = await redis.get(rotationKey);
            if (cachedRotation && (Date.now() - cachedRotation.timestamp < ROTATION_CACHE_TTL_MS)) {
                if (cachedRotation.oldTokenId === tokenId || cachedRotation.tokenId === tokenId) {
                    return {
                        sessionId: cachedRotation.sessionId,
                        tokenId: cachedRotation.tokenId,
                        refreshToken: cachedRotation.refreshToken,
                        status: TOKEN.REFRESH,
                    };
                }
            }
        } catch (err) {
            console.error("[Redis] Check rotation cache failed:", err.message);
        }

        // 2. In-flight request deduplication per node: if refresh is in progress for this session, await it
        if (pendingRefreshPromises.has(sessionId)) {
            try {
                return await pendingRefreshPromises.get(sessionId);
            } catch (err) {
                // If in-flight failed, proceed to try fresh
            }
        }

        // 3. Execute atomic refresh in DB with row-level locks
        const refreshPromise = (async () => {
            try {
                const updatedSession = await userDb.refreshSession({ sessionId, tokenId, userId, refreshToken });

                if (!updatedSession) {
                    return { status: TOKEN.FAILED };
                }

                if (updatedSession.status === TOKEN.REFRESH) {
                    const result = {
                        sessionId: updatedSession.sessionId,
                        tokenId: updatedSession.tokenId,
                        refreshToken: updatedSession.refreshToken,
                        status: TOKEN.REFRESH,
                    };

                    const rotationData = {
                        ...result,
                        oldTokenId: tokenId,
                        timestamp: Date.now(),
                    };

                    // Cache rotated token in Redis with TTL to handle concurrent client bursts
                    await redis.set(rotationKey, rotationData, { ex: ROTATION_CACHE_TTL_SEC });

                    // Also refresh the active session TTL in Redis
                    await redis.set(getRedisSessionKey(updatedSession.sessionId), {
                        sessionId: updatedSession.sessionId,
                        tokenId: updatedSession.tokenId,
                        userId,
                        status: "active",
                        updatedAt: Date.now(),
                    }, { ex: SESSION_CACHE_TTL_SEC });

                    return result;
                }

                if (updatedSession.status === TOKEN.CONCURRENT) {
                    // Re-check Redis cache for the latest rotated token
                    try {
                        const latestCached = await redis.get(rotationKey);
                        if (latestCached && (Date.now() - latestCached.timestamp < ROTATION_CACHE_TTL_MS)) {
                            return {
                                sessionId: latestCached.sessionId,
                                tokenId: latestCached.tokenId,
                                refreshToken: latestCached.refreshToken,
                                status: TOKEN.REFRESH,
                            };
                        }
                    } catch (err) {
                        console.error("[Redis] Concurrent lookup error:", err.message);
                    }

                    return {
                        sessionId: updatedSession.sessionId || sessionId,
                        tokenId: tokenId,
                        refreshToken: refreshToken,
                        status: TOKEN.CONCURRENT,
                    };
                }

                if (updatedSession.status === TOKEN.REVOKED || updatedSession.status === TOKEN.INVALID) {
                    // Invalidate Redis session cache immediately
                    await redis.del(getRedisSessionKey(sessionId));
                    await redis.del(rotationKey);
                }

                return {
                    sessionId: updatedSession.sessionId,
                    tokenId: updatedSession.tokenId,
                    refreshToken: updatedSession.refreshToken,
                    status: updatedSession.status,
                };
            } finally {
                pendingRefreshPromises.delete(sessionId);
            }
        })();

        pendingRefreshPromises.set(sessionId, refreshPromise);
        return await refreshPromise;
    },

    logout: async (data) => {
        const { userId, sessionId } = data;

        pendingRefreshPromises.delete(sessionId);

        // Invalidate Redis cache immediately
        await Promise.all([
            redis.del(getRedisSessionKey(sessionId)),
            redis.del(getRedisRotationKey(sessionId)),
        ]).catch(err => console.error("[Redis] Logout cache invalidation error:", err.message));

        const response = await userDb.logout({ userId, sessionId });

        if (!response || response.rowCount === 0) {
            return null;
        }

        const session = response.rows[0];

        return session;
    },

    getSessionStatus: async (sessionId) => {
        if (!sessionId) return null;

        // 1. Fast path: Check Redis cache
        try {
            const cached = await redis.get(getRedisSessionKey(sessionId));
            if (cached && cached.status === "active") {
                return cached;
            }
        } catch (err) {
            console.warn("[Session] Redis getSessionStatus error, falling back to PostgreSQL:", err.message);
        }

        // 2. Fallback to PostgreSQL to maintain active user login session even if Redis is down
        try {
            const response = await userDb.getSessionById({ sessionId });
            if (!response || response.rowCount === 0) {
                return null;
            }

            const row = response.rows[0];
            const isRevoked = Boolean(row.is_revoked);
            const isExpired = new Date(row.expires_at).getTime() <= Date.now();

            if (isRevoked || isExpired) {
                return null;
            }

            const activeSessionData = {
                sessionId: row.session_id,
                userId: row.public_id,
                status: "active",
                source: "postgres_fallback",
                expiresAt: new Date(row.expires_at).getTime(),
            };

            // 3. Auto-recovery: If Redis is available, repopulate the session in Redis
            redis.set(getRedisSessionKey(sessionId), activeSessionData, { ex: SESSION_CACHE_TTL_SEC }).catch(() => {});

            return activeSessionData;
        } catch (pgErr) {
            console.error("[Session] Postgres fallback getSessionById failed:", pgErr.message);
            return null;
        }
    }
};

export default authService;