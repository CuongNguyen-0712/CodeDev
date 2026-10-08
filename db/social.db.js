import { sql } from "@/lib/db";

export const socialDb = {
    getUsersSocial: async ({ userId, search, limit, offset }) => {
        const params = [];
        const conditions = [];

        params.push(userId);

        if (search && search.trim()) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(u.username) LIKE $${params.length}`);
        }

        params.push(limit, offset);

        conditions.push(`u.id != $1`);
        conditions.push(`u.status = 'Active'`);
        conditions.push(`f.sender_id IS NULL`);

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const query = `
            SELECT 
                u.id,
                u.username,
                i.image,
                i.nickname,
                i.level,
                i.rank,
                i.star
            FROM private.users u
            LEFT JOIN private.info i ON i.user_id = u.id
            LEFT JOIN private.friend f 
                ON (
                    (f.sender_id = $1 AND f.receiver_id = u.id)
                    OR 
                    (f.receiver_id = $1 AND f.sender_id = u.id)
                )
            ${whereSQL}
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `;

        return await sql(query, params);
    }
};
