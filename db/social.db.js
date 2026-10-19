import { sql } from "@/lib/db";

export const socialDb = {
    // Active users the caller has no friendship (pending or otherwise) with.
    getUsersSocial: async ({ userId, search, limit, offset }) => {
        const params = [userId];
        const conditions = [
            `u.id <> me.id`,
            `u.status = 'active'`,
            `f.id IS NULL`,
        ];

        if (search && search.trim()) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(u.username) LIKE $${params.length}`);
        }

        params.push(limit, offset);

        const query = `
            SELECT
                u.public_id AS id,
                u.username,
                i.image,
                i.nickname,
                i.exp_level AS level,
                lvl.title AS "levelTitle",
                i.show_profile AS "showProfile"
            FROM identity.users me
            JOIN identity.users u ON true
            LEFT JOIN profile.info i ON i.user_id = u.id
            LEFT JOIN profile.exp_level lvl ON lvl.level = i.exp_level
            LEFT JOIN community.friend f
                ON LEAST(f.sender_id, f.receiver_id) = LEAST(me.id, u.id)
               AND GREATEST(f.sender_id, f.receiver_id) = GREATEST(me.id, u.id)
            WHERE me.public_id = $1
              AND ${conditions.join(" AND ")}
            ORDER BY u.username
            LIMIT $${params.length - 1} OFFSET $${params.length};
        `;

        return await sql(query, params);
    }
};
