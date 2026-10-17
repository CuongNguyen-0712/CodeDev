import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { onboardingService } from "@/services/onboarding.service";

// Skips onboarding (status `skipped`, kept apart from `completed`; a completed one stays completed).
export const POST = apiRoute(
    ({ userId }) => onboardingService.skip({ userId }),
    { context: "api/onboarding/skip", csrf: true, limiter: rateLimiters.onboarding }
);
