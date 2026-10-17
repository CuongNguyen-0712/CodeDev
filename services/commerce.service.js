import { commerceDb } from "@/db/commerce.db";
import { ApiError } from "@/lib/error/apiError";
import { invalidateUserCache } from "@/lib/cacheKeys";
import { publishToUser } from "@/lib/pusher";
import { events, progressReasons } from "@/lib/realtime";
import { getCheckoutProvider } from "@/services/payments";
import { sha256Hex } from "@/services/payments/signature";

/**
 * Buying (money) and redeeming (points) courses. Prices always come from commerce.offer inside
 * the SQL functions; the client only names the course and an idempotency key.
 * Nothing about balances, payments or entitlements is cached in Redis.
 */

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

/** Drops the user's versioned Redis views (course lists show enrolment) and pings their tabs. */
async function afterOwnershipChange(userId, courseId) {
    await invalidateUserCache(userId);
    publishToUser(userId, events.PROGRESS_UPDATED, { courseId: courseId || null, reason: progressReasons.OWNERSHIP_CHANGED });
}

function mapOrder(row) {
    if (!row) return null;
    return {
        id: row.id,
        status: row.status,
        method: row.payment_method,
        currency: row.currency,
        amountMinor: toNumber(row.amount_minor),
        points: toNumber(row.points_total),
        createdAt: row.created_at,
        paidAt: row.paid_at,
        failedAt: row.failed_at,
        cancelledAt: row.cancelled_at,
        refundedAt: row.refunded_at,
        expiresAt: row.expires_at,
        failureReason: row.failure_reason,
        course: { id: row.course_id, title: row.course_title, image: row.course_image },
        payment: row.payment_status ? { id: row.payment_id || null, status: row.payment_status, provider: row.provider } : null,
        accessGranted: row.access_granted ?? undefined,
        checkoutUrl: row.status === "pending" ? row.checkout_url || null : null,
    };
}

export const commerceService = {
    redeem: async ({ userId, courseId, idempotencyKey }) => {
        const { rows } = await commerceDb.redeem({ userId, courseId, idempotencyKey });
        const row = rows[0];
        if (!row) throw new Error("Redeem returned no result");

        if (!row.replayed) await afterOwnershipChange(userId, courseId);

        return {
            orderId: row.order_id,
            courseId: row.course_id,
            pointsSpent: toNumber(row.points_spent),
            balanceAfter: toNumber(row.balance_after),
            replayed: row.replayed,
        };
    },

    /** Creates (or reuses) a pending order and its provider checkout. Never grants access. */
    checkout: async ({ userId, courseId, idempotencyKey }) => {
        const provider = getCheckoutProvider();
        if (!provider) {
            throw new ApiError("Online payment is not available yet.", 503, { code: "PAYMENTS_DISABLED", expose: true });
        }

        const { rows } = await commerceDb.createMoneyOrder({ userId, courseId, idempotencyKey, provider: provider.name });
        const order = rows[0];
        if (!order) throw new Error("Order creation returned no result");

        if (order.checkout_url) {
            return { orderId: order.order_id, checkoutUrl: order.checkout_url, reused: order.reused };
        }

        let checkout;
        try {
            checkout = await provider.createCheckout({
                orderId: order.order_id,
                paymentId: order.payment_id,
                amountMinor: toNumber(order.amount_minor),
                currency: order.currency,
            });
        } catch (error) {
            console.error("[commerce] provider checkout failed:", provider.name, error?.message);
            await commerceDb.failCheckout({ paymentId: order.payment_id, reason: "checkout_failed" });
            throw new ApiError("The payment provider is unavailable, please try again.", 502, { code: "PROVIDER_UNAVAILABLE", expose: true });
        }

        const attached = await commerceDb.attachCheckout({
            paymentId: order.payment_id,
            providerRef: checkout.providerRef,
            checkoutUrl: checkout.checkoutUrl,
        });

        return {
            orderId: order.order_id,
            checkoutUrl: attached.rows[0]?.checkout_url || checkout.checkoutUrl,
            reused: order.reused,
        };
    },

    /**
     * Applies a webhook event whose signature the route already verified. Idempotent: the same
     * event id is a no-op. Logs only ids and the outcome, never the payload.
     */
    applyPaymentEvent: async ({ provider, event, rawBody }) => {
        const { rows } = await commerceDb.applyPaymentEvent({
            provider,
            eventId: event.eventId,
            type: event.type,
            providerRef: event.providerRef,
            paymentId: event.paymentId,
            amountMinor: event.amountMinor,
            currency: event.currency,
            payloadSha256: sha256Hex(rawBody),
        });
        const result = rows[0] || { result: "unknown" };

        if (["amount_mismatch", "unknown_payment", "already_owned"].includes(result.result)) {
            console.warn(`[payments] ${provider} event ${event.eventId} (${event.type}): ${result.result}`);
        }

        if (result.user_id && ["granted", "revoked", "closed"].includes(result.result)) {
            await afterOwnershipChange(result.user_id, null);
        }

        return { result: result.result, orderId: result.order_id || null };
    },

    getWallet: async ({ userId, before = null, limit = 20 }) => {
        const [balance, ledger] = await Promise.all([
            commerceDb.getPointBalance({ userId }),
            commerceDb.getPointTransactions({ userId, before, limit }),
        ]);
        const hasMore = ledger.rowCount > limit;
        const transactions = ledger.rows.slice(0, limit).map((row) => ({
            id: row.id,
            direction: row.action,
            type: row.entry_type,
            amount: toNumber(row.amount),
            balanceAfter: toNumber(row.balance_after),
            source: row.source_type,
            reason: row.reason,
            createdAt: row.created_at,
            orderId: row.order_id,
            course: row.course_id ? { id: row.course_id, title: row.course_title } : null,
        }));
        const last = transactions[transactions.length - 1];

        return {
            balance,
            transactions,
            next: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
        };
    },

    getEntitlements: async ({ userId }) => {
        const { rows } = await commerceDb.getEntitlements({ userId });
        const items = rows.map((row) => ({
            id: row.id,
            courseId: row.course_id,
            courseTitle: row.course_title,
            source: row.source,
            status: row.status,
            hasAccess: row.has_access,
            grantedAt: row.granted_at,
            expiresAt: row.expires_at,
            revokedAt: row.revoked_at,
            revokeReason: row.revoke_reason,
        }));
        return { courseIds: items.filter((item) => item.hasAccess).map((item) => item.courseId), items };
    },

    getOrders: async ({ userId, before = null, limit = 20 }) => {
        const { rows, rowCount } = await commerceDb.getOrders({ userId, before, limit });
        const hasMore = rowCount > limit;
        const orders = rows.slice(0, limit).map(mapOrder);
        return { orders, next: hasMore ? orders[orders.length - 1]?.id : null };
    },

    getOrder: async ({ userId, orderId }) => {
        const { rows } = await commerceDb.getOrder({ userId, orderId });
        if (!rows[0]) throw new ApiError("Order not found", 404);
        return mapOrder(rows[0]);
    },

    getOffers: async ({ courseId }) => {
        const { rows } = await commerceDb.getOffers({ courseId });
        const money = rows.find((row) => row.price_type === "money");
        const points = rows.find((row) => row.price_type === "points");
        return {
            money: money ? { amountMinor: toNumber(money.amount), currency: money.currency } : null,
            points: points ? { amount: toNumber(points.amount) } : null,
        };
    },
};
