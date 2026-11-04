'use client';

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { useAdminUpdateAnnouncement } from "@/mutations/premium.mutation";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import PageHeader from "@/components/admin/shell/pageHeader";
import RowAction from "@/components/admin/ui/rowAction";
import { formatDateTime, formatNumber, formatRelative } from "@/components/admin/ui/format";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuBan, LuPlus, LuUndo2 } from "react-icons/lu";

const STATUS = {
    scheduled: { label: "Scheduled", variant: "info" },
    sending: { label: "Sending", variant: "primary" },
    sent: { label: "Sent", variant: "success" },
    cancelled: { label: "Cancelled", variant: "muted" },
    retracted: { label: "Retracted", variant: "warning" },
};

/** "Everyone", "Roles: student", "Learners of rust-basics", "3 users". */
export function describeAudience(audience) {
    switch (audience?.type) {
        case "all": return "Everyone";
        case "role": return `Roles: ${audience.roles.join(", ")}`;
        case "course": return `Learners of ${audience.courseId}`;
        case "users": return audience.userIds.length === 1 ? "1 user" : `${formatNumber(audience.userIds.length)} users`;
        default: return "—";
    }
}

function reach(item) {
    if (item.status === "scheduled") return `Sends ${formatDateTime(item.sendAt)}`;
    if (item.recipients == null) return null;
    const rate = item.recipients > 0 ? Math.round(((item.readCount || 0) / item.recipients) * 100) : 0;
    return `${formatNumber(item.recipients)} recipients · read by ${formatNumber(item.readCount || 0)} (${rate}%)`;
}

/** Notifications the team sent (announcement.send, docs/notification-plan.md 3): reach, read rate, cancel or retract. */
export default function AnnouncementsPage() {
    const { showAlert } = useApp();
    const update = useAdminUpdateAnnouncement();
    const [dialog, setDialog] = useState(null);
    const query = useInfiniteQuery({
        queryKey: adminKeys.announcements(),
        queryFn: ({ pageParam }) => adminClient.listAnnouncements({ cursor: pageParam || undefined }),
        initialPageParam: null,
        getNextPageParam: (page) => page.nextCursor,
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });

    const items = (query.data?.pages || []).flatMap((page) => page.items);
    const scheduled = items.filter((item) => item.status === "scheduled").length;
    const lastSent = items.find((item) => item.status === "sent");
    const finding = scheduled
        ? `${formatNumber(scheduled)} scheduled`
        : lastSent ? `Last sent ${formatRelative(lastSent.sentAt)}` : "Nothing sent yet";

    const run = (item, input, done) => update.mutate(
        { id: item.id, ...input },
        {
            onSuccess: () => showAlert(200, done),
            onError: (error) => showAlert(error?.status || 500, error?.message || "The announcement was not changed"),
        }
    );

    return (
        <>
            <PageHeader
                title="Announcements"
                description={query.isPending ? null : finding}
                actions={(
                    <Button asChild>
                        <Link href="/admin/announcements/new"><LuPlus aria-hidden="true" />New announcement</Link>
                    </Button>
                )}
            />

            <div className="overflow-hidden rounded-lg border border-border bg-card" aria-busy={query.isPending}>
                {query.isPending ? (
                    <ul className="divide-y divide-border">
                        {Array.from({ length: 4 }, (_, index) => <li key={index} className="px-4 py-3"><Skeleton className="h-12 w-full" /></li>)}
                    </ul>
                ) : query.isError ? (
                    <p className="p-4 text-sm">Couldn&apos;t load the announcements. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                ) : items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No announcement has been sent yet.</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {items.map((item) => {
                            const status = STATUS[item.status] || { label: item.status, variant: "muted" };
                            return (
                                <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                            <Badge variant={status.variant}>{status.label}</Badge>
                                            <span className="font-medium text-foreground">{describeAudience(item.audience)}</span>
                                            <span>{formatRelative(item.createdAt)}{item.createdBy ? ` by ${item.createdBy}` : ""}</span>
                                        </p>
                                        <p className="text-sm font-medium break-words">{item.title}</p>
                                        <p className="line-clamp-2 text-sm break-words whitespace-pre-line text-muted-foreground">{item.body}</p>
                                        {reach(item) && <p className="text-xs text-muted-foreground tabular-nums">{reach(item)}</p>}
                                    </div>
                                    {item.status === "scheduled" && (
                                        <RowAction icon={LuBan} label="Cancel" target={item.title} tone="warning" disabled={update.isPending} onClick={() => setDialog({ kind: "cancel", item })} />
                                    )}
                                    {item.status === "sent" && (
                                        <RowAction icon={LuUndo2} label="Retract" target={item.title} tone="danger" disabled={update.isPending} onClick={() => setDialog({ kind: "retract", item })} />
                                    )}
                                </li>
                            );
                        })}
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
                open={dialog?.kind === "cancel"}
                onOpenChange={(open) => !open && setDialog(null)}
                title="Cancel this announcement?"
                description={`"${dialog?.item?.title}" will not be sent. Nobody has received it yet.`}
                confirmLabel="Cancel announcement"
                onConfirm={() => run(dialog.item, { action: "cancel" }, "Announcement cancelled")}
            />
            <ConfirmDialog
                open={dialog?.kind === "retract"}
                onOpenChange={(open) => !open && setDialog(null)}
                title="Retract this announcement?"
                description={`"${dialog?.item?.title}" leaves the inbox of ${formatNumber(dialog?.item?.recipients || 0)} learners. To correct it, send a new one.`}
                confirmLabel="Retract"
                reasonLabel="Reason"
                onConfirm={(reason) => run(dialog.item, { action: "retract", reason }, "Announcement retracted")}
            />
        </>
    );
}
