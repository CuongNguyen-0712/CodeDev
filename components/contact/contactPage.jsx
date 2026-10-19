'use client'
import { useState, useEffect } from "react";

import useInfiniteScroll from '@/hooks/useInfiniteScroll'

import { ErrorReload } from '../ui/error'
import SearchBar from "../ui/searchBar";

import { uniqWith } from "lodash";
import { api } from "@/lib/axios";
import Link from "next/link";
import { LevelBadge, RankBadge } from "@/components/ui/level";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuLoaderCircle, LuUsers, LuUserSearch, LuX } from "react-icons/lu";

function initials(name = '') {
    const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
    return (parts[0]?.[0] || 'U').concat(parts[1]?.[0] || '').toUpperCase();
}

function PersonSkeleton() {
    return (
        <li className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="hidden h-5 w-20 sm:block" />
            <Skeleton className="hidden h-4 w-24 md:block" />
        </li>
    );
}

// `state` / `setState` are optional: the /contact page renders this without
// them, while a host panel can pass them to control visibility and closing.
export default function Contact({ state, setState }) {

    const [social, setSocial] = useState({
        data: {
            user: [],
            team: []
        },
        hasMore: true,
        pending: true,
        error: null,
        search: '',
        offset: 0,
        limit: 20,
        hasSearch: false,
    })

    // The social endpoint only returns users, so the list is fixed to users.
    const [filter] = useState('User');
    const [apiQueue, setApiQueue] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const { setRef } = useInfiniteScroll({
        hasMore: social.hasMore,
        onLoadMore: () => {
            if (!isProcessing && social.hasMore) {
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
            }
        }
    })

    const fetchData = async () => {
        if (!social.hasMore) return;

        const role = filter.toLowerCase();

        try {
            const currentOffset = social.offset;
            const response = await api.get('get/getUsersSocial', {
                params: {
                    search: social.search.trim(),
                    offset: currentOffset.toString(),
                    limit: social.limit,
                }
            })

            // lib/axios resolves to the response body: { success, data, message }.
            if (response?.success) {
                const data = Array.isArray(response.data) ? response.data : [];
                setSocial(prev => ({
                    ...prev,
                    data: {
                        ...prev.data,
                        [role]: uniqWith([...prev.data[role] ?? [], ...data], (a, b) => a.id === b.id),
                    },
                    hasMore: data.length >= prev.limit,
                    offset: currentOffset + prev.limit,
                    pending: false
                }))
            }
            else {
                setSocial(prev => ({ ...prev, error: { status: response?.status || 500, message: response?.message }, pending: false }))
            }
        } catch (err) {
            setSocial(prev => ({ ...prev, error: { status: 500, message: 'Something is wrong, please try again' }, pending: false }))
        }
    }

    // The initial load is queued by the search/filter effects below, so every
    // fetch goes through the queue and reads the current offset.
    const processQueue = async () => {
        if (isProcessing || apiQueue.length === 0) return;

        setIsProcessing(true);

        const task = apiQueue[0];

        // Fetches queued together (e.g. on mount) would read the same offset; run one.
        let consumed = 1;
        if (task.type === "fetch") {
            while (consumed < apiQueue.length && apiQueue[consumed].type === "fetch") consumed++;
        }

        try {
            if (task.type === "fetch") {
                await fetchData();
            }
            else {
                await task.execute();
            }
        } finally {
            setApiQueue((prev) => prev.slice(consumed));
            setIsProcessing(false);
        }
    }

    useEffect(() => {
        processQueue();
    }, [apiQueue])

    const handleSubmitSearch = () => {
        if (social.search.length > 0 && social.search.trim() === '') return;

        if (social.hasSearch && social.search.trim() === '') {
            setSocial((prev) => ({
                ...prev,
                data: {
                    user: [],
                    team: []
                },
                offset: 0,
                hasMore: true,
                pending: true
            }))
            setApiQueue((prev) => [...prev, { type: "fetch" }]);
            return;
        }

        setSocial((prev) => ({
            ...prev,
            data: {
                user: [],
                team: []
            },
            offset: 0,
            hasMore: true,
            hasSearch: true,
            pending: true
        }))
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    useEffect(() => {
        handleSubmitSearch();
    }, [social.search])

    useEffect(() => {
        setSocial((prev) => ({
            ...prev,
            offset: 0,
            hasMore: true,
            pending: true,
            data: {
                user: [],
                team: []
            }
        }))
        setApiQueue((prev) => [
            ...prev,
            {
                type: 'fetch'
            }
        ])
    }, [filter])

    const refetchData = () => {
        setSocial((prev) => ({
            ...prev,
            error: null,
            data: {
                user: [],
                team: []
            },
            pending: true,
            offset: 0,
            hasMore: true
        }));
        // Queue it so the fetch runs after the reset above is applied
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    const setSearch = (data) => setSocial((prev) => ({ ...prev, search: data }));

    const isVisible = state !== false;
    const people = social.data[filter.toLowerCase()] || [];
    const isInitialLoading = social.pending && social.offset === 0;
    const hasQuery = social.search.trim().length > 0;
    const countLabel = `${people.length}${social.hasMore ? '+' : ''} ${people.length === 1 ? 'person' : 'people'}`;
    const listLabel = isInitialLoading
        ? 'Loading people...'
        : `${countLabel}${hasQuery ? ` matching "${social.search.trim()}"` : ''}`;

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Contacts</h1>
                    <p className="max-w-[60ch] text-sm text-muted-foreground">
                        Find other CodeDev learners by username, see their level and open their profile.
                    </p>
                </div>
                {typeof setState === 'function' && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="self-start sm:self-auto"
                        onClick={() => setState(false)}
                        aria-label="Close contacts"
                    >
                        <LuX />
                    </Button>
                )}
            </header>

            <section className="w-full" aria-label="Search people">
                {/* Without `submit`, the search bar applies the typed value through setSearch, which triggers the search effect. */}
                <SearchBar
                    placeholder="Search by username..."
                    search={social.search}
                    setSearch={setSearch}
                    pending={social.pending}
                    isFilter={false}
                />
            </section>

            {isVisible && (
                <section aria-labelledby="contacts-list-heading" className="flex flex-col gap-3">
                    <h2 id="contacts-list-heading" className="flex min-h-8 items-center gap-2 text-sm font-medium text-foreground">
                        <LuUsers className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span aria-live="polite">{listLabel}</span>
                    </h2>

                    {isInitialLoading ? (
                        <ul className="m-0 list-none divide-y overflow-hidden rounded-lg border bg-card p-0" aria-busy="true">
                            {Array.from({ length: 6 }, (_, index) => <PersonSkeleton key={index} />)}
                        </ul>
                    ) : social.error ? (
                        <ErrorReload data={social.error} refetch={refetchData} />
                    ) : people.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
                            <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                <LuUserSearch className="size-5" aria-hidden="true" />
                            </span>
                            <div className="space-y-1">
                                <h3 className="text-sm font-semibold">
                                    {hasQuery ? 'No one matches this username' : 'No other learners yet'}
                                </h3>
                                <p className="max-w-[48ch] text-sm text-muted-foreground">
                                    {hasQuery
                                        ? 'Check the spelling or try a shorter part of the username.'
                                        : 'People you are not connected with yet will appear here as they join.'}
                                </p>
                            </div>
                            {hasQuery && (
                                <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                                    Clear search
                                </Button>
                            )}
                        </div>
                    ) : (
                        <ul className="m-0 list-none divide-y overflow-hidden rounded-lg border bg-card p-0">
                            {people.map((item) => {
                                const name = item.username || item.name || 'Unknown user';
                                return (
                                    <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                                        <Avatar className="size-9">
                                            <AvatarImage src={item.image || undefined} alt="" className="object-cover" />
                                            <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
                                                {initials(name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <p className="m-0 truncate text-sm font-medium text-foreground">
                                                {item.showProfile && item.username ? (
                                                    <Link
                                                        href={`/profile/${encodeURIComponent(item.username)}`}
                                                        aria-label={`View profile of ${name}`}
                                                        className="rounded-sm hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                                    >
                                                        {name}
                                                    </Link>
                                                ) : name}
                                            </p>
                                            <p className="m-0 truncate text-xs text-muted-foreground">
                                                {item.nickname && item.nickname !== 'None' ? item.nickname : 'No nickname'}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                                            {item.rank ? <RankBadge tier={item.rank.tier} title={item.rank.title} /> : null}
                                            <LevelBadge level={item.level} title={item.levelTitle} className="[&>span]:max-sm:hidden" />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {!isInitialLoading && !social.error && people.length > 0 && (
                        <div className="flex min-h-8 items-center justify-center text-xs text-muted-foreground">
                            {!social.pending && social.hasMore ? (
                                <span ref={setRef} className="flex items-center gap-2">
                                    <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                                    Loading more people...
                                </span>
                            ) : !social.hasMore ? (
                                <span>End of the list</span>
                            ) : null}
                        </div>
                    )}
                </section>
            )}
        </div>
    )
}
