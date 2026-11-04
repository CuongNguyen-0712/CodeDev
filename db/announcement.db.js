import { sql } from "@/lib/db";

/**
 * Admin notifications (migration 20261104_018, docs/notification-plan.md 3). ops.announcement holds
 * what was sent; each recipient's copy is a profile.notification row (kind 'announcement',
 * dedupe_key = the announcement id).
 *
 * Audiences are validated JSON ({ type: all | role | course | users }); each type maps to one
 * fixed SQL clause below, values always go through parameters.
 */
const KIND = "announcement";

function audienceClause(audience, params) {
    switch (audience?.type) {
        case "all":
            return "TRUE";
        case "role":
            params.push(audience.roles);
            return `EXISTS (SELECT 1 FROM identity.user_roles ur JOIN identity.roles r ON r.id = ur.role_id
                            WHERE ur.user_id = u.id AND r.code = ANY($${params.length}::text[]))`;
        case "course":
            params.push(audience.courseId);
            return `EXISTS (SELECT 1 FROM learning.register g JOIN catalog.course c ON c.id = g.course_id
                            WHERE g.user_id = u.id AND g.is_deleted = false AND c.public_id = $${params.length})`;
        case "users":
            params.push(audience.userIds);
            return `u.public_id = ANY($${params.length}::text[])`;
        default:
            throw new Error(`Unknown audience type: ${audience?.type}`);
    }
}

const COLUMNS = `a.id, a.title, a.body, a.link, a.audience, a.status, a.send_at, a.recipients, a.sent_at, a.created_at,
                 creator.username AS created_by`;

export const announcementDb = {
    /** Active accounts the audience reaches right now. */
    countAudience: async (audience) => {
        const params = [];
        const where = audienceClause(audience, params);
        const { rows } = await sql(`SELECT COUNT(*)::int AS n FROM identity.users u WHERE u.status = 'active' AND ${where}`, params);
        return rows[0]?.n ?? 0;
    },

    /** Public ids of the active accounts named by public id or username; the rest is unknown. */
    resolveUsers: async (identifiers) => {
        return sql(
            `SELECT u.public_id, u.username FROM identity.users u
             WHERE u.status = 'active' AND (u.public_id = ANY($1::text[]) OR u.username = ANY($1::text[]))`,
            [identifiers]
        );
    },

    courseExists: async (courseId) => {
        const { rows } = await sql(`SELECT 1 FROM catalog.course WHERE public_id = $1`, [courseId]);
        return rows.length > 0;
    },

    create: async (client, { title, body, link, audience, sendAt, createdBy }) => {
        const { rows } = await client.query(
            `INSERT INTO ops.announcement (title, body, link, audience, send_at, created_by)
             VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6)
             RETURNING id, title, body, link, audience, status, send_at, recipients, sent_at, created_at`,
            [title, body, link, JSON.stringify(audience), sendAt, createdBy]
        );
        return rows[0];
    },

    get: async (id) => {
        const { rows } = await sql(
            `SELECT ${COLUMNS} FROM ops.announcement a LEFT JOIN identity.users creator ON creator.id = a.created_by WHERE a.id = $1`,
            [id]
        );
        return rows[0] || null;
    },

    /** Newest first with read counts; `cursor` = { createdAt, id } of the last row. Fetches limit + 1. */
    list: async ({ cursor = null, limit = 30 }) => {
        const params = [limit + 1];
        let where = "";
        if (cursor) {
            params.push(cursor.createdAt, cursor.id);
            where = `WHERE (a.created_at, a.id) < ($2::timestamptz, $3::uuid)`;
        }
        return sql(
            `SELECT ${COLUMNS}, a.created_at::text AS cursor_at,
                    (SELECT COUNT(*) FILTER (WHERE n.has_seen)::int FROM profile.notification n
                     WHERE n.kind = '${KIND}' AND n.dedupe_key = a.id::text) AS read_count
             FROM ops.announcement a
             LEFT JOIN identity.users creator ON creator.id = a.created_by
             ${where}
             ORDER BY a.created_at DESC, a.id DESC
             LIMIT $1`,
            params
        );
    },

    /** Moves `from` -> `to` atomically; no row when the announcement is in another state. */
    transition: async (client, { id, from, to }) => {
        const { rows } = await client.query(
            `UPDATE ops.announcement SET status = $3, updated_at = now()
             WHERE id = $1 AND status = ANY($2::text[])
             RETURNING id, title, audience, status`,
            [id, from, to]
        );
        return rows[0] || null;
    },

    /** scheduled / sending -> sending once due; null when cancelled, retracted or not due yet. */
    startSending: async (id) => {
        const { rows } = await sql(
            `UPDATE ops.announcement SET status = 'sending', updated_at = now()
             WHERE id = $1 AND status IN ('scheduled', 'sending') AND send_at <= now() + interval '5 seconds'
             RETURNING id, title, body, link, audience`,
            [id]
        );
        return rows[0] || null;
    },

    /**
     * Writes the next batch of copies (users after `afterId`, by internal id). A retried batch
     * inserts nothing new (unique user_id, kind, dedupe_key).
     */
    deliverBatch: async ({ announcement, afterId = "0", limit = 1000 }) => {
        const params = [announcement.id, announcement.title, announcement.body, announcement.link, afterId, limit];
        const where = audienceClause(announcement.audience, params);
        const { rows } = await sql(
            `WITH batch AS (
                 SELECT u.id FROM identity.users u
                 WHERE u.status = 'active' AND u.id > $5::bigint AND ${where}
                 ORDER BY u.id
                 LIMIT $6
             ), ins AS (
                 INSERT INTO profile.notification (user_id, kind, title, message, link, dedupe_key)
                 SELECT id, '${KIND}', $2, $3, $4, $1::text FROM batch
                 ON CONFLICT DO NOTHING
                 RETURNING user_id
             )
             SELECT (SELECT MAX(id)::text FROM batch) AS last_id,
                    (SELECT COUNT(*)::int FROM batch) AS selected,
                    (SELECT COUNT(*)::int FROM ins) AS inserted`,
            params
        );
        return { lastId: rows[0]?.last_id ?? afterId, selected: rows[0]?.selected ?? 0, inserted: rows[0]?.inserted ?? 0 };
    },

    /** sending -> sent with the number of copies actually written. */
    finishSending: async (id) => {
        const { rows } = await sql(
            `UPDATE ops.announcement a
             SET status = 'sent', sent_at = now(), updated_at = now(),
                 recipients = (SELECT COUNT(*)::int FROM profile.notification n WHERE n.kind = '${KIND}' AND n.dedupe_key = a.id::text)
             WHERE a.id = $1 AND a.status = 'sending'
             RETURNING a.id, a.audience, a.recipients`,
            [id]
        );
        return rows[0] || null;
    },

    /** Hides every copy from the inboxes (rows stay until retention). */
    retractCopies: async (client, id) => {
        return client.query(
            `UPDATE profile.notification SET is_deleted = true, updated_at = now()
             WHERE kind = '${KIND}' AND dedupe_key = $1::text AND is_deleted = false`,
            [id]
        );
    },

    /** Scheduled sends that are due but never started (the queue was down when they were sent). */
    listOverdue: async () => {
        return sql(
            `SELECT id, send_at FROM ops.announcement
             WHERE status = 'scheduled' AND send_at < now() - interval '5 minutes'
             ORDER BY send_at LIMIT 100`
        );
    },
};
