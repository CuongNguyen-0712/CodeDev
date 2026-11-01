import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminReasonSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminRunService } from "@/services/adminRun.service";

// POST { reason }: closes every run past its deadline now (what the hourly sweeper does).
export const POST = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, ["admin.read", "ops.resolve"]);
        const input = parseOrThrow(adminReasonSchema, await readJson(req));
        return adminRunService.expireAll({ actor, reason: input.reason, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/runs/expire", csrf: true, limiter: rateLimiters.admin }
);
