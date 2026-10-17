import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adminClient, commerceClient, onboardingClient } from "@/clients/premium.client";

import { adminKeys } from "@/keys/admin.keys";
import { commerceKeys } from "@/keys/commerce.keys";
import { courseKeys } from "@/keys/course.keys";
import { onboardingKeys } from "@/keys/onboarding.keys";
import { userKeys } from "@/keys/user.keys";

/**
 * Everything that shows ownership, balance or "what to learn next". Invalidated after a purchase,
 * a redemption (success or a business error: the server state may differ from the screen) and
 * when an order changes status.
 */
export function ownershipChangeKeys(courseId) {
    return [
        commerceKeys.all,                 // wallet, entitlements, orders, order
        onboardingKeys.recommendationsAll(),
        userKeys.me(),                    // navbar points
        userKeys.overview(),
        userKeys.courseProgress(),
        courseKeys.all,                   // course lists and details (owned / enrolled state)
        ...(courseId ? [courseKeys.details(courseId)] : []),
    ];
}

export function invalidateOwnership(queryClient, courseId) {
    return Promise.all(ownershipChangeKeys(courseId).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** One key per user intent (one dialog / one click sequence): retries replay instead of charging twice. */
export function newIdempotencyKey() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const useRedeemCourse = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ courseId, idempotencyKey }) => commerceClient.redeem({ courseId, idempotencyKey }),
        onSettled: (_data, _error, variables) => invalidateOwnership(queryClient, variables?.courseId),
    });
};

export const useCheckout = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ courseId, idempotencyKey }) => commerceClient.checkout({ courseId, idempotencyKey }),
        onSettled: () => queryClient.invalidateQueries({ queryKey: commerceKeys.orders() }),
    });
};

export const useMockPayment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ orderId, outcome }) => commerceClient.completeMockPayment({ orderId, outcome }),
        onSettled: () => invalidateOwnership(queryClient),
    });
};

function useOnboardingWrite(mutationFn) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: (state) => {
            if (state) queryClient.setQueryData(onboardingKeys.status(), state);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: onboardingKeys.status() });
            queryClient.invalidateQueries({ queryKey: onboardingKeys.recommendationsAll() });
        },
    });
}

export const useSaveOnboardingStep = () => useOnboardingWrite((input) => onboardingClient.saveStep(input));
export const useCompleteOnboarding = () => useOnboardingWrite(() => onboardingClient.complete());
export const useSkipOnboarding = () => useOnboardingWrite(() => onboardingClient.skip());
export const useUpdatePreferences = () => useOnboardingWrite((input) => onboardingClient.updatePreferences(input));

function useAdminWrite(mutationFn) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: adminKeys.all });
            queryClient.invalidateQueries({ queryKey: courseKeys.all });
        },
    });
}

export const useAdminUpdateCourse = () => useAdminWrite((input) => adminClient.updateCourse(input));
export const useAdminPublish = () => useAdminWrite((input) => adminClient.setPublishStatus(input));
export const useAdminSetOffer = () => useAdminWrite((input) => adminClient.setOffer(input));
export const useAdminRemoveOffer = () => useAdminWrite((input) => adminClient.removeOffer(input));
export const useAdminAdjustPoints = () => useAdminWrite((input) => adminClient.adjustPoints(input));
export const useAdminGrant = () => useAdminWrite((input) => adminClient.grantEntitlement(input));
export const useAdminRevoke = () => useAdminWrite((input) => adminClient.revokeEntitlement(input));
export const useAdminRefund = () => useAdminWrite((input) => adminClient.refundOrder(input));
