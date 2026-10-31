import { ApiError } from "@/lib/error/apiError";
import { parseListQuery } from "@/lib/listFilters";
import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { courseService } from "@/services/course.service";

const PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * GET /api/course/courses (public read, plan 12.3). Optional session: an expired access token gets
 * 401 so the client refreshes instead of seeing guest results.
 */
export const GET = apiRoute(async ({ req, userId }) => {
    const { searchParams } = new URL(req.url);

    // Unknown keys and values outside the database enums / id ranges are dropped here.
    const { search, filter } = parseListQuery("course", searchParams);

    const lastId = searchParams.get("lastId") || null;
    if (lastId && !PUBLIC_ID.test(lastId)) {
        throw new ApiError("Invalid cursor", 400);
    }

    const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit"), 10) || 20, 1), 50);

    return courseService.getList({ userId, search, filter, lastId, limit });
}, { context: "api/course/courses", auth: "optional", allowLocked: true, limiter: rateLimiters.api });
