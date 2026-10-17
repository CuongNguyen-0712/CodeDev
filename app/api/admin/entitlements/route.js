import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminGrantSchema, adminRevokeSchema, parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminService } from "@/services/admin.service";

// GET ?userId=: a user's entitlements.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, "entitlement.grant");
        const target = parseOrThrow(publicId, new URL(req.url).searchParams.get("userId") || "");
        return adminService.getUserEntitlements({ userId: target });
    },
    { context: "api/admin/entitlements" }
);

// POST: grant access to a course (source admin_grant, optional expiry).
export const POST = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, "entitlement.grant");
        const input = parseOrThrow(adminGrantSchema, await readJson(req));
        return adminService.grantEntitlement({ actor, input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/entitlements", csrf: true, limiter: rateLimiters.admin }
);

// DELETE: revoke an active entitlement.
export const DELETE = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, "entitlement.grant");
        const input = parseOrThrow(adminRevokeSchema, await readJson(req));
        return adminService.revokeEntitlement({ actor, input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/entitlements", csrf: true, limiter: rateLimiters.admin }
);
