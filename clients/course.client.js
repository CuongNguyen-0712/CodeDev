import { apiClient } from '@/clients/api.client';

export const courseClient = {
    getDetails: async (courseId) => {
        const res = await apiClient.get('/course/course-details', { params: { courseId } });
        return Array.isArray(res.data) ? res.data[0] : res.data;
    },

    getList: async (params) => {
        const res = await apiClient.get('/course/courses', { params });
        return res.data;
    },

    getLearning: async (params) => {
        const res = await apiClient.get('/course/learning', { params });
        return res.data;
    },

    getComments: async (params) => {
        const res = await apiClient.get('/course/comments', { params });
        return res.data;
    }
};