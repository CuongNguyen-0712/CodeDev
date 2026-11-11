import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
    blockUserAction, createChatUploadAction, editMessageAction, markReadAction, recallMessageAction,
    reportMessageAction, respondRequestAction, sendMessageAction, typingAction, unblockUserAction,
} from "@/actions/chat.actions";
import { chatKeys } from "@/keys/chat.keys";
import { callAction } from "@/lib/actionResult";
import { READ_DEBOUNCE_MS, TYPING_THROTTLE_MS } from "@/lib/chat/limits";
import { lowerBadge, markRowRead } from "@/lib/chat/inboxCache";
import { insertMessage, optimisticMessage, patchMessage } from "@/lib/chat/messageCache";
import { getPusherClient } from "@/lib/pusherClient";
import { useChatOutboxStore } from "@/stores/chatOutboxStore";

// Lets the server skip this tab when it fans the event out.
const withSocket = (input) => {
    const socketId = getPusherClient()?.connection?.socket_id;
    return socketId ? { ...input, socketId } : input;
};

const refreshLists = (queryClient) => {
    queryClient.invalidateQueries({ queryKey: chatKeys.inbox("all") });
    queryClient.invalidateQueries({ queryKey: chatKeys.inbox("requests") });
    queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
};

/**
 * variables: { clientId, body, sender, attachmentIds?, attachments?, toUserId? }. The unsent message lives in the outbox store
 * (a refetch of the messages query must not drop it). Calling mutate again with the same clientId retries it;
 * the server returns the first copy if it arrived.
 */
export function useSendMessage(conversationId) {
    const queryClient = useQueryClient();
    const { reset } = useTypingPing(conversationId);
    return useMutation({
        mutationFn: ({ clientId, body, attachmentIds, toUserId }) => callAction(() => sendMessageAction(withSocket({
            clientId, body, ...(attachmentIds?.length ? { attachmentIds } : {}),
            ...(conversationId ? { conversationId } : { toUserId }),
        }))),
        onMutate: ({ clientId, body, sender, attachmentIds, attachments }) => {
            reset(); // the next keystroke after a send may ping at once
            if (!conversationId) return;
            const outbox = useChatOutboxStore.getState();
            if (outbox.byConversation[conversationId]?.some((m) => m.clientId === clientId)) outbox.setUnsentStatus(conversationId, clientId, "sending");
            // attachmentIds kept so Retry resends the same images.
            else outbox.addUnsent(conversationId, { ...optimisticMessage({ clientId, body, sender, conversationId, attachments }), attachmentIds: attachmentIds ?? [] });
        },
        onSuccess: ({ message }, { clientId, sender }) => {
            queryClient.setQueryData(chatKeys.messages(message.conversationId), (data) => insertMessage(data, message));
            useChatOutboxStore.getState().removeUnsent(message.conversationId, clientId);
            // A reply to a request accepts it: only then do the banner and canSend change, and the detail knows my state.
            const detail = queryClient.getQueryData(chatKeys.conversation(message.conversationId));
            const mine = detail?.members?.find((m) => m.id === sender?.id);
            if (detail && mine?.state !== "accepted") queryClient.invalidateQueries({ queryKey: chatKeys.conversation(message.conversationId) });
            // This tab never gets its own chat-message. No client-side preview helper exists (the action strips it), so refetch All only; unread is untouched.
            queryClient.invalidateQueries({ queryKey: chatKeys.inbox("all") });
        },
        onError: (_, { clientId }) => {
            if (conversationId) useChatOutboxStore.getState().setUnsentStatus(conversationId, clientId, "failed");
        },
    });
}

// Optimistic: `change(message, variables)` is applied at once and rolled back (that message only) when the action fails.
function useMessageWrite(action, change) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ conversationId: _conversationId, ...input }) => callAction(() => action(input)),
        onMutate: async (variables) => {
            const key = chatKeys.messages(variables.conversationId);
            await queryClient.cancelQueries({ queryKey: key });
            // Only this message is rolled back: other inserts or edits may land while the request runs.
            const previous = queryClient.getQueryData(key)?.pages.flatMap((p) => p.items).find((m) => m.id === variables.messageId);
            queryClient.setQueryData(key, (data) => (data && {
                ...data,
                pages: data.pages.map((page) => ({ ...page, items: page.items.map((m) => (m.id === variables.messageId ? change(m, variables) : m)) })),
            }));
            return { key, previous };
        },
        onError: (_, __, context) => {
            // A rollback may legitimately revive a message, which patchMessage refuses: swap the copy directly.
            if (context?.previous) queryClient.setQueryData(context.key, (data) => data && {
                ...data,
                pages: data.pages.map((page) => ({ ...page, items: page.items.map((m) => (m.id === context.previous.id ? context.previous : m)) })),
            });
        },
        onSuccess: ({ message }) => {
            queryClient.setQueryData(chatKeys.messages(message.conversationId), (data) => patchMessage(data, message));
            queryClient.invalidateQueries({ queryKey: chatKeys.inbox("all") });
        },
    });
}

// { conversationId, messageId, body }
export const useEditMessage = () => useMessageWrite(
    (input) => editMessageAction(withSocket(input)),
    (m, { body }) => ({ ...m, body, editedAt: new Date().toISOString() }),
);
// { conversationId, messageId }
export const useRecallMessage = () => useMessageWrite(
    ({ messageId }) => recallMessageAction(withSocket({ messageId })),
    (m) => ({ ...m, deleted: true, body: "", attachments: [] }),
);

const pendingReads = new Map(); // conversationId -> { seq, timer }

/**
 * Returns markRead(conversationId, seq) (meId finds my lastReadSeq in the cached detail): waits READ_DEBOUNCE_MS per conversation and sends the highest
 * seq seen. A failure is ignored; the next message marks it again.
 */
export function useMarkRead(meId) {
    const queryClient = useQueryClient();
    return useCallback((conversationId, seq) => {
        // Already read here (the detail's own lastReadSeq): nothing to send.
        const read = queryClient.getQueryData(chatKeys.conversation(conversationId))?.members?.find((m) => m.id === meId)?.lastReadSeq;
        try {
            if (read != null && BigInt(seq) <= BigInt(read)) return;
        } catch { /* unreadable seq: send it */ }
        const pending = pendingReads.get(conversationId);
        if (pending) {
            clearTimeout(pending.timer);
            if (BigInt(seq) > BigInt(pending.seq)) pending.seq = seq;
        }
        const entry = pending ?? { seq };
        entry.timer = setTimeout(async () => {
            pendingReads.delete(conversationId);
            try {
                await callAction(() => markReadAction({ conversationId, seq: entry.seq }));
                // Remember it, so the same seq is not sent again.
                queryClient.setQueryData(chatKeys.conversation(conversationId), (detail) => {
                    const mine = detail?.members?.find((m) => m.id === meId);
                    if (!mine || BigInt(entry.seq) <= BigInt(mine.lastReadSeq ?? 0)) return detail;
                    return { ...detail, members: detail.members.map((m) => (m === mine ? { ...m, lastReadSeq: String(entry.seq) } : m)) };
                });
                // The row and the badge are known locally: no refetch.
                const current = queryClient.getQueryData(chatKeys.inbox("all"));
                const { data, wasUnread, found } = markRowRead(current, conversationId, entry.seq);
                if (data !== current) queryClient.setQueryData(chatKeys.inbox("all"), data);
                if (wasUnread) lowerBadge(queryClient);
                else if (!found) queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
            } catch { /* ignored on purpose */ }
        }, READ_DEBOUNCE_MS);
        pendingReads.set(conversationId, entry);
    }, [queryClient, meId]);
}

const lastPing = new Map(); // conversationId -> ms of the last typing signal (shared so a send can reset it)

function makePing(conversationId) {
    const ping = () => {
        if (document.visibilityState !== "visible") return;
        const now = Date.now();
        if (now - (lastPing.get(conversationId) ?? 0) < TYPING_THROTTLE_MS) return;
        lastPing.set(conversationId, now);
        callAction(() => typingAction(withSocket({ conversationId }))).catch(() => { });
    };
    ping.reset = () => lastPing.delete(conversationId);
    return ping;
}

/** Returns ping(): sends a typing signal at most once per TYPING_THROTTLE_MS, only while the tab is visible. `ping.reset()` lifts the throttle. Failures are ignored. */
export const useTypingPing = (conversationId) => useMemo(() => makePing(conversationId), [conversationId]);

// { conversationId, accept }
export function useRespondRequest() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input) => callAction(() => respondRequestAction(input)),
        onSuccess: (_, { conversationId }) => {
            queryClient.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) });
            refreshLists(queryClient);
        },
    });
}

function useBlockWrite(action) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (userId) => callAction(() => action(userId)),
        // Blocking changes who can be messaged, so open conversations and the list of blocks go stale.
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: chatKeys.blocks() });
            queryClient.invalidateQueries({ queryKey: [...chatKeys.all, "conversation"] });
            refreshLists(queryClient);
        },
    });
}

export const useBlockUser = () => useBlockWrite(blockUserAction);
export const useUnblockUser = () => useBlockWrite(unblockUserAction);

// { messageId, reason }
export const useReportMessage = () => useMutation({ mutationFn: (input) => callAction(() => reportMessageAction(input)) });

// { conversationId, contentType, size, width, height } -> { attachmentId, upload: { url, method, headers } }
export const useCreateChatUpload = () => useMutation({ mutationFn: (input) => callAction(() => createChatUploadAction(input)) });
