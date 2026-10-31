import { apiRoute } from "@/lib/routeHandler";
import { roadmapService } from "@/services/roadmap.service";

/** GET /api/roadmap/list: published roadmaps (same for everyone). */
export const GET = apiRoute(() => roadmapService.getList({}), {
    context: "api/roadmap/list",
    auth: "none",
    cacheControl: "public, max-age=60, s-maxage=600, stale-while-revalidate=3600",
});
