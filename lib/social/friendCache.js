import { friendKeys } from "@/keys/friend.keys";
import { userKeys } from "@/keys/user.keys";

// Pure edits of the friend caches for one change { user, friendship, previous } (friendship from my side:
// null | "sent" | "received" | "friends"). Lists and people search follow `friendship` alone, so applying the
// same change twice (my action, then its realtime echo) is harmless; only counts use `previous`.
// Inputs are never mutated; when nothing changes the same `data` comes back. `null` = cannot patch, refetch.

const has = (data, id) => data.pages.some((page) => page.items.some((u) => u.id === id));

const without = (data, id) => (has(data, id)
    ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((u) => u.id !== id) })) }
    : data);

/** Friends list ({ pages: [{ items, nextCursor }] }, ordered by username); `search` is the list's search term. */
export function patchFriendList(data, { user, friendship }, search = "") {
    if (!data?.pages?.length) return null;
    if (friendship !== "friends") return without(data, user.id);
    // The server filters with username ILIKE %search%.
    if (has(data, user.id) || !user.username.toLowerCase().includes(search.trim().toLowerCase())) return data;
    // shortcut: code-unit order matches the C / C.UTF-8 collation only; use Intl.Collator if the DB collation differs.
    const p = data.pages.findIndex((page) => page.items.some((u) => u.username > user.username));
    if (p < 0) {
        // Past the last loaded row: only safe to append when no page is left to load.
        if (data.pages.at(-1).nextCursor) return null;
        const last = data.pages.length - 1;
        return { ...data, pages: data.pages.map((page, n) => (n === last ? { ...page, items: [...page.items, user] } : page)) };
    }
    const pages = data.pages.map((page, n) => {
        if (n !== p) return page;
        const i = page.items.findIndex((u) => u.username > user.username);
        return { ...page, items: [...page.items.slice(0, i), user, ...page.items.slice(i)] };
    });
    return { ...data, pages };
}

/** Invitations for direction "received" | "sent", newest first: a new one goes on top of the first page. */
export function patchInvitations(data, direction, { user, friendship }) {
    if (!data?.pages?.length) return null;
    if (friendship !== direction) return without(data, user.id);
    if (has(data, user.id)) return data;
    return { ...data, pages: data.pages.map((page, n) => (n ? page : { ...page, items: [user, ...page.items] })) };
}

/** People search pages: only the `friendship` of that person's rows changes (rank, showProfile stay). */
export function patchUserPages(data, { user, friendship }) {
    if (!data?.pages || !data.pages.some((page) => page.items.some((u) => u.id === user.id && u.friendship !== friendship))) return data;
    return {
        ...data,
        pages: data.pages.map((page) => ({ ...page, items: page.items.map((u) => (u.id === user.id ? { ...u, friendship } : u)) })),
    };
}

/** { friends, received } tab numbers, never below zero. */
export function patchCounts(counts, { friendship, previous }) {
    if (!counts) return null;
    const step = (state) => (friendship === state) - (previous === state);
    return {
        ...counts,
        friends: Math.max(0, counts.friends + step("friends")),
        received: Math.max(0, counts.received + step("received")),
    };
}

/**
 * Applies one change to every cached friends query and people search; refetches what cannot be patched.
 * `counts: false` leaves the tab numbers to the realtime event (my own actions echo back to me);
 * `users: false` skips people search.
 */
export function applyFriendChange(queryClient, change, { counts = true, users = true } = {}) {
    const patch = ([, kind, arg], data) => {
        if (kind === "list") return patchFriendList(data, change, arg);
        if (kind === "invitations") return patchInvitations(data, arg, change);
        if (kind === "counts") return counts ? patchCounts(data, change) : data;
        if (kind === "users") return data === undefined ? null : patchUserPages(data, change);
        return data;
    };
    const queries = [
        ...queryClient.getQueriesData({ queryKey: friendKeys.all }),
        ...(users ? queryClient.getQueriesData({ queryKey: [...userKeys.all, "users"] }) : []),
    ];
    for (const [queryKey, data] of queries) {
        const next = patch(queryKey, data);
        if (next === null) queryClient.invalidateQueries({ queryKey, exact: true });
        else if (next !== data) queryClient.setQueryData(queryKey, next);
    }
}
