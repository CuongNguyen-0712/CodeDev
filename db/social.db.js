import { sql } from "@/lib/db";
import { escapeLike } from "@/lib/listFilters";

// The other person of a friend row, in the row shape of /api/users (without its privacy fields).
const USER_COLUMNS = `u.public_id AS id, u.username, i.image, i.nickname, i.exp_level AS level, lvl.title AS "levelTitle"`;
const USER_JOINS = `LEFT JOIN profile.info i ON i.user_id = u.id
            LEFT JOIN profile.exp_level lvl ON lvl.level = i.exp_level`;

export const socialDb = {
    // Active users, each with the caller's `friendship` (null | sent | received | friends).
    // Users who turned "Show my profile" off cannot be found (rule 8), nor can anyone with a
    // block between them and the caller in either direction.
    getUsersSocial: async ({ userId, search, limit, cursor = null }) => {
        const params = [userId];
        const conditions = [
            `u.id <> me.id`,
            `u.status = 'active'`,
            `i.show_profile IS TRUE`,
            `NOT EXISTS (SELECT 1 FROM community.user_block b WHERE b.blocker_id = me.id AND b.blocked_id = u.id)`,
            `NOT EXISTS (SELECT 1 FROM community.user_block b WHERE b.blocker_id = u.id AND b.blocked_id = me.id)`,
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
                CASE
                    WHEN f.status = 'accepted' THEN 'friends'
                    WHEN f.status = 'pending' AND f.sender_id = me.id THEN 'sent'
                    WHEN f.status = 'pending' THEN 'received'
                END AS friendship,
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

    /**
     * Accepted friends who are active, keyset on (username, id). Each edge side has its own index
     * (idx_friend_sender_state / idx_friend_receiver_state), hence UNION ALL rather than OR.
     * shortcut: sorts one person's whole friend set in memory; needs another index past a few thousand friends.
     */
    listFriends: async ({ userId, search, cursor, limit }) => {
        const params = [userId];
        const conditions = [`u.status = 'active'`];
        if (search && search.trim()) {
            params.push(`%${escapeLike(search.trim())}%`);
            conditions.push(`u.username ILIKE $${params.length} ESCAPE '\\'`);
        }
        if (cursor) {
            params.push(cursor.username, cursor.id);
            conditions.push(`(u.username, u.id) > ($${params.length - 1}, $${params.length}::bigint)`);
        }
        params.push(limit);
        return (await sql(`
            WITH me AS (SELECT id FROM identity.users WHERE public_id = $1),
            friend_ids AS (
                SELECT f.receiver_id AS id FROM me JOIN community.friend f ON f.sender_id = me.id AND f.status = 'accepted'
                UNION ALL
                SELECT f.sender_id FROM me JOIN community.friend f ON f.receiver_id = me.id AND f.status = 'accepted'
            )
            SELECT ${USER_COLUMNS}, u.id::text AS cursor_id
            FROM friend_ids fi
            JOIN identity.users u ON u.id = fi.id
            ${USER_JOINS}
            WHERE ${conditions.join(" AND ")}
            ORDER BY u.username, u.id
            LIMIT $${params.length}`, params)).rows;
    },

    /**
     * Pending invitations from active people, newest first: keyset on (updated_at DESC, id), the
     * order of idx_friend_receiver_state / idx_friend_sender_state, so the index serves it without a sort.
     */
    listInvitations: async ({ userId, received, cursor, limit }) => {
        const [mine, theirs] = received ? ["receiver_id", "sender_id"] : ["sender_id", "receiver_id"];
        return (await sql(`
            SELECT ${USER_COLUMNS}, f.updated_at::text AS cursor_at, f.id::text AS cursor_id
            FROM community.friend f
            JOIN identity.users u ON u.id = f.${theirs}
            ${USER_JOINS}
            -- A scalar subquery, not a join: with "me" as a constant the planner reads the index in order.
            WHERE f.${mine} = (SELECT id FROM identity.users WHERE public_id = $1)
              AND f.status = 'pending'
              AND u.status = 'active'
              AND ($2::timestamp IS NULL OR (f.updated_at <= $2::timestamp AND (f.updated_at < $2::timestamp OR f.id > $3::uuid)))
            ORDER BY f.updated_at DESC, f.id
            LIMIT $4`, [userId, cursor?.createdAt ?? null, cursor?.id ?? null, limit])).rows;
    },

    /** Tab numbers in one statement: active friends, and pending invitations received from active people. */
    counts: async (userId) => (await sql(`
        WITH me AS (SELECT id FROM identity.users WHERE public_id = $1),
        edges AS (
            SELECT f.receiver_id AS other_id, f.status FROM me JOIN community.friend f ON f.sender_id = me.id AND f.status = 'accepted'
            UNION ALL
            SELECT f.sender_id, f.status FROM me JOIN community.friend f ON f.receiver_id = me.id AND f.status IN ('accepted', 'pending')
        )
        SELECT count(*) FILTER (WHERE e.status = 'accepted')::int AS friends,
               count(*) FILTER (WHERE e.status = 'pending')::int AS received
        FROM edges e JOIN identity.users u ON u.id = e.other_id AND u.status = 'active'`, [userId])).rows[0],

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

    /** A new invitation on an old rejected / cancelled row: new sender, new created_at (returned). */
    resetPending: async (client, id, senderDbId, receiverDbId) => (await client.query(
        `UPDATE community.friend SET sender_id = $2, receiver_id = $3, status = 'pending', created_at = now(), updated_at = now()
         WHERE id = $1 RETURNING created_at`, [id, senderDbId, receiverDbId])).rows[0].created_at,

    setStatus: (client, id, status) => client.query(
        `UPDATE community.friend SET status = $2, updated_at = now() WHERE id = $1`, [id, status]),

    deletePair: (client, aDbId, bDbId) => client.query(
        `DELETE FROM community.friend
         WHERE LEAST(sender_id, receiver_id) = LEAST($1::bigint, $2::bigint)
           AND GREATEST(sender_id, receiver_id) = GREATEST($1::bigint, $2::bigint)`, [aDbId, bDbId]),

    /** One user in the row shape of getUsersSocial (without cursor or privacy fields). */
    userSummary: async (client, dbId) => (await client.query(
        `SELECT ${USER_COLUMNS}
         FROM identity.users u
         ${USER_JOINS}
         WHERE u.id = $1`, [dbId])).rows[0] || null,
};
