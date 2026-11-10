'use server';

import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";
import { onboardingStepSchema, parseOrThrow, preferencesPatchSchema } from "@/lib/validation/premium";
import { onboardingService } from "@/services/onboarding.service";

const options = (context) => ({ limiter: rateLimiters.onboarding, context });

// Saves one onboarding step (moves the status to in_progress and the resume step forward).
export async function saveOnboardingStepAction(input) {
    return runAction(
        async ({ userId }) => onboardingService.saveStep({ userId, input: parseOrThrow(onboardingStepSchema, input) }),
        options("saveOnboardingStepAction")
    );
}

// Edits preferences from Profile / Settings; the onboarding status is left unchanged.
export async function updatePreferencesAction(input) {
    return runAction(
        async ({ userId }) => onboardingService.updatePreferences({ userId, input: parseOrThrow(preferencesPatchSchema, input) }),
        options("updatePreferencesAction")
    );
}

// Finishes onboarding (needs a role, an experience level and at least one goal).
export async function completeOnboardingAction() {
    return runAction(async ({ userId }) => onboardingService.complete({ userId }), options("completeOnboardingAction"));
}

export async function skipOnboardingAction() {
    return runAction(async ({ userId }) => onboardingService.skip({ userId }), options("skipOnboardingAction"));
}
