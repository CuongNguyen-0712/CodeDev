'use client'

import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { userQueries } from "@/queries/user.query";
import { useDismissNotifications, useMarkNotificationsRead } from "@/mutations/user.mutation";

import { ErrorReload } from "@/components/ui/error";
import { NotificationEmpty, NotificationItem, NotificationSkeleton } from "@/components/ui/notificationCenter";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";

import { LuBell, LuCheck, LuLoaderCircle, LuMailOpen } from "react-icons/lu";

const TABS = ['all', 'unread'];

function LoadMore({ hasNextPage, isFetchingNextPage, fetchNextPage, isError }) {
    if (isError) {
        return (
            <div className="flex justify-center py-3 text-sm text-muted-foreground" role="alert">
                <span className="flex items-center gap-2">
                    Could not load more notifications.
                    <Button variant="link" size="xs" onClick={() => fetchNextPage()}>Try again</Button>
                </span>
            </div>
        );
    }
    if (!hasNextPage) return null;
    return (
        <div className="flex justify-center py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage && <LuLoaderCircle className="animate-spin" aria-hidden="true" />}
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
            </Button>
        </div>
    );
}

function NotificationList({ status, unread }) {
    const query = useInfiniteQuery(userQueries.notifications(status, { unread }));
    const markRead = useMarkNotificationsRead();
    const dismiss = useDismissNotifications();
    const items = query.data?.pages?.flatMap((page) => page?.items || []) ?? [];
    const isLoading = query.isLoading || status === 'loading';

    if (!isLoading && query.isError && items.length === 0) {
        return <ErrorReload data={query.error} refetch={() => query.refetch()} title="Could not load your notifications" />;
    }

    if (!isLoading && items.length === 0) {
        return <NotificationEmpty unreadOnly={unread} className="border border-dashed" />;
    }

    return (
        <div className="flex flex-col">
            <div className="divide-y overflow-hidden rounded-lg border" aria-busy={isLoading}>
                {isLoading
                    ? <NotificationSkeleton rows={5} />
                    : items.map((item) => (
                        <NotificationItem
                            key={item.id}
                            item={item}
                            onOpen={(it) => { if (!it.read) markRead.mutate({ ids: [it.id] }); }}
                            onDismiss={(it) => dismiss.mutate([it.id])}
                        />
                    ))}
            </div>
            <LoadMore
                hasNextPage={query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                fetchNextPage={query.fetchNextPage}
                isError={query.isError && items.length > 0}
            />
        </div>
    );
}

export default function NotificationsPage() {
    const { status } = useSession();
    const searchParams = useSearchParams();
    const requested = searchParams?.get('tab');
    const defaultTab = TABS.includes(requested) ? requested : 'all';
    const markRead = useMarkNotificationsRead();
    const first = useInfiniteQuery(userQueries.notifications(status)).data?.pages?.[0];
    const unreadCount = first?.unreadCount ?? 0;
    // The line under the title states what the data says, not what the page is for.
    const finding = !first ? null
        : unreadCount > 0 ? `${unreadCount} unread`
        : first.items?.length ? "You're all caught up" : "No notifications yet";

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        Notifications
                    </h1>
                    {finding ? (
                        <p className="text-sm text-muted-foreground tabular" aria-live="polite">{finding}</p>
                    ) : (
                        <Skeleton className="h-4 w-28" />
                    )}
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { if (unreadCount > 0) markRead.mutate({ all: true }); }}
                    aria-disabled={unreadCount === 0}
                    disabled={markRead.isPending}
                    className={unreadCount === 0 ? "cursor-default text-muted-foreground hover:bg-transparent hover:text-muted-foreground" : undefined}
                >
                    <LuCheck aria-hidden="true" />
                    Mark all read
                </Button>
            </header>

            <Tabs defaultValue={defaultTab} className="gap-4">
                <TabsList>
                    <TabsTrigger value="all"><LuBell aria-hidden="true" />All</TabsTrigger>
                    <TabsTrigger value="unread">
                        <LuMailOpen aria-hidden="true" />Unread
                        {unreadCount > 0 && <span className="text-muted-foreground tabular">{unreadCount}</span>}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                    <NotificationList status={status} unread={false} />
                </TabsContent>
                <TabsContent value="unread">
                    <NotificationList status={status} unread />
                </TabsContent>
            </Tabs>
        </div>
    );
}
