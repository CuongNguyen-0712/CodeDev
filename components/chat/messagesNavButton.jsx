'use client';

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { chatQueries } from "@/queries/chat.query";

import { Button } from "@/components/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

import { LuMessageSquare } from "react-icons/lu";

export default function MessagesNavButton() {
    const { status } = useSession();
    const data = useQuery({ ...chatQueries.unread(), enabled: status === 'authenticated' }).data;
    // What the live region last announced; only a rise in the unread count is spoken.
    const [live, setLive] = useState({ count: null, message: '' });

    const unread = data?.unread ?? 0;
    if (data && live.count !== unread) {
        const added = live.count === null ? 0 : unread - live.count;
        setLive({ count: unread, message: added > 0 ? `${added} new message${added > 1 ? 's' : ''}` : live.message });
    }

    if (status !== 'authenticated') return null;

    return (
        <>
            <span className="sr-only" aria-live="polite" role="status">{live.message}</span>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="relative size-8 text-muted-foreground hover:text-foreground"
                    >
                        <Link href="/messages" aria-label={`Messages, ${unread} unread`}>
                            <LuMessageSquare className="size-4" />
                            {unread > 0 && (
                                <span
                                    aria-hidden="true"
                                    className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground tabular ring-2 ring-background"
                                >
                                    {unread > 9 ? '9+' : unread}
                                </span>
                            )}
                        </Link>
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Messages</TooltipContent>
            </Tooltip>
        </>
    );
}
