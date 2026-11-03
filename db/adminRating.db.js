import { sql } from "@/lib/db";

/** Learners' ratings of one course for the admin Feedback tab (docs/admin-panel-plan.md 12.5). */
export const adminRatingDb = {
    /** Visible average and count (kept by the trigger), stars 1-5 histogram, hidden count, last 30 days. */
    summary: async (coursePublicId) => (await sql(
        `SELECT c.id::text AS course_id, c.title, c.rating_avg::float AS average, c.rating_count AS count,
                COUNT(r.*) FILTER (WHERE r.is_hidden)::int AS hidden,
                COALESCE(jsonb_agg(r.stars) FILTER (WHERE r.user_id IS NOT NULL AND NOT r.is_hidden), '[]'::jsonb) AS stars,
                ROUND(AVG(r.stars) FILTER (WHERE NOT r.is_hidden AND r.updated_at > now() - interval '30 days'), 2)::float AS recent_average,
                COUNT(r.*) FILTER (WHERE NOT r.is_hidden AND r.updated_at > now() - interval '30 days')::int AS recent_count
         FROM catalog.course c
         LEFT JOIN community.course_rating r ON r.course_id = c.id
         WHERE c.public_id = $1
         GROUP BY c.id`,
        [coursePublicId]
    )).rows[0] || null,

    // shortcut: newest 200 ratings without paging; add keyset paging if a course ever gets more.
    list: async (courseDbId) => (await sql(
        `SELECT u.public_id AS user_id, u.username, r.stars, r.is_hidden AS hidden, r.updated_at
         FROM community.course_rating r JOIN identity.users u ON u.id = r.user_id
         WHERE r.course_id = $1
         ORDER BY r.updated_at DESC
         LIMIT 200`,
        [courseDbId]
    )).rows,

    lock: async (client, { courseDbId, userPublicId }) => (await client.query(
        `SELECT r.user_id, r.stars, r.is_hidden FROM community.course_rating r
         JOIN identity.users u ON u.id = r.user_id
         WHERE r.course_id = $1 AND u.public_id = $2
         FOR UPDATE OF r`,
        [courseDbId, userPublicId]
    )).rows[0] || null,

    setHidden: async (client, { courseDbId, userDbId, hidden }) => client.query(
        `UPDATE community.course_rating SET is_hidden = $3 WHERE course_id = $1 AND user_id = $2`,
        [courseDbId, userDbId, hidden]
    ),
};
