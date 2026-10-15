import { apiClient } from '@/clients/api.client';

export const userClient = {
    signUp: async (data) => {
        return await apiClient.post('/user/signup', data);
    },

    getMe: async () => {
        const res = await apiClient.get('/user/me');
        const user = Array.isArray(res.data) ? res.data[0] : res.data;
        return user;
    },

    getOverview: async () => {
        const res = await apiClient.get('/user/overview');
        return res.data;
    },

    getCourseProgress: async (params) => {
        const res = await apiClient.get('/user/course-progress', { params });
        return res.data;
    },

    getLearningProgress: async (params) => {
        const res = await apiClient.get('/user/learning-progress', { params });
        return res.data;
    },

    getSessions: async () => {
        const res = await apiClient.get('/user/sessions');
        return res.data || [];
    },

    revokeSession: async (sessionId) => {
        const res = await apiClient.delete('/user/sessions', { data: { sessionId } });
        return res.data;
    },

    revokeOtherSessions: async () => {
        const res = await apiClient.delete('/user/sessions', { data: { others: true } });
        return res.data;
    },
};