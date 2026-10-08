import { sql } from "@/lib/db";

export const teamDb = {
    createTeam: async ({ teamId, userId, name, size, description }) => {
        const params = [teamId, userId, name, size, description];
        const query = `
            INSERT INTO public.team (id, host_id, name, size, description) 
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `;
        return await sql(query, params);
    },

    getMyTeams: async ({ userId, search }) => {
        const params = [];
        const conditions = [];

        params.push(userId);
        conditions.push(`t1.host_id = $${params.length}`);

        if (search && search.trim()) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(t3.name) LIKE $${params.length}`);
        }

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const query = `
            SELECT
                t1.id AS team_id,
                t3.name AS team_name,
                t3.size AS team_size,
                t3.image_url AS team_image,
                u2.username AS host_name,
                (u2.id = $1) AS is_host,
                STRING_AGG(u1.username, ',') AS members
            FROM public.team t1
            JOIN public.team t2 ON t1.id = t2.id
            JOIN private.users u1 ON t2.host_id = u1.id
            JOIN public.team t3 ON t3.id = t1.id
            JOIN private.users u2 ON u2.id = t3.host_id
            ${whereSQL}    
            GROUP BY t1.id, t3.name, t3.size, t3.image_url, u2.username, u2.id
        `;

        return await sql(query, params);
    },

    getTeamsSocial: async ({ userId, search, limit, offset }) => {
        const conditions = [];
        const params = [];

        params.push(userId);
        conditions.push(`t.id NOT IN (
            SELECT team_id
            FROM social.team
            WHERE user_id = $1
        )`);

        if (search && search.trim()) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(t.name) LIKE $${params.length}`);
        }

        params.push(limit, offset);

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const query = `
            SELECT t.*
            FROM public.team t
            LEFT JOIN social.team s
                ON s.team_id = t.id AND s.user_id = $1
            ${whereSQL}
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `;

        return await sql(query, params);
    }
};
