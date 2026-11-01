import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminStructureChangeSchema } from "@/lib/validation/admin";
import { parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminCourseService } from "@/services/adminCourse.service";

// GET: modules, lessons and challenge counts in order, with the publish checklist.
export const GET = apiRoute(
    async ({ userId, params }) => {
        await requirePermission(userId, "admin.read");
        return adminCourseService.structure({ courseId: parseOrThrow(publicId, params.id) });
    },
    { context: "api/admin/courses/[id]/structure" }
);

// PATCH { kind, itemId, hidden? | move?: up|down, reason }: one module or lesson.
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "catalog.update"]);
        const input = parseOrThrow(adminStructureChangeSchema, await readJson(req));
        return adminCourseService.changeItem({ actor, courseId: parseOrThrow(publicId, params.id), ...input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/courses/[id]/structure", csrf: true, limiter: rateLimiters.admin }
);
