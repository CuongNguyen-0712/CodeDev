import { sql } from "@/lib/db";

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

    /** Members and the team conversation go with it (ON DELETE CASCADE). */
    deleteTeam: (client, teamId) => client.query(`DELETE FROM community.team WHERE id = $1`, [teamId]),

    /**
     * Rule 7 for an account being purged, inside the purge transaction (fk_team_host would otherwise delete the teams it
     * hosts): in each team the person is approved in, the earliest-joined other member becomes host, or the team is deleted
     * when nobody else is approved. No chat sync or event: their conversation membership goes with their user row.
     */
    handOverAll: async (client, userDbId) => {
        const { rows } = await client.query(
            `SELECT team_id FROM community.team_members WHERE user_id = $1 AND status = 'approved' ORDER BY team_id`, [userDbId]);
        for (const { team_id: teamId } of rows) {
            const team = await teamDb.lockTeam(client, teamId);
            if (!team) continue;
            await teamDb.upsertMember(client, { teamId, userDbId, status: "left" });
            const next = await teamDb.nextHost(client, teamId);
            if (!next) await teamDb.deleteTeam(client, teamId);
            else if (team.host_id === String(userDbId)) await teamDb.setHost(client, teamId, next.user_id);
        }
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
};
