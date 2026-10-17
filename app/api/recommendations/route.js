import { apiRoute } from "@/lib/routeHandler";
import { recommendationService } from "@/services/recommendation.service";

// Rule-based course recommendations with reasons for the signed-in user. Never buys anything.
export const GET = apiRoute(
    ({ req, userId }) => {
        const limit = Math.min(Math.max(Number.parseInt(new URL(req.url).searchParams.get("limit"), 10) || 6, 1), 12);
        return recommendationService.getForUser({ userId, limit });
    },
    { context: "api/recommendations" }
);
