import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminRatingHideSchema } from "@/lib/validation/admin";
import { parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminRatingService } from "@/services/adminRating.service";

// GET: average, count, 1-5 histogram, last 30 days and the newest ratings of one course.
export const GET = apiRoute(
    async ({ userId, params }) => {
        await requirePermission(userId, ["admin.read", "comment.moderate"]);
        return adminRatingService.get({ courseId: parseOrThrow(publicId, params.id) });
    },
    { context: "api/admin/courses/[id]/ratings" }
);

// PATCH { userId, hidden, reason }: hide or show one learner's rating (audited; the average is recounted).
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "comment.moderate"]);
        const input = parseOrThrow(adminRatingHideSchema, await readJson(req));
        return adminRatingService.setHidden({ actor, courseId: parseOrThrow(publicId, params.id), ...input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/courses/[id]/ratings", csrf: true, limiter: rateLimiters.admin }
);
