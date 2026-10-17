import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { adminOfferDeleteSchema, adminOfferSchema, parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminService } from "@/services/admin.service";

// Sets the money or points price (replaces the active offer of that type; old offers are kept).
export const POST = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, "course.price");
        const courseId = parseOrThrow(publicId, params.id);
        const input = parseOrThrow(adminOfferSchema, await readJson(req));
        return adminService.setOffer({ actor, courseId, input });
    },
    { context: "api/admin/courses/[id]/offers", csrf: true, limiter: rateLimiters.admin }
);

// Removes the money or points price.
export const DELETE = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, "course.price");
        const courseId = parseOrThrow(publicId, params.id);
        const { priceType, reason } = parseOrThrow(adminOfferDeleteSchema, await readJson(req));
        return adminService.removeOffer({ actor, courseId, priceType, reason });
    },
    { context: "api/admin/courses/[id]/offers", csrf: true, limiter: rateLimiters.admin }
);
