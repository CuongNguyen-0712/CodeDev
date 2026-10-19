import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminPointsAdjustSchema, parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminService } from "@/services/admin.service";

// Adds / removes a user's EXP (ledger entry 'adjustment' + audit log, once per idempotency key).
// Same permission and input shape as the points adjustment.
export const POST = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, "points.adjust");
        const input = parseOrThrow(adminPointsAdjustSchema, await readJson(req));
        return adminService.adjustExperience({ actor, input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/experience/adjust", csrf: true, limiter: rateLimiters.admin }
);
