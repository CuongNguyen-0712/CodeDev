import { apiRoute, requirePublicId } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { courseService } from "@/services/course.service";

/** GET /api/course/course-details?courseId= (public read, plan 12.3; owners also see unpublished). */
export const GET = apiRoute(async ({ req, userId }) => {
    const courseId = requirePublicId(new URL(req.url).searchParams.get("courseId"), "course id");
    return courseService.getDetails({ userId, courseId });
}, { context: "api/course/course-details", auth: "optional", allowLocked: true, limiter: rateLimiters.api });
