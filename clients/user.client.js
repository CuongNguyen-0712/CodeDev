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

    // Level table + one page of EXP history; `cursor` is the previous page's `next`.
    getExperience: async (cursor) => {
        const res = await apiClient.get('/user/experience', {
            params: cursor ? { beforeAt: cursor.createdAt, beforeId: cursor.id } : {},
        });
        return res.data;
    },

    // ?board=overall|exp|points&period=all|30d -> { entries, me, tiers, isPublic, updatedAt }
    getRanking: async ({ board, period }) => {
        const res = await apiClient.get('/ranking', { params: { board, period } });
        return res.data;
    },

    // { overall, exp, points }: the caller's all-time standing on each board.
    getMyRanks: async () => {
        const res = await apiClient.get('/ranking/me');
        return res.data;
    },

    getPrivacy: async () => {
        const res = await apiClient.get('/user/privacy');
        return res.data;
    },

    updatePrivacy: async (data) => {
        const res = await apiClient.patch('/user/privacy', data);
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