import Link from "next/link";

import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import UserAvatar from "@/components/chat/userAvatar";
import { Skeleton } from "@/components/shadcn/skeleton";

export function ConversationRow({ item, active = false }) {
    const title = item.title || "Conversation";
    // Unread is told by ink (foreground vs muted) and the dot, never by a background tint alone.
    const ink = item.unread ? "text-foreground" : "text-muted-foreground";

    return (
        <Link
            href={`/messages/${item.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
                "flex min-w-0 items-start gap-3 px-4 py-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                active && "bg-muted/50"
            )}
        >
            <UserAvatar name={title} image={item.image} />
            <div className="min-w-0 flex-1 space-y-0.5">
                <p className={cn("truncate text-sm", item.unread ? "font-semibold" : "font-medium", ink)}>{title}</p>
                <p className={cn("line-clamp-2 text-xs", ink)}>{item.lastMessage?.preview || "No messages yet"}</p>
                {item.lastMessageAt && (
                    <p className="text-xs text-muted-foreground">
                        <time dateTime={item.lastMessageAt}>{formatRelative(item.lastMessageAt)}</time>
                    </p>
                )}
            </div>
            {item.unread && (
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-ink">
                    <span className="sr-only">Unread</span>
                </span>
            )}
        </Link>
    );
}

export function ConversationSkeleton({ rows = 5 }) {
    return Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-4" aria-hidden="true">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-5/6" />
            </div>
        </div>
    ));
}
