import { requirePermission, requireRecentAuth } from "@/lib/authz";
import { ApiError } from "@/lib/error/apiError";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminReasonSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminOpsService } from "@/services/adminOps.service";

// POST { reason }: marks the dead letter handled.
export const POST = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "ops.resolve"]);
        await requireRecentAuth(actor);
        if (!/^\d{1,19}$/.test(String(params.id))) throw new ApiError("Invalid id", 400);
        const input = parseOrThrow(adminReasonSchema, await readJson(req));
        return adminOpsService.resolve({ actor, id: params.id, reason: input.reason, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/system/dead-letters/[id]/resolve", csrf: true, limiter: rateLimiters.admin }
);
