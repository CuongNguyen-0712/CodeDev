import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { onboardingStepSchema, parseOrThrow, preferencesPatchSchema, readJson } from "@/lib/validation/premium";
import { onboardingService } from "@/services/onboarding.service";

// POST: save one onboarding step (moves the status to in_progress and the resume step forward).
export const POST = apiRoute(
    async ({ req, userId }) => {
        const input = parseOrThrow(onboardingStepSchema, await readJson(req));
        return onboardingService.saveStep({ userId, input });
    },
    { context: "api/onboarding/preferences", csrf: true, limiter: rateLimiters.onboarding }
);

// PATCH: edit preferences from Profile / Settings; the onboarding status is left unchanged.
export const PATCH = apiRoute(
    async ({ req, userId }) => {
        const input = parseOrThrow(preferencesPatchSchema, await readJson(req));
        return onboardingService.updatePreferences({ userId, input });
    },
    { context: "api/onboarding/preferences", csrf: true, limiter: rateLimiters.onboarding }
);
