'use client';

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { useAdmin } from "@/components/admin/adminContext";
import { useAdminSetFeedbackHandled } from "@/mutations/premium.mutation";
import RowAction from "@/components/admin/ui/rowAction";
import { formatNumber, formatRelative } from "@/components/admin/ui/format";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuCheck, LuRotateCcw } from "react-icons/lu";

const STATES = [
    { value: "open", label: "Open" },
    { value: "handled", label: "Handled" },
    { value: "all", label: "All feedback" },
];

/** Feedback sent with "Send feedback" (feedback.read, docs/admin-panel-plan.md 11.3): read it, mark it handled. */
export default function FeedbackInbox() {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const [state, setState] = useState("open");
    const handle = useAdminSetFeedbackHandled();
    const query = useInfiniteQuery({
        queryKey: adminKeys.feedback({ state }),
        queryFn: ({ pageParam }) => adminClient.listFeedback({ state, cursor: pageParam || undefined }),
        initialPageParam: null,
        getNextPageParam: (page) => page.nextCursor,
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });

    const pages = query.data?.pages || [];
    const items = pages.flatMap((page) => page.items);
    const counts = pages[0]?.counts;
    const total = counts?.[state];

    const toggle = (item) => handle.mutate(
        { feedbackId: item.id, handled: !item.handled_at },
        {
            onSuccess: () => showAlert(200, item.handled_at ? "Feedback reopened" : "Feedback marked handled"),
            onError: (error) => showAlert(error?.status || 500, error?.message || "The feedback was not changed"),
        }
    );

    return (
        <section className="space-y-3" aria-labelledby="feedback-heading">
            <div className="flex flex-wrap items-center gap-2">
                <h2 id="feedback-heading" className="mr-auto text-sm font-semibold">Feedback about CodeDev</h2>
                <Select value={state} onValueChange={setState}>
                    <SelectTrigger className="w-44" aria-label="Filter feedback"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {STATES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>{item.label}{counts ? ` (${formatNumber(counts[item.value])})` : ""}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card" aria-busy={query.isPending}>
                {query.isPending ? (
                    <ul className="divide-y divide-border">
                        {Array.from({ length: 4 }, (_, index) => <li key={index} className="px-4 py-3"><Skeleton className="h-12 w-full" /></li>)}
                    </ul>
                ) : query.isError ? (
                    <p className="p-4 text-sm">Couldn&apos;t load the feedback. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                ) : items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">{state === "open" ? "Nothing is waiting. Every feedback has been handled." : "No feedback in this state."}</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {items.map((item) => (
                            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                        {item.user_id
                                            ? (can("user.read")
                                                ? <Link href={`/admin/users/${encodeURIComponent(item.user_id)}`} className="font-medium text-foreground hover:underline">{item.username}</Link>
                                                : <span className="font-medium text-foreground">{item.username}</span>)
                                            : <span>Anonymous</span>}
                                        <span>{formatRelative(item.created_at)}</span>
                                        {item.handled_at && <Badge variant="success">Handled{item.handled_by ? ` by ${item.handled_by}` : ""}</Badge>}
                                    </p>
                                    <p className="text-sm font-medium break-words">{item.title}</p>
                                    <p className="text-sm break-words whitespace-pre-line text-muted-foreground">{item.feedback}</p>
                                </div>
                                <RowAction
                                    icon={item.handled_at ? LuRotateCcw : LuCheck}
                                    label={item.handled_at ? "Reopen" : "Mark handled"}
                                    target={item.title}
                                    tone="primary"
                                    disabled={handle.isPending}
                                    onClick={() => toggle(item)}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {query.hasNextPage && (
                <div className="flex items-center justify-center gap-3">
                    {total != null && <span className="text-sm text-muted-foreground">{formatNumber(items.length)} of {formatNumber(total)}</span>}
                    <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                        {query.isFetchingNextPage ? "Loading…" : "Load more"}
                    </Button>
                </div>
            )}
        </section>
    );
}
