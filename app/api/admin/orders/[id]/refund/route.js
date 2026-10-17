import { requirePermission } from "@/lib/authz";
import { ApiError } from "@/lib/error/apiError";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminRefundSchema, parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminService } from "@/services/admin.service";

const ORDER_ID = /^ord_[0-9a-f]{32}$/;

// Refunds a points order (points back, access revoked, audit log). Idempotent per order.
export const POST = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, "order.refund");
        if (!ORDER_ID.test(params.id || "")) throw new ApiError("Order not found", 404);
        const { reason } = parseOrThrow(adminRefundSchema, await readJson(req));
        return adminService.refundPointsOrder({ actor, orderId: params.id, reason, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/orders/[id]/refund", csrf: true, limiter: rateLimiters.admin }
);
