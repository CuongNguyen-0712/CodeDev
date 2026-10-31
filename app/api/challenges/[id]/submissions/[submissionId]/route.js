import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { codeSubmissionService } from "@/services/codeSubmission.service";

/** GET /api/challenges/:id/submissions/:submissionId: the code of one of the learner's attempts. */
export const GET = apiRoute(
    ({ userId, params }) => codeSubmissionService.getSubmissionCode({ userId, challengeId: params.id, submissionId: params.submissionId }),
    { context: "api/challenges/submission", limiter: rateLimiters.api }
);
