import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminUserRoleSchema } from "@/lib/validation/admin";
import { parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminUserService } from "@/services/adminUser.service";

const change = (add) => apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "role.assign"]);
        const input = parseOrThrow(adminUserRoleSchema, await readJson(req));
        return adminUserService.changeRole({
            actor, userId: parseOrThrow(publicId, params.id), role: input.role, add, reason: input.reason, ip: RateLimiter.getClientIp(req),
        });
    },
    { context: "api/admin/users/[id]/roles", csrf: true, limiter: rateLimiters.admin }
);

// POST { role, reason } assigns, DELETE { role, reason } removes (rank rules in the service).
export const POST = change(true);
export const DELETE = change(false);
