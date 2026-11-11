'use client';

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { userQueries } from "@/queries/user.query";
import useInfiniteScroll from "@/hooks/useInfiniteScroll";
import { ErrorReload } from "../ui/error";
import SearchBar from "../ui/searchBar";
import { LevelBadge, RankBadge } from "@/components/ui/level";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";

import { LuLoaderCircle, LuMessageSquare, LuUsers, LuUserSearch, LuX } from "react-icons/lu";

function initials(name = '') {
    const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
    return (parts[0]?.[0] || 'U').concat(parts[1]?.[0] || '').toUpperCase();
}

function PersonSkeleton() {
    return (
        <li className="flex items-center gap-3 px-4 py-3" aria-hidden="true">
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

export default function Contact({ state, setState }) {
    const { data: session, status } = useSession();
    const [search, setSearch] = useState('');

    const {
        data,
        isLoading,
        isError,
        error,
        refetch,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
        isPlaceholderData,
    } = useInfiniteQuery(userQueries.users(status, search));

    const { setRef } = useInfiniteScroll({
        hasMore: hasNextPage && !isPlaceholderData,
        isLoading: isFetchingNextPage,
        onLoadMore: () => {
            if (hasNextPage && !isPlaceholderData) {
                fetchNextPage();
            }
        },
    });

    const people = data?.pages?.flatMap((page) => page?.items || []) || [];
    const isVisible = state !== false;
    const hasQuery = search.trim().length > 0;
    // The query waits for the session; until then show the skeleton, not "no learners".
    const isInitialLoading = (status === 'loading' || isLoading) && people.length === 0;

    const countLabel = `${people.length}${hasNextPage ? '+' : ''} ${people.length === 1 ? 'person' : 'people'}`;
    const listLabel = isInitialLoading
        ? 'Loading people...'
        : `${countLabel}${hasQuery ? ` matching "${search.trim()}"` : ''}`;

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        Find learners
                    </h1>
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
                <SearchBar
                    placeholder="Search by username..."
                    search={search}
                    setSearch={setSearch}
                    pending={isLoading}
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
                    ) : isError ? (
                        <ErrorReload data={error || { status: 500, message: "Could not load learners" }} refetch={refetch} />
                    ) : people.length === 0 ? (
                        <Empty className="border">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <LuUserSearch aria-hidden="true" />
                                </EmptyMedia>
                                <EmptyTitle>
                                    <h3 className="text-base font-semibold">
                                        {hasQuery ? 'No one matches this username' : 'No other learners yet'}
                                    </h3>
                                </EmptyTitle>
                                <EmptyDescription className="max-w-[48ch]">
                                    {hasQuery
                                        ? 'Check the spelling or try a shorter part of the username.'
                                        : 'People you are not connected with yet will appear here as they join.'}
                                </EmptyDescription>
                            </EmptyHeader>
                            {hasQuery && (
                                <EmptyContent>
                                    <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                                        Clear search
                                    </Button>
                                </EmptyContent>
                            )}
                        </Empty>
                    ) : (
                        <ul className="m-0 list-none divide-y overflow-hidden rounded-lg border bg-card p-0">
                            {people.map((item, index) => {
                                const name = item.username || item.name || 'Unknown user';
                                return (
                                    <li key={item.id} className="animate-enter flex items-center gap-3 px-4 py-3" style={{ '--enter-index': index % 20 }}>
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
                                            {session?.user?.id && item.id !== session.user.id ? (
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/messages/new?to=${encodeURIComponent(item.id)}`} aria-label={`Message ${name}`}>
                                                        <LuMessageSquare aria-hidden="true" />
                                                        <span className="max-sm:sr-only">Message</span>
                                                    </Link>
                                                </Button>
                                            ) : null}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {!isInitialLoading && !isError && people.length > 0 && (
                        <div className="flex min-h-8 items-center justify-center text-xs text-muted-foreground">
                            {isFetchingNextPage ? (
                                <span className="flex items-center gap-2">
                                    <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                                    Loading more people...
                                </span>
                            ) : hasNextPage ? (
                                <span ref={setRef} className="flex items-center gap-2">
                                    <Button variant="link" size="xs" onClick={() => fetchNextPage()}>
                                        Load more
                                    </Button>
                                </span>
                            ) : (
                                <span>End of the list</span>
                            )}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
