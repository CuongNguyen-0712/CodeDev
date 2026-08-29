import { userDb } from "@/app/db/user.db";

import bycrypt from "bcryptjs";

import { ApiError } from "@/app/lib/error/apiError";

import { generateSonyflake } from "@/app/lib/sonyflake";

import { hashRefreshToken, generateRefreshToken } from "@/app/utils/auth.util";

import { ulid } from "ulid";

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

        const updatedSession = await userDb.refreshSession({ sessionId, tokenId, userId, refreshToken });

        return {
            sessionId: updatedSession.sessionId,
            tokenId: updatedSession.tokenId,
            refreshToken: updatedSession.refreshToken,
            status: updatedSession.status,
        };
    },

    logout: async (data) => {
        const { userId, sessionId } = data;

        const response = await userDb.logout({ userId, sessionId });

        if (!response || response.rowCount === 0) {
            return null
        }

        const session = response.rows[0];

        return session;
    }
}