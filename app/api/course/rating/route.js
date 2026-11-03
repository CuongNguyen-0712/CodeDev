import { apiRoute, requirePublicId } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { courseRatingService } from "@/services/courseRating.service";

/** GET /api/course/rating?courseId= -> { average, count, stars, eligible } (plan 12; average null below 3 ratings). */
export const GET = apiRoute(async ({ req, userId }) => {
    const courseId = requirePublicId(new URL(req.url).searchParams.get("courseId"), "course id");
    return courseRatingService.get({ userId, courseId });
}, { context: "api/course/rating", auth: "optional", allowLocked: true, limiter: rateLimiters.commentRead });
