import { socialDb } from "@/db/social.db";
import { ApiError } from "@/lib/error/apiError";
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
    }
};

export default socialService;
