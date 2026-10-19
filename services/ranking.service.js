import { rankingDb } from "@/db/ranking.db";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL } from "@/lib/cacheKeys";
import { BOARDS, periodSince, toStanding } from "@/lib/ranking";

/**
 * Other learners' ranks are shown only when RANKING_PUBLIC=true: until production grades code on
 * the server (CODE_RUNNER_URL), coding results can be faked, so only a learner's own rank is shown
 * (ranking-plan §9).
 */
export const isRankingPublic = () => process.env.RANKING_PUBLIC === "true";

const toEntry = (row) => ({
    position: Number(row.position),
    user: {
        id: row.id,
        username: row.username,
        nickname: row.nickname && row.nickname !== "None" ? row.nickname : null,
        image: row.image || null,
        level: Number(row.level) || 1,
    },
    score: Number(row.score) || 0,
    tier: Number(row.tier) || 1,
    tierTitle: row.tier_title || null,
});

async function standing({ board, period, userKey }) {
    const result = await rankingDb.getStanding({ board, since: periodSince(period), userKey });
    return toStanding(result.rows[0]);
}

export const rankingService = {
    /** One board: top 50 (when public), the viewer's standing and the tier ladder. */
    getBoard: async ({ userId, board, period }) => {
        const isPublic = isRankingPublic();

        const [top, me, tiers] = await Promise.all([
            isPublic
                ? redis.remember(cacheKeys.rankingTop(board, period), TTL.RANKING_TOP, async () => {
                    const result = await rankingDb.getTop({ board, since: periodSince(period), limit: 50 });
                    return { entries: result.rows.map(toEntry), updatedAt: new Date().toISOString() };
                })
                : null,
            standing({ board, period, userKey: userId }),
            rankingDb.getTiers(board),
        ]);

        return {
            board,
            period,
            isPublic,
            updatedAt: top?.updatedAt || null,
            entries: top?.entries || [],
            me,
            tiers: tiers.rows.map((row) => ({ tier: row.tier, title: row.title, minScore: Number(row.min_score) })),
        };
    },

    /** All-time standing on every board for one learner (`userKey` = public_id). */
    getRanks: async (userKey) => {
        const rows = await Promise.all(BOARDS.map((board) => standing({ board, period: "all", userKey })));
        return Object.fromEntries(BOARDS.map((board, index) => [board, rows[index]]));
    },
};
