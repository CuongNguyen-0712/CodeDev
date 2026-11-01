import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminCatalogCreateSchema, adminCatalogListSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminCatalogService } from "@/services/adminCatalog.service";

// GET ?kind=category|language|skill|career_role|industry|learning_goal: rows with how many courses use them.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, "admin.read");
        const input = parseOrThrow(adminCatalogListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return adminCatalogService.list({ kind: input.kind });
    },
    { context: "api/admin/catalog" }
);

// POST { kind, name, code?, reason }: a new row (skills, roles, industries and goals need a code).
export const POST = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, ["admin.read", "catalog.update"]);
        const input = parseOrThrow(adminCatalogCreateSchema, await readJson(req));
        return adminCatalogService.create({ actor, ...input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/catalog", csrf: true, limiter: rateLimiters.admin }
);
