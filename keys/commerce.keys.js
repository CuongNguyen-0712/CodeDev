import { userKeys } from '@/keys/user.keys'

// Under userKeys.all: the realtime PROGRESS_UPDATED handler refreshes them with the rest of the
// user's data, and sign-out clears them.
export const commerceKeys = {
    all: [...userKeys.all, 'commerce'],
    wallet: () => [...commerceKeys.all, 'wallet'],
    entitlements: () => [...commerceKeys.all, 'entitlements'],
    orders: () => [...commerceKeys.all, 'orders'],
    order: (orderId) => [...commerceKeys.all, 'order', orderId],
}
