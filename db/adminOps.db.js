import { sql } from "@/lib/db";

/** System page figures (docs/admin-panel-plan.md 05). Read-only, run only when the page is open. */
export const adminOpsDb = {
    outbox: async () => (await sql(
        `SELECT COUNT(*) FILTER (WHERE processed_at IS NULL AND dead_at IS NULL)::int AS pending,
                COUNT(*) FILTER (WHERE processed_at IS NULL AND dead_at IS NULL AND attempts > 0)::int AS retrying,
                COUNT(*) FILTER (WHERE dead_at IS NOT NULL AND processed_at IS NULL)::int AS dead,
                MIN(created_at) FILTER (WHERE processed_at IS NULL AND dead_at IS NULL) AS oldest_pending_at
         FROM identity.auth_outbox`
    )).rows[0],

    deadLetters: async ({ open = true, limit = 50 }) => (await sql(
        `SELECT id::text, source, kind, ref, left(error, 300) AS error, attempts, created_at, resolved_at, resolution
         FROM ops.dead_letters
         WHERE ($1::boolean IS FALSE OR resolved_at IS NULL)
         ORDER BY id DESC LIMIT $2`,
        [open, limit]
    )).rows,

    lockDeadLetter: async (client, id) => (await client.query(
        `SELECT id::text, source, kind, ref, payload FROM ops.dead_letters WHERE id = $1 AND resolved_at IS NULL FOR UPDATE`,
        [id]
    )).rows[0] || null,

    resolveDeadLetter: async (client, { id, resolution }) => client.query(
        `UPDATE ops.dead_letters SET resolved_at = now(), resolution = left($2, 500) WHERE id = $1`, [id, resolution]),

    /** The outbox row behind a dead letter becomes pending again (the sweeper or worker sends it). */
    requeueOutbox: async (client, { outboxId }) => client.query(
        `UPDATE identity.auth_outbox SET dead_at = NULL, attempts = 0, available_at = now(), published_at = NULL
         WHERE id = $1 AND processed_at IS NULL`,
        [outboxId]
    ),

    database: async () => {
        const [connections, tables, statements] = await Promise.all([
            sql(`SELECT COALESCE(state, 'other') AS state, COUNT(*)::int AS count
                 FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1 ORDER BY 2 DESC`),
            sql(`SELECT s.schemaname || '.' || s.relname AS name, pg_total_relation_size(s.relid)::bigint AS bytes, s.n_live_tup::bigint AS rows
                 FROM pg_stat_user_tables s ORDER BY pg_total_relation_size(s.relid) DESC LIMIT 8`),
            sql(`SELECT to_regclass('pg_stat_statements') IS NOT NULL AS installed`).then(async ({ rows }) => {
                if (!rows[0]?.installed) return null;
                return (await sql(
                    `SELECT calls::bigint AS calls, round(mean_exec_time::numeric, 2)::float AS mean_ms, round(total_exec_time::numeric, 1)::float AS total_ms,
                            left(regexp_replace(query, '\\s+', ' ', 'g'), 160) AS query
                     FROM pg_stat_statements
                     WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
                     ORDER BY total_exec_time DESC LIMIT 5`
                )).rows;
            }).catch(() => null),
        ]);
        return { connections: connections.rows, tables: tables.rows, statements };
    },
};
