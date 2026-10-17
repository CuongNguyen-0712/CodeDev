import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminPointsAdjustSchema, parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminService } from "@/services/admin.service";

// Credits / debits a user's points (ledger entry 'adjusted' + audit log, once per idempotency key).
export const POST = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, "points.adjust");
        const input = parseOrThrow(adminPointsAdjustSchema, await readJson(req));
        return adminService.adjustPoints({ actor, input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/points/adjust", csrf: true, limiter: rateLimiters.admin }
);
