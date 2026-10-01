import { apiClient } from "@/clients/api.client";

export const roadmapClient = {
    getList: async () => {
        const res = await apiClient.get('/roadmap/list');
        return res.data;
    },

    getDetails: async (id) => {
        const res = await apiClient.get('/roadmap/details', { params: { id } });
        return res.data;
    }
};