import crypto from "crypto";

import { userDb } from "@/db/user.db";
import { commerceDb } from "@/db/commerce.db";
import { listCacheIdentity } from "@/lib/listFilters";
import { ApiError } from "@/lib/error/apiError";
import { challengeService } from "@/services/challenge.service";
import { cacheKeys, TTL, rememberForUser, invalidateUserCache } from "@/lib/cacheKeys";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";

import bycrypt from "bcryptjs";

import { generateSonyflake } from "@/lib/sonyflake";

import { ulid } from "ulid";

export const userService = {
    signUp: async (data) => {
        const id = generateSonyflake();
        const public_id = ulid();

        const { username, email, surname, name, password } = data;

        const salt = await bycrypt.genSalt(10);
        const hashedPassword = await bycrypt.hash(password, salt);

        try {
            const response = await userDb.signUp({ id, public_id, username, email, surname, name, password: hashedPassword });

            const newUser = response.rows[0];

            if (!newUser) {
                throw new ApiError('Failed to create user, try again later', 500);
            }

            return newUser;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            if (error.code === 'P0001') {
                throw new ApiError(error.message, 409);
            }
            if (error.code === '23505') {
                throw new ApiError('User with this email or username already exists', 409);
            }
            throw new ApiError(error.message || 'Failed to create user, try again later', 500);
        }
    },

    getMe: async (userId) => {
        const profile = await rememberForUser(userId, (v) => cacheKeys.userMe(userId, v), TTL.USER_ME, async () => {
            const response = await userDb.getMe(userId);

            if (!response) {
                throw new Error('Failed to fetch user details, try again later');
            }

            const user = response.rows[0];

            if (!user) {
                throw new ApiError('User not found', 404);
            }

            // The point balance is never cached in Redis: it is read from PostgreSQL below.
            const { points: _balance, ...rest } = user;
            return rest;
        });

        const points = await commerceDb.getPointBalance({ userId });
        return { ...profile, points };
    },

    getOverview: async (userId) => {
        return rememberForUser(userId, (v) => cacheKeys.userOverview(userId, v), TTL.USER_OVERVIEW, async () => {
            const response = await userDb.getOverview(userId);

            if (!response) {
                throw new Error('Failed to fetch user details, try again later');
            }

            const user = response.rows[0];

            if (!user) {
                throw new ApiError('User not found', 404);
            }

            return user.data || {};
        });
    },

    /**
     * "My learning" list. Cached per user (versioned: enrol / withdraw / progress / lesson visit
     * bump the version) and per normalised query, cursor included.
     */
    getCourseProgress: async ({ userId, search = "", filter = {}, nextCursor = null }) => {
        const hash = crypto
            .createHash("sha1")
            .update(listCacheIdentity("learning", { search, filter }, { cursor: nextCursor }))
            .digest("hex")
            .slice(0, 16);

        return rememberForUser(
            userId,
            (v) => cacheKeys.userCourseProgressList(userId, v, hash),
            TTL.USER_COURSE_PROGRESS_LIST,
            () => userService.loadCourseProgress({ userId, search, levels: filter.level || [], statuses: filter.status || [], nextCursor })
        );
    },

    loadCourseProgress: async (params) => {
        const response = await userDb.getCourseProgress(params);

        if (!response) {
            throw new Error('Failed to fetch course progress, try again later');
        }

        const LIMIT = 20;
        const hasMore = response.rowCount > LIMIT;
        const data = response.rows.slice(0, LIMIT);
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
        return rememberForUser(data.userId, (v) => cacheKeys.userLearningProgress(data.userId, v, data.courseId), TTL.USER_LEARNING_PROGRESS, async () => {
            const response = await userDb.getLearningProgress(data);

            if (!response) {
                throw new Error('Failed to fetch learning progress, try again later');
            }

            const user = response.rows[0];

            if (!user) {
                throw new ApiError('User not found', 404);
            }

            return challengeService.sanitizeLearningProgress(user.learning_progress || {});
        });
    },

    updateProfile: async (data) => {
        const { userId, nickname, surname, phone, name, email, bio, image } = data;

        const result = await userDb.updateProfile({
            userId,
            nickname,
            surname,
            phone,
            name,
            email,
            bio,
            image
        });

        if (!result) {
            throw new ApiError("Failed to update your information, try again later", 500);
        }

        await invalidateUserCache(userId);
        publishToUser(userId, events.PROFILE_UPDATED, {});

        return true;
    },

    getFriends: async (data) => {
        const { userId, search } = data;

        const result = await userDb.getFriends({ userId, search });

        if (!result) {
            throw new ApiError("Failed to get friends, try again later", 500);
        }

        return result.rows || result;
    }
}