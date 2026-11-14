import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
    createTeamAction, inviteToTeamAction, leaveTeamAction, removeTeamMemberAction, renameTeamAction, respondTeamInviteAction,
} from "@/actions/team.actions";
import { chatKeys } from "@/keys/chat.keys";
import { friendKeys } from "@/keys/friend.keys";
import { teamKeys } from "@/keys/team.keys";
import { callAction } from "@/lib/actionResult";

/** create({ name, memberIds }), invite({ teamId, userIds }), respond({ teamId, accept }), remove({ teamId, userId }), rename({ teamId, name }), leave(teamId). */
export function useTeamAction() {
    const queryClient = useQueryClient();
    const useWrite = (action) => useMutation({
        mutationFn: (input) => callAction(() => action(input)),
        // Settled, not success: a 409/404 means the cached team or invitation is stale.
        onSettled: () => {
            for (const queryKey of [teamKeys.all, friendKeys.counts(), chatKeys.inbox("all"), chatKeys.inbox("requests")]) {
                queryClient.invalidateQueries({ queryKey });
            }
        },
    });
    return {
        create: useWrite(createTeamAction),
        invite: useWrite(inviteToTeamAction),
        respond: useWrite(respondTeamInviteAction),
        remove: useWrite(removeTeamMemberAction),
        rename: useWrite(renameTeamAction),
        leave: useWrite(leaveTeamAction),
    };
}
