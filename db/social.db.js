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
    }
};
