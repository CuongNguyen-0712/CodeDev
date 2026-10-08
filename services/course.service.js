import { courseDb } from "@/db/course.db";
import { getPusherServer } from "@/lib/pusher";

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

        return true;
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

        return true;
    },

    getComments: async (params) => {
        const response = await courseDb.getComments(params);

        if (!response) {
            throw new Error('Failed to fetch comments, try again later');
        }

        const LIMIT = 20
        const hasMore = response.rowCount > LIMIT
        const data = response.rows.slice(0, LIMIT).map((item) => ({
            ...item,
            upvotes: Number(item.upvotes) || 0,
            downvotes: Number(item.downvotes) || 0,
            vote: item.vote || null,
        }));

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

        // Trigger realtime event to course channel via Pusher
        try {
            const pusher = getPusherServer();
            if (pusher && data.courseId) {
                const channelName = `course-${data.courseId}`;
                await pusher.trigger(channelName, "new-comment", {
                    id: comment.id,
                    user_id: comment.user_id,
                    username: comment.username,
                    avatar: comment.avatar,
                    comment: comment.comment,
                    upvotes: Number(comment.upvotes) || 0,
                    downvotes: Number(comment.downvotes) || 0,
                    created_at: comment.created_at,
                    vote: null,
                });
            }
        } catch (pusherError) {
            console.error("[Pusher] Failed to broadcast new comment:", pusherError.message);
        }

        return comment || true;
    },

    postVotingComment: async (data) => {
        const response = await courseDb.postVotingComment(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to vote on comment, try again later');
        }

        const voteRow = response.rows[0];
        const result = {
            commentId: data.commentId,
            upvotes: Number(voteRow.upvotes) || 0,
            downvotes: Number(voteRow.downvotes) || 0,
            vote: voteRow.vote || null,
        };

        // Realtime broadcast updated votes via Pusher if courseId provided
        try {
            const pusher = getPusherServer();
            if (pusher && data.courseId) {
                const channelName = `course-${data.courseId}`;
                await pusher.trigger(channelName, "comment-voted", {
                    commentId: data.commentId,
                    upvotes: result.upvotes,
                    downvotes: result.downvotes,
                });
            }
        } catch (pusherError) {
            console.error("[Pusher] Failed to broadcast comment vote:", pusherError.message);
        }

        return result;
    },

    deleteFavorite: async (data) => {
        const response = await courseDb.deleteFavorite(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to delete favorite status, try again later');
        }

        const deleted = response.rows[0];

        return !!deleted;
    },

    postSubmitChallenge: async (data) => {
        const response = await courseDb.submitChallenge(data);

        if (!response) {
            throw new Error('Failed to evaluate challenge, try again later');
        }

        return response;
    },
}