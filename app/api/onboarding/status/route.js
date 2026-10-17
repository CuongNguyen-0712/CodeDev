import { apiRoute } from "@/lib/routeHandler";
import { onboardingService } from "@/services/onboarding.service";

// Onboarding status, resume step and saved preferences of the signed-in user.
export const GET = apiRoute(
    ({ userId }) => onboardingService.getState({ userId }),
    { context: "api/onboarding/status" }
);
