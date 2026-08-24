import { userDb } from "@/app/db/user.db";

import bycrypt from "bcryptjs";

import crypto from "crypto";

import { ApiError } from "@/app/lib/error/apiError";

import { generateSonyflake } from "@/app/lib/sonyflake";

import { ulid } from "ulid";

export const authService = {
    login: async (data) => {
        const { username, password } = data;

        const response = await userDb.login({ username });

        if (!response || response.length === 0) {
            throw new ApiError("Invalid credentials, try again", 401);
        }

        const user = response[0];

        const isValid = await bycrypt.compare(password, user.password);

        if (!isValid) {
            throw new ApiError("Invalid credentials, try again", 401);
        }

        const permissions = await userDb.getPermissions({ userId: user.id });

        if (!permissions || permissions.length === 0) {
            throw new ApiError("No permissions found for the user", 403);
        }

        user.permissions = permissions.map(p => p.permissions);

        const session = await authService.createSession({ userId: user.id });

        user.session_id = session.session_id;
        user.refresh_token = session.refresh_token;

        return user;
    },

    signUpWithProvider: async (data) => {
        const id = generateSonyflake();
        const public_id = ulid();

        const response = await userDb.signUpWithProvider({ ...data, id, public_id });

        if (!response || response.length === 0) {
            throw new ApiError("Authentication failed, try again", 500);
        }

        const user = response[0];

        const permissions = await userDb.getPermissions({ userId: user.id });

        if (!permissions || permissions.length === 0) {
            throw new ApiError("No permissions found for the user", 403);
        }

        user.permissions = permissions.map(p => p.permissions);

        const session = await authService.createSession({ userId: user.id });

        user.session_id = session.session_id;
        user.refresh_token = session.refresh_token;

        return user;
    },

    createSession: async (data) => {
        const { userId } = data;
        const id = generateSonyflake();

        const refresh_token = crypto.randomBytes(40).toString("hex");
        const refresh_token_hash = crypto.createHash("sha256").update(refresh_token).digest("hex");

        const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        const session = await userDb.createSession({ id, userId, refresh_token_hash, expires_at });

        if (!session || session.length === 0) {
            throw new ApiError("Failed to create session, try again", 500);
        }

        return {
            session_id: session[0].session_id,
            refresh_token: refresh_token,
        }
    },

    refreshSession: async (data) => {
        const { session_id, userId, refresh_token } = data;

        const old_refresh_token_hash = crypto.createHash("sha256").update(refresh_token).digest("hex");

        const new_refresh_token = crypto.randomBytes(40).toString("hex");
        const new_refresh_token_hash = crypto.createHash("sha256").update(new_refresh_token).digest("hex");

        const updateSession = await userDb.refreshSession({ session_id, userId, old_refresh_token_hash, new_refresh_token_hash });

        if (!updateSession || updateSession.length === 0) {
            throw new ApiError("Invalid session, try again", 401);
        }

        const session = updateSession[0];

        return {
            session_id: session.id,
            refresh_token: new_refresh_token,
        };
    },

    logout: async (data) => {
        const { userId, sessionId } = data;

        const response = await userDb.logout({ userId, sessionId });

        if (!response || response.length === 0) {
            throw new ApiError("Invalid session, try again", 401);
        }

        return true;
    }
}