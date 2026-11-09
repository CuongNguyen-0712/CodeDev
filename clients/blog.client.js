import { apiClient } from '@/clients/api.client';

export const blogClient = {
    // { items, nextCursor }; published posts, newest first.
    getList: async (params) => {
        const res = await apiClient.get('/blog/posts', { params });
        return res.data;
    },

    // { trusted, items }; the signed-in author's own posts in every status.
    getMine: async () => (await apiClient.get('/blog/posts/mine')).data,
    // The author's own post for the editor, any status.
    getPost: async (id) => (await apiClient.get(`/blog/posts/${id}`)).data,
    createPost: async (input) => (await apiClient.post('/blog/posts', input)).data,
    updatePost: async ({ id, ...input }) => (await apiClient.patch(`/blog/posts/${id}`, input)).data,
    deletePost: async (id) => (await apiClient.delete(`/blog/posts/${id}`)).data,
    // Returns { url, width, height }.
    uploadImage: async (file) => {
        const form = new FormData();
        form.append('file', file);
        return (await apiClient.upload('/blog/images', form)).data;
    },
};
