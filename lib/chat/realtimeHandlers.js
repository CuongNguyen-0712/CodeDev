import { chatClient } from "@/clients/chat.client";
import { chatKeys } from "@/keys/chat.keys";
import { TYPING_SHOW_MS } from "@/lib/chat/limits";
import { applyIncoming, lowerBadge, markRowRead, patchRowPreview } from "@/lib/chat/inboxCache";
import { insertMessage } from "@/lib/chat/messageCache";
import { getOpenConversation } from "@/lib/chat/openConversation";
import { useChatOutboxStore } from "@/stores/chatOutboxStore";
import { useChatTypingStore } from "@/stores/chatTypingStore";

const bigger = (a, b) => {
    try {
        return BigInt(a) > BigInt(b);
    } catch {
        return false;
    }
};

/** Pusher handlers for the chat-* events on the user channel (spec section 6). */
export function createChatHandlers(queryClient, meId) {
    const NO_RESTART = { cancelRefetch: false };
    const invalidate = (queryKey) => queryClient.invalidateQueries({ queryKey }, NO_RESTART);
    // Fallback when the cache cannot answer: refetch the rows and the unread badge.
    const touchLists = () => {
        invalidate(chatKeys.inbox("all"));
        invalidate(chatKeys.inbox("requests"));
        invalidate(chatKeys.unread());
    };

    const insert = (conversationId, message) =>
        queryClient.setQueryData(chatKeys.messages(conversationId), (data) => insertMessage(data, message));

    // Applies the event to a cached inbox tab; true when the row was there.
    const applyToInbox = (tab, conversationId, incoming) => {
        const key = chatKeys.inbox(tab);
        const result = applyIncoming(queryClient.getQueryData(key), { conversationId, ...incoming }, { meId, openId: getOpenConversation() });
        if (result.found && result.data !== queryClient.getQueryData(key)) queryClient.setQueryData(key, result.data);
        return result;
    };

    return {
        "chat-message": async ({ conversationId, message, messageId, preview, seq, senderId, createdAt } = {}) => {
            const incoming = { seq: message?.seq ?? seq, preview, senderId: message?.sender?.id ?? senderId, createdAt: message?.createdAt ?? createdAt };
            const all = applyToInbox("all", conversationId, incoming);
            const requests = applyToInbox("requests", conversationId, incoming);
            // Only a row in All counts toward the badge; a request has its own count.
            if (all.becameUnread) {
                const n = queryClient.getQueryData(chatKeys.unread());
                if (n) queryClient.setQueryData(chatKeys.unread(), { ...n, unread: n.unread + 1 });
            }
            else if (!all.found && !requests.found) touchLists();
            const insertAndSettle = (m) => {
                // Event first, send response later: the unsent copy must not render next to the real one.
                useChatOutboxStore.getState().removeUnsent(conversationId, m.clientId);
                insert(conversationId, m);
            };
            // A conversation that is not open has no cache to update: the inbox refetch is enough.
            if (!queryClient.getQueryData(chatKeys.messages(conversationId))) return;
            if (message) return insertAndSettle(message);
            try {
                insertAndSettle(await chatClient.getMessage(messageId));
            } catch {
                invalidate(chatKeys.messages(conversationId));
            }
        },

        "chat-message-updated": ({ conversationId, message, preview } = {}) => {
            // An unsent message from someone else may have been counted as unread: only a refetch knows.
            if (!message || (message.deleted && message.sender?.id !== meId)) touchLists();
            else {
                for (const tab of ["all", "requests"]) {
                    const key = chatKeys.inbox(tab);
                    const current = queryClient.getQueryData(key);
                    const next = patchRowPreview(current, conversationId, { seq: message.seq, preview });
                    if (next !== current) queryClient.setQueryData(key, next);
                }
            }
            invalidate(chatKeys.messages(conversationId));
        },

        "chat-read": ({ conversationId, userId, seq } = {}) => {
            // The viewer read it on another tab or device: clear the row here too (a repeat finds it read already).
            if (userId === meId) {
                const key = chatKeys.inbox("all");
                const current = queryClient.getQueryData(key);
                const { data, wasUnread } = markRowRead(current, conversationId, seq);
                if (data !== current) queryClient.setQueryData(key, data);
                if (wasUnread) lowerBadge(queryClient);
            }
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
        },

        "chat-conversation-updated": ({ conversationId } = {}) => {
            touchLists();
            invalidate(chatKeys.conversation(conversationId));
        },
    };
}
