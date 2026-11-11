import { create } from "zustand";

const EMPTY_UNSENT = Object.freeze([]);

/**
 * Messages the user sent that the server has not confirmed (status "sending" or "failed"), per conversation.
 * Client-only: the messages query holds server messages, so a refetch never drops these.
 * Naming and structure rules: docs/state-management.md.
 */
export const useChatOutboxStore = create((set) => ({
    byConversation: {},   // conversationId -> optimistic messages, newest first

    addUnsent: (conversationId, message) => set((s) => ({
        byConversation: { ...s.byConversation, [conversationId]: [message, ...(s.byConversation[conversationId] ?? [])] },
    })),
    setUnsentStatus: (conversationId, clientId, status) => set((s) => {
        const list = s.byConversation[conversationId];
        if (!list?.some((m) => m.clientId === clientId && m.status !== status)) return s;
        return { byConversation: { ...s.byConversation, [conversationId]: list.map((m) => (m.clientId === clientId ? { ...m, status } : m)) } };
    }),
    removeUnsent: (conversationId, clientId) => set((s) => {
        const list = s.byConversation[conversationId];
        if (!clientId || !list?.some((m) => m.clientId === clientId)) return s;
        return { byConversation: { ...s.byConversation, [conversationId]: list.filter((m) => m.clientId !== clientId) } };
    }),
}));

/** Selector factory: the unsent messages of one conversation (stable frozen array when none). */
export const selectUnsent = (conversationId) => (s) => s.byConversation[conversationId] ?? EMPTY_UNSENT;
