import { courseDb } from "@/app/db/course.db";

export const courseService = {
    getDetails: async (courseId) => {
        const response = await courseDb.getCourseDetails(courseId);

        if (!response) {
            throw new Error('Failed to fetch course details, try again later');
        }

        return response;
    },

    getList: async (params) => {
        const response = await courseDb.getCourseList(params);

        if (!response) {
            throw new Error('Failed to fetch course list, try again later');
        }

        const LIMIT = 20
        const hasMore = response.length > LIMIT
        const lastId = hasMore ? response[response.length - 1].id : null

        return {
            data: response.slice(0, LIMIT),
            hasMore,
            lastId
        }
    },

    postRegister: async (data) => {
        const response = await courseDb.postRegister(data);

        if (!response) {
            throw new Error('Failed to register for the course, try again later');
        }

        return response;
    },

    postWithdraw: async (data) => {
        const response = await courseDb.postWithdraw(data);

        if (!response) {
            throw new Error('Failed to withdraw from the course, try again later');
        }

        return response;
    },

    getLearning: async (data) => {
        const response = await courseDb.getLearning(data);

        if (!response) {
            throw new Error('Failed to fetch learning, try again later');
        }

        return response;
    },

    postSubmitLesson: async (data) => {
        const response = await courseDb.postSubmitLesson(data);

        if (!response) {
            throw new Error('Failed to submit lesson, try again later');
        }

        return response;
    },

    postFavorite: async (data) => {
        const response = await courseDb.postFavorite(data);

        if (!response) {
            throw new Error('Failed to favorite course, try again later');
        }

        return response;
    }
}