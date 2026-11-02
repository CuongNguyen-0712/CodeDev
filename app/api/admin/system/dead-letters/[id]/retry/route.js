import { requirePermission, requireRecentAuth } from "@/lib/authz";
import { ApiError } from "@/lib/error/apiError";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminReasonSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminOpsService } from "@/services/adminOps.service";

// POST { reason }: sends the work again (the outbox row becomes pending, or the Inngest event is sent again).
export const POST = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "ops.resolve"]);
        await requireRecentAuth(actor);
        if (!/^\d{1,19}$/.test(String(params.id))) throw new ApiError("Invalid id", 400);
        const input = parseOrThrow(adminReasonSchema, await readJson(req));
        return adminOpsService.retry({ actor, id: params.id, reason: input.reason, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/system/dead-letters/[id]/retry", csrf: true, limiter: rateLimiters.admin }
);
