import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { challengeService } from "@/services/challenge.service";

/** GET /api/challenges/:id/workspace: starter files, visible tests and attempts of a coding challenge. */
export const GET = apiRoute(
    ({ userId, params }) => challengeService.getCodingWorkspace({ userId, challengeId: params.id }),
    { context: "api/challenges/workspace", limiter: rateLimiters.api }
);
