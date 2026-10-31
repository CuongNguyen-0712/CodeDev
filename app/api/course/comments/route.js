import { apiRoute, requirePublicId } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { courseService, decodeCommentCursor } from "@/services/course.service";

/** GET /api/course/comments?courseId=&cursor= -> { items, nextCursor } (public read, plan 12.3). */
export const GET = apiRoute(async ({ req, userId }) => {
    const { searchParams } = new URL(req.url);
    const courseId = requirePublicId(searchParams.get("courseId"), "course id");
    const cursor = decodeCommentCursor(searchParams.get("cursor"));
    return courseService.getComments({ userId, courseId, cursor });
}, { context: "api/course/comments", auth: "optional", allowLocked: true, limiter: rateLimiters.commentRead });
