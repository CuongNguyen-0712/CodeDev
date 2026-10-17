import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { onboardingService } from "@/services/onboarding.service";

// Finishes onboarding (needs a role, an experience level and at least one goal).
export const POST = apiRoute(
    ({ userId }) => onboardingService.complete({ userId }),
    { context: "api/onboarding/complete", csrf: true, limiter: rateLimiters.onboarding }
);
