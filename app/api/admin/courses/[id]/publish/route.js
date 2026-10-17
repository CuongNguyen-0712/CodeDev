import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { adminPublishSchema, parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminService } from "@/services/admin.service";

// Publish / unpublish / archive / back to draft.
export const POST = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, "course.publish");
        const courseId = parseOrThrow(publicId, params.id);
        const { status, reason } = parseOrThrow(adminPublishSchema, await readJson(req));
        return adminService.setPublishStatus({ actor, courseId, status, reason });
    },
    { context: "api/admin/courses/[id]/publish", csrf: true, limiter: rateLimiters.admin }
);
