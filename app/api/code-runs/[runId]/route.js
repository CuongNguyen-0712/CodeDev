import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { challengeService } from "@/services/challenge.service";

/** GET /api/code-runs/:runId: polled by the learner until the run leaves queued / running. */
export const GET = apiRoute(
    ({ userId, params }) => challengeService.getCodeRun({ userId, runId: params.runId }),
    { context: "api/code-runs", limiter: rateLimiters.codeRunPoll }
);
