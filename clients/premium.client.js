import { apiClient } from '@/clients/api.client';

// Onboarding, recommendations and commerce APIs (app/api/onboarding, recommendations, commerce).
// The signed-in user always comes from the session cookie: no user id is ever sent.

export const onboardingClient = {
    getCatalog: async () => (await apiClient.get('/onboarding/catalog')).data,
    getStatus: async () => (await apiClient.get('/onboarding/status')).data,
    saveStep: async (input) => (await apiClient.post('/onboarding/preferences', input)).data,
    updatePreferences: async (input) => (await apiClient.patch('/onboarding/preferences', input)).data,
    complete: async () => (await apiClient.post('/onboarding/complete', {})).data,
    skip: async () => (await apiClient.post('/onboarding/skip', {})).data,
    getRecommendations: async (limit = 6) => (await apiClient.get('/recommendations', { params: { limit } })).data,
};

export const commerceClient = {
    getWallet: async (cursor) => (await apiClient.get('/commerce/wallet', {
        params: cursor ? { beforeAt: cursor.createdAt, beforeId: cursor.id } : {},
    })).data,
    getEntitlements: async () => (await apiClient.get('/commerce/entitlements')).data,
    getOrders: async (before) => (await apiClient.get('/commerce/orders', { params: before ? { before } : {} })).data,
    getOrder: async (orderId) => (await apiClient.get(`/commerce/orders/${encodeURIComponent(orderId)}`)).data,
    redeem: async ({ courseId, idempotencyKey }) => (await apiClient.post('/commerce/redeem', { courseId, idempotencyKey })).data,
    checkout: async ({ courseId, idempotencyKey }) => (await apiClient.post('/commerce/checkout', { courseId, idempotencyKey })).data,
    completeMockPayment: async ({ orderId, outcome }) =>
        (await apiClient.post(`/payments/mock/${encodeURIComponent(orderId)}`, { outcome })).data,
};

// Admin: `userId` here is the TARGET user picked by an admin, checked server-side by permission.
export const adminClient = {
    getCourses: async () => (await apiClient.get('/admin/courses')).data,
    updateCourse: async ({ courseId, ...input }) => (await apiClient.patch(`/admin/courses/${encodeURIComponent(courseId)}`, input)).data,
    setPublishStatus: async ({ courseId, status, reason }) =>
        (await apiClient.post(`/admin/courses/${encodeURIComponent(courseId)}/publish`, { status, reason })).data,
    setOffer: async ({ courseId, ...input }) => (await apiClient.post(`/admin/courses/${encodeURIComponent(courseId)}/offers`, input)).data,
    removeOffer: async ({ courseId, priceType, reason }) =>
        (await apiClient.delete(`/admin/courses/${encodeURIComponent(courseId)}/offers`, { data: { priceType, reason } })).data,
    findUsers: async (q) => (await apiClient.get('/admin/users', { params: { q } })).data,
    getUserEntitlements: async (userId) => (await apiClient.get('/admin/entitlements', { params: { userId } })).data,
    adjustPoints: async (input) => (await apiClient.post('/admin/points/adjust', input)).data,
    grantEntitlement: async (input) => (await apiClient.post('/admin/entitlements', input)).data,
    revokeEntitlement: async (input) => (await apiClient.delete('/admin/entitlements', { data: input })).data,
    getOrders: async () => (await apiClient.get('/admin/orders')).data,
    refundOrder: async ({ orderId, reason }) => (await apiClient.post(`/admin/orders/${encodeURIComponent(orderId)}/refund`, { reason })).data,
    getAudit: async () => (await apiClient.get('/admin/audit')).data,
};

/** Machine-readable error code of a failed API call (`INSUFFICIENT_POINTS`, `ALREADY_OWNED`, ...). */
export function errorCode(error) {
    return error?.data?.code || error?.code || null;
}
