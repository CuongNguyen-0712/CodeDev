/**
 * Leaderboard query state and the shape of a standing (docs/ranking-plan.md,
 * docs/ui-ux/PROFILE_AND_LEADERBOARD_PLAN.md §4). Shared by the API and the /ranking page.
 */
export const BOARDS = ["overall", "exp", "points"];
export const PERIODS = ["all", "30d"];

export const BOARD_LABELS = { overall: "Overall", exp: "EXP", points: "Points" };
export const PERIOD_LABELS = { all: "All time", "30d": "Last 30 days" };
export const SCORE_UNITS = { overall: "pts", exp: "EXP", points: "points" };

/** Unknown values fall back to the defaults, so a bad URL never errors. */
export function parseRankingQuery(params) {
    const get = (key) => (typeof params?.get === "function" ? params.get(key) : params?.[key]);
    const board = BOARDS.includes(get("board")) ? get("board") : "overall";
    const period = PERIODS.includes(get("period")) ? get("period") : "all";
    return { board, period };
}

/** Start of the period (ISO), or null for all time. */
export function periodSince(period, now = new Date()) {
    if (period !== "30d") return null;
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

/** DB standing row -> API shape. `toNext` is 0 at the top tier. */
export function toStanding(row) {
    if (!row) return null;
    const allScore = Number(row.all_score) || 0;
    const nextMin = row.next_min_score == null ? null : Number(row.next_min_score);
    const tierMin = Number(row.tier_min_score) || 0;
    return {
        position: row.position == null ? null : Number(row.position),
        score: Number(row.score) || 0,
        visible: row.visible !== false,
        optedOut: row.opted_out === true,
        user: row.username
            ? { id: row.public_id, username: row.username, nickname: row.nickname && row.nickname !== "None" ? row.nickname : null, image: row.image || null }
            : null,
        tier: Number(row.tier) || 1,
        title: row.tier_title || null,
        allTimeScore: allScore,
        next: nextMin == null ? null : { title: row.next_title, minScore: nextMin },
        toNext: nextMin == null ? 0 : Math.max(0, nextMin - allScore),
        percent: nextMin == null
            ? 100
            : Math.min(100, Math.max(0, Math.round(((allScore - tierMin) / Math.max(1, nextMin - tierMin)) * 100))),
    };
}

/** Boards whose tier went up between two `{ overall, exp, points }` snapshots (rank-up toast). */
export function rankUps(before, after) {
    if (!before || !after) return [];
    return BOARDS
        .filter((board) => (Number(after[board]?.tier) || 0) > (Number(before[board]?.tier) || 0) && before[board])
        .map((board) => ({ board, title: after[board].title }));
}
