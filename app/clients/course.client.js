import { api } from '@/app/lib/axios'

export const courseClient = {
    getDetails: async (courseId) => {
        const res = await api.get('/course/course-details', { params: { courseId } })
        if (!res.success) {
            throw new Error('Failed to fetch course details, try again later')
        }
        return Array.isArray(res.data)
            ? res.data[0]
            : res.data
    },

    getList: async (params) => {
        const res = await api.get('/course/courses', { params })
        if (!res.success) {
            throw new Error('Failed to fetch course list, try again later')
        }
        return res.data
    },

    postRegister: async (courseId) => {
        const res = await api.post('/course/register', { courseId })

        if (!res.success) {
            throw new Error('Failed to register for the course, try again later')
        }

        return res.success
    },

    postWithdraw: async (courseId) => {
        const res = await api.post('/course/withdraw', { courseId })

        if (!res.success) {
            throw new Error('Failed to withdraw from the course, try again later')
        }

        return res.success
    },

    getLearning: async (params) => {
        const res = await api.get('/course/learning', { params })

        if (!res.success) {
            throw new Error('Failed to fetch learning, try again later')
        }

        return res.data
    },

    postSubmitLesson: async ({ courseId, lessonId }) => {
        const res = await api.post('/course/submit-lesson', { courseId, lessonId })

        if (!res.success) {
            throw new Error('Failed to submit lesson, try again later')
        }

        return res.success
    },

    postFavorite: async ({ courseId }) => {
        const res = await api.post('/course/favorite', { courseId })

        if (!res.success) {
            throw new Error('Failed to update favorite status, try again later')
        }

        return res.success
    },

    getComments: async (params) => {

        const res = await api.get('/course/comments', { params })

        if (!res.success) {
            throw new Error('Failed to fetch comments, try again later')
        }

        return res.data
    },

    postComment: async ({ courseId, content }) => {
        const res = await api.post('/course/comment', { courseId, content })

        if (!res.success) {
            throw new Error('Failed to post comment, try again later')
        }

        return res.success
    },

    postVotingComment: async ({ commentId, vote }) => {
        const res = await api.post('/course/vote-comment', { commentId, vote })

        if (!res.success) {
            throw new Error('Failed to vote on comment, try again later')
        }

        return res.data
    },

    deleteFavorite: async ({ courseId }) => {
        const res = await api.delete('/course/unfavorite', { params: { courseId } })

        if (!res.success) {
            throw new Error('Failed to delete favorite status, try again later')
        }

        return res.success
    }
}