import { sql } from "@/lib/db";

/**
 * Orders, payments, points ledger and entitlements. Writes go through the SQL functions of
 * migration 20261017_004 (one statement = one transaction). Every read is scoped to the user of
 * the session (`u.public_id = $1`), so ids from the client can never reach another user's data.
 */
export const commerceDb = {
    getPointBalance: async ({ userId }) => {
        const { rows } = await sql(
            `SELECT COALESCE(i.points, 0)::bigint AS points
             FROM profile.info i JOIN identity.users u ON u.id = i.user_id
             WHERE u.public_id = $1`,
            [userId]
        );
        return Number(rows[0]?.points ?? 0);
    },

    redeem: async ({ userId, courseId, idempotencyKey }) => {
        return sql(
            `SELECT * FROM public.redeem_course_points($1, $2, $3)`,
            [userId, courseId, idempotencyKey]
        );
    },

    createMoneyOrder: async ({ userId, courseId, idempotencyKey, provider, ttlMinutes = 30 }) => {
        return sql(
            `SELECT * FROM public.create_money_order($1, $2, $3, $4, $5)`,
            [userId, courseId, idempotencyKey, provider, ttlMinutes]
        );
    },

    /** Stores the provider's checkout once (a concurrent duplicate keeps the first one). */
    attachCheckout: async ({ paymentId, providerRef, checkoutUrl }) => {
        return sql(
            `UPDATE commerce.payment
             SET provider_ref = COALESCE(provider_ref, $2), checkout_url = COALESCE(checkout_url, $3), updated_at = now()
             WHERE public_id = $1
             RETURNING provider_ref, checkout_url`,
            [paymentId, providerRef, checkoutUrl]
        );
    },

    /** The provider refused to create a checkout: close the order so a retry starts fresh. */
    failCheckout: async ({ paymentId, reason }) => {
        return sql(
            `WITH p AS (
                 UPDATE commerce.payment SET status = 'failed', failure_code = $2, updated_at = now()
                 WHERE public_id = $1 AND status = 'pending'
                 RETURNING order_id
             )
             UPDATE commerce.orders o
             SET status = 'failed', failed_at = now(), failure_reason = $2, updated_at = now()
             FROM p WHERE o.id = p.order_id AND o.status = 'pending'`,
            [paymentId, reason]
        );
    },

    applyPaymentEvent: async ({ provider, eventId, type, providerRef, paymentId, amountMinor, currency, payloadSha256 }) => {
        return sql(
            `SELECT * FROM public.apply_payment_event($1, $2, $3, $4, $5, $6, $7, $8)`,
            [provider, eventId, type, providerRef ?? null, paymentId ?? null, amountMinor ?? null, currency ?? null, payloadSha256]
        );
    },

    /** Ledger page, newest first (keyset on created_at, id). */
    getPointTransactions: async ({ userId, before = null, limit = 20 }) => {
        const params = [userId, limit + 1];
        let cursor = "";
        if (before) {
            params.push(before.createdAt, before.id);
            cursor = `AND (pt.created_at, pt.id) < ($3::timestamptz, $4::uuid)`;
        }
        return sql(
            `SELECT pt.id, pt.action, pt.entry_type, pt.amount, pt.balance_after, pt.source_type,
                    pt.reason, pt.created_at, o.public_id AS order_id, c.public_id AS course_id, c.title AS course_title
             FROM profile.point_transaction pt
             JOIN identity.users u ON u.id = pt.user_id
             LEFT JOIN commerce.orders o ON o.id = pt.order_id
             LEFT JOIN commerce.order_items oi ON oi.order_id = o.id
             LEFT JOIN catalog.course c ON c.id = oi.course_id
             WHERE u.public_id = $1 ${cursor}
             ORDER BY pt.created_at DESC, pt.id DESC
             LIMIT $2`,
            params
        );
    },

    getEntitlements: async ({ userId }) => {
        return sql(
            `SELECT e.public_id AS id, c.public_id AS course_id, c.title AS course_title, e.source, e.status,
                    e.granted_at, e.expires_at, e.revoked_at, e.revoke_reason,
                    (e.status = 'active' AND (e.expires_at IS NULL OR e.expires_at > now())
                        AND c.is_deleted = false AND c.publish_status <> 'archived') AS has_access
             FROM commerce.entitlement e
             JOIN identity.users u ON u.id = e.user_id
             JOIN catalog.course c ON c.id = e.course_id
             WHERE u.public_id = $1
             ORDER BY e.granted_at DESC`,
            [userId]
        );
    },

    getOrders: async ({ userId, before = null, limit = 20 }) => {
        const params = [userId, limit + 1];
        let cursor = "";
        if (before) {
            params.push(before);
            cursor = `AND o.id < (SELECT id FROM commerce.orders WHERE public_id = $3)`;
        }
        return sql(
            `SELECT o.public_id AS id, o.status, o.payment_method, o.currency, o.amount_minor, o.points_total,
                    o.created_at, o.paid_at, o.failed_at, o.cancelled_at, o.refunded_at, o.expires_at, o.failure_reason,
                    c.public_id AS course_id, c.title AS course_title, c.image AS course_image,
                    p.status AS payment_status, p.provider
             FROM commerce.orders o
             JOIN identity.users u ON u.id = o.user_id
             JOIN commerce.order_items oi ON oi.order_id = o.id
             JOIN catalog.course c ON c.id = oi.course_id
             LEFT JOIN LATERAL (
                 SELECT status, provider FROM commerce.payment WHERE order_id = o.id ORDER BY id DESC LIMIT 1
             ) p ON true
             WHERE u.public_id = $1 ${cursor}
             ORDER BY o.id DESC
             LIMIT $2`,
            params
        );
    },

    /** One order of the user; another user's order id simply returns no row (404). */
    getOrder: async ({ userId, orderId }) => {
        return sql(
            `SELECT o.public_id AS id, o.status, o.payment_method, o.currency, o.amount_minor, o.points_total,
                    o.created_at, o.paid_at, o.failed_at, o.cancelled_at, o.refunded_at, o.expires_at, o.failure_reason,
                    c.public_id AS course_id, c.title AS course_title, c.image AS course_image,
                    p.public_id AS payment_id, p.status AS payment_status, p.provider, p.checkout_url,
                    EXISTS (SELECT 1 FROM commerce.entitlement e WHERE e.order_id = o.id AND e.status = 'active') AS access_granted
             FROM commerce.orders o
             JOIN identity.users u ON u.id = o.user_id
             JOIN commerce.order_items oi ON oi.order_id = o.id
             JOIN catalog.course c ON c.id = oi.course_id
             LEFT JOIN LATERAL (
                 SELECT public_id, status, provider, checkout_url FROM commerce.payment WHERE order_id = o.id ORDER BY id DESC LIMIT 1
             ) p ON true
             WHERE u.public_id = $1 AND o.public_id = $2`,
            [userId, orderId]
        );
    },

    /** Active offers of a course (prices shown to the user are always read from here). */
    getOffers: async ({ courseId }) => {
        return sql(
            `SELECT ofr.public_id AS id, ofr.price_type, ofr.amount, ofr.currency
             FROM commerce.offer ofr
             JOIN catalog.course c ON c.id = ofr.course_id
             WHERE c.public_id = $1 AND ofr.is_active`,
            [courseId]
        );
    },

    /** Whether the user may open the course's lessons (entitlement), for API guards. */
    hasCourseAccess: async ({ userId, courseId }) => {
        const { rows } = await sql(
            `SELECT public.has_course_access(u.id, c.id) AS ok
             FROM identity.users u, catalog.course c
             WHERE u.public_id = $1 AND c.public_id = $2`,
            [userId, courseId]
        );
        return rows[0]?.ok === true;
    },
};
