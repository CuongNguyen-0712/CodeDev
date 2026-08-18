import { userDb } from "@/app/db/user.db";

import bycrypt from "bcryptjs";

import { generateSonyflake } from "@/app/lib/sonyflake";

import { ulid } from "ulid";

export const userService = {
    signUp: async (data) => {
        const id = generateSonyflake();
        const public_id = ulid();

        const { username, email, surname, name, password } = data;

        const salt = await bycrypt.genSalt(10);
        const hashedPassword = await bycrypt.hash(password, salt);

        const userData = await userDb.signUp({ id, public_id, username, email, surname, name, password: hashedPassword });

        return userData;
    },

    getMe: async (userId) => {
        const response = await userDb.getMe(userId);

        if (!response) {
            throw new Error('Failed to fetch user details, try again later');
        }

        return response;
    },

    getOverview: async (userId) => {
        const response = await userDb.getOverview(userId);

        if (!response) {
            throw new Error('Failed to fetch user details, try again later');
        }

        return response?.[0].data || {};
    },

    getCourseProgress: async (params) => {
        const response = await userDb.getCourseProgress(params);

        if (!response) {
            throw new Error('Failed to fetch course progress, try again later');
        }

        const LIMIT = 20;
        const hasMore = response.length > LIMIT;
        const data = response.slice(0, LIMIT);
        const lastItem = data[data.length - 1];
        const nextCursor = hasMore
            ?
            Buffer.from(
                JSON.stringify({
                    sortTime: lastItem?.sort_time,
                    id: lastItem?.course_id
                })
            ).toString('base64url')
            :
            null;

        return {
            data,
            hasMore,
            nextCursor
        };
    },

    getLearningProgress: async (data) => {
        const response = await userDb.getLearningProgress(data);

        if (!response) {
            throw new Error('Failed to fetch learning progress, try again later');
        }

        return response[0]?.learning_progress || {};
    }
}