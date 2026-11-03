import { sql } from "@/lib/db";

/**
 * Public profile reads and the privacy switches (docs/ui-ux/PROFILE_AND_LEADERBOARD_PLAN.md §3).
 * Public lookups accept a username or public_id only, never the internal id.
 */
export const profileDb = {
    /** Visible profile by username (preferred) or public_id; no row when hidden, locked or missing. */
    getPublicProfile: async (key) => {
        return sql(
            `SELECT u.public_id AS id, u.username, u.created_at,
                    i.image, i.nickname, i.exp, i.exp_level AS level,
                    lvl.title AS "levelTitle", lvl.min_exp AS "levelMinExp", nxt.min_exp AS "nextLevelMinExp",
                    i.show_learning, i.show_on_leaderboard,
                    (SELECT COUNT(*)::int FROM profile.exp_transaction t
                     WHERE t.user_id = u.id AND t.source_type = 'challenge' AND t.amount > 0) AS challenges_passed
             FROM identity.users u
             JOIN profile.info i ON i.user_id = u.id
             LEFT JOIN profile.exp_level lvl ON lvl.level = i.exp_level
             LEFT JOIN profile.exp_level nxt ON nxt.level = i.exp_level + 1 AND nxt.is_active
             WHERE (u.username = $1 OR u.public_id = $1)
               AND u.status = 'active'
               AND i.show_profile
             ORDER BY (u.username = $1) DESC
             LIMIT 1`,
            [key]
        );
    },

    /** Course counts by status, plus recent courses and languages when `withCourses`. */
    getLearningSummary: async ({ userKey, withCourses }) => {
        return sql(
            `WITH base AS (
                 SELECT id, title, status, progress, lessons AS total, last_seen,
                        language_name, language_logo, language_color, category_name
                 FROM learning.user_progress
                 WHERE user_id = $1 AND c_deleted = false AND r_deleted = false
             )
             SELECT
                 (SELECT COALESCE(JSONB_OBJECT_AGG(status, total), '{}'::jsonb)
                  FROM (SELECT status, COUNT(*)::int AS total FROM base GROUP BY status) s) AS by_status,
                 CASE WHEN $2::boolean THEN (
                     SELECT COALESCE(JSONB_AGG(c ORDER BY c.status = 'completed' DESC, c.last_seen DESC NULLS LAST), '[]'::jsonb)
                     FROM (
                         SELECT id, title, status, progress, total, last_seen, language_name, language_logo, category_name
                         FROM base WHERE status IN ('in_progress', 'completed')
                         ORDER BY status = 'completed' DESC, last_seen DESC NULLS LAST
                         LIMIT 6
                     ) c
                 ) END AS courses,
                 CASE WHEN $2::boolean THEN (
                     SELECT COALESCE(JSONB_AGG(l ORDER BY l.total DESC), '[]'::jsonb)
                     FROM (
                         SELECT language_name AS name, language_logo AS logo, COUNT(*)::int AS total,
                                ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
                         FROM base WHERE status IN ('in_progress', 'completed')
                         GROUP BY language_name, language_logo
                     ) l
                 ) END AS languages`,
            [userKey, withCourses]
        );
    },

    getPrivacy: async (userId) => {
        return sql(
            `SELECT i.show_profile, i.show_learning, i.show_on_leaderboard, u.username
             FROM identity.users u JOIN profile.info i ON i.user_id = u.id
             WHERE u.public_id = $1`,
            [userId]
        );
    },

    /** Only the keys present in `flags` change (NULL keeps the current value). */
    setPrivacy: async (userId, { showProfile = null, showLearning = null, showOnLeaderboard = null }) => {
        return sql(
            `UPDATE profile.info i
             SET show_profile = COALESCE($2::boolean, i.show_profile),
                 show_learning = COALESCE($3::boolean, i.show_learning),
                 show_on_leaderboard = COALESCE($4::boolean, i.show_on_leaderboard),
                 updated_at = now()
             FROM identity.users u
             WHERE u.id = i.user_id AND u.public_id = $1
             RETURNING i.show_profile, i.show_learning, i.show_on_leaderboard, u.username`,
            [userId, showProfile, showLearning, showOnLeaderboard]
        );
    },
};
