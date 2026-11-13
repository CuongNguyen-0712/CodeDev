import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
    cancelFriendRequestAction, removeFriendAction, respondFriendRequestAction, sendFriendRequestAction,
} from "@/actions/social.actions";
import { friendKeys } from "@/keys/friend.keys";
import { userKeys } from "@/keys/user.keys";
import { callAction } from "@/lib/actionResult";

/** send(userId), respond({ userId, accept }), cancel(userId), remove(userId): each a mutation result of { friendship, user }. */
export function useFriendAction() {
    const queryClient = useQueryClient();
    // Task 6 replaces this blanket refresh with optimistic cache patching.
    const onSuccess = () => {
        queryClient.invalidateQueries({ queryKey: friendKeys.all });
        queryClient.invalidateQueries({ queryKey: [...userKeys.all, 'users'] });
    };
    const useOne = (action) => useMutation({ mutationFn: (input) => callAction(() => action(input)), onSuccess });

    return {
        send: useOne(sendFriendRequestAction),
        respond: useOne(respondFriendRequestAction),
        cancel: useOne(cancelFriendRequestAction),
        remove: useOne(removeFriendAction),
    };
}
