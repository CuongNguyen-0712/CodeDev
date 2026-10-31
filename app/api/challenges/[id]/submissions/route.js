import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { codeSubmissionService } from "@/services/codeSubmission.service";

/** GET /api/challenges/:id/submissions: the learner's coding attempts. */
export const GET = apiRoute(
    ({ userId, params }) => codeSubmissionService.getHistory({ userId, challengeId: params.id }),
    { context: "api/challenges/submissions", limiter: rateLimiters.api }
);
