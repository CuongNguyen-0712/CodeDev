import { apiClient } from '@/clients/api.client';

export const chatClient = {
    // { items, nextCursor }; tab is "all" or "requests".
    getInbox: async ({ tab, cursor }) => (await apiClient.get('/chat/conversations', { params: { tab, ...(cursor ? { cursor } : {}) } })).data,
    getConversation: async (id) => (await apiClient.get(`/chat/conversations/${id}`)).data,
    // { items, nextCursor }, newest first; `before` is the seq cursor.
    getMessages: async ({ id, before }) => (await apiClient.get(`/chat/conversations/${id}/messages`, { params: before ? { before } : {} })).data,
    getMessage: async (id) => (await apiClient.get(`/chat/messages/${id}`)).data,
    // { unread, requests }
    getUnread: async () => (await apiClient.get('/chat/unread')).data,
    // { items }
    getBlocks: async () => (await apiClient.get('/chat/blocks')).data,
};
