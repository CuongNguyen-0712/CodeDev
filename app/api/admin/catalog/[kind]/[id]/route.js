import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminCatalogDeleteSchema, adminCatalogParamsSchema, adminCatalogUpdateSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminCatalogService } from "@/services/adminCatalog.service";

// PATCH { name?, isActive?, reason }: rename, or (coded lists) deactivate / reactivate.
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "catalog.update"]);
        const { kind, id } = parseOrThrow(adminCatalogParamsSchema, params);
        const input = parseOrThrow(adminCatalogUpdateSchema, await readJson(req));
        return adminCatalogService.update({ actor, kind, id, ...input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/catalog/[kind]/[id]", csrf: true, limiter: rateLimiters.admin }
);

// DELETE { reason }: only a row no course uses (409 otherwise).
export const DELETE = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "catalog.update"]);
        const { kind, id } = parseOrThrow(adminCatalogParamsSchema, params);
        const input = parseOrThrow(adminCatalogDeleteSchema, await readJson(req));
        return adminCatalogService.remove({ actor, kind, id, reason: input.reason, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/catalog/[kind]/[id]", csrf: true, limiter: rateLimiters.admin }
);
