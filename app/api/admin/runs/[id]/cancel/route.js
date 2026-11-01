import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminReasonSchema } from "@/lib/validation/admin";
import { parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminRunService } from "@/services/adminRun.service";

// POST { reason }: stops a queued or running run (409 once it has finished).
export const POST = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "coderun.cancel"]);
        const input = parseOrThrow(adminReasonSchema, await readJson(req));
        return adminRunService.cancel({ actor, runId: parseOrThrow(publicId, params.id), reason: input.reason, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/runs/[id]/cancel", csrf: true, limiter: rateLimiters.admin }
);
