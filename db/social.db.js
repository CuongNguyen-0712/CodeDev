import { sql } from "@/lib/db";
import { escapeLike } from "@/lib/listFilters";

export const socialDb = {
    // Active users the caller has no friendship (pending or otherwise) with. Users who turned
    // "Show my profile" off cannot be found (settings privacy section), so they are not listed.
    getUsersSocial: async ({ userId, search, limit, cursor = null }) => {
        const params = [userId];
        const conditions = [
            `u.id <> me.id`,
            `u.status = 'active'`,
            `i.show_profile IS TRUE`,
            `f.id IS NULL`,
        ];

        if (search && search.trim()) {
            params.push(`%${escapeLike(search.trim())}%`);
            // ILIKE on the bare column: served by idx_users_username_trgm.
            conditions.push(`u.username ILIKE $${params.length} ESCAPE '\\'`);
        }

        // Keyset on (username, id): pages stay stable while users sign up, and deep pages stay cheap.
        if (cursor) {
            params.push(cursor.username, cursor.id);
            conditions.push(`(u.username, u.id) > ($${params.length - 1}, $${params.length}::bigint)`);
        }

        params.push(limit);

        const query = `
            SELECT
                u.public_id AS id,
                u.username,
                i.image,
                i.nickname,
                i.exp_level AS level,
                lvl.title AS "levelTitle",
                i.show_profile AS "showProfile",
                u.id::text AS cursor_id
            FROM identity.users me
            JOIN identity.users u ON true
            LEFT JOIN profile.info i ON i.user_id = u.id
            LEFT JOIN profile.exp_level lvl ON lvl.level = i.exp_level
            LEFT JOIN community.friend f
                ON LEAST(f.sender_id, f.receiver_id) = LEAST(me.id, u.id)
               AND GREATEST(f.sender_id, f.receiver_id) = GREATEST(me.id, u.id)
            WHERE me.public_id = $1
              AND ${conditions.join(" AND ")}
            ORDER BY u.username, u.id
            LIMIT $${params.length};
        `;

        return await sql(query, params);
    },

    // Friend writes below take a transaction `client`; ids in and out are DB ids (text).

    /** Both users, locked in ascending id order so opposite requests on a pair queue instead of deadlocking. */
    lockUsers: async (client, publicIds) => (await client.query(
        `SELECT u.id::text AS id, u.public_id, u.status, COALESCE(i.show_profile, false) AS show_profile
         FROM identity.users u LEFT JOIN profile.info i ON i.user_id = u.id
         WHERE u.public_id = ANY($1::text[])
         ORDER BY u.id
         FOR NO KEY UPDATE OF u`, [publicIds])).rows,

    /** The pair's row (either direction) locked, or null; matches uq_friend_pair. */
    lockPair: async (client, aDbId, bDbId) => (await client.query(
        `SELECT id, sender_id::text AS sender_id, receiver_id::text AS receiver_id, status, created_at
         FROM community.friend
         WHERE LEAST(sender_id, receiver_id) = LEAST($1::bigint, $2::bigint)
           AND GREATEST(sender_id, receiver_id) = GREATEST($1::bigint, $2::bigint)
         FOR UPDATE`, [aDbId, bDbId])).rows[0] || null,

    insertPending: (client, senderDbId, receiverDbId) => client.query(
        `INSERT INTO community.friend (sender_id, receiver_id, status) VALUES ($1, $2, 'pending')
         ON CONFLICT ((LEAST(sender_id, receiver_id)), (GREATEST(sender_id, receiver_id))) DO NOTHING`, [senderDbId, receiverDbId]),

    /** A new invitation on an old rejected / cancelled row: new sender, new created_at. */
    resetPending: (client, id, senderDbId, receiverDbId) => client.query(
        `UPDATE community.friend SET sender_id = $2, receiver_id = $3, status = 'pending', created_at = now(), updated_at = now()
         WHERE id = $1`, [id, senderDbId, receiverDbId]),

    setStatus: (client, id, status) => client.query(
        `UPDATE community.friend SET status = $2, updated_at = now() WHERE id = $1`, [id, status]),

    deletePair: (client, aDbId, bDbId) => client.query(
        `DELETE FROM community.friend
         WHERE LEAST(sender_id, receiver_id) = LEAST($1::bigint, $2::bigint)
           AND GREATEST(sender_id, receiver_id) = GREATEST($1::bigint, $2::bigint)`, [aDbId, bDbId]),

    /** One user in the row shape of getUsersSocial (without cursor or privacy fields). */
    userSummary: async (client, dbId) => (await client.query(
        `SELECT u.public_id AS id, u.username, i.image, i.nickname, i.exp_level AS level, lvl.title AS "levelTitle"
         FROM identity.users u
         LEFT JOIN profile.info i ON i.user_id = u.id
         LEFT JOIN profile.exp_level lvl ON lvl.level = i.exp_level
         WHERE u.id = $1`, [dbId])).rows[0] || null,
};
