import { chatClient } from "@/clients/chat.client";
import { chatKeys } from "@/keys/chat.keys";
import { TYPING_SHOW_MS } from "@/lib/chat/limits";
import { insertMessage } from "@/lib/chat/messageCache";
import { useChatTypingStore } from "@/stores/chatTypingStore";

const bigger = (a, b) => {
    try {
        return BigInt(a) > BigInt(b);
    } catch {
        return false;
    }
};

/** Pusher handlers for the chat-* events on the user channel (spec section 6). */
export function createChatHandlers(queryClient) {
    const NO_RESTART = { cancelRefetch: false };
    const invalidate = (queryKey) => queryClient.invalidateQueries({ queryKey }, NO_RESTART);
    // Every chat event moves the inbox rows and the unread badge.
    const touchLists = () => {
        invalidate(chatKeys.inbox("all"));
        invalidate(chatKeys.inbox("requests"));
        invalidate(chatKeys.unread());
    };

    const insert = (conversationId, message) =>
        queryClient.setQueryData(chatKeys.messages(conversationId), (data) => insertMessage(data, message));

    return {
        "chat-message": async ({ conversationId, message, messageId } = {}) => {
            touchLists();
            // A conversation that is not open has no cache to update: the inbox refetch is enough.
            if (!queryClient.getQueryData(chatKeys.messages(conversationId))) return;
            if (message) return insert(conversationId, message);
            try {
                insert(conversationId, await chatClient.getMessage(messageId));
            } catch {
                invalidate(chatKeys.messages(conversationId));
            }
        },

        "chat-message-updated": ({ conversationId } = {}) => {
            touchLists();
            invalidate(chatKeys.messages(conversationId));
        },

        "chat-read": ({ conversationId, userId, seq } = {}) => {
            touchLists();
            queryClient.setQueryData(chatKeys.conversation(conversationId), (detail) => {
                const member = detail?.members?.find((m) => m.id === userId);
                if (!member || !bigger(seq, member.lastReadSeq)) return detail;
                return { ...detail, members: detail.members.map((m) => (m === member ? { ...m, lastReadSeq: String(seq) } : m)) };
            });
        },

        "chat-typing": ({ conversationId, userId } = {}) => {
            const store = useChatTypingStore.getState();
            store.setTyping(conversationId, userId);
            // A newer ping extends the expiry, so only the last timer clears the typer.
            setTimeout(() => {
                if ((useChatTypingStore.getState().byConversation[conversationId]?.[userId] ?? 0) <= Date.now()) {
                    useChatTypingStore.getState().clear(conversationId, userId);
                }
            }, TYPING_SHOW_MS + 50);
            touchLists();
        },

        "chat-conversation-updated": ({ conversationId } = {}) => {
            touchLists();
            invalidate(chatKeys.conversation(conversationId));
        },
    };
}
