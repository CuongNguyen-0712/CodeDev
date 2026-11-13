import { chatDb } from "@/db/chat.db";
import { socialDb } from "@/db/social.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";
import { runAfter } from "@/lib/runAfter";
import { friendTargetSchema, respondSchema } from "@/lib/validation/social";
import { parseOrThrow } from "@/lib/validation/premium";
import { rankingDb } from "@/db/ranking.db";
import { ensureRankingSnapshot, isRankingPublic } from "@/services/ranking.service";
import { chatRealtime } from "@/services/chatRealtime.service";
import { notificationService } from "@/services/notification.service";

function decodeUserCursor(raw) {
    if (!raw) return null;
    try {
        const [username, id] = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf-8"));
        if (typeof username === "string" && username.length <= 255 && /^\d{1,19}$/.test(id)) return { username, id };
    } catch {
        // fall through
    }
    throw new ApiError("Invalid cursor", 400);
}

const userNotFound = () => new ApiError("User not found", 404);
const notPending = () => new ApiError("There is no pending friend request", 409);

/** The caller's view of a friend row: null | "sent" | "received" | "friends". */
function friendshipOf(row, meDbId) {
    if (row?.status === "accepted") return "friends";
    if (row?.status === "pending") return row.sender_id === meDbId ? "sent" : "received";
    return null;
}

/**
 * After commit (rule 10), `friend-updated` to both people, each with their own view: `user` is the other person.
 * `a` and `b` are `{ dbId, user }`; a failed publish is logged by runAfter and never reaches the caller.
 */
export async function publishFriendUpdated(before, row, a, b) {
    for (const [to, other] of [[a, b], [b, a]]) {
        await runAfter(() => publishToUser(to.user.id, events.FRIEND_UPDATED, {
            user: other.user, friendship: friendshipOf(row, to.dbId), previous: friendshipOf(before, to.dbId),
        }));
    }
}

/** Post-commit effects of a change made by `me`: the request box, one notification per invitation (rule 7), events. */
async function afterFriendChange({ before, row, me, other, conversation }) {
    if (conversation) await runAfter(() => chatRealtime.conversationUpdated(conversation));
    // A new invitation is always sent by `me`; an accept is always made by `me`, the receiver.
    const createdAt = row?.created_at.getTime();
    if (row?.status === "pending") {
        await runAfter(() => notificationService.notify(other.user.id, {
            kind: "friend_request", title: "New friend request", message: `${me.user.username} sent you a friend request.`,
            link: "/contact?tab=invitations", dedupeKey: `${me.user.id}:${createdAt}`,
        }));
    } else if (row?.status === "accepted") {
        await runAfter(() => notificationService.notify(other.user.id, {
            kind: "friend_accepted", title: "Friend request accepted", message: `${me.user.username} accepted your friend request.`,
            link: "/contact?tab=friends", dedupeKey: `${me.user.id}:${createdAt}`,
        }));
    }
    await publishFriendUpdated(before, row, me, other);
}

/**
 * One friend write in one transaction: both users locked (ascending id), then the pair row.
 * `change({ client, me, other, row })` returns the row's new state (or null once deleted).
 */
async function friendWrite(userId, targetId, change, { inviting = false } = {}) {
    if (userId === targetId) throw new ApiError("You can't add yourself as a friend", 400);
    const result = await withTransaction(async (client) => {
        const users = await socialDb.lockUsers(client, [userId, targetId]);
        const me = users.find((u) => u.public_id === userId);
        const other = users.find((u) => u.public_id === targetId);
        // Rule 8: inactive people are never acted on; a hidden profile only stops new invitations.
        if (!me || !other || other.status !== "active" || (inviting && !other.show_profile)) throw userNotFound();
        const before = await socialDb.lockPair(client, me.id, other.id);
        const row = await change({ client, me, other, row: before });
        // Rule 6: becoming friends takes the pair's direct conversation out of the request box.
        const conversation = row?.status === "accepted" && before?.status !== "accepted"
            ? await chatDb.acceptDirectMembers(client, me.id, other.id) : null;
        return {
            before, row, conversation,
            me: { dbId: me.id, user: await socialDb.userSummary(client, me.id) },
            other: { dbId: other.id, user: await socialDb.userSummary(client, other.id) },
        };
    });
    // Every change moves the row's status; a repeated send leaves it as it was and has no effects.
    if (result.before?.status !== result.row?.status) await afterFriendChange(result);
    return { friendship: friendshipOf(result.row, result.me.dbId), user: result.other.user };
}

/** The receiver accepts a pending row. Shared by respond(accept) and a send that crosses an invitation. */
async function accept(client, row) {
    await socialDb.setStatus(client, row.id, "accepted");
    return { ...row, status: "accepted" };
}

export const socialService = {
    /** People search: `{ items, nextCursor }` (docs/api-conventions.md, keyset on username + id). */
    searchUsers: async ({ userId, search, limit = 10, cursor = null }) => {
        const result = await socialDb.getUsersSocial({ userId, search, limit: limit + 1, cursor: decodeUserCursor(cursor) });

        if (!result) {
            throw new ApiError("Failed to load user social data, try again later", 500);
        }

        const page = result.rows.slice(0, limit);
        const last = page[page.length - 1];
        const nextCursor = result.rows.length > limit
            ? Buffer.from(JSON.stringify([last.username, last.cursor_id])).toString("base64url")
            : null;
        let items = page.map(({ cursor_id, ...row }) => row);

        if (isRankingPublic() && items.length > 0) {
            // Overall rank badge, only for learners shown on the leaderboard (others get none).
            await ensureRankingSnapshot();
            const tiers = await rankingDb.getOverallTiers(items.map((row) => row.id));
            const byId = new Map(tiers.rows.map((row) => [row.id, { tier: Number(row.tier), title: row.tier_title }]));
            items = items.map((row) => ({ ...row, rank: byId.get(row.id) || null }));
        }

        return { items, nextCursor };
    },

    /** Rule 1: invite; a request crossing the other person's pending one accepts it. */
    sendRequest: async ({ userId, targetId }) => {
        parseOrThrow(friendTargetSchema, { userId: targetId });
        return friendWrite(userId, targetId, async ({ client, me, other, row }) => {
            if (await chatDb.isBlocked(client, me.id, other.id)) throw new ApiError("Can't send a friend request", 403);
            if (!row) {
                // Re-read: a conflicting row (if any) goes through the same rules as a found one.
                await socialDb.insertPending(client, me.id, other.id);
                row = await socialDb.lockPair(client, me.id, other.id);
            }
            if (row.status === "accepted") throw new ApiError("Already friends", 409);
            if (row.status === "pending") return row.sender_id === me.id ? row : accept(client, row);
            const createdAt = await socialDb.resetPending(client, row.id, me.id, other.id);
            return { ...row, sender_id: me.id, receiver_id: other.id, status: "pending", created_at: createdAt };
        }, { inviting: true });
    },

    /** Rule 2: only the receiver of a pending row; accept → friends, decline → rejected. */
    respond: async ({ userId, targetId, accept: accepting }) => {
        parseOrThrow(respondSchema, { userId: targetId, accept: accepting });
        return friendWrite(userId, targetId, async ({ client, me, row }) => {
            if (row?.status !== "pending" || row.receiver_id !== me.id) throw notPending();
            if (accepting) return accept(client, row);
            await socialDb.setStatus(client, row.id, "rejected");
            return { ...row, status: "rejected" };
        });
    },

    /** Rule 3: only the sender of a pending row → cancelled. */
    cancel: async ({ userId, targetId }) => {
        parseOrThrow(friendTargetSchema, { userId: targetId });
        return friendWrite(userId, targetId, async ({ client, me, row }) => {
            if (row?.status !== "pending" || row.sender_id !== me.id) throw notPending();
            await socialDb.setStatus(client, row.id, "cancelled");
            return { ...row, status: "cancelled" };
        });
    },

    /** Rule 4: either friend deletes the row; the direct conversation is left as it is (rule 9). */
    remove: async ({ userId, targetId }) => {
        parseOrThrow(friendTargetSchema, { userId: targetId });
        return friendWrite(userId, targetId, async ({ client, me, other, row }) => {
            if (row?.status !== "accepted") throw new ApiError("You are not friends", 409);
            await socialDb.deletePair(client, me.id, other.id);
            return null;
        });
    },
};

export default socialService;
