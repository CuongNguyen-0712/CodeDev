import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { challengeService } from "@/services/challenge.service";

/** GET /api/challenges/:id/quiz: the learner's questions (no answers), attempts and cooldown. */
export const GET = apiRoute(
    ({ userId, params }) => challengeService.getQuizState({ userId, challengeId: params.id }),
    { context: "api/challenges/quiz", limiter: rateLimiters.api }
);
