import { sql } from "@/lib/db";

/** Learner ratings of courses (community.course_rating, migration 20261103_012). */
export const courseRatingDb = {
    /**
     * The course's average and the learner's own rating, and whether they may rate: enrolled
     * (not withdrawn) with at least one completed lesson. userPublicId may be null (signed out).
     */
    state: async ({ userPublicId, coursePublicId }) => (await sql(
        `SELECT c.id::text AS course_id, c.rating_avg::float AS rating_avg, c.rating_count,
                u.id::text AS user_id, r.stars,
                (u.id IS NOT NULL AND s.enrolled AND s.has_completed) AS eligible,
                s.enrolled, s.has_completed
         FROM catalog.course c
         LEFT JOIN identity.users u ON u.public_id = $1
         LEFT JOIN community.course_rating r ON r.user_id = u.id AND r.course_id = c.id
         CROSS JOIN LATERAL (SELECT
                EXISTS (SELECT 1 FROM learning.register g WHERE g.user_id = u.id AND g.course_id = c.id AND g.is_deleted = false) AS enrolled,
                EXISTS (SELECT 1 FROM learning.history h WHERE h.user_id = u.id AND h.course_id = c.id AND h.status = 'completed') AS has_completed
         ) s
         WHERE c.public_id = $2 AND c.is_deleted IS NOT TRUE`,
        [userPublicId, coursePublicId]
    )).rows[0] || null,

    /** One rating per learner and course: a second call changes the stars (the trigger recounts). */
    upsert: async ({ userDbId, courseDbId, stars }) => (await sql(
        `INSERT INTO community.course_rating (user_id, course_id, stars) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, course_id) DO UPDATE SET stars = EXCLUDED.stars, updated_at = now()
         RETURNING stars`,
        [userDbId, courseDbId, stars]
    )).rows[0],
};
