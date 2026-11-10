// Server actions for onboarding: validation, session user only, and the onboarding limiter.
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = { saveStep: vi.fn(), updatePreferences: vi.fn(), complete: vi.fn(), skip: vi.fn() };
vi.mock("@/services/onboarding.service", () => ({ onboardingService: svc }));
vi.mock("@/lib/serverAction", () => ({
    runAction: async (handler, options) => {
        try {
            return { success: true, data: await handler({ userId: "u1" }), options };
        } catch (error) {
            return { success: false, status: error.status, message: error.message };
        }
    },
}));

const { saveOnboardingStepAction, updatePreferencesAction, completeOnboardingAction, skipOnboardingAction } = await import("@/actions/onboarding.actions");
const { rateLimiters } = await import("@/lib/rateLimit");

describe("onboarding actions", () => {
    beforeEach(() => {
        for (const fn of Object.values(svc)) fn.mockReset().mockResolvedValue({ status: "in_progress" });
    });

    it("saveOnboardingStepAction needs the data of the step, with the onboarding limiter", async () => {
        expect(await saveOnboardingStepAction({ step: "role" })).toMatchObject({ success: false, status: 400 });
        expect(await saveOnboardingStepAction(undefined)).toMatchObject({ success: false, status: 400 });
        expect(await saveOnboardingStepAction(null)).toMatchObject({ success: false, status: 400 });
        expect(svc.saveStep).not.toHaveBeenCalled();
        const result = await saveOnboardingStepAction({ step: "role", roleCode: "backend_developer" });
        expect(svc.saveStep).toHaveBeenCalledWith({ userId: "u1", input: { step: "role", roleCode: "backend_developer" } });
        expect(result.options.limiter).toBe(rateLimiters.onboarding);
    });

    it("a userId in the input is refused (strict schemas)", async () => {
        expect(await saveOnboardingStepAction({ step: "role", roleCode: "backend_developer", userId: "usr_attacker" })).toMatchObject({ success: false, status: 400 });
        expect(await updatePreferencesAction({ userId: "usr_attacker" })).toMatchObject({ success: false, status: 400 });
        expect(svc.saveStep).not.toHaveBeenCalled();
        expect(svc.updatePreferences).not.toHaveBeenCalled();
    });

    it("updatePreferencesAction passes the parsed patch", async () => {
        const result = await updatePreferencesAction({ experienceLevel: null });
        expect(svc.updatePreferences).toHaveBeenCalledWith({ userId: "u1", input: { experienceLevel: null } });
        expect(result.options.limiter).toBe(rateLimiters.onboarding);
    });

    it("complete and skip act on the session user only", async () => {
        await completeOnboardingAction({ userId: "usr_attacker" });
        await skipOnboardingAction({ userId: "usr_attacker" });
        expect(svc.complete).toHaveBeenCalledWith({ userId: "u1" });
        expect(svc.skip).toHaveBeenCalledWith({ userId: "u1" });
    });
});
