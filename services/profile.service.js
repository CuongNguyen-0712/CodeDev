import { profileDb } from "@/db/profile.db";
import { ApiError } from "@/lib/error/apiError";
import { redis } from "@/lib/cache";
import { cacheKeys } from "@/lib/cacheKeys";
import { BOARDS, PERIODS } from "@/lib/ranking";
import { isRankingPublic, rankingService } from "@/services/ranking.service";

const PRIVACY_KEYS = ["showProfile", "showLearning", "showOnLeaderboard"];

const toPrivacy = (row) => ({
    username: row.username,
    showProfile: row.show_profile,
    showLearning: row.show_learning,
    showOnLeaderboard: row.show_on_leaderboard,
});

export const profileService = {
    /**
     * Public view of a learner, or null when missing / hidden / locked (callers answer 404 for all,
     * so a hidden profile cannot be told apart). Never contains email, points, orders or sessions.
     */
    getPublicProfile: async (key) => {
        if (typeof key !== "string" || !key || key.length > 255) return null;

        const { rows } = await profileDb.getPublicProfile(key);
        const user = rows[0];
        if (!user) return null;

        const showRanks = isRankingPublic() && user.show_on_leaderboard;
        const [learning, ranks] = await Promise.all([
            profileDb.getLearningSummary({ userKey: user.id, withCourses: user.show_learning }),
            showRanks ? rankingService.getRanks(user.id) : null,
        ]);
        const summary = learning.rows[0] || {};

        return {
            id: user.id,
            username: user.username,
            nickname: user.nickname && user.nickname !== "None" ? user.nickname : null,
            image: user.image || null,
            memberSince: user.created_at,
            exp: Number(user.exp) || 0,
            level: Number(user.level) || 1,
            levelTitle: user.levelTitle,
            levelMinExp: user.levelMinExp,
            nextLevelMinExp: user.nextLevelMinExp,
            challengesPassed: Number(user.challenges_passed) || 0,
            byStatus: summary.by_status || {},
            showLearning: user.show_learning,
            courses: summary.courses || null,
            languages: summary.languages || null,
            ranks,
        };
    },

    getPrivacy: async (userId) => {
        const { rows } = await profileDb.getPrivacy(userId);
        if (!rows[0]) throw new ApiError("Profile not found", 404);
        return toPrivacy(rows[0]);
    },

    updatePrivacy: async (userId, body) => {
        const flags = {};
        for (const key of PRIVACY_KEYS) {
            if (body?.[key] === undefined) continue;
            if (typeof body[key] !== "boolean") throw new ApiError(`${key} must be true or false`, 400);
            flags[key] = body[key];
        }
        if (Object.keys(flags).length === 0) throw new ApiError("No privacy setting to update", 400);

        const { rows } = await profileDb.setPrivacy(userId, flags);
        if (!rows[0]) throw new ApiError("Profile not found", 404);
        // Opting out (or back in) shows on the boards now, not after the 5-minute cache.
        if ("showOnLeaderboard" in flags) {
            await redis.del(...BOARDS.flatMap((board) => PERIODS.map((period) => cacheKeys.rankingTop(board, period))));
        }
        return toPrivacy(rows[0]);
    },
};
