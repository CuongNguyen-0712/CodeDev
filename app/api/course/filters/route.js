import { apiRoute } from "@/lib/routeHandler";
import { courseService } from "@/services/course.service";

/** GET /api/course/filters: languages / categories that have visible courses (same for everyone). */
export const GET = apiRoute(() => courseService.getFilterOptions(), {
    context: "api/course/filters",
    auth: "none",
    cacheControl: "public, max-age=60, s-maxage=600, stale-while-revalidate=3600",
});
