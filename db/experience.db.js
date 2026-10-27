import { sql } from "@/lib/db";

export const experienceDb = {
    /** The active level table (public reference data). */
    getLevels: async () => {
        return sql(
            `SELECT level, title, min_exp FROM profile.exp_level WHERE is_active ORDER BY level`
        );
    },

    /** Every active achievement with the user's progress and, once earned, when. */
    getAchievements: async ({ userId }) => {
        return sql(
            `SELECT a.code, a.title, a.description, a.threshold, p.progress, ua.earned_at,
                    (SELECT r.amount FROM profile.exp_rule r WHERE r.rule_key = 'achievement.' || a.code AND r.is_active) AS exp
             FROM identity.users u
             CROSS JOIN LATERAL public.achievement_progress(u.id) p
             JOIN profile.achievement a ON a.id = p.achievement_id
             LEFT JOIN profile.user_achievement ua ON ua.user_id = u.id AND ua.achievement_id = a.id
             WHERE u.public_id = $1
             ORDER BY a.sort_order, a.id`,
            [userId]
        );
    },

    /**
     * One row per coding challenge the user has passed: the first pass time and the hints opened
     * before it (`submitted_at` is `timestamp`, read in the same session time zone it was written in).
     */
    getHintUsage: async ({ userId }) => {
        return sql(
            `WITH me AS (SELECT id FROM identity.users WHERE public_id = $1),
             first_pass AS (
                 SELECT s.challenge_id, MIN(s.submitted_at) AS passed_at
                 FROM challenge.code_submissions s
                 JOIN me ON me.id = s.user_id
                 WHERE s.status = 'passed'
                 GROUP BY s.challenge_id
             )
             SELECT ch.id::text AS challenge_id, ch.title, ch.type, ch.lesson_id::text AS lesson_id,
                    l.title AS lesson_title, c.public_id AS course_id, fp.passed_at,
                    COUNT(hv.level)::int AS hints_opened,
                    COALESCE(MAX(hv.level), 0)::int AS max_hint_level
             FROM first_pass fp
             JOIN challenge.challenges ch ON ch.id = fp.challenge_id AND ch.is_deleted = false
             JOIN catalog.course c ON c.id = ch.course_id
             LEFT JOIN course.lesson l ON l.id = ch.lesson_id
             LEFT JOIN challenge.hint_views hv
                    ON hv.user_id = (SELECT id FROM me)
                   AND hv.challenge_id = fp.challenge_id
                   AND hv.opened_at < fp.passed_at
             GROUP BY ch.id, l.title, c.public_id, fp.passed_at
             ORDER BY fp.passed_at DESC`,
            [userId]
        );
    },

    /** EXP ledger page, newest first (keyset on created_at, id), with the title of what earned it. */
    getTransactions: async ({ userId, before = null, limit = 20 }) => {
        const params = [userId, limit + 1];
        let cursor = "";
        if (before) {
            params.push(before.createdAt, before.id);
            cursor = `AND (t.created_at, t.id) < ($3::timestamptz, $4::uuid)`;
        }
        return sql(
            `SELECT t.id, t.amount, t.exp_after, t.source_type, t.rule_key, t.reason, t.created_at,
                    COALESCE(l.title, ch.title, c.title, a.title) AS source_title
             FROM profile.exp_transaction t
             JOIN identity.users u ON u.id = t.user_id
             LEFT JOIN course.lesson l ON t.source_type = 'lesson' AND l.id = t.source_id
             LEFT JOIN challenge.challenges ch ON t.source_type = 'challenge' AND ch.id = t.source_id
             LEFT JOIN catalog.course c ON t.source_type = 'course' AND c.id = t.source_id
             LEFT JOIN profile.achievement a ON t.source_type = 'achievement' AND a.id = t.source_id
             WHERE u.public_id = $1 ${cursor}
             ORDER BY t.created_at DESC, t.id DESC
             LIMIT $2`,
            params
        );
    },
};
