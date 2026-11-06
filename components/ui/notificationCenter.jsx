'use client';

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { userQueries } from "@/queries/user.query";
import { useMarkNotificationsRead } from "@/mutations/user.mutation";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ErrorReload } from "@/components/ui/error";
import { Button } from "@/components/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";

import { notificationKind } from "@/constants/notifications";

import { LuBell, LuCheck, LuX } from "react-icons/lu";

/**
 * One inbox row; shared by the bell, /notifications and the admin composer preview (`preview`:
 * not a link). `onDismiss` adds a remove button beside the link (never inside it).
 */
export function NotificationItem({ item, onOpen, onDismiss, compact = false, preview = false }) {
    const { icon: Icon, className, team } = notificationKind(item.kind);
    const Row = preview ? 'div' : Link;
    const rowProps = preview ? {} : { href: item.link || '/notifications', onClick: () => onOpen?.(item) };
    // Unread is told by ink (foreground vs muted) and the dot, never by a background tint alone.
    const ink = item.read ? "text-muted-foreground" : "text-foreground";

    return (
        <div className="group relative flex items-start transition-colors hover:bg-muted/50">
            <Row
                {...rowProps}
                className={cn(
                    "flex min-w-0 flex-1 items-start gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    compact ? "p-3" : "px-4 py-4",
                    onDismiss && "pr-12"
                )}
            >
                <span className="flex w-5 shrink-0 justify-center pt-0.5">
                    <Icon className={cn("size-4", className)} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                    <p className={cn("truncate text-sm", item.read ? "font-medium" : "font-semibold", ink)}>
                        {item.title}
                    </p>
                    <p className={cn("line-clamp-2 text-xs", ink)}>
                        {item.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {team && <>CodeDev team · </>}
                        <time dateTime={item.createdAt}>{formatRelative(item.createdAt)}</time>
                    </p>
                </div>
                {!item.read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-ink">
                        <span className="sr-only">Unread</span>
                    </span>
                )}
            </Row>
            {onDismiss && (
                <Button
                    type="button"
                    variant="ghost"
                    size={compact ? "icon-xs" : "icon-sm"}
                    onClick={() => onDismiss(item)}
                    aria-label={`Remove notification: ${item.title}`}
                    className="absolute top-3 right-2 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground max-md:opacity-100"
                >
                    <LuX aria-hidden="true" />
                </Button>
            )}
        </div>
    );
}

export function NotificationSkeleton({ rows = 3, compact = false }) {
    return Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn("flex items-start gap-3", compact ? "p-3" : "px-4 py-4")} aria-hidden="true">
            <Skeleton className="mt-0.5 size-4 rounded-full" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-16" />
            </div>
        </div>
    ));
}

/** The page's empty list: the frame stays, the copy says what will appear here. */
export function NotificationEmpty({ unreadOnly = false, className }) {
    return (
        <Empty className={className}>
            <EmptyHeader>
                <EmptyMedia variant="icon"><LuBell aria-hidden="true" /></EmptyMedia>
                <EmptyTitle>{unreadOnly ? "You're all caught up" : "No notifications yet"}</EmptyTitle>
                <EmptyDescription>
                    {unreadOnly ? "New notifications land here until you read them." : "Course access, level-ups, achievements and messages from the team land here."}
                </EmptyDescription>
            </EmptyHeader>
        </Empty>
    );
}

export default function NotificationCenter() {
    const { status } = useSession();
    const query = useInfiniteQuery(userQueries.notifications(status));
    const markRead = useMarkNotificationsRead();
    const [open, setOpen] = useState(false);
    // What the live region last announced; only a rise in the unread count is spoken.
    const [live, setLive] = useState({ count: null, message: '' });

    const first = query.data?.pages?.[0];
    const items = first?.items ?? [];
    const unreadCount = first?.unreadCount ?? 0;

    if (first && live.count !== unreadCount) {
        const added = live.count === null ? 0 : unreadCount - live.count;
        setLive({ count: unreadCount, message: added > 0 ? `${added} new notification${added > 1 ? 's' : ''}` : live.message });
    }

    if (status !== 'authenticated') return null;

    const markAllRead = () => {
        if (unreadCount > 0) markRead.mutate({ all: true });
    };

    const handleOpen = (item) => {
        if (!item.read) markRead.mutate({ ids: [item.id] });
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <span className="sr-only" aria-live="polite" role="status">{live.message}</span>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="relative size-8 text-muted-foreground hover:text-foreground"
                            aria-label={`Notifications (${unreadCount} unread)`}
                        >
                            <LuBell className="size-4" />
                            {unreadCount > 0 && (
                                <span
                                    aria-hidden="true"
                                    className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground tabular ring-2 ring-background"
                                >
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Notifications</TooltipContent>
            </Tooltip>

            <PopoverContent align="end" className="w-80 p-0 sm:w-96">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                    <p className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold">Notifications</span>
                        {unreadCount > 0 && <span className="text-xs text-muted-foreground tabular">{unreadCount} unread</span>}
                    </p>
                    {/* Always mounted, so focus stays on it after "mark all read"; nothing to do reads as plain muted text, not faded. */}
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={markAllRead}
                        aria-disabled={unreadCount === 0}
                        className={cn("text-xs text-muted-foreground", unreadCount === 0 ? "cursor-default hover:bg-transparent" : "hover:text-foreground")}
                    >
                        <LuCheck className="mr-1 size-3" aria-hidden="true" />
                        Mark all read
                    </Button>
                </div>

                <div className="max-h-96 divide-y overflow-y-auto" aria-busy={query.isLoading}>
                    {query.isLoading ? (
                        <NotificationSkeleton compact />
                    ) : query.isError && items.length === 0 ? (
                        <ErrorReload data={query.error} refetch={() => query.refetch()} compact title="Could not load notifications" />
                    ) : items.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
                    ) : (
                        items.map((item) => <NotificationItem key={item.id} item={item} onOpen={handleOpen} compact />)
                    )}
                </div>

                <div className="border-t px-4 py-2 text-center">
                    <Button asChild variant="link" size="xs">
                        <Link href="/notifications" onClick={() => setOpen(false)}>View all</Link>
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
