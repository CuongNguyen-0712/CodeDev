'use client';

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import PageHeader from "@/components/admin/shell/pageHeader";
import RowAction from "@/components/admin/ui/rowAction";
import FileIcon from "@/components/chat/fileIcon";
import { formatDate, formatRelative } from "@/components/admin/ui/format";
import { useAdminChatReportAction } from "@/mutations/premium.mutation";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuCheck, LuEyeOff } from "react-icons/lu";

const DONE = { hide: "Message hidden", dismiss: "Reports dismissed" };

/** Reported chat messages (chat.moderate): only the reported message is shown, never the rest of its conversation. */
export default function ChatReports() {
    const { showAlert } = useApp();
    const act = useAdminChatReportAction();
    const [target, setTarget] = useState(null);
    const query = useInfiniteQuery({
        queryKey: adminKeys.chatReports(),
        queryFn: ({ pageParam }) => adminClient.listChatReports({ cursor: pageParam || undefined }),
        initialPageParam: null,
        getNextPageParam: (page) => page.nextCursor || undefined,
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });
    const messages = (query.data?.pages || []).flatMap((page) => page.items);

    const run = ({ message, action }, reason) => act.mutate(
        { messageId: message.messageId, action, reason },
        {
            onSuccess: (result) => showAlert(200, result?.changed === false ? "Already done" : DONE[action]),
            onError: (error) => showAlert(error?.status || 500, error?.message || "The message was not changed"),
        }
    );
    const label = target ? `the message from ${target.message.sender.username}` : "";

    return (
        <>
            <PageHeader title="Chat reports" description="Review messages members reported, then hide them or dismiss the reports." />
            <div className="overflow-hidden rounded-lg border border-border bg-card" aria-busy={query.isPending}>
                {query.isPending ? (
                    <ul className="divide-y divide-border">
                        {Array.from({ length: 4 }, (_, index) => <li key={index} className="px-4 py-3"><Skeleton className="h-14 w-full" /></li>)}
                    </ul>
                ) : query.isError ? (
                    <p className="p-4 text-sm">Couldn&apos;t load the reports. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                ) : messages.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No reported messages.</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {messages.map((message) => (
                            <li key={message.messageId} className="flex flex-wrap items-start gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground">{message.sender.nickname || message.sender.username}</span>
                                        <span title={formatDate(message.firstReportedAt)}>{formatRelative(message.firstReportedAt)}</span>
                                        <Badge variant="muted">{message.conversationKind === "team" ? "Team chat" : "Direct chat"}</Badge>
                                        <Badge variant="warning">{message.reports} {message.reports === 1 ? "report" : "reports"}</Badge>
                                    </p>
                                    {message.body && <p className="text-sm break-words whitespace-pre-line">{message.body}</p>}
                                    {message.attachments.length > 0 && (
                                        <ul className="flex flex-wrap gap-2">
                                            {message.attachments.map((attachment, index) => {
                                                const src = `/api/admin/chat-reports/${message.messageId}/attachments/${attachment.id}`;
                                                if (attachment.kind === "file") {
                                                    return (
                                                        <li key={attachment.id} className="w-full">
                                                            <a href={src} className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                                                                <FileIcon name={attachment.name} className="size-4 shrink-0 text-muted-foreground" />
                                                                <span className="truncate" title={attachment.name}>{attachment.name}</span>
                                                            </a>
                                                        </li>
                                                    );
                                                }
                                                return (
                                                    <li key={attachment.id}>
                                                        <a href={src} target="_blank" rel="noopener noreferrer" className="block rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                                                            {/* eslint-disable-next-line @next/next/no-img-element -- the route 302s to a short-lived signed URL */}
                                                            <img
                                                                src={src}
                                                                alt={`Image ${index + 1} of ${message.attachments.length} from ${message.sender.username}`}
                                                                loading="lazy"
                                                                className="size-20 rounded-md border border-border bg-muted object-cover"
                                                            />
                                                        </a>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                    <ul className="list-disc space-y-0.5 pl-4 text-sm break-words text-muted-foreground">
                                        {message.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
                                    </ul>
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                    <RowAction icon={LuEyeOff} label="Hide" target={`the message from ${message.sender.username}`} tone="danger" disabled={act.isPending} onClick={() => setTarget({ message, action: "hide" })} />
                                    <RowAction icon={LuCheck} label="Dismiss" target={`the reports on the message from ${message.sender.username}`} tone="primary" disabled={act.isPending} onClick={() => setTarget({ message, action: "dismiss" })} />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {query.hasNextPage && (
                <div className="mt-3 flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                        {query.isFetchingNextPage ? "Loading…" : "Load more"}
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={Boolean(target)}
                onOpenChange={(value) => !value && setTarget(null)}
                title={target ? `${target.action === "hide" ? "Hide" : "Dismiss the reports on"} ${label}` : ""}
                description={target?.action === "hide"
                    ? "The message is unsent for everyone in the conversation and its open reports are closed."
                    : "The message stays and the open reports are closed."}
                confirmLabel={target?.action === "hide" ? "Hide message" : "Dismiss reports"}
                destructive={target?.action === "hide"}
                reasonLabel={target?.action === "hide" ? "Reason" : undefined}
                minReason={10}
                onConfirm={(reason) => run(target, reason)}
            />
        </>
    );
}
