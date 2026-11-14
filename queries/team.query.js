import { userClient } from "@/clients/user.client";

import { teamKeys } from "@/keys/team.keys";
import { QUERY_TIMES } from "@/lib/queryTimes";

export const teamQueries = {
    members(status, teamId) {
        return {
            queryKey: teamKeys.members(teamId),
            enabled: status === 'authenticated' && Boolean(teamId),
            queryFn: () => userClient.getTeamMembers(teamId),
            ...QUERY_TIMES.personal,
        };
    },

    /** Pending team invitations (useInfiniteQuery). */
    invitations(status) {
        return {
            queryKey: teamKeys.invitations(),
            enabled: status === 'authenticated',
            queryFn: ({ pageParam }) => userClient.getTeamInvitations(pageParam ? { cursor: pageParam } : {}),
            initialPageParam: null,
            getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
            ...QUERY_TIMES.personal,
        };
    },
}
