import { sql } from "@/lib/db";

/** Course structure for the admin (docs/admin-panel-plan.md 03): modules, lessons and their challenges. */
export const adminCourseDb = {
    structure: async ({ coursePublicId }) => (await sql(
        `SELECT c.public_id AS id, c.title, c.publish_status, c.access_model, c.level::text AS level,
                (SELECT COUNT(*) FROM commerce.offer o WHERE o.course_id = c.id AND o.is_active)::int AS active_offers,
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'id', m.id::text, 'title', m.title, 'order', m.order_index, 'hidden', m.is_hidden,
                        'lessons', COALESCE((
                            SELECT json_agg(json_build_object(
                                'id', l.id::text, 'title', l.title, 'order', l.order_index, 'hidden', l.is_hidden,
                                'contentType', l.content_type, 'contentSource', l.content_source,
                                'challenges', (SELECT COUNT(*) FROM challenge.challenges ch WHERE ch.lesson_id = l.id AND ch.is_deleted IS NOT TRUE)::int,
                                'codingWithoutTests', (
                                    SELECT COUNT(*) FROM challenge.challenges ch
                                    WHERE ch.lesson_id = l.id AND ch.is_deleted IS NOT TRUE AND ch.type <> 'quiz'
                                      AND NOT EXISTS (SELECT 1 FROM challenge.challenge_test_cases tc WHERE tc.challenge_id = ch.id))::int
                            ) ORDER BY l.order_index, l.id)
                            FROM course.lesson l WHERE l.module_id = m.id AND l.is_deleted IS NOT TRUE), '[]')
                    ) ORDER BY m.order_index, m.id)
                    FROM course.module m WHERE m.course_id = c.id AND m.is_deleted IS NOT TRUE), '[]') AS modules
         FROM catalog.course c
         WHERE c.public_id = $1 AND c.is_deleted IS NOT TRUE`,
        [coursePublicId]
    )).rows[0] || null,

    /** A module or lesson of this course, locked, with its neighbours' ids for moving. */
    lockItem: async (client, { kind, itemId, coursePublicId }) => {
        const query = kind === "module"
            ? `SELECT m.id::text AS id, m.title, m.order_index, m.is_hidden, m.course_id::text AS parent_id
               FROM course.module m JOIN catalog.course c ON c.id = m.course_id
               WHERE m.id = $1 AND c.public_id = $2 AND m.is_deleted IS NOT TRUE FOR UPDATE OF m`
            : `SELECT l.id::text AS id, l.title, l.order_index, l.is_hidden, l.module_id::text AS parent_id
               FROM course.lesson l JOIN course.module m ON m.id = l.module_id JOIN catalog.course c ON c.id = m.course_id
               WHERE l.id = $1 AND c.public_id = $2 AND l.is_deleted IS NOT TRUE FOR UPDATE OF l`;
        return (await client.query(query, [itemId, coursePublicId])).rows[0] || null;
    },

    neighbour: async (client, { kind, item, direction }) => {
        const table = kind === "module" ? "course.module" : "course.lesson";
        const parent = kind === "module" ? "course_id" : "module_id";
        const [cmp, order] = direction === "up" ? ["<", "DESC"] : [">", "ASC"];
        return (await client.query(
            `SELECT id::text AS id, order_index FROM ${table}
             WHERE ${parent} = $1 AND is_deleted IS NOT TRUE
               AND (order_index, id) ${cmp} ($2::int, $3::bigint)
             ORDER BY order_index ${order}, id ${order} LIMIT 1 FOR UPDATE`,
            [item.parent_id, item.order_index, item.id]
        )).rows[0] || null;
    },

    setHidden: async (client, { kind, itemId, hidden }) => client.query(
        `UPDATE ${kind === "module" ? "course.module" : "course.lesson"} SET is_hidden = $2, updated_at = now() WHERE id = $1`,
        [itemId, hidden]
    ),

    /** Swaps the positions of two siblings (equal positions get distinct ones). */
    swapOrder: async (client, { kind, a, b }) => {
        const table = kind === "module" ? "course.module" : "course.lesson";
        const [first, second] = a.order_index === b.order_index ? [b.order_index + 1, a.order_index] : [b.order_index, a.order_index];
        await client.query(`UPDATE ${table} SET order_index = $2, updated_at = now() WHERE id = $1`, [a.id, first]);
        await client.query(`UPDATE ${table} SET order_index = $2, updated_at = now() WHERE id = $1`, [b.id, second]);
    },
};
