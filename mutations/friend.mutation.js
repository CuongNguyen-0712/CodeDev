import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
    cancelFriendRequestAction, removeFriendAction, respondFriendRequestAction, sendFriendRequestAction,
} from "@/actions/social.actions";
import { friendKeys } from "@/keys/friend.keys";
import { userKeys } from "@/keys/user.keys";
import { callAction } from "@/lib/actionResult";
import { isPusherConnected } from "@/lib/pusherClient";
import { applyFriendChange, patchUserPages } from "@/lib/social/friendCache";

const USERS = [...userKeys.all, "users"];
const rowsOf = (data) => data?.pages?.flatMap((page) => page.items) ?? [];

// The person and my current friendship with them, from whichever cache holds them; null when none does.
function findPerson(queryClient, id) {
    for (const [, data] of queryClient.getQueriesData({ queryKey: USERS })) {
        const row = rowsOf(data).find((u) => u.id === id);
        if (row) {
            const { friendship, rank: _rank, showProfile: _showProfile, ...user } = row;
            return { user, previous: friendship ?? null };
        }
    }
    const lists = [[[...friendKeys.all, "list"], "friends"], [friendKeys.invitations("received"), "received"], [friendKeys.invitations("sent"), "sent"]];
    for (const [queryKey, previous] of lists) {
        for (const [, data] of queryClient.getQueriesData({ queryKey })) {
            const user = rowsOf(data).find((u) => u.id === id);
            if (user) return { user, previous };
        }
    }
    return null;
}

/**
 * Optimistic: `next(input, previous)` is the friendship shown at once. Counts are left to the
 * friend-updated event, which reaches my own tabs too (patching them here as well would count twice).
 */
function useFriendWrite(action, next) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input) => callAction(() => action(input)),
        onMutate: async (input) => {
            const found = findPerson(queryClient, input?.userId ?? input);
            if (!found) return null;
            // Counts are never written here: their in-flight refetch may finish.
            await Promise.all([
                queryClient.cancelQueries({ queryKey: friendKeys.all, predicate: (q) => q.queryKey[1] !== "counts" }),
                queryClient.cancelQueries({ queryKey: USERS }),
            ]);
            const change = { user: found.user, friendship: next(input, found.previous), previous: found.previous };
            applyFriendChange(queryClient, change, { counts: false });
            return change;
        },
        // Undo only this person, and in people search only rows still showing our guess: changes that landed meanwhile stay.
        onError: (_, __, change) => {
            if (change) {
                const undo = { user: change.user, friendship: change.previous, previous: change.friendship };
                for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: USERS })) {
                    if (rowsOf(data).some((u) => u.id === change.user.id && u.friendship !== change.friendship)) continue;
                    const restored = patchUserPages(data, undo);
                    if (restored !== data) queryClient.setQueryData(queryKey, restored);
                }
                applyFriendChange(queryClient, undo, { counts: false, users: false });
            }
            queryClient.invalidateQueries({ queryKey: friendKeys.all });
        },
        onSuccess: ({ friendship, user }) => {
            applyFriendChange(queryClient, { user, friendship }, { counts: false });
            // No socket, no echo: refetch the tab numbers instead.
            if (!isPusherConnected()) queryClient.invalidateQueries({ queryKey: friendKeys.counts() });
        },
        // onMutate cancels in-flight refetches (an earlier error's recovery among them): restart the ones still due.
        onSettled: () => {
            const due = { predicate: (q) => q.state.isInvalidated };
            queryClient.invalidateQueries({ queryKey: friendKeys.all, ...due }, { cancelRefetch: false });
            queryClient.invalidateQueries({ queryKey: USERS, ...due }, { cancelRefetch: false });
        },
    });
}

/** send(userId), respond({ userId, accept }), cancel(userId), remove(userId): each a mutation result of { friendship, user }. */
export function useFriendAction() {
    return {
        send: useFriendWrite(sendFriendRequestAction, (_, previous) => (previous === "received" ? "friends" : "sent")),
        respond: useFriendWrite(respondFriendRequestAction, ({ accept }) => (accept ? "friends" : null)),
        cancel: useFriendWrite(cancelFriendRequestAction, () => null),
        remove: useFriendWrite(removeFriendAction, () => null),
    };
}
