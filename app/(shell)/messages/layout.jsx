'use client'

import { Suspense } from "react";
import { useSelectedLayoutSegment } from "next/navigation";

import { CHAT_COLUMN, CHAT_GRID_HEIGHT, CHAT_LAYOUT_HEIGHT, CHAT_LAYOUT_PADDING } from "@/components/chat/chatHeight";
import Inbox from "@/components/chat/inbox";
import { cn } from "@/lib/utils";

import { Skeleton } from "@/components/shadcn/skeleton";

// The layout owns the two-column frame and reads the open segment (null on /messages), so pages stay
// plain content. Below 768px one column shows: the inbox on /messages, the pane on /messages/[id].
// Pure CSS (`md:`), so nothing flashes on load. Height: components/chat/chatHeight.js.
export default function MessagesLayout({ children }) {
    const segment = useSelectedLayoutSegment();
    const open = segment !== null;

    return (
        <div className={cn("mx-auto flex w-full max-w-6xl flex-col gap-6", CHAT_LAYOUT_HEIGHT, CHAT_LAYOUT_PADDING)}>
            <h1 className="sr-only">Messages</h1>
            <div className={cn("grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:gap-6", CHAT_GRID_HEIGHT)}>
                <aside className={cn(CHAT_COLUMN, open && "max-md:hidden")} aria-label="Conversations">
                    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                        <Inbox activeId={segment} />
                    </Suspense>
                </aside>
                <section className={cn(CHAT_COLUMN, !open && "max-md:hidden")}>{children}</section>
            </div>
        </div>
    );
}
