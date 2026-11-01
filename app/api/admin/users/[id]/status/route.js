import { requirePermission, requireRecentAuth } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminUserStatusSchema } from "@/lib/validation/admin";
import { parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminUserService } from "@/services/adminUser.service";

// POST { status: active | suspended | blocked, until?, reason }: locking signs the user out everywhere.
export const POST = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "user.status"]);
        await requireRecentAuth(actor);
        const input = parseOrThrow(adminUserStatusSchema, await readJson(req));
        return adminUserService.setStatus({
            actor, userId: parseOrThrow(publicId, params.id), ...input, ip: RateLimiter.getClientIp(req),
        });
    },
    { context: "api/admin/users/[id]/status", csrf: true, limiter: rateLimiters.admin }
);
