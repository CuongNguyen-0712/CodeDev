'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import { chatKeys } from "@/keys/chat.keys";

import { mergeOutbox } from "@/lib/chat/messageCache";
import { retryTransient } from "@/lib/queryTimes";
import { useMarkRead } from "@/mutations/chat.mutation";
import { chatQueries } from "@/queries/chat.query";
import { selectUnsent, useChatOutboxStore } from "@/stores/chatOutboxStore";

import MessageBubble from "@/components/chat/messageBubble";
import TypingLine from "@/components/chat/typingLine";
import { ErrorReload } from "@/components/ui/error";

import { Button } from "@/components/shadcn/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";

import { LuMessageSquare } from "react-icons/lu";

const BOTTOM_SLACK = 48;   // px from the end that still counts as "at the bottom"

/** A 404 means the conversation is gone for this member (left, hidden, declined): leave it and refresh the inbox (spec section 10). */
export function useLeaveWhenGone(error) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const gone = error?.status === 404;
    useEffect(() => {
        if (!gone) return;
        for (const queryKey of [chatKeys.inbox("all"), chatKeys.inbox("requests"), chatKeys.unread()]) queryClient.invalidateQueries({ queryKey });
        router.replace("/messages");
    }, [gone, queryClient, router]);
    return gone;
}

export function EmptyThread() {
    return (
        <Empty className="m-auto border border-dashed">
            <EmptyHeader>
                <EmptyMedia variant="icon"><LuMessageSquare aria-hidden="true" /></EmptyMedia>
                <EmptyTitle>Say hello</EmptyTitle>
                <EmptyDescription>Messages you send appear here.</EmptyDescription>
            </EmptyHeader>
        </Empty>
    );
}

function ThreadSkeleton() {
    return (
        <div className="flex flex-col gap-3 p-4" aria-busy="true">
            {[false, true, false].map((mine, i) => (
                <Skeleton key={i} className={mine ? "h-10 w-1/2 self-end rounded-2xl" : "h-14 w-2/3 rounded-2xl"} />
            ))}
        </div>
    );
}

/**
 * The thread, oldest at the top. "Load earlier" keeps the reading position; new messages scroll into view
 * only when the reader is already at the bottom, and only then (tab visible) is the newest server seq marked read.
 */
export default function MessageList({ conversation, meId, failures, ...handlers }) {
    const id = conversation.id;
    const query = useInfiniteQuery({ ...chatQueries.messages(id), retry: retryTransient });
    const unsent = useChatOutboxStore(selectUnsent(id));
    const markRead = useMarkRead(meId);

    const serverItems = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
    // Newest first in the cache; the thread reads top to bottom.
    const items = useMemo(() => [...mergeOutbox(serverItems, unsent)].reverse(), [serverItems, unsent]);
    const others = useMemo(() => conversation.members.filter((m) => m.id !== meId), [conversation.members, meId]);
    // Server items only: an unsent message has no seq.
    const newestSeq = serverItems[0]?.seq ?? null;

    const scroller = useRef(null);
    const atBottom = useRef(true);
    const marked = useRef(null);
    const fromBottom = useRef(null);   // distance from the end, saved while an older page loads
    const pageCount = query.data?.pages.length ?? 0;

    const markIfSeen = useCallback(() => {
        if (!newestSeq || newestSeq === marked.current || !atBottom.current || document.visibilityState !== "visible") return;
        marked.current = newestSeq;
        markRead(id, newestSeq);
    }, [id, newestSeq, markRead]);

    useLayoutEffect(() => {
        const el = scroller.current;
        if (!el) return;
        if (fromBottom.current !== null) {
            el.scrollTop = el.scrollHeight - fromBottom.current;
            fromBottom.current = null;
        } else if (atBottom.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [items, pageCount]);

    useEffect(() => {
        markIfSeen();
        document.addEventListener("visibilitychange", markIfSeen);
        return () => document.removeEventListener("visibilitychange", markIfSeen);
    }, [markIfSeen]);

    const onScroll = () => {
        const el = scroller.current;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
        if (atBottom.current) markIfSeen();
    };

    // The typing bubble grows the thread: a reader at the bottom stays there.
    const keepAtBottom = useCallback(() => {
        const el = scroller.current;
        if (el && atBottom.current) el.scrollTop = el.scrollHeight;
    }, []);

    const loadEarlier = () => {
        const el = scroller.current;
        fromBottom.current = el.scrollHeight - el.scrollTop;
        query.fetchNextPage();
    };

    const gone = useLeaveWhenGone(query.error);

    if (query.isPending || gone) return <div className="min-h-0 flex-1"><ThreadSkeleton /></div>;
    if (query.isError && items.length === 0) {
        return <div className="min-h-0 flex-1 p-4"><ErrorReload data={query.error} refetch={() => query.refetch()} title="Could not load the messages" /></div>;
    }

    return (
        <div ref={scroller} onScroll={onScroll} role="log" aria-label="Messages" tabIndex={0} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4">
            {query.hasNextPage && (
                <div className="flex justify-center pb-3">
                    <Button type="button" variant="outline" size="sm" onClick={loadEarlier} disabled={query.isFetchingNextPage}>
                        {query.isFetchingNextPage && <Spinner />}
                        Load earlier
                    </Button>
                </div>
            )}
            {items.length === 0 ? <EmptyThread /> : (
                <ul className="m-0 mt-auto flex list-none flex-col gap-3 p-0">
                    {items.map((message) => (
                        <MessageBubble
                            key={message.clientId || message.id}
                            message={message}
                            mine={message.sender?.id === meId}
                            others={others}
                            showSender={conversation.kind === "team"}
                            failure={failures[message.clientId]}
                            {...handlers}
                        />
                    ))}
                </ul>
            )}
            <TypingLine conversationId={id} members={conversation.members} meId={meId} onShow={keepAtBottom} />
        </div>
    );
}
