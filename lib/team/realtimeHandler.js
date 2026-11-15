import { chatKeys } from "@/keys/chat.keys";
import { friendKeys } from "@/keys/friend.keys";
import { teamKeys } from "@/keys/team.keys";
import { removeRow } from "@/lib/chat/inboxCache";

const INBOXES = ["all", "requests"];

/**
 * `team-updated` ({ teamId, change, conversationId?, userId? }): invalidate only, except a team that is over for me
 * (ended, or kicked / left with userId = me): its conversation leaves the inbox caches at once. Without the conversation
 * id the rows cannot be told apart, so the inbox is refetched instead. The conversation itself is refetched too, so another
 * open tab on it gets its 404 and leaves.
 */
export function createTeamHandler(queryClient, meId) {
    return ({ change, conversationId, userId } = {}) => {
        const over = change === "ended" || ((change === "kicked" || change === "left") && userId != null && userId === meId);
        for (const tab of INBOXES) {
            const key = chatKeys.inbox(tab);
            const data = queryClient.getQueryData(key);
            if (over && conversationId && data) {
                const next = removeRow(data, conversationId);
                if (next !== data) queryClient.setQueryData(key, next);
            }
        }
        const keys = [teamKeys.all, friendKeys.counts(), ...INBOXES.map(chatKeys.inbox), chatKeys.unread()];
        if (over && conversationId) keys.push(chatKeys.conversation(conversationId));
        for (const queryKey of keys) queryClient.invalidateQueries({ queryKey });
    };
}
