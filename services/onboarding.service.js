import { onboardingDb } from "@/db/onboarding.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { redis } from "@/lib/cache";
import { ONBOARDING_STEPS, EXPERIENCE_LEVELS } from "@/lib/validation/premium";

/**
 * Onboarding state machine (docs/premium-onboarding-design.md §9):
 *   not_started -> in_progress (first saved step) -> completed (complete)
 *   not_started | in_progress -> skipped;  skipped -> in_progress -> completed
 *   completed never goes back; editing preferences afterwards keeps it completed.
 * current_step only moves forward, so a reload resumes at the furthest step reached.
 */

const STEP_INDEX = Object.fromEntries(ONBOARDING_STEPS.map((step, index) => [step, index]));
const CATALOG_CACHE_KEY = "cache:onboarding:catalog";
const CATALOG_TTL = 10 * 60;

/** Statuses that send a signed-in user to /onboarding after login. */
export const ONBOARDING_PENDING = new Set(["not_started", "in_progress"]);

function nextStep(step) {
    return ONBOARDING_STEPS[Math.min(STEP_INDEX[step] + 1, ONBOARDING_STEPS.length - 1)];
}

function furthest(a, b) {
    return (STEP_INDEX[a] ?? 0) >= (STEP_INDEX[b] ?? 0) ? a : b;
}

function toState(row) {
    if (!row) throw new ApiError("User not found", 404);
    return {
        status: row.status,
        currentStep: row.current_step,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        skippedAt: row.skipped_at,
        preferences: {
            roleCode: row.role_code || null,
            roleName: row.role_name || null,
            industryCodes: row.industry_codes || [],
            experienceLevel: row.experience_level || null,
            goalCodes: row.goal_codes || [],
            preferredLanguageId: row.preferred_language_id || null,
        },
    };
}

export const onboardingService = {
    /** Taxonomy is the same for everyone: cached (reference data, no user data). */
    getCatalog: async () => {
        return redis.remember(CATALOG_CACHE_KEY, CATALOG_TTL, async () => {
            const [catalogRes, languagesRes] = await Promise.all([
                onboardingDb.getCatalog(),
                onboardingDb.getPreferenceLanguages(),
            ]);
            const pick = (kind) => catalogRes.rows
                .filter((row) => row.kind === kind)
                .map(({ code, name, description }) => ({ code, name, description: description || null }));

            return {
                roles: pick("role"),
                industries: pick("industry"),
                goals: pick("goal"),
                levels: EXPERIENCE_LEVELS,
                languages: languagesRes.rows.map(({ id, name }) => ({ id: Number(id), name })),
            };
        });
    },

    getState: async ({ userId }) => {
        const { rows } = await onboardingDb.getState({ userId });
        return toState(rows[0]);
    },

    /** Saves one onboarding step and advances current_step. */
    saveStep: async ({ userId, input }) => {
        const { step, ...prefs } = input;
        if (step === "industry" && prefs.industryCodes === undefined) prefs.industryCodes = [];

        await withTransaction((client) => onboardingDb.savePreferences(client, {
            userId,
            prefs,
            nextState: (previous) => previous.status === "completed"
                ? { status: "completed", currentStep: previous.current_step }
                : { status: "in_progress", currentStep: furthest(previous.current_step, nextStep(step)) },
        }));

        return onboardingService.getState({ userId });
    },

    /** Profile / Preferences edit: never changes the onboarding status. */
    updatePreferences: async ({ userId, input }) => {
        await withTransaction((client) => onboardingDb.savePreferences(client, { userId, prefs: input, nextState: null }));
        return onboardingService.getState({ userId });
    },

    complete: async ({ userId }) => {
        const state = await onboardingService.getState({ userId });
        if (state.status === "completed") return state;

        const missing = [];
        if (!state.preferences.roleCode) missing.push("role");
        if (!state.preferences.experienceLevel) missing.push("experience level");
        if (state.preferences.goalCodes.length === 0) missing.push("at least one goal");
        if (missing.length) {
            throw new ApiError(`Choose your ${missing.join(", ")} before finishing.`, 422, { code: "ONBOARDING_INCOMPLETE" });
        }

        await withTransaction((client) => onboardingDb.savePreferences(client, {
            userId,
            prefs: {},
            nextState: () => ({ status: "completed", currentStep: "recommendations" }),
        }));

        return onboardingService.getState({ userId });
    },

    skip: async ({ userId }) => {
        await onboardingDb.skip({ userId });
        return onboardingService.getState({ userId });
    },

    /** Used by the post-login landing page; any failure lets the user in (onboarding is optional). */
    needsOnboarding: async ({ userId }) => {
        try {
            const { rows } = await onboardingDb.getState({ userId });
            return ONBOARDING_PENDING.has(rows[0]?.status);
        } catch (error) {
            console.error("[onboarding] status check failed:", error?.message);
            return false;
        }
    },
};
