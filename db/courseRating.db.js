import { sql } from "@/lib/db";

/** Learner ratings of courses at progress milestones (community.course_rating, migrations 20261103_012, 20261110_024). */
export const courseRatingDb = {
    /**
     * The course's average, its per-milestone breakdown, and the learner's enrolment, progress
     * (completed / visible lessons, counted like public.submit_lesson) and own ratings.
     * userPublicId may be null (signed out).
     */
    state: async ({ userPublicId, coursePublicId }) => (await sql(
        `SELECT c.id::text AS course_id, c.rating_avg::float AS rating_avg, c.rating_count,
                u.id::text AS user_id,
                EXISTS (SELECT 1 FROM learning.register g WHERE g.user_id = u.id AND g.course_id = c.id AND g.is_deleted = false) AS enrolled,
                p.completed, p.total,
                COALESCE((SELECT jsonb_agg(jsonb_build_object('milestone', r.milestone, 'stars', r.stars, 'is_hidden', r.is_hidden) ORDER BY r.milestone)
                          FROM community.course_rating r WHERE r.user_id = u.id AND r.course_id = c.id), '[]'::jsonb) AS ratings,
                COALESCE((SELECT jsonb_agg(jsonb_build_object('milestone', b.milestone, 'avg', b.avg, 'count', b.count) ORDER BY b.milestone)
                          FROM (SELECT milestone, ROUND(AVG(stars), 2)::float AS avg, COUNT(*)::int AS count
                                FROM community.course_rating WHERE course_id = c.id AND NOT is_hidden
                                GROUP BY milestone) b), '[]'::jsonb) AS breakdown
         FROM catalog.course c
         LEFT JOIN identity.users u ON u.public_id = $1
         CROSS JOIN LATERAL (
             SELECT COUNT(l.id)::int AS total,
                    COUNT(h.lesson_id) FILTER (WHERE h.status = 'completed')::int AS completed
             FROM course.module m
             JOIN course.lesson l ON l.module_id = m.id AND l.is_deleted = false AND l.is_hidden = false
             LEFT JOIN learning.history h ON h.lesson_id = l.id AND h.user_id = u.id AND h.course_id = c.id
             WHERE m.course_id = c.id AND m.is_deleted = false AND m.is_hidden = false
         ) p
         WHERE c.public_id = $2 AND c.is_deleted IS NOT TRUE`,
        [userPublicId, coursePublicId]
    )).rows[0] || null,

    /**
     * One rating per learner, course and milestone: a second call changes the stars (the trigger
     * recounts). A new row of a hidden learner starts hidden, so rating again never escapes moderation.
     */
    upsert: async ({ userDbId, courseDbId, milestone, stars }) => (await sql(
        `INSERT INTO community.course_rating (user_id, course_id, milestone, stars, is_hidden)
         VALUES ($1, $2, $3, $4, EXISTS (SELECT 1 FROM community.course_rating WHERE user_id = $1 AND course_id = $2 AND is_hidden))
         ON CONFLICT (user_id, course_id, milestone) DO UPDATE SET stars = EXCLUDED.stars, updated_at = now()
         RETURNING stars`,
        [userDbId, courseDbId, milestone, stars]
    )).rows[0],
};
