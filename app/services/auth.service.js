import { userDb } from "@/app/db/user.db";

import bycrypt from "bcryptjs";

import { generateSonyflake } from "@/app/lib/sonyflake";

import { ApiError } from "@/app/lib/error/apiError";

import { ulid } from "ulid";

export const authService = {
    signUp: async (data) => {
        const id = generateSonyflake();
        const public_id = ulid();

        const { surname, name, email, username, password } = data;

        const salt = await bycrypt.genSalt(10);
        const hashedPassword = await bycrypt.hash(password, salt);

        await userDb.signUp({ id, public_id, surname, name, email, username, password: hashedPassword });

        return true;
    },


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

        return user;
    }
}