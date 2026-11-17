'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import { chatKeys } from "@/keys/chat.keys";

import { mergeOutbox, older } from "@/lib/chat/messageCache";
import { retryTransient } from "@/lib/queryTimes";
import { useMarkRead } from "@/mutations/chat.mutation";
import useInfiniteScroll from "@/hooks/useInfiniteScroll";
import { chatQueries } from "@/queries/chat.query";
import { selectUnsent, useChatOutboxStore } from "@/stores/chatOutboxStore";

import { groupFlags } from "@/components/chat/messageGroups";
import MessageBubble from "@/components/chat/messageBubble";
import TypingLine from "@/components/chat/typingLine";
import { showAlert } from "@/components/ui/alert";
import { ErrorReload } from "@/components/ui/error";

import { Button } from "@/components/shadcn/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";

import { LuArrowDown, LuMessageSquare } from "react-icons/lu";

const BOTTOM_SLACK = 48;   // px from the end that still counts as "at the bottom"
// Once scrolled up, the reader is back at the bottom only this close to the end. Scrolling up hides the in-list
// typing bubble (pt-3 + 32px row = 44px), so the thread shrinks by that much: with one threshold the reader would
// count as back at the bottom, the bubble would return and keepAtBottom would snap the thread down.
const RETURN_SLACK = BOTTOM_SLACK - 44;
const FLASH_MS = 1500;
const distanceToEnd = (el) => el.scrollHeight - el.scrollTop - el.clientHeight;

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
        // Compact (gap-3 p-4): on a phone the pane leaves the thread only a few lines above the composer.
        <Empty className="m-auto flex-none gap-3 border border-dashed p-4 md:p-6">
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
 * The thread, oldest at the top. Earlier messages load when the sentinel at the top nears view, and the reading position is kept; new messages scroll into view
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
    const groups = useMemo(() => groupFlags(items), [items]);
    const others = useMemo(() => conversation.members.filter((m) => m.id !== meId), [conversation.members, meId]);
    // Server items only: an unsent message has no seq.
    const newestSeq = serverItems[0]?.seq ?? null;

    const scroller = useRef(null);
    const [scrollRoot, setScrollRoot] = useState(null);   // the scroller as state: the observer re-attaches once it exists
    const setScroller = useCallback((node) => { scroller.current = node; setScrollRoot(node); }, []);
    const atBottom = useRef(true);
    const [scrolledUp, setScrolledUp] = useState(false);   // atBottom mirrored into state, to show the jump button
    const [seenSeq, setSeenSeq] = useState(null);          // newest server seq when the reader left the bottom
    const marked = useRef(null);
    const fromBottom = useRef(null);   // distance from the end, saved while an older page loads
    const pageCount = query.data?.pages.length ?? 0;
    const [flashId, setFlashId] = useState(null);   // the message a quote just jumped to
    const flashTimer = useRef(null);
    useEffect(() => () => clearTimeout(flashTimer.current), []);

    const markIfSeen = useCallback(() => {
        if (!newestSeq || newestSeq === marked.current || !atBottom.current || document.visibilityState !== "visible") return;
        marked.current = newestSeq;
        markRead(id, newestSeq);
    }, [id, newestSeq, markRead]);

    // Others' messages newer than what the reader last saw at the bottom.
    const newSinceScroll = useMemo(() => {
        if (!scrolledUp || seenSeq === null) return 0;
        return serverItems.filter((m) => m.sender?.id !== meId && older(seenSeq, m.seq)).length;
    }, [scrolledUp, seenSeq, serverItems, meId]);

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
        if (fromBottom.current !== null) fromBottom.current = el.scrollHeight - el.scrollTop;   // a page is loading: restore to where the reader is now
        atBottom.current = distanceToEnd(el) < (scrolledUp ? RETURN_SLACK : BOTTOM_SLACK);
        if (!atBottom.current && !scrolledUp) setSeenSeq(newestSeq);   // leaving the bottom: everything up to here was seen
        setScrolledUp(!atBottom.current);
        if (atBottom.current) markIfSeen();
    };

    const jumpToLatest = () => {
        const el = scroller.current;
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
        // The button unmounts at the bottom: keep keyboard focus on the thread, not <body>.
        el.focus({ preventScroll: true });
    };

    // A quote of a message that is not in the loaded pages cannot be scrolled to.
    const jumpTo = ({ id: messageId }) => {
        const target = scroller.current?.querySelector(`[data-message-id="${messageId}"]`);
        if (!target) return showAlert(0, "Original message is not loaded");
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        target.focus({ preventScroll: true });
        setFlashId(messageId);
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashId(null), FLASH_MS);
    };

    // The typing bubble grows the thread: a reader at the bottom stays there.
    const keepAtBottom = useCallback(() => {
        const el = scroller.current;
        if (el && atBottom.current) el.scrollTop = el.scrollHeight;
    }, []);

    // Images and other late content grow the list after layout: a reader at the bottom stays there. Reads atBottom, so it never fights the page-restore above.
    const listObserver = useRef(null);
    const setList = useCallback((node) => {
        listObserver.current?.disconnect();
        listObserver.current = null;
        if (!node) return;
        listObserver.current = new ResizeObserver(keepAtBottom);
        listObserver.current.observe(node);
    }, [keepAtBottom]);

    const loadEarlier = () => {
        const el = scroller.current;
        fromBottom.current = el.scrollHeight - el.scrollTop;
        // A failed fetch must not leave a saved position behind for the next items change to restore.
        query.fetchNextPage().then((result) => { if (result.isError) fromBottom.current = null; });
    };

    const { setRef: sentinelRef } = useInfiniteScroll({ hasMore: !!query.hasNextPage, onLoadMore: loadEarlier, isLoading: query.isFetchingNextPage, root: scrollRoot });

    const gone = useLeaveWhenGone(query.error);

    if (query.isPending || gone) return <div className="min-h-0 flex-1"><ThreadSkeleton /></div>;
    if (query.isError && items.length === 0) {
        return <div className="min-h-0 flex-1 p-4"><ErrorReload data={query.error} refetch={() => query.refetch()} title="Could not load the messages" /></div>;
    }

    return (
        // The jump button and the floating typing bar are absolute siblings of the scroller, so they do not scroll away.
        <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={setScroller} onScroll={onScroll} role="log" aria-label="Messages" tabIndex={0} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4">
            <div ref={sentinelRef} aria-hidden="true" className="h-px" />
            {/* Fixed height while more pages exist, so the spinner appearing never shifts the thread. */}
            {query.hasNextPage && (
                <div className="flex h-8 shrink-0 items-center justify-center">
                    {query.isFetchingNextPage && <Spinner aria-label="Loading earlier messages" />}
                </div>
            )}
            {items.length === 0 ? <EmptyThread /> : (
                <ul ref={setList} className="m-0 mt-auto flex list-none flex-col p-0">
                    {items.map((message, index) => (
                        <MessageBubble
                            key={message.clientId || message.id}
                            message={message}
                            {...groups[index]}
                            mine={message.sender?.id === meId}
                            meId={meId}
                            flash={flashId != null && message.id === flashId}   // outbox messages have id null: never match an idle flashId
                            onJump={jumpTo}
                            others={others}
                            showSender={conversation.kind === "team"}
                            failure={failures[message.clientId]}
                            {...handlers}
                        />
                    ))}
                </ul>
            )}
            <TypingLine conversationId={id} members={conversation.members} meId={meId} onShow={keepAtBottom} bubble={!scrolledUp} />
        </div>
        {scrolledUp && <TypingLine conversationId={id} members={conversation.members} meId={meId} floating />}
        {scrolledUp && (
            <Button type="button" size="icon" variant="secondary" onClick={jumpToLatest} className="absolute right-3 bottom-3 z-10 rounded-full shadow-md"
                aria-label={newSinceScroll > 0 ? `Jump to latest messages, ${newSinceScroll} new` : "Jump to latest messages"}>
                <LuArrowDown aria-hidden="true" />
                {newSinceScroll > 0 && (
                    <span aria-hidden="true" className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground tabular ring-2 ring-background">
                        {newSinceScroll > 99 ? "99+" : newSinceScroll}
                    </span>
                )}
            </Button>
        )}
        </div>
    );
}
