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
    adjustExperience: async (input) => (await apiClient.post('/admin/experience/adjust', input)).data,
    grantEntitlement: async (input) => (await apiClient.post('/admin/entitlements', input)).data,
    revokeEntitlement: async (input) => (await apiClient.delete('/admin/entitlements', { data: input })).data,
    getOrders: async (filters = {}) => (await apiClient.get('/admin/orders', {
        params: Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
    })).data,
    search: async ({ q, type }) => (await apiClient.get('/admin/search', { params: { q, type: type || undefined } })).data,
    refundOrder: async ({ orderId, reason }) => (await apiClient.post(`/admin/orders/${encodeURIComponent(orderId)}/refund`, { reason })).data,
    getAudit: async ({ before, ...filters }) => (await apiClient.get('/admin/audit', {
        params: Object.fromEntries(Object.entries({ ...filters, before }).filter(([, value]) => value)),
    })).data,
    getContentKpis: async (courseId) => (await apiClient.get('/admin/content-kpis', { params: { course: courseId } })).data,
    getExpAudit: async () => (await apiClient.get('/admin/exp-audit')).data,
    getActivity: async (days, tz) => (await apiClient.get('/admin/dashboard/activity', { params: { days, tz } })).data,
    getDashboard: async ({ fresh = false, tz } = {}) => (await apiClient.get('/admin/dashboard', { params: { tz, ...(fresh ? { fresh: 1 } : {}) } })).data,
    listUsers: async ({ cursor, ...filters }) => (await apiClient.get('/admin/users/list', {
        params: Object.fromEntries(Object.entries({ ...filters, cursor }).filter(([, value]) => value)),
    })).data,
    getUser: async (userId) => (await apiClient.get(`/admin/users/${encodeURIComponent(userId)}`)).data,
    getUserActivity: async ({ userId, kinds, before }) => (await apiClient.get(`/admin/users/${encodeURIComponent(userId)}/activity`, {
        params: { kinds: kinds?.length ? kinds.join(',') : undefined, before: before || undefined },
    })).data,
    setUserStatus: async ({ userId, ...input }) => (await apiClient.post(`/admin/users/${encodeURIComponent(userId)}/status`, input)).data,
    addUserRole: async ({ userId, role, reason }) => (await apiClient.post(`/admin/users/${encodeURIComponent(userId)}/roles`, { role, reason })).data,
    removeUserRole: async ({ userId, role, reason }) =>
        (await apiClient.delete(`/admin/users/${encodeURIComponent(userId)}/roles`, { data: { role, reason } })).data,
    revokeUserSessions: async ({ userId, reason }) =>
        (await apiClient.delete(`/admin/users/${encodeURIComponent(userId)}/sessions`, { data: { reason } })).data,
    listRuns: async ({ tab, language, type, user, cursor }) => (await apiClient.get('/admin/runs/list', {
        params: { tab, language: language || undefined, type: type || undefined, user: user || undefined, cursor: cursor || undefined },
    })).data,
    getRun: async (runId) => (await apiClient.get(`/admin/runs/${encodeURIComponent(runId)}`)).data,
    getRunSource: async (runId) => (await apiClient.get(`/admin/runs/${encodeURIComponent(runId)}/source`)).data,
    cancelRun: async ({ runId, reason }) => (await apiClient.post(`/admin/runs/${encodeURIComponent(runId)}/cancel`, { reason })).data,
    expireRuns: async ({ reason }) => (await apiClient.post('/admin/runs/expire', { reason })).data,
    getChallenges: async (courseId) => (await apiClient.get('/admin/challenges', { params: { course: courseId } })).data,
    getCourseRatings: async (courseId) => (await apiClient.get(`/admin/courses/${encodeURIComponent(courseId)}/ratings`)).data,
    setRatingHidden: async ({ courseId, ...input }) => (await apiClient.patch(`/admin/courses/${encodeURIComponent(courseId)}/ratings`, input)).data,
    listBlog: async (params) => (await apiClient.get('/admin/blog', { params })).data,
    getBlogPost: async (postId) => (await apiClient.get(`/admin/blog/${encodeURIComponent(postId)}`)).data,
    actOnBlog: async ({ postId, ...input }) => (await apiClient.patch(`/admin/blog/${encodeURIComponent(postId)}`, input)).data,
    listBlogComments: async (params) => (await apiClient.get('/admin/blog/comments', { params })).data,
    setBlogCommentHidden: async ({ commentId, ...input }) => (await apiClient.patch(`/admin/blog/comments/${encodeURIComponent(commentId)}`, input)).data,
    listComments: async (params) => (await apiClient.get('/admin/comments', { params })).data,
    setCommentHidden: async ({ commentId, ...input }) => (await apiClient.patch(`/admin/comments/${encodeURIComponent(commentId)}`, input)).data,
    listFeedback: async (params) => (await apiClient.get('/admin/feedback', { params })).data,
    listAnnouncements: async (params) => (await apiClient.get('/admin/announcements', { params })).data,
    previewAnnouncement: async (audience) => (await apiClient.post('/admin/announcements/preview', { audience })).data,
    createAnnouncement: async (input) => (await apiClient.post('/admin/announcements', input)).data,
    updateAnnouncement: async ({ id, ...input }) => (await apiClient.patch(`/admin/announcements/${encodeURIComponent(id)}`, input)).data,
    setFeedbackHandled: async ({ feedbackId, ...input }) => (await apiClient.patch(`/admin/feedback/${encodeURIComponent(feedbackId)}`, input)).data,
    updateChallenge: async ({ challengeId, ...input }) => (await apiClient.patch(`/admin/challenges/${encodeURIComponent(challengeId)}`, input)).data,
    getSystem: async () => (await apiClient.get('/admin/system')).data,
    getMfaStatus: async () => (await apiClient.get('/admin/mfa')).data,
    setupMfa: async () => (await apiClient.post('/admin/mfa/setup', {})).data,
    confirmMfa: async (code) => (await apiClient.post('/admin/mfa/confirm', { code })).data,
    verifyMfa: async (code) => (await apiClient.post('/admin/mfa/verify', { code })).data,
    getCourseStructure: async (courseId) => (await apiClient.get(`/admin/courses/${encodeURIComponent(courseId)}/structure`)).data,
    changeCourseStructure: async ({ courseId, ...input }) => (await apiClient.patch(`/admin/courses/${encodeURIComponent(courseId)}/structure`, input)).data,
    getCatalog: async (kind) => (await apiClient.get('/admin/catalog', { params: { kind } })).data,
    createCatalogItem: async (input) => (await apiClient.post('/admin/catalog', input)).data,
    updateCatalogItem: async ({ kind, id, ...input }) => (await apiClient.patch(`/admin/catalog/${kind}/${encodeURIComponent(id)}`, input)).data,
    deleteCatalogItem: async ({ kind, id, reason }) => (await apiClient.delete(`/admin/catalog/${kind}/${encodeURIComponent(id)}`, { data: { reason } })).data,
    resolveDeadLetter: async ({ id, reason }) => (await apiClient.post(`/admin/system/dead-letters/${encodeURIComponent(id)}/resolve`, { reason })).data,
    getSettings: async () => (await apiClient.get('/admin/settings')).data,
    retryDeadLetter: async ({ id, reason }) => (await apiClient.post(`/admin/system/dead-letters/${encodeURIComponent(id)}/retry`, { reason })).data,
};

/** Machine-readable error code of a failed API call (`INSUFFICIENT_POINTS`, `ALREADY_OWNED`, ...). */
export function errorCode(error) {
    return error?.data?.code || error?.code || null;
}
