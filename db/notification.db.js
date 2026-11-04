import { sql } from "@/lib/db";

/**
 * Notification inbox rows (migration 20261104_017). Every function takes the user's public id
 * and resolves it here, so a caller can only ever read or mark its own rows.
 * `created_at` travels as the database's own text (microseconds, no time zone): the keyset
 * cursor compares it as text, never as a JS Date.
 */
const USER = `(SELECT id FROM identity.users WHERE public_id = $1)`;
const COLUMNS = `n.id, n.kind, n.title, n.message, n.link, n.has_seen, n.created_at::text AS created_at`;

export const notificationDb = {
    /** No row when (user, kind, dedupe_key) already exists. */
    insert: async ({ userId, kind, title, message, link = null, dedupeKey = null }) => {
        return sql(
            `INSERT INTO profile.notification (user_id, kind, title, message, link, dedupe_key)
             VALUES (${USER}, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING
             RETURNING id, kind`,
            [userId, kind, title, message, link, dedupeKey]
        );
    },

    /** Newest first; `cursor` = { createdAt, id } of the last row seen. Fetches limit + 1 rows. */
    list: async ({ userId, unreadOnly = false, cursor = null, limit = 20 }) => {
        const params = [userId, limit + 1];
        let where = "";
        if (unreadOnly) where += " AND n.has_seen = false";
        if (cursor) {
            params.push(cursor.createdAt, cursor.id);
            where += ` AND (n.created_at, n.id) < ($3::timestamp, $4::uuid)`;
        }
        return sql(
            `SELECT ${COLUMNS}
             FROM profile.notification n
             JOIN identity.users u ON u.id = n.user_id
             WHERE u.public_id = $1 AND n.is_deleted = false${where}
             ORDER BY n.created_at DESC, n.id DESC
             LIMIT $2`,
            params
        );
    },

    unreadCount: async ({ userId }) => {
        return sql(
            `SELECT COUNT(*)::int AS n
             FROM profile.notification n
             WHERE n.user_id = ${USER} AND n.has_seen = false AND n.is_deleted = false`,
            [userId]
        );
    },

    markRead: async ({ userId, ids }) => {
        return sql(
            `UPDATE profile.notification SET has_seen = true, read_at = now(), updated_at = now()
             WHERE user_id = ${USER} AND has_seen = false AND id = ANY($2::uuid[])`,
            [userId, ids]
        );
    },

    markAllRead: async ({ userId }) => {
        return sql(
            `UPDATE profile.notification SET has_seen = true, read_at = now(), updated_at = now()
             WHERE user_id = ${USER} AND has_seen = false AND is_deleted = false`,
            [userId]
        );
    },

    /** Removes rows from the user's inbox (kept until retention, so announcement counts stay right). */
    dismiss: async ({ userId, ids }) => {
        return sql(
            `UPDATE profile.notification SET is_deleted = true, has_seen = true, read_at = COALESCE(read_at, now()), updated_at = now()
             WHERE user_id = ${USER} AND is_deleted = false AND id = ANY($2::uuid[])`,
            [userId, ids]
        );
    },

    courseTitle: async ({ courseId }) => {
        return sql(`SELECT title FROM catalog.course WHERE public_id = $1`, [courseId]);
    },

    /** Rows older than `days`, read or not: the inbox is a recent record, not an archive. */
    purgeOld: async ({ days = 90, limit = 1000 } = {}) => {
        const res = await sql(
            `DELETE FROM profile.notification
             WHERE id IN (
                 SELECT id FROM profile.notification
                 WHERE created_at < now() - make_interval(days => $1)
                 LIMIT $2
             )`,
            [days, limit]
        );
        return res.rowCount;
    },
};
