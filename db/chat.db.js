import { sql } from "@/lib/db";

// Each function takes a transaction `client`, or null to run on its own.
const run = (client, text, params) => (client ? client.query(text, params) : sql(text, params));
const one = async (client, text, params) => (await run(client, text, params)).rows[0] || null;

// profile.info.nickname defaults to 'None', which means "not set".
const NICKNAME = (alias) => `NULLIF(${alias}.nickname, 'None')`;

const MESSAGE = `
    SELECT m.public_id AS id, m.id::text AS seq, c.public_id AS conversation_id, m.client_id,
           u.public_id AS sender_id, u.username AS sender_username, ${NICKNAME("i")} AS sender_nickname, i.image AS sender_image,
           m.body, m.created_at, m.edited_at, m.deleted_at IS NOT NULL AS deleted,
           COALESCE((SELECT json_agg(json_build_object('id', a.public_id, 'width', a.width, 'height', a.height) ORDER BY a.id)
                     FROM community.chat_attachment a WHERE a.message_id = m.id), '[]'::json) AS attachments
    FROM community.chat_message m
    JOIN community.conversation c ON c.id = m.conversation_id
    JOIN identity.users u ON u.id = m.sender_id
    LEFT JOIN profile.info i ON i.user_id = u.id`;

/** SQL for community.conversation, conversation_member, chat_message and user_block; ids that leave the service are public ids. */
export const chatDb = {
    userByPublicId: (client, publicId) => one(client,
        `SELECT u.id::text AS id, u.public_id, u.status, COALESCE(i.show_profile, false) AS show_profile
         FROM identity.users u LEFT JOIN profile.info i ON i.user_id = u.id WHERE u.public_id = $1`, [publicId]),

    isBlocked: async (client, a, b) => (await one(client,
        `SELECT EXISTS (SELECT 1 FROM community.user_block
                        WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)) AS blocked`, [a, b])).blocked,

    /** Accepted friends, or approved members of the same team. */
    areClose: async (client, a, b) => (await one(client,
        `SELECT EXISTS (SELECT 1 FROM community.friend f
                        WHERE LEAST(f.sender_id, f.receiver_id) = LEAST($1::bigint, $2::bigint)
                          AND GREATEST(f.sender_id, f.receiver_id) = GREATEST($1::bigint, $2::bigint) AND f.status = 'accepted')
             OR EXISTS (SELECT 1 FROM community.team_members x JOIN community.team_members y ON y.team_id = x.team_id
                        WHERE x.user_id = $1 AND y.user_id = $2 AND x.status = 'approved' AND y.status = 'approved') AS close`, [a, b])).close,

    lockByDirectKey: (client, directKey) => one(client,
        `SELECT id::text AS id, public_id, kind FROM community.conversation WHERE direct_key = $1 FOR UPDATE`, [directKey]),

    lockByPublicId: (client, publicId) => one(client,
        `SELECT id::text AS id, public_id, kind FROM community.conversation WHERE public_id = $1 FOR UPDATE`, [publicId]),

    /** Creates the direct conversation and its two members; false when another transaction created it first. */
    insertDirect: async (client, { publicId, directKey, members }) => {
        const row = await one(client,
            `INSERT INTO community.conversation (public_id, kind, direct_key) VALUES ($1, 'direct', $2)
             ON CONFLICT (direct_key) DO NOTHING RETURNING id::text AS id`, [publicId, directKey]);
        if (!row) return false;
        await client.query(
            `INSERT INTO community.conversation_member (conversation_id, user_id, state)
             SELECT $1, unnest($2::bigint[]), unnest($3::community.member_state[])`,
            [row.id, members.map((m) => m.userId), members.map((m) => m.state)]);
        return true;
    },

    /** The caller's live membership (not left) with the conversation's title source; null when not a member. */
    membership: (client, { conversationId, userId }) => one(client,
        `SELECT c.id::text AS id, c.public_id, c.kind, cm.state, t.name AS team_name, t.image_url AS team_image
         FROM community.conversation c
         JOIN identity.users me ON me.public_id = $2
         JOIN community.conversation_member cm ON cm.conversation_id = c.id AND cm.user_id = me.id AND cm.left_at IS NULL
         LEFT JOIN community.team t ON t.id = c.team_id
         WHERE c.public_id = $1`, [conversationId, userId]),

    members: async (client, conversationDbId) => (await run(client,
        `SELECT cm.user_id::text AS user_id, u.public_id, u.username, ${NICKNAME("i")} AS nickname, i.image, u.status,
                cm.state, cm.last_read_message_id::text AS last_read_seq, cm.left_at
         FROM community.conversation_member cm
         JOIN identity.users u ON u.id = cm.user_id
         LEFT JOIN profile.info i ON i.user_id = u.id
         WHERE cm.conversation_id = $1 ORDER BY cm.created_at, cm.user_id`, [conversationDbId])).rows,

    hasSent: async (client, { conversationDbId, senderDbId }) => (await one(client,
        `SELECT EXISTS (SELECT 1 FROM community.chat_message WHERE conversation_id = $1 AND sender_id = $2) AS sent`,
        [conversationDbId, senderDbId])).sent,

    messageByClientId: (client, { senderDbId, clientId }) => one(client,
        `SELECT public_id, conversation_id::text AS conversation_id FROM community.chat_message WHERE sender_id = $1 AND client_id = $2`,
        [senderDbId, clientId]),

    /** Inserts the message, moves the conversation's last message and marks it read (and accepted) for the sender; null on a duplicate clientId. */
    insertMessage: async (client, { publicId, conversationDbId, senderDbId, clientId, body }) => {
        const row = await one(client,
            `INSERT INTO community.chat_message (public_id, conversation_id, sender_id, client_id, body) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (sender_id, client_id) DO NOTHING RETURNING id, created_at`,
            [publicId, conversationDbId, senderDbId, clientId, body]);
        if (!row) return null;
        await client.query(`UPDATE community.conversation SET last_message_id = $2, last_message_at = $3 WHERE id = $1`, [conversationDbId, row.id, row.created_at]);
        await client.query(
            `UPDATE community.conversation_member SET last_read_message_id = $3, state = 'accepted' WHERE conversation_id = $1 AND user_id = $2`,
            [conversationDbId, senderDbId, row.id]);
        return row;
    },

    /** A message the user can read (live member of its conversation). */
    messageForMember: (client, { messageId, userId }) => one(client,
        `${MESSAGE}
         JOIN community.conversation_member cm ON cm.conversation_id = m.conversation_id AND cm.left_at IS NULL
         JOIN identity.users me ON me.id = cm.user_id AND me.public_id = $2
         WHERE m.public_id = $1`, [messageId, userId]),

    /** Newest first, below `before` (a seq) when given. */
    listMessages: async ({ conversationDbId, before, limit }) => (await sql(
        `${MESSAGE} WHERE m.conversation_id = $1 AND ($2::bigint IS NULL OR m.id < $2::bigint) ORDER BY m.id DESC LIMIT $3`,
        [conversationDbId, before ?? null, limit])).rows,

    /** The user's live conversations in one state, newest activity first, keyset on (activity, public_id). */
    listConversations: async ({ userId, state, cursor, limit }) => (await sql(
        `SELECT c.public_id AS id, c.kind, cm.state, c.last_message_at,
                CASE WHEN c.kind = 'team' THEN t.name ELSE COALESCE(${NICKNAME("oi")}, ou.username) END AS title,
                CASE WHEN c.kind = 'team' THEN t.image_url ELSE oi.image END AS image,
                lm.id::text AS last_seq, lm.body AS last_body, lm.deleted_at IS NOT NULL AS last_deleted,
                lu.public_id AS last_sender_id, lm.created_at AS last_created_at,
                EXISTS (SELECT 1 FROM community.chat_attachment a WHERE a.message_id = lm.id) AS last_has_image,
                EXISTS (SELECT 1 FROM community.chat_message x
                        WHERE x.conversation_id = c.id AND x.id > cm.last_read_message_id AND x.sender_id <> me.id AND x.deleted_at IS NULL) AS unread,
                COALESCE(c.last_message_at, c.created_at)::text AS cursor_at, c.public_id AS cursor_id
         FROM identity.users me
         JOIN community.conversation_member cm ON cm.user_id = me.id AND cm.left_at IS NULL AND cm.state = $2::community.member_state
         JOIN community.conversation c ON c.id = cm.conversation_id
         LEFT JOIN community.team t ON t.id = c.team_id
         LEFT JOIN LATERAL (SELECT om.user_id FROM community.conversation_member om
                            WHERE om.conversation_id = c.id AND om.user_id <> me.id LIMIT 1) o ON c.kind = 'direct'
         LEFT JOIN identity.users ou ON ou.id = o.user_id
         LEFT JOIN profile.info oi ON oi.user_id = ou.id
         LEFT JOIN community.chat_message lm ON lm.id = c.last_message_id
         LEFT JOIN identity.users lu ON lu.id = lm.sender_id
         WHERE me.public_id = $1
           AND ($3::timestamptz IS NULL OR (COALESCE(c.last_message_at, c.created_at), c.public_id) < ($3::timestamptz, $4::text))
         ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.public_id DESC LIMIT $5`,
        [userId, state, cursor?.createdAt ?? null, cursor?.id ?? null, limit])).rows,

    /** Unread = accepted conversations with a live message from someone else past the read mark; requests = pending conversations. */
    unreadCounts: async (userId) => (await sql(
        `SELECT count(*) FILTER (WHERE cm.state = 'accepted' AND EXISTS (
                    SELECT 1 FROM community.chat_message x
                    WHERE x.conversation_id = cm.conversation_id AND x.id > cm.last_read_message_id AND x.sender_id <> me.id AND x.deleted_at IS NULL))::int AS unread,
                count(*) FILTER (WHERE cm.state = 'pending')::int AS requests
         FROM identity.users me
         JOIN community.conversation_member cm ON cm.user_id = me.id AND cm.left_at IS NULL
         WHERE me.public_id = $1`, [userId])).rows[0],
};
