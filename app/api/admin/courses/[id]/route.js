import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { adminCoursePatchSchema, parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminService } from "@/services/admin.service";

// Edits course metadata (access model, type, level, skills, roles, industries, goals, prerequisites).
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, "course.update");
        const courseId = parseOrThrow(publicId, params.id);
        const input = parseOrThrow(adminCoursePatchSchema, await readJson(req));
        return adminService.updateCourse({ actor, courseId, input });
    },
    { context: "api/admin/courses/[id]", csrf: true, limiter: rateLimiters.admin }
);
