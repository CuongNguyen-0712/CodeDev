'use client';

import Link from "next/link";
import { useSession } from "next-auth/react";

import useInfiniteScroll from "@/hooks/useInfiniteScroll";
import { ErrorReload } from "@/components/ui/error";
import { LevelBadge, RankBadge } from "@/components/ui/level";
import UserAvatar from "@/components/chat/userAvatar";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";

import { LuLoaderCircle, LuMessageSquare } from "react-icons/lu";

const LIST = "m-0 list-none divide-y overflow-hidden rounded-lg border bg-card p-0";

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

/**
 * One person on /contact: avatar, username (linked when the profile is public), nickname ('None' means unset),
 * level and actions; Message for anyone but me.
 */
export function PersonRow({ item, actions, index = 0 }) {
    const { data: session } = useSession();
    const name = item.username || 'Unknown user';
    return (
        <li className="animate-enter flex items-center gap-3 px-4 py-3" style={{ '--enter-index': index % 20 }}>
            <UserAvatar name={name} image={item.image} />
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
                <div className="flex items-center gap-2">
                    {item.rank ? <RankBadge tier={item.rank.tier} title={item.rank.title} /> : null}
                    <LevelBadge level={item.level} title={item.levelTitle} className="[&>span]:max-sm:hidden" />
                </div>
                <div className="flex items-center gap-2">
                    {actions}
                    {session?.user?.id && item.id !== session.user.id ? (
                        <Button asChild variant="outline" size="sm">
                            <Link href={`/messages/new?to=${encodeURIComponent(item.id)}`} aria-label={`Message ${name}`}>
                                <LuMessageSquare aria-hidden="true" />
                                <span className="max-sm:sr-only">Message</span>
                            </Link>
                        </Button>
                    ) : null}
                </div>
            </div>
        </li>
    );
}

/** Dashed empty state shared by the /contact lists. */
export function PeopleEmpty({ icon: Icon, title, description, children }) {
    return (
        <Empty className="border border-dashed">
            <EmptyHeader>
                <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>
                <EmptyTitle>{title}</EmptyTitle>
                <EmptyDescription className="max-w-[48ch]">{description}</EmptyDescription>
            </EmptyHeader>
            {children && <EmptyContent>{children}</EmptyContent>}
        </Empty>
    );
}

/**
 * An infinite list of people from a useInfiniteQuery result: skeleton, first-load error, `empty`, rows, then the
 * scroll sentinel. `noun` names the rows in the footer lines ("Loading more friends...").
 */
export function PersonList({ query, noun, errorTitle, empty, renderRow }) {
    const { status } = useSession();
    const { data, isLoading, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, isPlaceholderData } = query;
    const items = data?.pages?.flatMap((page) => page?.items || []) || [];
    const canLoad = hasNextPage && !isPlaceholderData && !isError;

    const { setRef } = useInfiniteScroll({
        hasMore: canLoad,
        isLoading: isFetchingNextPage,
        onLoadMore: () => { if (canLoad) fetchNextPage(); },
    });

    // The query waits for the session; until then show the skeleton, not the empty state.
    if ((status === 'loading' || isLoading) && items.length === 0) {
        return (
            <ul className={LIST} aria-busy="true">
                {Array.from({ length: 6 }, (_, index) => <PersonSkeleton key={index} />)}
            </ul>
        );
    }
    if (isError && items.length === 0) {
        return <ErrorReload data={error || { status: 500, message: errorTitle }} refetch={() => refetch()} title={errorTitle} />;
    }
    if (items.length === 0) return empty;

    return (
        <>
            <ul className={LIST}>{items.map(renderRow)}</ul>
            <div className="flex min-h-8 items-center justify-center text-xs text-muted-foreground">
                {isFetchingNextPage ? (
                    <span className="flex items-center gap-2">
                        <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                        Loading more {noun}...
                    </span>
                ) : isError ? (
                    <span className="flex items-center gap-2 text-sm" role="alert">
                        Could not load more {noun}.
                        <Button variant="link" size="xs" onClick={() => fetchNextPage()}>Try again</Button>
                    </span>
                ) : hasNextPage ? (
                    <span ref={setRef} className="flex items-center gap-2">
                        <Button variant="link" size="xs" onClick={() => fetchNextPage()}>Load more</Button>
                    </span>
                ) : (
                    <span>End of the list</span>
                )}
            </div>
        </>
    );
}
