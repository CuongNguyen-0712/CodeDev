import { sql } from "@/lib/db";

// ops.dead_letters: background work that failed for good (migration 20261030_001).
export const deadLetterDb = {
    /** Stores one failure; the same (source, kind, ref) reported again is ignored. */
    record: async ({ source, kind, ref = null, payload = null, error = null, attempts = null }) => {
        await sql(
            `INSERT INTO ops.dead_letters (source, kind, ref, payload, error, attempts)
             VALUES ($1, $2, $3, $4::jsonb, left($5, 2000), $6)
             ON CONFLICT (source, kind, ref) DO NOTHING;`,
            [source, kind, ref == null ? null : String(ref), payload == null ? null : JSON.stringify(payload), error, attempts]
        );
    },

    list: async ({ open = true, limit = 50 } = {}) => {
        const res = await sql(
            `SELECT id::text, source, kind, ref, payload, error, attempts, created_at, resolved_at, resolution
             FROM ops.dead_letters
             WHERE ($1::boolean IS FALSE OR resolved_at IS NULL)
             ORDER BY id DESC LIMIT $2;`,
            [open, limit]
        );
        return res.rows;
    },

    get: async ({ id }) => (await sql(`SELECT id::text, source, kind, ref, payload FROM ops.dead_letters WHERE id = $1;`, [id])).rows[0] || null,

    resolve: async ({ id, resolution }) => {
        const res = await sql(
            `UPDATE ops.dead_letters SET resolved_at = now(), resolution = $2 WHERE id = $1 AND resolved_at IS NULL;`,
            [id, resolution]
        );
        return res.rowCount > 0;
    },

    /** Unresolved failures newer than `hours`, for /api/health. */
    countOpen: async ({ hours = 1 } = {}) => {
        const res = await sql(
            `SELECT COUNT(*)::int AS n FROM ops.dead_letters
             WHERE resolved_at IS NULL AND created_at > now() - make_interval(hours => $1);`,
            [hours]
        );
        return res.rows[0].n;
    },
};
