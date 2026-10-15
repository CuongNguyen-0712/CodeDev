import { sql } from "@/lib/db";

const USER_ID = (param) => `(SELECT id FROM identity.users WHERE public_id = ${param})`;

export const teamDb = {
    // Creates the team and registers the host as an approved member in one statement.
    createTeam: async ({ teamId, userId, name, size, description }) => {
        const params = [teamId, userId, name, size, description];
        const query = `
            WITH team AS (
                INSERT INTO community.team (id, host_id, name, size, description)
                VALUES ($1, ${USER_ID("$2")}, $3, $4, $5)
                RETURNING id, host_id
            )
            INSERT INTO community.team_members (team_id, user_id, status)
            SELECT id, host_id, 'approved' FROM team
            RETURNING team_id AS id;
        `;
        return await sql(query, params);
    },

    // Teams the user belongs to (approved membership), with their member list.
    getMyTeams: async ({ userId, search }) => {
        const params = [userId];
        const conditions = [
            `me.user_id = ${USER_ID("$1")}`,
            `me.status = 'approved'`,
        ];

        if (search && search.trim()) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(t.name) LIKE $${params.length}`);
        }

        const query = `
            SELECT
                t.id AS team_id,
                t.name AS team_name,
                t.size AS team_size,
                t.image_url AS team_image,
                host.username AS host_name,
                (t.host_id = me.user_id) AS is_host,
                STRING_AGG(mu.username, ',' ORDER BY m.created_at) AS members
            FROM community.team_members me
            JOIN community.team t ON t.id = me.team_id
            JOIN identity.users host ON host.id = t.host_id
            JOIN community.team_members m ON m.team_id = t.id AND m.status = 'approved'
            JOIN identity.users mu ON mu.id = m.user_id
            WHERE ${conditions.join(" AND ")}
            GROUP BY t.id, t.name, t.size, t.image_url, host.username, t.host_id, me.user_id
            ORDER BY t.created_at DESC;
        `;

        return await sql(query, params);
    },

    // Teams the user has not joined or requested yet.
    getTeamsSocial: async ({ userId, search, limit, offset }) => {
        const params = [userId];
        const conditions = [
            `NOT EXISTS (
                SELECT 1 FROM community.team_members m
                WHERE m.team_id = t.id
                  AND m.user_id = ${USER_ID("$1")}
                  AND m.status IN ('pending', 'approved')
            )`,
        ];

        if (search && search.trim()) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(t.name) LIKE $${params.length}`);
        }

        params.push(limit, offset);

        const query = `
            SELECT
                t.id,
                t.name,
                t.size,
                t.description,
                t.image_url,
                t.created_at,
                (SELECT COUNT(*)::int FROM community.team_members m WHERE m.team_id = t.id AND m.status = 'approved') AS member_count
            FROM community.team t
            WHERE ${conditions.join(" AND ")}
            ORDER BY t.created_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length};
        `;

        return await sql(query, params);
    }
};
