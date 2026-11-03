import { cacheLife, cacheTag } from "next/cache";
import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";

/**
 * React Query hydration state for data a page prerenders (Cache Components). TanStack's own
 * `dehydrate()` reads `Date.now()`, which fails a prerender; here the timestamp is cached with the
 * same tags as the data, so both advance together when lib/pageCache marks the tags stale.
 * Pattern from the Next.js docs (guides/client-side-data-fetching/tanstack-query).
 */
async function getHydrationUpdatedAt(tags) {
    "use cache";
    cacheTag(...tags);
    cacheLife("max");
    return Date.now();
}

/** @param {{ queryKey: unknown[], data: unknown }[]} queries  @param {{ tags: string[] }} options */
export async function dehydrateCached(queries, { tags }) {
    const updatedAt = await getHydrationUpdatedAt(tags);

    const queryClient = new QueryClient();
    for (const query of queries) {
        queryClient.setQueryData(query.queryKey, query.data, { updatedAt });
    }

    return {
        mutations: [],
        queries: queryClient
            .getQueryCache()
            .getAll()
            .filter((query) => defaultShouldDehydrateQuery(query))
            .map((query) => ({
                dehydratedAt: updatedAt,
                queryHash: query.queryHash,
                queryKey: query.queryKey,
                state: query.state,
                ...(query.meta ? { meta: query.meta } : {}),
            })),
    };
}
