import { sql } from "@/lib/db";

/**
 * Privileged reads and writes for the admin area. Writes take a transaction `client` so the
 * change and its identity.audit_log row commit together (services/admin.service.js).
 */

const COURSE_COLUMNS = `
    c.public_id AS id, c.title, c.level, c.publish_status, c.published_at, c.access_model, c.course_type,
    c.students, c.lessons, c.modules, c.updated_at,
    l.name AS language_name, cat.name AS category_name,
    COALESCE((SELECT json_agg(json_build_object('code', s.code, 'weight', cs.weight) ORDER BY s.code)
              FROM catalog.course_skill cs JOIN catalog.skill s ON s.id = cs.skill_id WHERE cs.course_id = c.id), '[]') AS skills,
    COALESCE((SELECT array_agg(r.code ORDER BY r.code) FROM catalog.course_career_role x
              JOIN catalog.career_role r ON r.id = x.career_role_id WHERE x.course_id = c.id), '{}') AS role_codes,
    COALESCE((SELECT array_agg(i.code ORDER BY i.code) FROM catalog.course_industry x
              JOIN catalog.industry i ON i.id = x.industry_id WHERE x.course_id = c.id), '{}') AS industry_codes,
    COALESCE((SELECT array_agg(g.code ORDER BY g.code) FROM catalog.course_learning_goal x
              JOIN catalog.learning_goal g ON g.id = x.learning_goal_id WHERE x.course_id = c.id), '{}') AS goal_codes,
    COALESCE((SELECT array_agg(p.public_id ORDER BY p.public_id) FROM catalog.course_prerequisite x
              JOIN catalog.course p ON p.id = x.prerequisite_course_id WHERE x.course_id = c.id), '{}') AS prerequisite_ids,
    COALESCE((SELECT json_agg(json_build_object('priceType', o.price_type, 'amount', o.amount, 'currency', o.currency))
              FROM commerce.offer o WHERE o.course_id = c.id AND o.is_active), '[]') AS offers
`;

export const adminDb = {
    listCourses: async () => {
        return sql(`
            SELECT ${COURSE_COLUMNS}
            FROM catalog.course c
            LEFT JOIN catalog.language l ON l.id = c.language_id
            LEFT JOIN catalog.category cat ON cat.id = c.category_id
            WHERE c.is_deleted = false OR c.publish_status = 'archived'
            ORDER BY c.id DESC
            LIMIT 200`);
    },

    getTaxonomy: async () => {
        return sql(`
            SELECT 'skill' AS kind, code, name FROM catalog.skill WHERE is_active
            UNION ALL SELECT 'role', code, name FROM catalog.career_role WHERE is_active
            UNION ALL SELECT 'industry', code, name FROM catalog.industry WHERE is_active
            UNION ALL SELECT 'goal', code, name FROM catalog.learning_goal WHERE is_active
            ORDER BY kind, name`);
    },

    /** Locks the course row and returns its admin view (null when unknown). */
    lockCourse: async (client, courseId) => {
        const locked = await client.query(`SELECT id FROM catalog.course WHERE public_id = $1 FOR UPDATE`, [courseId]);
        if (locked.rowCount === 0) return null;
        const { rows } = await client.query(`
            SELECT c.id AS db_id, ${COURSE_COLUMNS}
            FROM catalog.course c
            LEFT JOIN catalog.language l ON l.id = c.language_id
            LEFT JOIN catalog.category cat ON cat.id = c.category_id
            WHERE c.id = $1`, [locked.rows[0].id]);
        return rows[0];
    },

    updateCourseColumns: async (client, courseDbId, { accessModel, courseType, level }) => {
        await client.query(
            `UPDATE catalog.course
             SET access_model = COALESCE($2, access_model),
                 course_type = COALESCE($3, course_type),
                 level = COALESCE($4::level_enum, level),
                 updated_at = now()
             WHERE id = $1`,
            [courseDbId, accessModel ?? null, courseType ?? null, level ?? null]
        );
    },

    setPublishStatus: async (client, courseDbId, status) => {
        await client.query(
            `UPDATE catalog.course SET publish_status = $2::varchar, is_deleted = ($2::varchar = 'archived'), updated_at = now() WHERE id = $1`,
            [courseDbId, status]
        );
    },

    /** Replaces a course <-> taxonomy set. `codes` must all exist and be active. */
    replaceCourseSet: async (client, courseDbId, kind, codes, weights = null) => {
        const spec = COURSE_SETS[kind];
        const found = await client.query(
            `SELECT id, code FROM ${spec.taxonomy} WHERE code = ANY($1::varchar[]) AND is_active`,
            [codes]
        );
        if (found.rowCount !== codes.length) {
            const error = new Error(`Unknown ${kind}`);
            error.code = "CD400";
            throw error;
        }
        await client.query(`DELETE FROM ${spec.table} WHERE course_id = $1`, [courseDbId]);
        if (codes.length === 0) return;

        if (spec.weighted) {
            const byCode = new Map(found.rows.map((row) => [row.code, row.id]));
            await client.query(
                `INSERT INTO ${spec.table} (course_id, ${spec.column}, weight)
                 SELECT $1, unnest($2::int[]), unnest($3::smallint[])`,
                [courseDbId, codes.map((code) => byCode.get(code)), codes.map((code) => weights.get(code))]
            );
        } else {
            await client.query(
                `INSERT INTO ${spec.table} (course_id, ${spec.column}) SELECT $1, unnest($2::int[])`,
                [courseDbId, found.rows.map((row) => row.id)]
            );
        }
    },

    replacePrerequisites: async (client, courseDbId, publicIds) => {
        const found = await client.query(
            `SELECT id FROM catalog.course WHERE public_id = ANY($1::varchar[]) AND id <> $2`,
            [publicIds, courseDbId]
        );
        if (found.rowCount !== publicIds.length) {
            const error = new Error("Unknown prerequisite course");
            error.code = "CD400";
            throw error;
        }
        await client.query(`DELETE FROM catalog.course_prerequisite WHERE course_id = $1`, [courseDbId]);
        if (publicIds.length) {
            await client.query(
                `INSERT INTO catalog.course_prerequisite (course_id, prerequisite_course_id) SELECT $1, unnest($2::bigint[])`,
                [courseDbId, found.rows.map((row) => row.id)]
            );
        }
    },

    deactivateOffer: async (client, courseDbId, priceType) => {
        return client.query(
            `UPDATE commerce.offer SET is_active = false, deactivated_at = now()
             WHERE course_id = $1 AND price_type = $2 AND is_active
             RETURNING public_id, amount, currency`,
            [courseDbId, priceType]
        );
    },

    insertOffer: async (client, { courseDbId, priceType, amount, currency, actorId }) => {
        return client.query(
            `INSERT INTO commerce.offer (public_id, course_id, price_type, amount, currency, created_by)
             VALUES ('ofr_' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5)
             RETURNING public_id, price_type, amount, currency`,
            [courseDbId, priceType, amount, currency ?? null, actorId]
        );
    },

    audit: async (client, { actorId, action, targetType, targetId, reason = null, before = null, after = null, ip = null }) => {
        await client.query(
            `INSERT INTO identity.audit_log (actor_id, action, target_type, target_id, reason, before, after, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [actorId, action, targetType, String(targetId), reason, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, ip]
        );
    },

    findUserForUpdate: async (client, userPublicId) => {
        const { rows } = await client.query(
            `SELECT u.id, u.public_id, COALESCE(i.points, 0)::bigint AS points, i.exp, i.exp_level
             FROM identity.users u JOIN profile.info i ON i.user_id = u.id
             WHERE u.public_id = $1
             FOR UPDATE OF i`,
            [userPublicId]
        );
        return rows[0] || null;
    },

    /** EXP adjustment through public.post_exp (never below 0, once per idempotency key). */
    postExp: async (client, { userDbId, amount, idempotencyKey, actorId, reason }) => {
        const { rows } = await client.query(
            `SELECT * FROM public.post_exp($1::bigint, $2::int, 'adjustment', NULL, NULL, $3, $4::bigint, $5)`,
            [userDbId, amount, idempotencyKey, actorId, reason]
        );
        return rows[0];
    },

    postPoints: async (client, args) => {
        const { rows } = await client.query(
            `SELECT * FROM public.post_points($1::bigint, $2, $3, $4::bigint, $5, $6::bigint, $7, $8::bigint, $9::bigint, $10)`,
            [args.userDbId, args.action, args.entryType, args.amount, args.sourceType, args.sourceId,
                args.idempotencyKey ?? null, args.orderId ?? null, args.actorId ?? null, args.reason ?? null]
        );
        return rows[0];
    },

    /** Points order of any user, locked (refunds). */
    lockOrder: async (client, orderPublicId) => {
        const { rows } = await client.query(
            `SELECT o.id, o.public_id, o.user_id, o.status, o.payment_method::text AS method, o.points_total,
                    u.public_id AS user_public_id
             FROM commerce.orders o JOIN identity.users u ON u.id = o.user_id
             WHERE o.public_id = $1
             FOR UPDATE OF o`,
            [orderPublicId]
        );
        return rows[0] || null;
    },

    markOrderRefunded: async (client, orderDbId) => {
        await client.query(
            `UPDATE commerce.orders SET status = 'refunded', refunded_at = now(), updated_at = now() WHERE id = $1`,
            [orderDbId]
        );
    },

    revokeEntitlementsOfOrder: async (client, orderDbId, reason) => {
        return client.query(
            `UPDATE commerce.entitlement SET status = 'revoked', revoked_at = now(), revoke_reason = $2
             WHERE order_id = $1 AND status = 'active'
             RETURNING public_id`,
            [orderDbId, reason]
        );
    },

    grantEntitlement: async (client, { userDbId, courseDbId, expiresAt, actorId }) => {
        await client.query(
            `UPDATE commerce.entitlement SET status = 'expired'
             WHERE user_id = $1 AND course_id = $2 AND status = 'active' AND expires_at <= now()`,
            [userDbId, courseDbId]
        );
        return client.query(
            `INSERT INTO commerce.entitlement (public_id, user_id, course_id, source, granted_by, expires_at)
             VALUES ('ent_' || replace(gen_random_uuid()::text, '-', ''), $1, $2, 'admin_grant', $3, $4)
             ON CONFLICT DO NOTHING
             RETURNING public_id`,
            [userDbId, courseDbId, actorId, expiresAt ?? null]
        );
    },

    revokeEntitlement: async (client, entitlementPublicId, reason) => {
        return client.query(
            `UPDATE commerce.entitlement e SET status = 'revoked', revoked_at = now(), revoke_reason = $2
             FROM identity.users u, catalog.course c
             WHERE e.public_id = $1 AND e.status = 'active' AND u.id = e.user_id AND c.id = e.course_id
             RETURNING e.public_id, e.source, u.public_id AS user_public_id, c.public_id AS course_public_id`,
            [entitlementPublicId, reason]
        );
    },

    /** Admin search: username / email prefix or exact public id. */
    findUsers: async ({ query }) => {
        return sql(
            `SELECT u.public_id AS id, u.username, u.email, COALESCE(i.points, 0)::bigint AS points, COALESCE(i.exp, 0)::bigint AS exp, COALESCE(i.exp_level, 1) AS level
             FROM identity.users u LEFT JOIN profile.info i ON i.user_id = u.id
             WHERE u.public_id = $1 OR u.username ILIKE $2 ESCAPE '\\' OR u.email ILIKE $2 ESCAPE '\\'
             ORDER BY u.username
             LIMIT 20`,
            [query, `${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`]
        );
    },

    getUserEntitlements: async ({ userId }) => {
        return sql(
            `SELECT e.public_id AS id, c.public_id AS course_id, c.title, e.source, e.status, e.granted_at, e.expires_at
             FROM commerce.entitlement e
             JOIN identity.users u ON u.id = e.user_id
             JOIN catalog.course c ON c.id = e.course_id
             WHERE u.public_id = $1
             ORDER BY e.granted_at DESC`,
            [userId]
        );
    },

    listOrders: async ({ limit = 50 }) => {
        return sql(
            `SELECT o.public_id AS id, o.status, o.payment_method, o.currency, o.amount_minor, o.points_total,
                    o.created_at, o.failure_reason, u.username, c.title AS course_title
             FROM commerce.orders o
             JOIN identity.users u ON u.id = o.user_id
             JOIN commerce.order_items oi ON oi.order_id = o.id
             JOIN catalog.course c ON c.id = oi.course_id
             ORDER BY o.id DESC
             LIMIT $1`,
            [limit]
        );
    },

    listAudit: async ({ limit = 50 }) => {
        return sql(
            `SELECT a.id, a.action, a.target_type, a.target_id, a.reason, a.created_at, u.username AS actor
             FROM identity.audit_log a LEFT JOIN identity.users u ON u.id = a.actor_id
             ORDER BY a.id DESC
             LIMIT $1`,
            [limit]
        );
    },
};

// Fixed table / column names (never user input) for the course <-> taxonomy sets.
const COURSE_SETS = {
    skill: { taxonomy: "catalog.skill", table: "catalog.course_skill", column: "skill_id", weighted: true },
    role: { taxonomy: "catalog.career_role", table: "catalog.course_career_role", column: "career_role_id" },
    industry: { taxonomy: "catalog.industry", table: "catalog.course_industry", column: "industry_id" },
    goal: { taxonomy: "catalog.learning_goal", table: "catalog.course_learning_goal", column: "learning_goal_id" },
};
