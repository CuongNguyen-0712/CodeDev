import { chatDb } from "@/db/chat.db";
import { socialDb } from "@/db/social.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { friendTargetSchema, respondSchema } from "@/lib/validation/social";
import { parseOrThrow } from "@/lib/validation/premium";
import { rankingDb } from "@/db/ranking.db";
import { ensureRankingSnapshot, isRankingPublic } from "@/services/ranking.service";

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
 * One friend write in one transaction: both users locked (ascending id), then the pair row.
 * `change({ client, me, other, row })` returns the row's new state (or null once deleted).
 */
function friendWrite(userId, targetId, change, { inviting = false } = {}) {
    if (userId === targetId) throw new ApiError("You can't add yourself as a friend", 400);
    return withTransaction(async (client) => {
        const users = await socialDb.lockUsers(client, [userId, targetId]);
        const me = users.find((u) => u.public_id === userId);
        const other = users.find((u) => u.public_id === targetId);
        // Rule 8: inactive people are never acted on; a hidden profile only stops new invitations.
        if (!me || !other || other.status !== "active" || (inviting && !other.show_profile)) throw userNotFound();
        const row = await change({ client, me, other, row: await socialDb.lockPair(client, me.id, other.id) });
        return { friendship: friendshipOf(row, me.id), user: await socialDb.userSummary(client, other.id) };
    });
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
            await socialDb.resetPending(client, row.id, me.id, other.id);
            return { ...row, sender_id: me.id, receiver_id: other.id, status: "pending" };
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
