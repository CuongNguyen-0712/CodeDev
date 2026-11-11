'use client'

import { Suspense } from "react";
import { useSelectedLayoutSegment } from "next/navigation";

import Inbox from "@/components/chat/inbox";
import { cn } from "@/lib/utils";

import { Skeleton } from "@/components/shadcn/skeleton";

// The layout owns the two-column frame and reads the open segment (null on /messages), so pages stay
// plain content. Below 768px one column shows: the inbox on /messages, the pane on /messages/[id].
// Pure CSS (`md:`), so nothing flashes on load. 3rem = the navbar (h-12).
export default function MessagesLayout({ children }) {
    const segment = useSelectedLayoutSegment();
    const open = segment !== null;

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <h1 className="sr-only">Messages</h1>
            <div className="grid min-h-[calc(100svh-3rem-6rem)] md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:gap-6">
                <aside className={cn("min-w-0", open && "max-md:hidden")} aria-label="Conversations">
                    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                        <Inbox activeId={segment} />
                    </Suspense>
                </aside>
                <section className={cn("min-w-0", !open && "max-md:hidden")}>{children}</section>
            </div>
        </div>
    );
}
