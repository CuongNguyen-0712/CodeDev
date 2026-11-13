import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { socialService } from "@/services/social.service";

/** GET /api/friends?search=&cursor= -> { items, nextCursor }: the learner's friends. The service validates the cursor. */
export const GET = apiRoute(async ({ req, userId }) => {
    const q = new URL(req.url).searchParams;
    return socialService.listFriends({ userId, search: (q.get("search") || "").slice(0, 100), cursor: q.get("cursor") || null });
}, { context: "api/friends", limiter: rateLimiters.api });
