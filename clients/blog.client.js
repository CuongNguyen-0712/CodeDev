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
    // { liked, likeCount }
    likePost: async (id) => (await apiClient.post(`/blog/posts/${id}/like`)).data,
    unlikePost: async (id) => (await apiClient.delete(`/blog/posts/${id}/like`)).data,
    // { likeCount, commentCount, liked, reported, own }; works signed out.
    getViewer: async (id) => (await apiClient.get(`/blog/posts/${id}/viewer`)).data,
    // { ids }: which of these posts (at most 50) the signed-in user liked.
    getLiked: async (ids) => (await apiClient.get('/blog/likes', { params: { ids: ids.join(',') } })).data,
    reportPost: async ({ id, reason }) => (await apiClient.post(`/blog/posts/${id}/report`, { reason })).data,
    // { items: [{ id, body, createdAt, author, own }], nextCursor }, newest first; works signed out.
    getComments: async ({ id, cursor }) => (await apiClient.get(`/blog/posts/${id}/comments`, { params: cursor ? { cursor } : {} })).data,
    addComment: async ({ id, body }) => (await apiClient.post(`/blog/posts/${id}/comments`, { body })).data,
    deleteComment: async (commentId) => (await apiClient.delete(`/blog/comments/${commentId}`)).data,
    // Returns { url, width, height }.
    uploadImage: async (file) => {
        const form = new FormData();
        form.append('file', file);
        return (await apiClient.upload('/blog/images', form)).data;
    },
};
