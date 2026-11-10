import { sql } from "@/lib/db";

// Comment states in the admin (deleted comments are the author's choice and never listed).
const COMMENT_FILTERS = {
    all: "TRUE",
    visible: "m.is_hidden IS NOT TRUE",
    hidden: "m.is_hidden IS TRUE",
    downvoted: "m.downvotes > m.upvotes",
};
export const COMMENT_STATES = Object.keys(COMMENT_FILTERS);

const FEEDBACK_FILTERS = {
    open: "f.handled_at IS NULL",
    handled: "f.handled_at IS NOT NULL",
    all: "TRUE",
};
export const FEEDBACK_STATES = Object.keys(FEEDBACK_FILTERS);

/** Course comments and CodeDev feedback for the admin (docs/admin-panel-plan.md 11.3). */
export const adminFeedbackDb = {
    courseId: async (publicId) => (await sql(`SELECT id::text AS id FROM catalog.course WHERE public_id = $1`, [publicId])).rows[0]?.id ?? null,

    /** One page, newest first (keyset on created_at, id); courseDbId null lists every course. */
    listComments: async ({ courseDbId = null, state = "all", cursor = null, limit = 30 }) => {
        const params = [courseDbId];
        const where = ["m.is_deleted = false", "($1::bigint IS NULL OR m.reference_id = $1::bigint)", COMMENT_FILTERS[state] || COMMENT_FILTERS.all];
        if (cursor) {
            params.push(cursor.createdAt, cursor.id);
            where.push(`(m.created_at, m.id) < ($${params.length - 1}::timestamp, $${params.length}::bigint)`);
        }
        params.push(limit);
        return sql(
            `SELECT m.public_id AS id, m.content, m.upvotes::int AS upvotes, m.downvotes::int AS downvotes, m.is_hidden AS hidden,
                    m.created_at, m.created_at::text AS cursor_at, m.id::text AS cursor_id,
                    u.public_id AS user_id, u.username, c.public_id AS course_id, c.title AS course_title,
                    (SELECT r.stars FROM community.course_rating r WHERE r.user_id = m.user_id AND r.course_id = m.reference_id AND NOT r.is_hidden ORDER BY r.milestone DESC LIMIT 1) AS rating
             FROM community.comment m
             JOIN identity.users u ON u.id = m.user_id
             JOIN catalog.course c ON c.id = m.reference_id AND c.is_deleted IS NOT TRUE
             WHERE ${where.join(" AND ")}
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT $${params.length}`,
            params
        );
    },

    commentCounts: async (courseDbId = null) => (await sql(
        `SELECT COUNT(*)::int AS all, COUNT(*) FILTER (WHERE m.is_hidden IS NOT TRUE)::int AS visible,
                COUNT(*) FILTER (WHERE m.is_hidden IS TRUE)::int AS hidden, COUNT(*) FILTER (WHERE m.downvotes > m.upvotes)::int AS downvoted,
                COUNT(*) FILTER (WHERE m.created_at > (now() AT TIME ZONE 'UTC') - interval '7 days')::int AS last_7_days
         FROM community.comment m JOIN catalog.course c ON c.id = m.reference_id AND c.is_deleted IS NOT TRUE
         WHERE m.is_deleted = false AND ($1::bigint IS NULL OR m.reference_id = $1::bigint)`,
        [courseDbId]
    )).rows[0],

    lockComment: async (client, publicId) => (await client.query(
        `SELECT m.id, m.is_hidden, c.public_id AS course_id, u.public_id AS author_id
         FROM community.comment m JOIN catalog.course c ON c.id = m.reference_id
         LEFT JOIN identity.users u ON u.id = m.user_id
         WHERE m.public_id = $1 AND m.is_deleted = false FOR UPDATE OF m`,
        [publicId]
    )).rows[0] || null,

    setCommentHidden: async (client, { id, hidden }) => client.query(
        `UPDATE community.comment SET is_hidden = $2, updated_at = now() WHERE id = $1`, [id, hidden]
    ),

    /** Feedback sent from the navbar, newest first (keyset on created_at, id). */
    listFeedback: async ({ state = "open", cursor = null, limit = 30 }) => {
        const params = [];
        const where = [FEEDBACK_FILTERS[state] || FEEDBACK_FILTERS.open];
        if (cursor) {
            params.push(cursor.createdAt, cursor.id);
            where.push(`(f.created_at, f.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
        }
        params.push(limit);
        return sql(
            `SELECT f.id::text AS id, f.title, f.feedback, f.created_at, f.handled_at, f.created_at::text AS cursor_at,
                    u.public_id AS user_id, u.username, h.username AS handled_by
             FROM community.feedback f
             LEFT JOIN identity.users u ON u.id = f.user_id
             LEFT JOIN identity.users h ON h.id = f.handled_by
             WHERE ${where.join(" AND ")}
             ORDER BY f.created_at DESC, f.id DESC
             LIMIT $${params.length}`,
            params
        );
    },

    feedbackCounts: async () => (await sql(
        `SELECT COUNT(*) FILTER (WHERE handled_at IS NULL)::int AS open, COUNT(*) FILTER (WHERE handled_at IS NOT NULL)::int AS handled,
                COUNT(*)::int AS all
         FROM community.feedback`
    )).rows[0],

    lockFeedback: async (client, id) => (await client.query(
        `SELECT f.id, f.handled_at, f.title, u.public_id AS user_id
         FROM community.feedback f LEFT JOIN identity.users u ON u.id = f.user_id
         WHERE f.id = $1 FOR UPDATE OF f`, [id]
    )).rows[0] || null,

    setFeedbackHandled: async (client, { id, handledBy }) => client.query(
        `UPDATE community.feedback SET handled_at = CASE WHEN $2::bigint IS NULL THEN NULL ELSE now() END, handled_by = $2 WHERE id = $1`,
        [id, handledBy]
    ),
};
