import { userDb } from "@/app/db/user.db";

export const userService = {
    getMe: async (userId) => {
        const response = await userDb.getMe(userId);

        if (!response) {
            throw new Error('Failed to fetch user details, try again later');
        }

        return response;
    },


    getCourseProgress: async (data) => {
        const response = await userDb.getCourseProgress(data);

        if (!response) {
            throw new Error('Failed to fetch course progress, try again later');
        }

        return response;
    },

    getLearningProgress: async (data) => {
        const response = await userDb.getLearningProgress(data);

        if (!response) {
            throw new Error('Failed to fetch learning progress, try again later');
        }

        return response[0]?.learning_progress || {};
    }
}