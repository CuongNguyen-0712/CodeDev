import { userDb } from "@/app/db/user.db";

import bycrypt from "bcryptjs";

import { ApiError } from "@/app/lib/error/apiError";

import { generateSonyflake } from "@/app/lib/sonyflake";

import { hashRefreshToken, generateRefreshToken } from "@/app/utils/auth.util";

import { ulid } from "ulid";
import { TOKEN } from "@/app/constants/auth";

const pendingRefreshPromises = new Map();
const recentRotations = new Map();
const ROTATION_CACHE_TTL_MS = 120_000; // 2 minutes

function cleanupExpiredRotations() {
    const now = Date.now();
    for (const [key, val] of recentRotations.entries()) {
        if (now - val.timestamp > ROTATION_CACHE_TTL_MS) {
            recentRotations.delete(key);
        }
    }
}

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

        return {
            sessionId: session.sessionId,
            tokenId: session.tokenId,
            refreshToken: refreshToken,
        }
    },

    refreshSession: async (data) => {
        const { sessionId, tokenId, userId, refreshToken } = data;

        cleanupExpiredRotations();

        // 1. Fast path: check if this session was recently rotated and matches tokenId
        const cached = recentRotations.get(sessionId);
        if (cached && (Date.now() - cached.timestamp < ROTATION_CACHE_TTL_MS)) {
            if (cached.oldTokenId === tokenId || cached.tokenId === tokenId) {
                return {
                    sessionId: cached.sessionId,
                    tokenId: cached.tokenId,
                    refreshToken: cached.refreshToken,
                    status: TOKEN.REFRESH,
                };
            }
        }

        // 2. In-flight deduplication: if refresh is in progress for this session, await it
        if (pendingRefreshPromises.has(sessionId)) {
            try {
                return await pendingRefreshPromises.get(sessionId);
            } catch (err) {
                // If in-flight failed, proceed to try fresh
            }
        }

        // 3. Execute refresh with mutex
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

                    recentRotations.set(sessionId, {
                        ...result,
                        oldTokenId: tokenId,
                        timestamp: Date.now(),
                    });

                    return result;
                }

                if (updatedSession.status === TOKEN.CONCURRENT) {
                    const latestCached = recentRotations.get(sessionId);
                    if (latestCached && (Date.now() - latestCached.timestamp < ROTATION_CACHE_TTL_MS)) {
                        return {
                            sessionId: latestCached.sessionId,
                            tokenId: latestCached.tokenId,
                            refreshToken: latestCached.refreshToken,
                            status: TOKEN.REFRESH,
                        };
                    }

                    return {
                        sessionId: updatedSession.sessionId || sessionId,
                        tokenId: tokenId,
                        refreshToken: refreshToken,
                        status: TOKEN.CONCURRENT,
                    };
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

        recentRotations.delete(sessionId);
        pendingRefreshPromises.delete(sessionId);

        const response = await userDb.logout({ userId, sessionId });

        if (!response || response.rowCount === 0) {
            return null
        }

        const session = response.rows[0];

        return session;
    }
}