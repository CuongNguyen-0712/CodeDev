import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { socialService } from "@/services/social.service";

/** GET /api/users?search=&cursor=&limit= -> { items, nextCursor }: people the learner can add. */
export const GET = apiRoute(async ({ req, userId }) => {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").slice(0, 100);
    const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit"), 10) || 10, 1), 50);
    return socialService.searchUsers({ userId, search, limit, cursor: searchParams.get("cursor") });
}, { context: "api/users", limiter: rateLimiters.api });
