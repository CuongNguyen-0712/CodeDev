import { api } from '@/app/lib/axios'

export const courseClient = {
    getDetails: async (courseId) => {
        const res = await api.get('/course/courseDetails', {
            params: {
                courseId
            }
        })
        if (!res.success) {
            throw new Error('Failed to fetch course details, try again later')
        }
        return Array.isArray(res.data)
            ? res.data[0]
            : res.data
    },

    getList: async (params) => {
        const res = await api.get('/course/courseList', { params })
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
        const res = await api.post('/course/submitLesson', { courseId, lessonId })

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
    }
}