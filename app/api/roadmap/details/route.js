import { apiRoute, requirePublicId } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { roadmapService } from "@/services/roadmap.service";

/** GET /api/roadmap/details?id= (public read, plan 12.3; signed-in learners also get their progress). */
export const GET = apiRoute(async ({ req, userId }) => {
    const publicId = requirePublicId(new URL(req.url).searchParams.get("id"), "roadmap id");
    return roadmapService.getDetails({ publicId, userId });
}, { context: "api/roadmap/details", auth: "optional", allowLocked: true, limiter: rateLimiters.api });
