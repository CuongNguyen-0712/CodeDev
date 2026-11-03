import { apiRoute, requirePublicId } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { courseService } from "@/services/course.service";

/**
 * GET /api/course/viewer-state?courseId= -> { is_favorite, status, progress, owned } for the signed-in
 * viewer, null for a guest. The course page is cached for everyone; this is the personal part.
 */
export const GET = apiRoute(async ({ req, userId }) => {
    const courseId = requirePublicId(new URL(req.url).searchParams.get("courseId"), "course id");
    return userId ? courseService.getViewerState({ userId, courseId }) : null;
}, { context: "api/course/viewer-state", auth: "optional", allowLocked: true, limiter: rateLimiters.api });
