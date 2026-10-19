import { sql } from "@/lib/db";

// Board -> column of public.ranking_scores. Whitelist: the column name is interpolated into SQL.
export const BOARD_COLUMNS = { overall: "overall", exp: "exp", points: "points_earned" };

// Who can appear on a board: active, opted in, not staff (admin.read).
const VISIBLE = `
    u.status = 'active'
    AND i.show_on_leaderboard
    AND NOT EXISTS (
        SELECT 1
        FROM identity.user_roles ur
        JOIN identity.role_permissions rp ON rp.role_id = ur.role_id
        JOIN identity.permissions pm ON pm.id = rp.permission_id
        WHERE ur.user_id = u.id AND pm.resource = 'admin' AND pm.action = 'read'
    )
`;

// Tier from the all-time score of the board (a 30-day board still shows the lasting tier).
const TIER = (scoreSql) => `
    LEFT JOIN LATERAL (
        SELECT t.tier, t.title
        FROM profile.rank_tier t
        WHERE t.kind = $1 AND t.min_score <= COALESCE(${scoreSql}, 0)
        ORDER BY t.min_score DESC
        LIMIT 1
    ) tier ON true
`;

export const rankingDb = {
    getTiers: async (board) => {
        return sql(
            `SELECT tier, title, min_score FROM profile.rank_tier WHERE kind = $1 ORDER BY min_score`,
            [board]
        );
    },

    /** All-time overall tier of the listed learners (public_ids) who are on the leaderboard. */
    getOverallTiers: async (userKeys) => {
        return sql(
            `SELECT u.public_id AS id, tier.tier, tier.title AS tier_title
             FROM identity.users u
             JOIN profile.info i ON i.user_id = u.id
             JOIN public.ranking_scores(NULL) s ON s.user_id = u.id
             ${TIER("s.overall")}
             WHERE u.public_id = ANY($2::text[]) AND ${VISIBLE} AND s.overall > 0`,
            ["overall", userKeys]
        );
    },

    /** Top `limit` visible learners of a board; ties go to whoever reached the score first. */
    getTop: async ({ board, since = null, limit = 50 }) => {
        const col = BOARD_COLUMNS[board];
        return sql(
            `WITH s AS (SELECT * FROM public.ranking_scores($2::timestamptz)),
                  a AS (SELECT * FROM public.ranking_scores(NULL))
             SELECT
                 ROW_NUMBER() OVER (ORDER BY s.${col} DESC, s.last_at ASC, u.id ASC)::int AS position,
                 u.public_id AS id, u.username, i.image, i.nickname,
                 i.exp_level AS level,
                 s.${col} AS score,
                 tier.tier, tier.title AS tier_title
             FROM s
             JOIN identity.users u ON u.id = s.user_id
             JOIN profile.info i ON i.user_id = u.id
             LEFT JOIN a ON a.user_id = s.user_id
             ${TIER(`a.${col}`)}
             WHERE ${VISIBLE} AND s.${col} > 0
             ORDER BY position
             LIMIT $3`,
            [board, since, limit]
        );
    },

    /**
     * One learner's standing on a board, whether or not they are visible on it: position counts
     * only visible learners ranked above them. `userKey` is a public_id.
     */
    getStanding: async ({ board, since = null, userKey }) => {
        const col = BOARD_COLUMNS[board];
        return sql(
            `WITH s AS (SELECT * FROM public.ranking_scores($2::timestamptz)),
                  a AS (SELECT * FROM public.ranking_scores(NULL)),
                  me AS (
                      SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard,
                             (${VISIBLE}) AS visible,
                             COALESCE(s.${col}, 0) AS score, s.last_at,
                             COALESCE(a.${col}, 0) AS all_score
                      FROM identity.users u
                      JOIN profile.info i ON i.user_id = u.id
                      LEFT JOIN s ON s.user_id = u.id
                      LEFT JOIN a ON a.user_id = u.id
                      WHERE u.public_id = $3
                  )
             SELECT
                 me.score, me.visible, NOT me.show_on_leaderboard AS opted_out,
                 me.public_id, me.username, me.nickname, me.image,
                 CASE WHEN me.score > 0 THEN (
                     SELECT COUNT(*)::int + 1
                     FROM s
                     JOIN identity.users u ON u.id = s.user_id
                     JOIN profile.info i ON i.user_id = u.id
                     WHERE ${VISIBLE} AND u.id <> me.id
                       AND (s.${col} > me.score
                            OR (s.${col} = me.score AND (s.last_at, u.id) < (me.last_at, me.id)))
                 ) END AS position,
                 tier.tier, tier.title AS tier_title,
                 cur.min_score AS tier_min_score,
                 nxt.title AS next_title, nxt.min_score AS next_min_score,
                 me.all_score
             FROM me
             ${TIER("me.all_score")}
             LEFT JOIN profile.rank_tier cur ON cur.kind = $1 AND cur.tier = tier.tier
             LEFT JOIN profile.rank_tier nxt ON nxt.kind = $1 AND nxt.tier = tier.tier + 1`,
            [board, since, userKey]
        );
    },
};
