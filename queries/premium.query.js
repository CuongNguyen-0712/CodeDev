import { commerceClient, onboardingClient, adminClient } from "@/clients/premium.client";

import { adminKeys } from "@/keys/admin.keys";
import { SEARCH_MIN } from "@/lib/adminSearch";
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
    // Unfiltered shares its cache with the overview finding (components/admin/ui/pageFindings.jsx).
    orders: (filters) => {
        const active = filters && Object.values(filters).some(Boolean) ? filters : undefined;
        return { queryKey: adminKeys.orders(active), queryFn: () => adminClient.getOrders(active), ...QUERY_TIMES.live, retry: retryTransient };
    },
    // Ctrl / Cmd + K; the palette debounces `q`, and keeps the last results while the next ones load.
    search: (q, type) => ({
        queryKey: adminKeys.search(q, type),
        queryFn: () => adminClient.search({ q, type }),
        enabled: q.length >= SEARCH_MIN,
        placeholderData: (previous) => previous,
        ...QUERY_TIMES.live,
        retry: retryTransient,
    }),
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
    // Refetched every 60 s only while the tab is visible: a hidden admin tab never wakes the database.
    dashboard: (tz) => ({
        queryKey: adminKeys.dashboard(tz),
        queryFn: () => adminClient.getDashboard({ tz }),
        ...QUERY_TIMES.live,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
        retry: retryTransient,
    }),
    activity: (days, tz) => ({
        queryKey: adminKeys.activity(days, tz),
        queryFn: () => adminClient.getActivity(days, tz),
        ...QUERY_TIMES.live,
        placeholderData: (previous) => previous,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
        retry: retryTransient,
    }),
    user: (userId) => ({
        queryKey: adminKeys.user(userId),
        queryFn: () => adminClient.getUser(userId),
        enabled: Boolean(userId),
        ...QUERY_TIMES.live,
        retry: retryTransient,
    }),
};
