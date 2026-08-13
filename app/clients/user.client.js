import { api } from '@/app/lib/axios'

export const userClient = {
    getMe: async () => {
        const res = await api.get('/user/me');

        if (!res.success) {
            throw new Error('Failed to fetch user details, try again later');
        }

        return Array.isArray(res.data)
            ? res.data[0]
            : res.data;
    },

    getOverview: async () => {
        const res = await api.get('/user/overview');

        if (!res.success) {
            throw new Error('Failed to fetch user details, try again later');
        }

        return res.data;
    },

    getCourseProgress: async (params) => {
        const res = await api.get('/user/course-progress', { params });

        if (!res.success) {
            throw new Error('Failed to fetch course progress, try again later');
        }

        return res.data;
    },

    getLearningProgress: async (params) => {
        const res = await api.get('/user/learning-progress', { params });

        if (!res.success) {
            throw new Error('Failed to fetch learning progress, try again later');
        }

        return res.data;
    }
}