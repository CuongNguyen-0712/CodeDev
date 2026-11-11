import { useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
    blockUserAction, createChatUploadAction, editMessageAction, markReadAction, recallMessageAction,
    reportMessageAction, respondRequestAction, sendMessageAction, typingAction, unblockUserAction,
} from "@/actions/chat.actions";
import { chatKeys } from "@/keys/chat.keys";
import { callAction } from "@/lib/actionResult";
import { READ_DEBOUNCE_MS, TYPING_THROTTLE_MS } from "@/lib/chat/limits";
import { insertMessage, optimisticMessage, patchMessage, setMessageStatus } from "@/lib/chat/messageCache";
import { getPusherClient } from "@/lib/pusherClient";

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
 * variables: { clientId, body, sender, attachmentIds?, toUserId? }. The optimistic message is added once;
 * calling mutate again with the same clientId retries it (the server returns the first copy if it arrived).
 */
export function useSendMessage(conversationId) {
    const queryClient = useQueryClient();
    const key = conversationId ? chatKeys.messages(conversationId) : null;
    return useMutation({
        mutationFn: ({ clientId, body, attachmentIds, toUserId }) => callAction(() => sendMessageAction(withSocket({
            clientId, body, ...(attachmentIds?.length ? { attachmentIds } : {}),
            ...(conversationId ? { conversationId } : { toUserId }),
        }))),
        onMutate: ({ clientId, body, sender }) => {
            if (!key) return;
            const retrying = queryClient.getQueryData(key)?.pages.some((p) => p.items.some((m) => m.clientId === clientId && m.seq == null));
            queryClient.setQueryData(key, (data) => (retrying
                ? setMessageStatus(data, clientId, "sending")
                : insertMessage(data, optimisticMessage({ clientId, body, sender, conversationId }))));
        },
        onSuccess: ({ message }) => {
            queryClient.setQueryData(chatKeys.messages(message.conversationId), (data) => insertMessage(data, message));
        },
        onError: (_, { clientId }) => {
            if (key) queryClient.setQueryData(key, (data) => setMessageStatus(data, clientId, "failed"));
        },
        onSettled: () => refreshLists(queryClient),
    });
}

function useMessageWrite(action) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input) => callAction(() => action(input)),
        onSuccess: ({ message }) => {
            queryClient.setQueryData(chatKeys.messages(message.conversationId), (data) => patchMessage(data, message));
            queryClient.invalidateQueries({ queryKey: chatKeys.inbox("all") });
        },
    });
}

// { messageId, body }
export const useEditMessage = () => useMessageWrite((input) => editMessageAction(withSocket(input)));
// messageId
export const useRecallMessage = () => useMessageWrite((messageId) => recallMessageAction(withSocket({ messageId })));

const pendingReads = new Map(); // conversationId -> { seq, timer }

/**
 * Returns markRead(conversationId, seq): waits READ_DEBOUNCE_MS per conversation and sends the highest
 * seq seen. A failure is ignored; the next message marks it again.
 */
export function useMarkRead() {
    const queryClient = useQueryClient();
    return useCallback((conversationId, seq) => {
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
                refreshLists(queryClient);
            } catch { /* ignored on purpose */ }
        }, READ_DEBOUNCE_MS);
        pendingReads.set(conversationId, entry);
    }, [queryClient]);
}

/** Returns ping(): sends a typing signal at most once per TYPING_THROTTLE_MS. Failures are ignored. */
export function useTypingPing(conversationId) {
    const lastSent = useRef(0);
    return useCallback(() => {
        const now = Date.now();
        if (now - lastSent.current < TYPING_THROTTLE_MS) return;
        lastSent.current = now;
        callAction(() => typingAction(withSocket({ conversationId }))).catch(() => { });
    }, [conversationId]);
}

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
