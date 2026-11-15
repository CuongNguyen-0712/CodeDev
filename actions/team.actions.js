'use server';

import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";
import { teamService } from "@/services/team.service";

// userId always comes from the session via runAction; the service validates the rest (400) and checks membership.
// Each returns { team } (respond: { team, conversationId }).

export async function createTeamAction({ name, memberIds } = {}) {
    return runAction(({ userId }) => teamService.create({ userId, name, memberIds }),
        { limiter: rateLimiters.team, context: "createTeamAction" });
}

export async function inviteToTeamAction({ teamId, userIds } = {}) {
    return runAction(({ userId }) => teamService.invite({ userId, teamId, userIds }),
        { limiter: rateLimiters.team, context: "inviteToTeamAction" });
}

export async function respondTeamInviteAction({ teamId, accept } = {}) {
    return runAction(({ userId }) => teamService.respond({ userId, teamId, accept }),
        { limiter: rateLimiters.team, context: "respondTeamInviteAction" });
}

// `userId` is the member to remove; the caller is the session user.
export async function removeTeamMemberAction({ teamId, userId: targetId } = {}) {
    return runAction(({ userId }) => teamService.removeMember({ userId, teamId, targetId }),
        { limiter: rateLimiters.team, context: "removeTeamMemberAction" });
}

export async function renameTeamAction({ teamId, name } = {}) {
    return runAction(({ userId }) => teamService.rename({ userId, teamId, name }),
        { limiter: rateLimiters.team, context: "renameTeamAction" });
}

export async function leaveTeamAction(teamId) {
    return runAction(({ userId }) => teamService.leave({ userId, teamId }),
        { limiter: rateLimiters.team, context: "leaveTeamAction" });
}
