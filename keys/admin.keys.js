export const adminKeys = {
    all: ['admin'],
    courses: () => [...adminKeys.all, 'courses'],
    orders: () => [...adminKeys.all, 'orders'],
    audit: () => [...adminKeys.all, 'audit'],
    users: (query) => [...adminKeys.all, 'users', query],
    entitlements: (userId) => [...adminKeys.all, 'entitlements', userId],
}
