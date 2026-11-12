import { sql } from "@/lib/db";

// Each function takes a transaction `client`, or null to run on its own.
const run = (client, text, params) => (client ? client.query(text, params) : sql(text, params));
const one = async (client, text, params) => (await run(client, text, params)).rows[0] || null;

// profile.info.nickname defaults to 'None', which means "not set".
const NICKNAME = (alias) => `NULLIF(${alias}.nickname, 'None')`;

// What chatMedia needs to reach a stored attachment, aliased to its `att` shape; every read and delete follows the row's provider.
const ATTACHMENT = `a.kind, a.provider, a.storage_key AS "storageKey", a.content_type AS "contentType", a.file_name AS "fileName"`;

const MESSAGE = `
    SELECT m.public_id AS id, m.id::text AS seq, c.public_id AS conversation_id, m.client_id,
           u.public_id AS sender_id, u.username AS sender_username, ${NICKNAME("i")} AS sender_nickname, i.image AS sender_image,
           m.body, m.created_at, m.edited_at, m.deleted_at IS NOT NULL AS deleted,
           COALESCE((SELECT json_agg(CASE WHEN a.kind = 'file'
                                           THEN json_build_object('id', a.public_id, 'kind', 'file', 'name', a.file_name, 'size', a.size_bytes)
                                           ELSE json_build_object('id', a.public_id, 'kind', 'image', 'width', a.width, 'height', a.height) END ORDER BY a.id)
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

    /** Read only (no lock): the public id of the direct conversation with this key, if any. */
    directPublicId: async (client, directKey) => (await one(client,
        `SELECT public_id FROM community.conversation WHERE direct_key = $1`, [directKey]))?.public_id ?? null,

    lockByPublicId: (client, publicId) => one(client,
        `SELECT id::text AS id, public_id, kind FROM community.conversation WHERE public_id = $1 FOR UPDATE`, [publicId]),

    lockByTeamId: (client, teamId) => one(client,
        `SELECT id::text AS id, public_id, kind FROM community.conversation WHERE team_id = $1 FOR UPDATE`, [teamId]),

    teamExists: async (client, teamId) => Boolean(await one(client, `SELECT 1 FROM community.team WHERE id = $1`, [teamId])),

    /** Idempotent on team_id; returns the conversation's public id. */
    ensureTeam: async (client, { publicId, teamId }) => {
        await run(client, `INSERT INTO community.conversation (public_id, kind, team_id) VALUES ($1, 'team', $2) ON CONFLICT (team_id) DO NOTHING`, [publicId, teamId]);
        return (await one(client, `SELECT public_id FROM community.conversation WHERE team_id = $1`, [teamId])).public_id;
    },

    joinTeam: (client, { conversationDbId, userDbId }) => client.query(
        `INSERT INTO community.conversation_member (conversation_id, user_id, state) VALUES ($1, $2, 'accepted')
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL, state = 'accepted'`, [conversationDbId, userDbId]),

    leaveTeam: (client, { conversationDbId, userDbId }) => client.query(
        `UPDATE community.conversation_member SET left_at = now() WHERE conversation_id = $1 AND user_id = $2`, [conversationDbId, userDbId]),

    /** Moves the read mark forward only, never past the newest message; returns the old and new marks. */
    advanceRead: (client, { conversationDbId, userDbId, seq }) => one(client,
        `WITH old AS (SELECT last_read_message_id AS v FROM community.conversation_member WHERE conversation_id = $1 AND user_id = $2),
              upd AS (UPDATE community.conversation_member SET last_read_message_id = GREATEST(last_read_message_id,
                          LEAST($3::bigint, COALESCE((SELECT max(id) FROM community.chat_message WHERE conversation_id = $1), 0)))
                      WHERE conversation_id = $1 AND user_id = $2 RETURNING last_read_message_id AS v)
         SELECT old.v::text AS before, upd.v::text AS after FROM old, upd`, [conversationDbId, userDbId, seq]),

    setState: (client, { conversationDbId, userDbId, state }) => client.query(
        `UPDATE community.conversation_member SET state = $3 WHERE conversation_id = $1 AND user_id = $2`, [conversationDbId, userDbId, state]),

    /** A message with its conversation's public id and whether the edit window has passed. */
    messageRef: (client, { messageId, windowMs }) => one(client,
        `SELECT m.id::text AS id, m.sender_id::text AS sender_id, m.deleted_at IS NOT NULL AS deleted,
                m.created_at < now() - ($2::int * interval '1 millisecond') AS expired, c.public_id AS conversation_id
         FROM community.chat_message m JOIN community.conversation c ON c.id = m.conversation_id WHERE m.public_id = $1`, [messageId, windowMs]),

    messageById: (client, messageId) => one(client, `${MESSAGE} WHERE m.public_id = $1`, [messageId]),

    editBody: (client, { messageDbId, body }) => client.query(
        `UPDATE community.chat_message SET body = $2, edited_at = now() WHERE id = $1`, [messageDbId, body]),

    /** Marks the message unsent, drops its attachment rows and returns them as chatMedia attachments. */
    recall: async (client, messageDbId) => {
        await client.query(`UPDATE community.chat_message SET deleted_at = now(), body = '' WHERE id = $1`, [messageDbId]);
        return (await client.query(`DELETE FROM community.chat_attachment a WHERE a.message_id = $1 RETURNING ${ATTACHMENT}`, [messageDbId])).rows;
    },

    insertAttachment: (client, { publicId, conversationDbId, uploaderDbId, kind, provider, storageKey, contentType, size, fileName, width, height }) => client.query(
        `INSERT INTO community.chat_attachment (public_id, conversation_id, uploader_id, kind, provider, storage_key, content_type, size_bytes, file_name, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [publicId, conversationDbId, uploaderDbId, kind, provider, storageKey, contentType, size, fileName, width, height]),

    /** The caller's own unsent uploads among `ids` (no lock), with the declared size; used to inspect the files before the send transaction. */
    unsentUploads: async (client, { uploaderDbId, ids }) => (await run(client,
        `SELECT a.id::text AS id, ${ATTACHMENT}, a.size_bytes AS size FROM community.chat_attachment a
         WHERE a.public_id = ANY($1::text[]) AND a.uploader_id = $2 AND a.message_id IS NULL`, [ids, uploaderDbId])).rows,

    deleteAttachments: (client, dbIds) => run(client, `DELETE FROM community.chat_attachment WHERE id = ANY($1::bigint[])`, [dbIds]),

    /** Attaches the caller's unsent uploads of this conversation to the message; returns how many matched. */
    claimAttachments: async (client, { ids, uploaderDbId, conversationDbId, messageDbId }) => (await client.query(
        `UPDATE community.chat_attachment SET message_id = $4
         WHERE public_id = ANY($1::text[]) AND uploader_id = $2 AND conversation_id = $3 AND message_id IS NULL`,
        [ids, uploaderDbId, conversationDbId, messageDbId])).rowCount,

    /** An attachment on a live message the user may read. */
    readableAttachment: (client, { attachmentId, userId }) => one(client,
        `SELECT ${ATTACHMENT} FROM community.chat_attachment a
         JOIN community.chat_message m ON m.id = a.message_id AND m.deleted_at IS NULL
         JOIN community.conversation_member cm ON cm.conversation_id = m.conversation_id AND cm.left_at IS NULL
         JOIN identity.users me ON me.id = cm.user_id AND me.public_id = $2
         WHERE a.public_id = $1`, [attachmentId, userId]),

    /** Unsent uploads older than `minutes`, row-locked and skipping rows another purge holds. */
    lockOrphans: async (client, { minutes, limit }) => (await client.query(
        `SELECT a.id::text AS id, ${ATTACHMENT} FROM community.chat_attachment a
         WHERE a.message_id IS NULL AND a.created_at < now() - ($1::int * interval '1 minute')
         ORDER BY a.created_at LIMIT $2 FOR UPDATE SKIP LOCKED`, [minutes, limit])).rows,

    addBlock: (client, { blockerDbId, blockedDbId }) => run(client,
        `INSERT INTO community.user_block (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [blockerDbId, blockedDbId]),

    removeBlock: (client, { blockerDbId, blockedDbId }) => run(client,
        `DELETE FROM community.user_block WHERE blocker_id = $1 AND blocked_id = $2`, [blockerDbId, blockedDbId]),

    listBlocks: async (userId) => (await sql(
        `SELECT u.public_id AS id, u.username, ${NICKNAME("i")} AS nickname, i.image, b.created_at AS "blockedAt"
         FROM identity.users me
         JOIN community.user_block b ON b.blocker_id = me.id
         JOIN identity.users u ON u.id = b.blocked_id
         LEFT JOIN profile.info i ON i.user_id = u.id
         WHERE me.public_id = $1 ORDER BY b.created_at DESC, u.id DESC`, [userId])).rows,

    /** False when this reporter already reported the message. */
    addReport: async (client, { messageDbId, reporterDbId, reason }) => (await run(client,
        `INSERT INTO community.chat_report (message_id, reporter_id, reason) VALUES ($1, $2, $3) ON CONFLICT (message_id, reporter_id) DO NOTHING`,
        [messageDbId, reporterDbId, reason])).rowCount === 1,

    /** Messages with open reports, oldest first report first, keyset on (first open report, message id). Only the reported message, never its conversation. */
    listReported: async ({ cursor, limit }) => (await sql(
        `WITH r AS (SELECT message_id, count(*)::int AS reports, (array_agg(reason ORDER BY created_at DESC))[1:5] AS reasons, min(created_at) AS first_at
                    FROM community.chat_report WHERE resolved_at IS NULL GROUP BY message_id)
         SELECT m.public_id AS "messageId", m.body, c.kind AS "conversationKind", r.reports, r.reasons, r.first_at AS "firstReportedAt",
                u.public_id AS sender_id, u.username AS sender_username, ${NICKNAME("i")} AS sender_nickname,
                COALESCE((SELECT json_agg(json_build_object('id', a.public_id, 'kind', a.kind, 'name', a.file_name) ORDER BY a.id)
                          FROM community.chat_attachment a WHERE a.message_id = m.id), '[]'::json) AS attachments,
                r.first_at::text AS cursor_at, m.public_id AS cursor_id
         FROM r
         JOIN community.chat_message m ON m.id = r.message_id
         JOIN community.conversation c ON c.id = m.conversation_id
         JOIN identity.users u ON u.id = m.sender_id
         LEFT JOIN profile.info i ON i.user_id = u.id
         WHERE ($1::timestamptz IS NULL OR (r.first_at, m.public_id) > ($1::timestamptz, $2::text))
         ORDER BY r.first_at, m.public_id LIMIT $3`,
        [cursor?.createdAt ?? null, cursor?.id ?? null, limit])).rows,

    /** Closes the message's open reports; returns how many were open. */
    resolveReports: async (client, { messageDbId, adminDbId }) => (await client.query(
        `UPDATE community.chat_report SET resolved_at = now(), resolved_by = $2 WHERE message_id = $1 AND resolved_at IS NULL`,
        [messageDbId, adminDbId])).rowCount,

    /** An attachment of `messageId` (chatMedia shape), only while that message has an open report; else null. */
    reportedAttachment: async (client, { messageId, attachmentId }) => (await one(client,
        `SELECT ${ATTACHMENT} FROM community.chat_attachment a
         JOIN community.chat_message m ON m.id = a.message_id
         WHERE m.public_id = $1 AND a.public_id = $2
           AND EXISTS (SELECT 1 FROM community.chat_report r WHERE r.message_id = m.id AND r.resolved_at IS NULL)`,
        [messageId, attachmentId])) ?? null,

    hasOpenReports: async (client, messageDbId) => (await one(client,
        `SELECT EXISTS (SELECT 1 FROM community.chat_report WHERE message_id = $1 AND resolved_at IS NULL) AS open`, [messageDbId])).open,

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
                (SELECT max(a.kind) FROM community.chat_attachment a WHERE a.message_id = lm.id) AS last_attachment_kind, -- 'image' > 'file': any image wins
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

    /** Unread (same definition as the inbox) in a conversation the user is an accepted, live member of; the latest unread message supplies the preview. */
    pushSummary: ({ userId, conversationId }) => one(null,
        `SELECT c.kind, t.name AS team_name, u.n AS unread, lm.body AS last_body,
                (SELECT max(a.kind) FROM community.chat_attachment a WHERE a.message_id = lm.id) AS last_attachment_kind,
                lu.username AS sender_username, ${NICKNAME("li")} AS sender_nickname
         FROM identity.users me
         JOIN community.conversation_member cm ON cm.user_id = me.id AND cm.left_at IS NULL AND cm.state = 'accepted'
         JOIN community.conversation c ON c.id = cm.conversation_id AND c.public_id = $2
         LEFT JOIN community.team t ON t.id = c.team_id
         CROSS JOIN LATERAL (SELECT count(*)::int AS n, max(x.id) AS last_id FROM community.chat_message x
                             WHERE x.conversation_id = c.id AND x.id > cm.last_read_message_id AND x.sender_id <> me.id AND x.deleted_at IS NULL) u
         JOIN community.chat_message lm ON lm.id = u.last_id
         JOIN identity.users lu ON lu.id = lm.sender_id
         LEFT JOIN profile.info li ON li.user_id = lu.id
         WHERE me.public_id = $1`, [userId, conversationId]),
};
