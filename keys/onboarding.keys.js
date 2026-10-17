import { userKeys } from '@/keys/user.keys'

export const onboardingKeys = {
    // Reference data shared by everyone (roles, industries, goals).
    catalog: () => ['onboarding', 'catalog'],
    status: () => [...userKeys.all, 'onboarding', 'status'],
    recommendationsAll: () => [...userKeys.all, 'recommendations'],
    recommendations: (limit) => [...onboardingKeys.recommendationsAll(), limit],
}
