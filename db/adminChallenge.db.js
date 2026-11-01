import { sql } from "@/lib/db";

/** Challenges of one course for the admin (docs/admin-panel-plan.md 04), published or not. */
export const adminChallengeDb = {
    listByCourse: async ({ coursePublicId }) => sql(
        `SELECT ch.public_id AS id, ch.title, ch.type, ch.difficulty::text AS difficulty, ch.status::text AS status,
                ch.is_published, ch.points, l.title AS lesson_title, m.title AS module_title
         FROM challenge.challenges ch
         JOIN catalog.course c ON c.id = ch.course_id
         LEFT JOIN course.lesson l ON l.id = ch.lesson_id
         LEFT JOIN course.module m ON m.id = l.module_id
         WHERE c.public_id = $1 AND ch.is_deleted IS NOT TRUE
         ORDER BY m.order_index NULLS LAST, l.order_index NULLS LAST, ch.id`,
        [coursePublicId]
    ),

    lock: async (client, challengeId) => (await client.query(
        `SELECT id, public_id, title, status::text AS status, is_published, points
         FROM challenge.challenges WHERE public_id = $1 AND is_deleted IS NOT TRUE FOR UPDATE`,
        [challengeId]
    )).rows[0] || null,

    update: async (client, { id, status, isPublished, points }) => client.query(
        `UPDATE challenge.challenges
         SET status = COALESCE($2::public.status_challenge, status),
             is_published = COALESCE($3, is_published),
             points = COALESCE($4, points),
             updated_at = now()
         WHERE id = $1`,
        [id, status ?? null, isPublished ?? null, points ?? null]
    ),
};
