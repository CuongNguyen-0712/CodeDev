import { rankingDb } from "@/db/ranking.db";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL } from "@/lib/cacheKeys";
import { BOARDS, periodSince, toStanding } from "@/lib/ranking";
import { serverExecutionEnabled } from "@/lib/challenges/codeRunner";

/**
 * Other learners' ranks are shown once coding is graded on the server (code runner or Vercel Sandbox):
 * without it, coding results can be faked, so only a learner's own rank is shown (ranking-plan §9).
 * RANKING_PUBLIC=true|false overrides this.
 */
export const isRankingPublic = () =>
    process.env.RANKING_PUBLIC ? process.env.RANKING_PUBLIC === "true" : serverExecutionEnabled();

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

/**
 * Recomputes the snapshot now (the ranking-refresh cron, hourly). The marker lasts a few minutes;
 * after that the first reader refreshes it, so an idle site does not wake the database for it.
 */
export async function refreshRankingSnapshot() {
    const refreshed = await rankingDb.refreshSnapshot();
    await redis.set(cacheKeys.rankingSnapshot(), new Date().toISOString(), { ex: TTL.RANKING_SNAPSHOT + 120 });
    return { refreshed };
}

/**
 * Fallback for readers: recomputes profile.ranking_snapshot when no refresh happened within
 * TTL.RANKING_SNAPSHOT. That reader pays for it; other instances skip (advisory lock).
 */
export async function ensureRankingSnapshot() {
    await redis.remember(cacheKeys.rankingSnapshot(), TTL.RANKING_SNAPSHOT, async () => {
        await rankingDb.refreshSnapshot();
        return new Date().toISOString();
    });
}

const getTiers = (board) =>
    redis.remember(cacheKeys.rankingTiers(board), TTL.RANKING_TIERS, async () =>
        (await rankingDb.getTiers(board)).rows.map((row) => ({ tier: row.tier, title: row.title, minScore: Number(row.min_score) })));

async function standing({ board, period, userKey }) {
    const result = await rankingDb.getStanding({ board, since: periodSince(period), userKey });
    return toStanding(result.rows[0]);
}

export const rankingService = {
    /** One board: top 50 (when public), the viewer's standing and the tier ladder. */
    getBoard: async ({ userId, board, period }) => {
        const isPublic = isRankingPublic();
        await ensureRankingSnapshot();

        const [top, me, tiers] = await Promise.all([
            isPublic
                ? redis.remember(cacheKeys.rankingTop(board, period), TTL.RANKING_TOP, async () => {
                    const result = await rankingDb.getTop({ board, since: periodSince(period), limit: 50 });
                    return { entries: result.rows.map(toEntry), updatedAt: new Date().toISOString() };
                })
                : null,
            standing({ board, period, userKey: userId }),
            getTiers(board),
        ]);

        return {
            board,
            period,
            isPublic,
            updatedAt: top?.updatedAt || null,
            entries: top?.entries || [],
            me,
            tiers,
        };
    },

    /** All-time standing on every board for one learner (`userKey` = public_id). */
    getRanks: async (userKey) => {
        await ensureRankingSnapshot();
        const rows = await Promise.all(BOARDS.map((board) => standing({ board, period: "all", userKey })));
        return Object.fromEntries(BOARDS.map((board, index) => [board, rows[index]]));
    },
};
