import { requirePermission } from "@/lib/authz";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminSearchSchema } from "@/lib/validation/admin";
import { parseOrThrow } from "@/lib/validation/premium";
import { adminSearchService } from "@/services/adminSearch.service";

// GET ?q=&type=user|course|challenge|order|run: up to 5 matches per group the viewer may see.
export const GET = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, ["admin.read"]);
        const input = parseOrThrow(adminSearchSchema, Object.fromEntries(new URL(req.url).searchParams));
        return adminSearchService.search({ actor, q: input.q, type: input.type });
    },
    { context: "api/admin/search", limiter: rateLimiters.adminSearch }
);
