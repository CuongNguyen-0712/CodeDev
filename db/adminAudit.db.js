import { sql } from "@/lib/db";

const RANGES = { "1h": "1 hour", "24h": "24 hours", "7d": "7 days", "30d": "30 days" };
export const AUDIT_RANGES = [...Object.keys(RANGES), "all"];

const escapeLike = (text) => text.replace(/[\%_]/g, (ch) => `\${ch}`);

/** identity.audit_log for the Audit screen (docs/admin-panel-plan.md 5.5), newest first, keyset on id. */
export const adminAuditDb = {
    list: async ({ actor = "", action = "", targetType = "", targetId = "", range = "7d", beforeId = null, limit = 50 }) => {
        const params = [];
        const where = [];
        if (RANGES[range]) where.push(`a.created_at > now() - interval '${RANGES[range]}'`);
        if (actor === "system") where.push("a.actor_id IS NULL");
        else if (actor) { params.push(actor); where.push(`u.username = $${params.length}`); }
        if (action) { params.push(`${escapeLike(action)}%`); where.push(`a.action LIKE $${params.length} ESCAPE '\'`); }
        if (targetType) { params.push(targetType); where.push(`a.target_type = $${params.length}`); }
        if (targetId) { params.push(targetId); where.push(`a.target_id = $${params.length}`); }
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

    /** Values for the filter column, with counts, over the last 90 days. */
    facets: async () => (await sql(
        `SELECT
            (SELECT COALESCE(json_agg(x ORDER BY x.count DESC), '[]') FROM (
                SELECT split_part(action, '.', 1) AS value, COUNT(*)::int AS count FROM identity.audit_log
                WHERE created_at > now() - interval '90 days' GROUP BY 1) x) AS actions,
            (SELECT COALESCE(json_agg(x ORDER BY x.count DESC), '[]') FROM (
                SELECT target_type AS value, COUNT(*)::int AS count FROM identity.audit_log
                WHERE created_at > now() - interval '90 days' GROUP BY 1) x) AS targets,
            (SELECT COALESCE(json_agg(x ORDER BY x.count DESC), '[]') FROM (
                SELECT COALESCE(u.username, 'system') AS value, COUNT(*)::int AS count FROM identity.audit_log a
                LEFT JOIN identity.users u ON u.id = a.actor_id
                WHERE a.created_at > now() - interval '90 days' GROUP BY 1 LIMIT 20) x) AS actors`
    )).rows[0],
};
