import { chatClient } from "../clients/chat.client";

import { chatKeys } from "@/keys/chat.keys";
import { QUERY_TIMES } from "@/lib/queryTimes";

export const chatQueries = {
    inbox(tab) {
        return {
            queryKey: chatKeys.inbox(tab),
            initialPageParam: undefined,
            queryFn: ({ pageParam }) => chatClient.getInbox({ tab, cursor: pageParam }),
            getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
            ...QUERY_TIMES.live,
        };
    },
    conversation(id) {
        return { queryKey: chatKeys.conversation(id), queryFn: () => chatClient.getConversation(id), ...QUERY_TIMES.live };
    },
    // Pages newest first; pageParam is the `before` seq cursor.
    messages(id) {
        return {
            queryKey: chatKeys.messages(id),
            initialPageParam: undefined,
            queryFn: ({ pageParam }) => chatClient.getMessages({ id, before: pageParam }),
            getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
            ...QUERY_TIMES.live,
        };
    },
    unread() {
        return { queryKey: chatKeys.unread(), queryFn: () => chatClient.getUnread(), refetchInterval: 60_000, ...QUERY_TIMES.live };
    },
    blocks() {
        return { queryKey: chatKeys.blocks(), queryFn: () => chatClient.getBlocks(), ...QUERY_TIMES.personal };
    },
};
