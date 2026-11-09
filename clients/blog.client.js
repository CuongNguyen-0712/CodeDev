import { apiClient } from '@/clients/api.client';

export const blogClient = {
    // { items, nextCursor }; published posts, newest first.
    getList: async (params) => {
        const res = await apiClient.get('/blog/posts', { params });
        return res.data;
    },
};
