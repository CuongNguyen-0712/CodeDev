import { socialDb } from "@/db/social.db";
import { ApiError } from "@/lib/error/apiError";
import { rankingDb } from "@/db/ranking.db";
import { isRankingPublic } from "@/services/ranking.service";

export const socialService = {
    getUsersSocial: async ({ userId, search, limit = 10, offset = 0 }) => {
        const result = await socialDb.getUsersSocial({ userId, search, limit, offset });

        if (!result) {
            throw new ApiError("Failed to load user social data, try again later", 500);
        }

        const rows = result.rows || result;
        if (!isRankingPublic() || rows.length === 0) return rows;

        // Overall rank badge, only for learners shown on the leaderboard (others get none).
        const tiers = await rankingDb.getOverallTiers(rows.map((row) => row.id));
        const byId = new Map(tiers.rows.map((row) => [row.id, { tier: Number(row.tier), title: row.tier_title }]));
        return rows.map((row) => ({ ...row, rank: byId.get(row.id) || null }));
    }
};

export default socialService;
