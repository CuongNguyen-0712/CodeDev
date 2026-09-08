import { courseDb } from "@/app/db/course.db";

export const courseService = {
    getDetails: async (data) => {
        const response = await courseDb.getCourseDetails(data);

        if (!response) {
            throw new Error('Failed to fetch course details, try again later');
        }

        const details = response.rows[0];

        return details;
    },

    getList: async (params) => {
        const response = await courseDb.getCourseList(params);

        if (!response) {
            throw new Error('Failed to fetch course list, try again later');
        }

        const LIMIT = params.limit || 20
        const hasMore = response.rowCount > LIMIT
        const data = response.rows.slice(0, LIMIT)

        return {
            data,
            hasMore,
            lastId: hasMore ? data[LIMIT - 1]?.id : null
        }
    },

    postRegister: async (data) => {
        const response = await courseDb.postRegister(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to register for the course, try again later');
        }

        const course = response.rows[0];

        return !!course;
    },

    postWithdraw: async (data) => {
        const response = await courseDb.postWithdraw(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to withdraw from the course, try again later');
        }

        return response;
    },

    getLearning: async (data) => {
        const response = await courseDb.getLearning(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to fetch learning, try again later');
        }

        const learning = response.rows[0];

        return learning;
    },

    postSubmitLesson: async (data) => {
        const response = await courseDb.postSubmitLesson(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to submit lesson, try again later');
        }

        const course = response.rows[0];

        return !!course;
    },

    postFavorite: async (data) => {
        const response = await courseDb.postFavorite(data);

        if (!response || response.rowCount === 0) {
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
        const hasMore = response.rowCount > LIMIT
        const data = response.rows.slice(0, LIMIT)

        return {
            data,
            hasMore,
            lastCreated: hasMore ? data[LIMIT - 1]?.created_at : null
        }
    },

    postComment: async (data) => {
        const response = await courseDb.postComment(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to post comment, try again later');
        }

        const comment = response.rows[0];

        return !!comment;
    },

    postVotingComment: async (data) => {
        const response = await courseDb.postVotingComment(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to vote on comment, try again later');
        }

        const vote = response.rows[0];

        return !!vote;
    },

    deleteFavorite: async (data) => {
        const response = await courseDb.deleteFavorite(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to delete favorite status, try again later');
        }

        const deleted = response.rows[0];

        return !!deleted;
    },
}