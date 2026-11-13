import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { socialService } from "@/services/social.service";

/** GET /api/friends/counts -> { friends, received }: the numbers on the /contact tabs. */
export const GET = apiRoute(({ userId }) => socialService.counts({ userId }),
    { context: "api/friends/counts", limiter: rateLimiters.api });
