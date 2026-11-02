import { sql } from "@/lib/db";

/**
 * Admin user management (docs/admin-panel-plan.md, module 02). Reads take the pool; writes take a
 * transaction `client` so the change and its identity.audit_log row commit together.
 */

const STATE = `CASE WHEN u.status = 'blocked' AND u.status_until IS NOT NULL THEN 'suspended'
                    WHEN u.status = 'blocked' THEN 'blocked'
                    WHEN u.email_verified IS NOT TRUE THEN 'unverified'
                    ELSE 'active' END`;

const TAB_FILTERS = {
    all: "TRUE",
    active: "u.status = 'active' AND u.email_verified IS TRUE",
    unverified: "u.status = 'active' AND u.email_verified IS NOT TRUE",
    suspended: "u.status = 'blocked' AND u.status_until IS NOT NULL",
    blocked: "u.status = 'blocked' AND u.status_until IS NULL",
};

export const USER_TABS = Object.keys(TAB_FILTERS);

const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export const adminUserDb = {
    /** One page, newest first (keyset on created_at, id). */
    list: async ({ tab = "all", search = "", matchEmail = false, role = null, cursor = null, limit = 50 }) => {
        const params = [];
        const where = [TAB_FILTERS[tab] || TAB_FILTERS.all];
        if (search) {
            params.push(search, `%${escapeLike(search)}%`);
            // Matching a masked email would reveal it one character at a time: email only with user.pii.
            const email = matchEmail ? ` OR u.email ILIKE $${params.length} ESCAPE '\\'` : "";
            where.push(`(u.public_id = $${params.length - 1} OR u.username ILIKE $${params.length} ESCAPE '\\'${email})`);
        }
        if (role) {
            params.push(role);
            where.push(`EXISTS (SELECT 1 FROM identity.user_roles ur JOIN identity.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = $${params.length})`);
        }
        if (cursor) {
            params.push(cursor.createdAt, cursor.id);
            where.push(`(u.created_at, u.id) < ($${params.length - 1}::timestamp, $${params.length}::bigint)`);
        }
        params.push(limit);

        return sql(
            `SELECT u.public_id AS id, u.username, u.email, ${STATE} AS state, u.status_until, u.created_at,
                    u.created_at::text AS cursor_at, u.id::text AS cursor_id,
                    (SELECT MAX(s.last_seen_at) FROM identity.sessions s WHERE s.user_id = u.id) AS last_active_at,
                    COALESCE((SELECT array_agg(r.code ORDER BY r.rank DESC) FROM identity.user_roles ur
                              JOIN identity.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '{}') AS roles
             FROM identity.users u
             WHERE ${where.join(" AND ")}
             ORDER BY u.created_at DESC, u.id DESC
             LIMIT $${params.length}`,
            params
        );
    },

    tabCounts: async () => {
        const columns = Object.entries(TAB_FILTERS).map(([tab, filter]) => `COUNT(*) FILTER (WHERE ${filter})::int AS ${tab}`);
        return (await sql(`SELECT ${columns.join(", ")} FROM identity.users u`)).rows[0];
    },

    detail: async ({ userId }) => {
        const { rows } = await sql(
            `SELECT u.public_id AS id, u.username, u.email, ${STATE} AS state, u.status, u.status_until, u.status_reason,
                    u.email_verified, u.created_at,
                    i.surname, i.name, i.nickname, i.image, COALESCE(i.points, 0)::bigint AS points,
                    COALESCE(i.exp, 0)::bigint AS exp, COALESCE(i.exp_level, 1) AS level,
                    (SELECT MAX(s.last_seen_at) FROM identity.sessions s WHERE s.user_id = u.id) AS last_active_at,
                    COALESCE((SELECT json_agg(json_build_object('code', r.code, 'name', r.name, 'rank', r.rank) ORDER BY r.rank DESC)
                              FROM identity.user_roles ur JOIN identity.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '[]') AS roles,
                    COALESCE((SELECT array_agg(DISTINCT a.provider::text) FROM identity.accounts a WHERE a.user_id = u.id), '{}') AS providers
             FROM identity.users u
             LEFT JOIN profile.info i ON i.user_id = u.id
             WHERE u.public_id = $1`,
            [userId]
        );
        return rows[0] || null;
    },

    sessions: async ({ userId }) => sql(
        `SELECT s.id::text AS id, s.user_agent, s.ip_address, s.created_at, s.last_seen_at, s.idle_expires_at, s.absolute_expires_at
         FROM identity.sessions s JOIN identity.users u ON u.id = s.user_id
         WHERE u.public_id = $1 AND s.revoked_at IS NULL AND s.is_revoked IS NOT TRUE
           AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
         ORDER BY s.last_seen_at DESC NULLS LAST
         LIMIT 20`,
        [userId]
    ),

    enrollments: async ({ userId }) => sql(
        `SELECT c.public_id AS course_id, c.title, r.status, r.progress, r.created_at, r.last_seen
         FROM learning.register r
         JOIN identity.users u ON u.id = r.user_id
         JOIN catalog.course c ON c.id = r.course_id
         WHERE u.public_id = $1 AND r.is_deleted IS NOT TRUE
         ORDER BY COALESCE(r.last_seen, r.created_at) DESC
         LIMIT 50`,
        [userId]
    ),

    /**
     * Activity timeline, newest first, from the tables that already record it. `before` is the
     * oldest timestamp already shown (keyset on time; rows sharing it may repeat, never vanish).
     */
    activity: async ({ userId, kinds, before = null, limit = 30 }) => {
        const parts = {
            admin: `SELECT 'admin' AS kind, a.created_at AS at, a.action AS title, a.reason AS detail, a.target_type AS ref
                    FROM identity.audit_log a WHERE a.target_type = 'user' AND a.target_id = u.public_id`,
            session: `SELECT 'session', s.created_at::timestamptz, 'Signed in', s.user_agent, NULL FROM identity.sessions s WHERE s.user_id = u.id`,
            run: `SELECT 'run', r.queued_at::timestamptz, r.status, r.language, r.public_id FROM challenge.code_runs r WHERE r.user_id = u.id`,
            submission: `SELECT 'submission', cs.submitted_at::timestamptz, cs.status, cs.language, cs.public_id
                         FROM challenge.code_submissions cs WHERE cs.user_id = u.id`,
            points: `SELECT 'points', p.created_at::timestamptz, p.action || ' ' || p.amount::text, p.entry_type, NULL
                     FROM profile.point_transaction p WHERE p.user_id = u.id`,
            order: `SELECT 'order', o.created_at::timestamptz, o.status::text, o.payment_method::text, o.public_id FROM commerce.orders o WHERE o.user_id = u.id`,
        };
        const chosen = (kinds?.length ? kinds : Object.keys(parts)).filter((kind) => parts[kind]);
        const params = [userId, limit];
        let timeFilter = "";
        if (before) {
            params.push(before);
            timeFilter = "WHERE t.at < $3::timestamptz";
        }
        return sql(
            `SELECT t.* FROM identity.users u
             CROSS JOIN LATERAL (${chosen.map((kind) => parts[kind]).join(" UNION ALL ")}) AS t(kind, at, title, detail, ref)
             ${timeFilter ? `${timeFilter} AND u.public_id = $1` : "WHERE u.public_id = $1"}
             ORDER BY t.at DESC
             LIMIT $2`,
            params
        );
    },

    /** The target row, locked, with its highest role rank. */
    lockUser: async (client, userId) => {
        const { rows } = await client.query(
            `SELECT u.id::text AS db_id, u.public_id, u.username, u.status, u.status_until, u.status_reason,
                    COALESCE((SELECT MAX(r.rank) FROM identity.user_roles ur JOIN identity.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), 0) AS rank,
                    COALESCE((SELECT array_agg(r.code ORDER BY r.rank DESC) FROM identity.user_roles ur JOIN identity.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '{}') AS roles
             FROM identity.users u WHERE u.public_id = $1
             FOR UPDATE`,
            [userId]
        );
        return rows[0] || null;
    },

    setStatus: async (client, { dbId, status, until, reason }) => client.query(
        `UPDATE identity.users SET status = $2::public.user_status_enum, status_until = $3, status_reason = $4, updated_at = now() WHERE id = $1`,
        [dbId, status, until, reason]
    ),

    findRole: async (client, code) => (await client.query(`SELECT id, code, name, rank FROM identity.roles WHERE code = $1`, [code])).rows[0] || null,

    addRole: async (client, { dbId, roleId }) => client.query(
        `INSERT INTO identity.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [dbId, roleId]),

    removeRole: async (client, { dbId, roleId }) => client.query(
        `DELETE FROM identity.user_roles WHERE user_id = $1 AND role_id = $2`, [dbId, roleId]),

    /** Active super admins, locked so two concurrent removals cannot both pass the "last one" check. */
    lockActiveSuperAdmins: async (client) => (await client.query(
        `SELECT u.public_id FROM identity.users u
         JOIN identity.user_roles ur ON ur.user_id = u.id
         JOIN identity.roles r ON r.id = ur.role_id AND r.code = 'super_admin'
         WHERE u.status = 'active'
         FOR UPDATE OF u`
    )).rows.map((row) => row.public_id),

    roles: async () => sql(`SELECT code, name, rank FROM identity.roles ORDER BY rank DESC, code`),

    /** Suspensions that ended: back to active (called by the sweeper). */
    liftEndedSuspensions: async (client) => client.query(
        `UPDATE identity.users
         SET status = 'active', status_until = NULL, status_reason = NULL, updated_at = now()
         WHERE status = 'blocked' AND status_until IS NOT NULL AND status_until <= now()
         RETURNING public_id`
    ),
};
