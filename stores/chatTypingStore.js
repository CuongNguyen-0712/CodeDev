import { create } from "zustand";

import { TYPING_SHOW_MS } from "@/lib/chat/limits";

const EMPTY_TYPERS = Object.freeze([]);

/**
 * Who is typing right now, per conversation. UI-only and short-lived: nothing from the server is
 * copied here. Naming and structure rules: docs/state-management.md.
 */
export const useChatTypingStore = create((set) => ({
    byConversation: {},   // conversationId -> { [userId]: expiresAt (ms since epoch) }

    setTyping: (conversationId, userId) => set((s) => ({
        byConversation: {
            ...s.byConversation,
            [conversationId]: { ...s.byConversation[conversationId], [userId]: Date.now() + TYPING_SHOW_MS },
        },
    })),
    clear: (conversationId, userId) => set((s) => {
        const entry = s.byConversation[conversationId];
        if (!entry || !(userId in entry)) return s;
        const { [userId]: _removed, ...rest } = entry;
        return { byConversation: { ...s.byConversation, [conversationId]: rest } };
    }),
}));

/** User ids still typing at `now`. Builds an array: wrap with useShallow in components. */
export function selectTypingUsers(state, conversationId, now = Date.now()) {
    const entry = state.byConversation[conversationId];
    if (!entry) return EMPTY_TYPERS;
    return Object.keys(entry).filter((userId) => entry[userId] > now);
}
