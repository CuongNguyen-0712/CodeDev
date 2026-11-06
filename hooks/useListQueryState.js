"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { defaultFilter, isFiltered, parseListQuery, toQueryParams, LIST_SCHEMAS } from "@/lib/listFilters";

/**
 * Search + filter state of a list page, stored in the URL query (`?q=...&level=...`) so a view
 * can be shared, reloaded and walked with back / forward.
 *
 * Writes go through the History API, which Next.js syncs with useSearchParams without a server
 * round trip. Typing replaces the current entry; applying filters pushes a new one. Query keys
 * that belong to other features are kept.
 *
 * `suggested`: a filter to start from (the learner's onboarding profile) when the page opens with
 * an empty query. Applied once per mount, so Reset clears it until the next visit.
 */
export function useListQueryState(kind, { suggested = null } = {}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const state = useMemo(() => parseListQuery(kind, searchParams), [kind, searchParams]);

    // Setters stay stable while the URL changes (SearchBar debounces on their identity).
    // Updated after commit (refs must not be written during render), before any event can call a setter.
    const latest = useRef({ state, searchParams });
    useLayoutEffect(() => {
        latest.current = { state, searchParams };
    });

    const write = useCallback((next, { push = false } = {}) => {
        const params = new URLSearchParams(latest.current.searchParams);
        for (const key of ["q", "search", "sort", ...Object.keys(LIST_SCHEMAS[kind])]) {
            params.delete(key);
            params.delete(`${key}[]`);
        }
        for (const [key, value] of Object.entries(toQueryParams(kind, next))) {
            params.set(key, value);
        }

        const query = params.toString();
        const url = `${pathname}${query ? `?${query}` : ""}${window.location.hash}`;
        if (url === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;

        // `null` state: Next.js only syncs useSearchParams for entries it did not create itself.
        window.history[push ? "pushState" : "replaceState"](null, "", url);
    }, [kind, pathname]);

    const suggestedApplied = useRef(false);
    useEffect(() => {
        if (!suggested || suggestedApplied.current) return;
        suggestedApplied.current = true;
        if (isFiltered(kind, latest.current.state) || latest.current.state.search) return;
        write({ ...latest.current.state, filter: suggested });
    }, [kind, suggested, write]);

    const setSearch = useCallback((search) => {
        write({ ...latest.current.state, search });
    }, [write]);

    const setFilter = useCallback((filter) => {
        write({ ...latest.current.state, filter }, { push: true });
    }, [write]);

    const setSort = useCallback((sort) => {
        write({ ...latest.current.state, sort }, { push: true });
    }, [write]);

    // Clears search and filters; the chosen order stays.
    const reset = useCallback(() => {
        write({ search: "", filter: defaultFilter(kind), sort: latest.current.state.sort }, { push: true });
    }, [kind, write]);

    return {
        search: state.search,
        filter: state.filter,
        sort: state.sort,
        /** Canonical params for the API call and the React Query key. */
        params: useMemo(() => toQueryParams(kind, state), [kind, state]),
        isFiltered: isFiltered(kind, state),
        setSearch,
        setFilter,
        setSort,
        reset,
    };
}

export default useListQueryState;
