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
    // { likeCount, commentCount, liked, reported, own }; works signed out.
    getViewer: async (id) => (await apiClient.get(`/blog/posts/${id}/viewer`)).data,
    // { ids, counts: { [id]: { likeCount, commentCount } } } for these posts (at most 50); ids is [] signed out.
    getFeedState: async (ids) => (await apiClient.get('/blog/likes', { params: { ids: ids.join(',') } })).data,
    // { items: [{ id, body, createdAt, author, own }], nextCursor }, newest first; works signed out.
    getComments: async ({ id, cursor }) => (await apiClient.get(`/blog/posts/${id}/comments`, { params: cursor ? { cursor } : {} })).data,
};
