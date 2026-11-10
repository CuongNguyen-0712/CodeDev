import { sql } from "@/lib/db";

/** Learners' ratings of one course for the admin Feedback tab (docs/admin-panel-plan.md 12.5). */
export const adminRatingDb = {
    /**
     * Visible average and count (kept by the trigger), a 1-5 histogram and the last 30 days over each
     * learner's latest visible milestone (what the average counts), and the hidden learners.
     */
    summary: async (coursePublicId) => (await sql(
        `SELECT c.id::text AS course_id, c.title, c.rating_avg::float AS average, c.rating_count AS count,
                (SELECT COUNT(DISTINCT r.user_id)::int FROM community.course_rating r WHERE r.course_id = c.id AND r.is_hidden) AS hidden,
                COALESCE(jsonb_agg(l.stars) FILTER (WHERE l.user_id IS NOT NULL), '[]'::jsonb) AS stars,
                ROUND(AVG(l.stars) FILTER (WHERE l.updated_at > now() - interval '30 days'), 2)::float AS recent_average,
                COUNT(l.*) FILTER (WHERE l.updated_at > now() - interval '30 days')::int AS recent_count
         FROM catalog.course c
         LEFT JOIN LATERAL (
             SELECT DISTINCT ON (r.user_id) r.user_id, r.stars, r.updated_at
             FROM community.course_rating r
             WHERE r.course_id = c.id AND NOT r.is_hidden
             ORDER BY r.user_id, r.milestone DESC
         ) l ON true
         WHERE c.public_id = $1
         GROUP BY c.id`,
        [coursePublicId]
    )).rows[0] || null,

    // shortcut: newest 200 learners without paging; add keyset paging if a course ever gets more.
    /** One row per learner: their latest stars, every milestone, hidden (all rows hide together). */
    list: async (courseDbId) => (await sql(
        `SELECT u.public_id AS user_id, u.username,
                (array_agg(r.stars ORDER BY r.milestone DESC))[1] AS stars,
                jsonb_agg(jsonb_build_object('milestone', r.milestone, 'stars', r.stars) ORDER BY r.milestone) AS milestones,
                bool_or(r.is_hidden) AS hidden, max(r.updated_at) AS updated_at
         FROM community.course_rating r JOIN identity.users u ON u.id = r.user_id
         WHERE r.course_id = $1
         GROUP BY u.public_id, u.username
         ORDER BY max(r.updated_at) DESC
         LIMIT 200`,
        [courseDbId]
    )).rows,

    /** Visible ratings given or changed per week, the last 12 weeks (this week last), empty weeks kept. */
    weekly: async (courseDbId) => (await sql(
        `SELECT w::date::text AS week,
                (SELECT COUNT(*) FROM community.course_rating r
                 WHERE r.course_id = $1 AND NOT r.is_hidden AND r.updated_at >= w AND r.updated_at < w + interval '7 days')::int AS count
         FROM generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS w
         ORDER BY w`,
        [courseDbId]
    )).rows,

    /** Locks all of the learner's rows for the course; their latest stars, every milestone, hidden. */
    lock: async (client, { courseDbId, userPublicId }) => {
        const rows = (await client.query(
            `SELECT r.user_id, r.milestone, r.stars, r.is_hidden FROM community.course_rating r
             JOIN identity.users u ON u.id = r.user_id
             WHERE r.course_id = $1 AND u.public_id = $2
             ORDER BY r.milestone
             FOR UPDATE OF r`,
            [courseDbId, userPublicId]
        )).rows;
        if (rows.length === 0) return null;
        return {
            user_id: rows[0].user_id,
            stars: rows.at(-1).stars,
            milestones: rows.map((r) => ({ milestone: r.milestone, stars: r.stars })),
            is_hidden: rows.some((r) => r.is_hidden),
        };
    },

    setHidden: async (client, { courseDbId, userDbId, hidden }) => client.query(
        `UPDATE community.course_rating SET is_hidden = $3 WHERE course_id = $1 AND user_id = $2`,
        [courseDbId, userDbId, hidden]
    ),
};
