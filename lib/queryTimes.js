/**
 * React Query cache timings, by how the data changes. Every query in queries/ picks one preset,
 * so similar data behaves the same way.
 *
 *   staleTime: how long a cached result is shown without asking the server again.
 *   gcTime:    how long an unused result stays in memory (going back to a page is instant).
 *
 * The server keeps its own Redis copies (lib/cacheKeys.js) with comparable lifetimes, and data the
 * user changes is invalidated explicitly by mutations and realtime events, so these values only
 * bound how stale a screen can get through changes made elsewhere.
 */
const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const QUERY_TIMES = {
    /** Rarely edited reference data shared by everyone: filter options, roadmap list. */
    reference: { staleTime: 10 * MINUTE, gcTime: 30 * MINUTE },
    /** Public catalog content: course lists, course and roadmap pages. */
    catalog: { staleTime: 30 * SECOND, gcTime: 5 * MINUTE },
    /** The signed-in user's own data; mutations and realtime events invalidate it. */
    personal: { staleTime: 30 * SECOND, gcTime: 10 * MINUTE },
    /** Profile shown in the navbar: changes only through the user's own actions. */
    profile: { staleTime: 5 * MINUTE, gcTime: 10 * MINUTE },
    /** Data other people or timers change: comments, quiz attempts / cooldowns. */
    live: { staleTime: 15 * SECOND, gcTime: 5 * MINUTE },
    /** Content that never changes once written: a submitted code snapshot. */
    immutable: { staleTime: Infinity, gcTime: 30 * MINUTE },
};

/** Retry transient failures only: a 4xx (bad input, auth, not found) will not fix itself. */
export function retryTransient(failureCount, error) {
    const status = Number(error?.status ?? error?.response?.status ?? 0);
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
    return failureCount < 2;
}
