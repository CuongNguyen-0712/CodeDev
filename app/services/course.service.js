import { courseDb } from "@/app/db/course.db";

export const courseService = {
    getDetails: async (data) => {
        const response = await courseDb.getCourseDetails(data);

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
        const data = response.slice(0, LIMIT)

        return {
            data,
            hasMore,
            lastId: hasMore ? data[data.length - 1].id : null
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
    },

    getComments: async (params) => {
        const response = await courseDb.getComments(params);

        if (!response) {
            throw new Error('Failed to fetch comments, try again later');
        }

        const LIMIT = 20
        const hasMore = response.length > LIMIT
        const data = response.slice(0, LIMIT)
        const lastCreated = hasMore ? data[data.length - 1].created_at : null

        return {
            data: response.slice(0, LIMIT),
            hasMore,
            lastCreated
        }
    },

    postComment: async (data) => {
        const response = await courseDb.postComment(data);

        if (!response) {
            throw new Error('Failed to post comment, try again later');
        }

        return response;
    },

    postVotingComment: async (data) => {
        const response = await courseDb.postVotingComment(data);

        if (!response) {
            throw new Error('Failed to vote on comment, try again later');
        }

        return response;
    },

    deleteFavorite: async (data) => {
        const response = await courseDb.deleteFavorite(data);

        if (!response) {
            throw new Error('Failed to delete favorite status, try again later');
        }

        return response;
    },
}