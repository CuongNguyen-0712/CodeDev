import { sql } from "@/lib/db";

const RANGES = { "1h": "1 hour", "24h": "24 hours", "7d": "7 days", "30d": "30 days" };
export const AUDIT_RANGES = [...Object.keys(RANGES), "all"];

export const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** identity.audit_log for the Audit screen (docs/admin-panel-plan.md 5.5), newest first, keyset on id. */
export const adminAuditDb = {
    list: async ({ actor = "", action = "", targetType = "", targetId = "", q = "", range = "7d", beforeId = null, limit = 50 }) => {
        const params = [];
        const where = [];
        if (RANGES[range]) where.push(`a.created_at > now() - interval '${RANGES[range]}'`);
        if (actor === "system") where.push("a.actor_id IS NULL");
        else if (actor) { params.push(actor); where.push(`u.username = $${params.length}`); }
        // A facet value is an action group ("role") or a full action ("role.grant"): match it or its children only.
        if (action) { params.push(action, `${escapeLike(action)}.%`); where.push(`(a.action = $${params.length - 1} OR a.action LIKE $${params.length} ESCAPE '\\')`); }
        if (targetType) { params.push(targetType); where.push(`a.target_type = $${params.length}`); }
        if (targetId) { params.push(targetId); where.push(`a.target_id = $${params.length}`); }
        if (q) {
            params.push(`%${escapeLike(q)}%`);
            where.push(`(a.action ILIKE $${params.length} ESCAPE '\\' OR a.target_id ILIKE $${params.length} ESCAPE '\\' OR u.username ILIKE $${params.length} ESCAPE '\\')`);
        }
        if (beforeId) { params.push(beforeId); where.push(`a.id < $${params.length}::bigint`); }
        params.push(limit);
        return sql(
            `SELECT a.id::text AS id, a.action, a.target_type, a.target_id, a.reason, a.before, a.after, a.ip_address, a.created_at,
                    u.username AS actor
             FROM identity.audit_log a LEFT JOIN identity.users u ON u.id = a.actor_id
             ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
             ORDER BY a.id DESC
             LIMIT $${params.length}`,
            params
        );
    },

    /** Values for the filter column, with counts over the same time range as the list (top 20 actors). */
    facets: async (range = "7d") => {
        const since = RANGES[range] ? `a.created_at > now() - interval '${RANGES[range]}'` : "TRUE";
        return (await sql(
            `SELECT
                (SELECT COALESCE(json_agg(x ORDER BY x.count DESC), '[]') FROM (
                    SELECT split_part(a.action, '.', 1) AS value, COUNT(*)::int AS count FROM identity.audit_log a
                    WHERE ${since} GROUP BY 1) x) AS actions,
                (SELECT COALESCE(json_agg(x ORDER BY x.count DESC), '[]') FROM (
                    SELECT a.target_type AS value, COUNT(*)::int AS count FROM identity.audit_log a
                    WHERE ${since} GROUP BY 1) x) AS targets,
                (SELECT COALESCE(json_agg(x ORDER BY x.count DESC), '[]') FROM (
                    SELECT COALESCE(u.username, 'system') AS value, COUNT(*)::int AS count FROM identity.audit_log a
                    LEFT JOIN identity.users u ON u.id = a.actor_id
                    WHERE ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 20) x) AS actors`
        )).rows[0];
    },
};
