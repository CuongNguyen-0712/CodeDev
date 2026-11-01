import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminReasonSchema } from "@/lib/validation/admin";
import { parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminUserService } from "@/services/adminUser.service";

// DELETE { reason }: signs the user out of every session.
export const DELETE = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "session.revoke"]);
        const input = parseOrThrow(adminReasonSchema, await readJson(req));
        return adminUserService.revokeSessions({
            actor, userId: parseOrThrow(publicId, params.id), reason: input.reason, ip: RateLimiter.getClientIp(req),
        });
    },
    { context: "api/admin/users/[id]/sessions", csrf: true, limiter: rateLimiters.admin }
);
