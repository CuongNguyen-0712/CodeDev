import { chatDb } from "@/db/chat.db";
import { sql } from "@/lib/db";

// Same user row as /api/friends (nickname raw: 'None' means unset).
const USER_COLUMNS = `u.public_id AS id, u.username, i.image, i.nickname, i.exp_level AS level, lvl.title AS "levelTitle"`;
const USER_JOINS = `LEFT JOIN profile.info i ON i.user_id = u.id
            LEFT JOIN profile.exp_level lvl ON lvl.level = i.exp_level`;

// Team writes take a transaction `client`; user ids in and out are DB ids (text), team ids are the public `team_…` ids.
export const teamDb = {
    /** The team row locked (rule 5: before any read or write of its members), or null. */
    lockTeam: async (client, teamId) => (await client.query(
        `SELECT id, name, host_id::text AS host_id FROM community.team WHERE id = $1 FOR UPDATE`, [teamId])).rows[0] || null,

    insertTeam: (client, { id, name, hostDbId }) => client.query(
        `INSERT INTO community.team (id, name, size, host_id) VALUES ($1, $2, 5, $3)`, [id, name, hostDbId]),

    /**
     * People by public id: username, user status, whether they are an accepted friend of `friendOfDbId` (may be null),
     * and their member status in `teamId` (may be null).
     */
    people: async (client, { teamId, friendOfDbId, publicIds }) => (await client.query(
        `SELECT u.id::text AS id, u.public_id, u.username, u.status, m.status AS member_status,
                EXISTS (SELECT 1 FROM community.friend f
                        WHERE LEAST(f.sender_id, f.receiver_id) = LEAST($2::bigint, u.id)
                          AND GREATEST(f.sender_id, f.receiver_id) = GREATEST($2::bigint, u.id) AND f.status = 'accepted') AS friend
         FROM identity.users u
         LEFT JOIN community.team_members m ON m.team_id = $1 AND m.user_id = u.id
         WHERE u.public_id = ANY($3::text[])`, [teamId, friendOfDbId, publicIds])).rows,

    /**
     * One row per (team, person): a re-invite resets the old row to pending with updated_at = now() (the invite time);
     * joining sets joined_at, any other status keeps it.
     */
    upsertMember: async (client, { teamId, userDbId, status }) => (await client.query(
        `INSERT INTO community.team_members (team_id, user_id, status, updated_at, joined_at)
         VALUES ($1, $2, $3::text::public.join_team_status, now(), CASE WHEN $3::text = 'approved' THEN now() END)
         ON CONFLICT (team_id, user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now(),
             joined_at = COALESCE(EXCLUDED.joined_at, community.team_members.joined_at)
         RETURNING user_id::text AS user_id, status, updated_at, joined_at`, [teamId, userDbId, status])).rows[0],

    /** Seats taken: pending invites count (rule 2). */
    capacity: async (client, teamId) => (await client.query(
        `SELECT count(*) FILTER (WHERE status = 'approved')::int AS approved, count(*) FILTER (WHERE status = 'pending')::int AS pending
         FROM community.team_members WHERE team_id = $1`, [teamId])).rows[0],

    /** `{ user_id, public_id, joined_at }` of the approved member who joined first (ties: lower row id), or null; served by idx_team_members_team_joined. */
    nextHost: async (client, teamId) => (await client.query(
        `SELECT m.user_id::text AS user_id, u.public_id, m.joined_at FROM community.team_members m JOIN identity.users u ON u.id = m.user_id
         WHERE m.team_id = $1 AND m.status = 'approved' ORDER BY m.joined_at, m.id LIMIT 1`, [teamId])).rows[0] || null,

    /** Public ids of the team's members with `status`. */
    memberIds: async (client, teamId, status) => (await client.query(
        `SELECT u.public_id FROM community.team_members m JOIN identity.users u ON u.id = m.user_id
         WHERE m.team_id = $1 AND m.status = $2::text::public.join_team_status`, [teamId, status])).rows.map((r) => r.public_id),

    setHost: (client, teamId, hostDbId) => client.query(
        `UPDATE community.team SET host_id = $2, updated_at = now() WHERE id = $1`, [teamId, hostDbId]),

    rename: (client, teamId, name) => client.query(
        `UPDATE community.team SET name = $2, updated_at = now() WHERE id = $1`, [teamId, name]),

    /** `{ kind, provider, storageKey }` of every file stored for the conversation (sent or only uploaded): what chat's attachment delete job takes. */
    conversationFiles: async (client, conversationDbId) => (await client.query(
        `SELECT kind, provider, storage_key AS "storageKey" FROM community.chat_attachment WHERE conversation_id = $1`, [conversationDbId])).rows,

    /** Members and the team conversation go with it (ON DELETE CASCADE). */
    deleteTeam: (client, teamId) => client.query(`DELETE FROM community.team WHERE id = $1`, [teamId]),

    /**
     * Rule 7 for an account being purged, inside the purge transaction (fk_team_host would otherwise delete the teams it
     * hosts): in each team the person is approved in, the earliest-joined other member becomes host, or the team is deleted
     * when nobody else is approved. No chat sync or event: their conversation membership goes with their user row.
     * Returns the files of the ended teams' conversations (`conversationFiles`), for the caller to queue after commit.
     */
    handOverAll: async (client, userDbId) => {
        const { rows } = await client.query(
            `SELECT team_id FROM community.team_members WHERE user_id = $1 AND status = 'approved' ORDER BY team_id`, [userDbId]);
        const files = [];
        for (const { team_id: teamId } of rows) {
            const team = await teamDb.lockTeam(client, teamId);
            if (!team) continue;
            await teamDb.upsertMember(client, { teamId, userDbId, status: "left" });
            const next = await teamDb.nextHost(client, teamId);
            if (next) {
                if (team.host_id === String(userDbId)) await teamDb.setHost(client, teamId, next.user_id);
                continue;
            }
            const conversation = await chatDb.lockByTeamId(client, teamId);
            if (conversation) files.push(...await teamDb.conversationFiles(client, conversation.id));
            await teamDb.deleteTeam(client, teamId);
        }
        return files;
    },

    /** Read after commit, on the pool: `{ id, name, hostId, memberCount, pendingCount, conversationId }` or null; conversationId is null until the conversation exists. */
    summary: async (teamId) => (await sql(
        `SELECT t.id, t.name, h.public_id AS "hostId",
                (SELECT count(*) FROM community.team_members m WHERE m.team_id = t.id AND m.status = 'approved')::int AS "memberCount",
                (SELECT count(*) FROM community.team_members m WHERE m.team_id = t.id AND m.status = 'pending')::int AS "pendingCount",
                c.public_id AS "conversationId"
         FROM community.team t
         JOIN identity.users h ON h.id = t.host_id
         LEFT JOIN community.conversation c ON c.team_id = t.id
         WHERE t.id = $1`, [teamId])).rows[0] || null,

    /** Team name and the caller's member status in it, or null when the team does not exist. */
    teamFor: async (teamId, userId) => (await sql(
        `SELECT t.id, t.name, m.status AS member_status
         FROM community.team t
         LEFT JOIN community.team_members m ON m.team_id = t.id AND m.user_id = (SELECT id FROM identity.users WHERE public_id = $2)
         WHERE t.id = $1`, [teamId, userId])).rows[0] || null,

    /** Approved members by join order, then pending (a team has at most 5 rows); `role` is host | member | invited. */
    members: async (teamId) => (await sql(
        `SELECT ${USER_COLUMNS},
                CASE WHEN m.status = 'pending' THEN 'invited' WHEN m.user_id = t.host_id THEN 'host' ELSE 'member' END AS role
         FROM community.team t
         JOIN community.team_members m ON m.team_id = t.id AND m.status IN ('approved', 'pending')
         JOIN identity.users u ON u.id = m.user_id
         ${USER_JOINS}
         WHERE t.id = $1
         ORDER BY (m.status = 'pending'), m.joined_at, m.id`, [teamId])).rows,

    /**
     * Pending invitations of the caller for teams that still exist, newest first, keyset (updated_at DESC, id);
     * the inviter is the team's host (only hosts invite). Served by idx_team_members_user + a sort of the person's pending rows.
     */
    listInvitations: async ({ userId, cursor, limit }) => (await sql(
        `SELECT t.id AS team_id, t.name AS team_name, m.updated_at AS invited_at, m.updated_at::text AS cursor_at, m.id::text AS cursor_id,
                ${USER_COLUMNS}
         FROM community.team_members m
         JOIN community.team t ON t.id = m.team_id
         JOIN identity.users u ON u.id = t.host_id
         ${USER_JOINS}
         WHERE m.user_id = (SELECT id FROM identity.users WHERE public_id = $1)
           AND m.status = 'pending'
           AND ($2::timestamp IS NULL OR (m.updated_at <= $2::timestamp AND (m.updated_at < $2::timestamp OR m.id > $3::bigint)))
         ORDER BY m.updated_at DESC, m.id
         LIMIT $4`, [userId, cursor?.createdAt ?? null, cursor?.id ?? null, limit])).rows,
};
