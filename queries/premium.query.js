import { commerceClient, onboardingClient, adminClient } from "@/clients/premium.client";

import { adminKeys } from "@/keys/admin.keys";
import { commerceKeys } from "@/keys/commerce.keys";
import { onboardingKeys } from "@/keys/onboarding.keys";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";

const authed = (status) => status === "authenticated";

export const onboardingQueries = {
    /** Roles / industries / goals from the database (reference data). */
    catalog() {
        return {
            queryKey: onboardingKeys.catalog(),
            queryFn: () => onboardingClient.getCatalog(),
            ...QUERY_TIMES.reference,
            retry: retryTransient,
        };
    },

    status(status) {
        return {
            queryKey: onboardingKeys.status(),
            queryFn: () => onboardingClient.getStatus(),
            enabled: authed(status),
            ...QUERY_TIMES.personal,
            retry: retryTransient,
        };
    },

    recommendations(status, limit = 6) {
        return {
            queryKey: onboardingKeys.recommendations(limit),
            queryFn: () => onboardingClient.getRecommendations(limit),
            enabled: authed(status),
            ...QUERY_TIMES.personal,
            retry: retryTransient,
        };
    },
};

export const commerceQueries = {
    /** Point balance + ledger pages (PostgreSQL; the server never caches it in Redis). */
    wallet(status) {
        return {
            queryKey: commerceKeys.wallet(),
            queryFn: ({ pageParam }) => commerceClient.getWallet(pageParam),
            initialPageParam: null,
            getNextPageParam: (lastPage) => lastPage?.next || undefined,
            enabled: authed(status),
            ...QUERY_TIMES.personal,
            retry: retryTransient,
        };
    },

    /** Owned course ids. Until it resolves (or when it fails) the UI shows no ownership state. */
    entitlements(status) {
        return {
            queryKey: commerceKeys.entitlements(),
            queryFn: () => commerceClient.getEntitlements(),
            enabled: authed(status),
            ...QUERY_TIMES.personal,
            retry: retryTransient,
        };
    },

    orders(status) {
        return {
            queryKey: commerceKeys.orders(),
            queryFn: ({ pageParam }) => commerceClient.getOrders(pageParam),
            initialPageParam: null,
            getNextPageParam: (lastPage) => lastPage?.next || undefined,
            enabled: authed(status),
            ...QUERY_TIMES.personal,
            retry: retryTransient,
        };
    },

    /** One order; polled while the payment is pending (the webhook decides, not the redirect). */
    order(status, orderId) {
        return {
            queryKey: commerceKeys.order(orderId),
            queryFn: () => commerceClient.getOrder(orderId),
            enabled: authed(status) && Boolean(orderId),
            ...QUERY_TIMES.live,
            refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
            retry: retryTransient,
        };
    },
};

export const adminQueries = {
    courses: () => ({ queryKey: adminKeys.courses(), queryFn: () => adminClient.getCourses(), ...QUERY_TIMES.live, retry: retryTransient }),
    orders: () => ({ queryKey: adminKeys.orders(), queryFn: () => adminClient.getOrders(), ...QUERY_TIMES.live, retry: retryTransient }),
    audit: () => ({ queryKey: adminKeys.audit(), queryFn: () => adminClient.getAudit(), ...QUERY_TIMES.live, retry: retryTransient }),
    users: (query) => ({
        queryKey: adminKeys.users(query),
        queryFn: () => adminClient.findUsers(query),
        enabled: query.trim().length >= 2,
        ...QUERY_TIMES.live,
        retry: retryTransient,
    }),
    entitlements: (userId) => ({
        queryKey: adminKeys.entitlements(userId),
        queryFn: () => adminClient.getUserEntitlements(userId),
        enabled: Boolean(userId),
        ...QUERY_TIMES.live,
        retry: retryTransient,
    }),
    contentKpis: (courseId) => ({
        queryKey: adminKeys.contentKpis(courseId),
        queryFn: () => adminClient.getContentKpis(courseId),
        enabled: Boolean(courseId),
        ...QUERY_TIMES.live,
        retry: retryTransient,
    }),
    // The audit scans the whole EXP ledger: runs only once the admin asks for it.
    expAudit: (enabled) => ({
        queryKey: adminKeys.expAudit(),
        queryFn: () => adminClient.getExpAudit(),
        enabled,
        ...QUERY_TIMES.live,
        retry: false,
    }),
};
