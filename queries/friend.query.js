import { keepPreviousData } from "@tanstack/react-query";

import { userClient } from "@/clients/user.client";

import { friendKeys } from "@/keys/friend.keys";
import { QUERY_TIMES } from "@/lib/queryTimes";

const nextCursor = (lastPage) => lastPage?.nextCursor || undefined;

export const friendQueries = {
    /** Friends list (useInfiniteQuery); shown while the next search loads. */
    list(status, search) {
        const term = search?.trim() || '';
        return {
            queryKey: friendKeys.list(term),
            enabled: status === 'authenticated',
            queryFn: ({ pageParam }) =>
                userClient.getFriends({
                    ...(term ? { search: term } : {}),
                    ...(pageParam ? { cursor: pageParam } : {}),
                }),
            initialPageParam: null,
            getNextPageParam: nextCursor,
            placeholderData: keepPreviousData,
            ...QUERY_TIMES.personal,
        };
    },

    /** direction: "received" | "sent" (useInfiniteQuery). */
    invitations(status, direction) {
        return {
            queryKey: friendKeys.invitations(direction),
            enabled: status === 'authenticated',
            queryFn: ({ pageParam }) =>
                userClient.getFriendInvitations({ direction, ...(pageParam ? { cursor: pageParam } : {}) }),
            initialPageParam: null,
            getNextPageParam: nextCursor,
            ...QUERY_TIMES.personal,
        };
    },

    counts(status) {
        return {
            queryKey: friendKeys.counts(),
            enabled: status === 'authenticated',
            queryFn: () => userClient.getFriendCounts(),
            ...QUERY_TIMES.personal,
        };
    },
}
