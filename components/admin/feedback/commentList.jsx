'use client';

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { useAdmin } from "@/components/admin/adminContext";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { useAdminSetCommentHidden } from "@/mutations/premium.mutation";
import RowAction from "@/components/admin/ui/rowAction";
import { formatNumber, formatRelative } from "@/components/admin/ui/format";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuEye, LuEyeOff, LuStar, LuThumbsDown, LuThumbsUp } from "react-icons/lu";

const STATES = [
    { value: "all", label: "All comments" },
    { value: "visible", label: "Visible" },
    { value: "hidden", label: "Hidden" },
    { value: "downvoted", label: "More downvotes" },
];

/**
 * Course comments for moderators (comment.moderate, docs/admin-panel-plan.md 11.3): one course, or
 * every course when `courseId` is not given. Hiding takes a comment off the course page, with a reason.
 */
export default function CommentList({ courseId = null }) {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const [state, setState] = useState("all");
    const [target, setTarget] = useState(null);
    const setHidden = useAdminSetCommentHidden();
    const filters = { course: courseId || undefined, state };
    const query = useInfiniteQuery({
        queryKey: adminKeys.comments(filters),
        queryFn: ({ pageParam }) => adminClient.listComments({ ...filters, cursor: pageParam || undefined }),
        initialPageParam: null,
        getNextPageParam: (page) => page.nextCursor,
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });

    const pages = query.data?.pages || [];
    const comments = pages.flatMap((page) => page.items);
    const counts = pages[0]?.counts;
    const total = counts?.[state];

    return (
        <section className="space-y-3" aria-labelledby={`comments-heading-${courseId || "all"}`}>
            <div className="flex flex-wrap items-center gap-2">
                <h2 id={`comments-heading-${courseId || "all"}`} className="mr-auto text-sm font-semibold">
                    Comments
                    {counts && <span className="ml-2 font-normal text-muted-foreground">{formatNumber(counts.last_7_days)} in the last 7 days</span>}
                </h2>
                <Select value={state} onValueChange={setState}>
                    <SelectTrigger className="w-44" aria-label="Filter comments"><SelectValue /></SelectTrigger>
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
                    <p className="p-4 text-sm">Couldn&apos;t load the comments. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                ) : comments.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">{state === "all" ? "No comments yet." : "No comment in this state."}</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {comments.map((comment) => (
                            <li key={comment.id} className="flex items-start gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                        {can("user.read")
                                            ? <Link href={`/admin/users/${encodeURIComponent(comment.user_id)}`} className="font-medium text-foreground hover:underline">{comment.username}</Link>
                                            : <span className="font-medium text-foreground">{comment.username}</span>}
                                        {comment.rating && (
                                            <span className="flex items-center gap-0.5 tabular-nums" title={`Rated this course ${comment.rating} out of 5`}>
                                                <LuStar className="size-3.5 text-xp fill-xp/20" aria-hidden="true" />{comment.rating}<span className="sr-only"> out of 5</span>
                                            </span>
                                        )}
                                        {!courseId && <Link href={`/admin/courses/${encodeURIComponent(comment.course_id)}`} className="truncate hover:underline">{comment.course_title}</Link>}
                                        <span>{formatRelative(comment.created_at)}</span>
                                        {comment.hidden && <Badge variant="muted">Hidden</Badge>}
                                    </p>
                                    <p className={comment.hidden ? "text-sm break-words whitespace-pre-line text-muted-foreground" : "text-sm break-words whitespace-pre-line"}>{comment.content}</p>
                                    <p className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                                        <span className="flex items-center gap-1"><LuThumbsUp className="size-3.5" aria-hidden="true" />{formatNumber(comment.upvotes)}<span className="sr-only"> upvotes</span></span>
                                        <span className="flex items-center gap-1"><LuThumbsDown className="size-3.5" aria-hidden="true" />{formatNumber(comment.downvotes)}<span className="sr-only"> downvotes</span></span>
                                    </p>
                                </div>
                                <RowAction
                                    icon={comment.hidden ? LuEye : LuEyeOff}
                                    label={comment.hidden ? "Show" : "Hide"}
                                    target={`the comment by ${comment.username}`}
                                    tone={comment.hidden ? "primary" : "danger"}
                                    disabled={setHidden.isPending}
                                    onClick={() => setTarget(comment)}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {query.hasNextPage && (
                <div className="flex items-center justify-center gap-3">
                    {total != null && <span className="text-sm text-muted-foreground">{formatNumber(comments.length)} of {formatNumber(total)}</span>}
                    <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                        {query.isFetchingNextPage ? "Loading…" : "Load more"}
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={Boolean(target)}
                onOpenChange={(value) => !value && setTarget(null)}
                title={target ? `${target.hidden ? "Show" : "Hide"} the comment by ${target.username}` : ""}
                description={target?.hidden
                    ? "The comment appears on the course page again."
                    : "The comment leaves the course page for everyone. The text is kept and can be shown again."}
                confirmLabel={target?.hidden ? "Show comment" : "Hide comment"}
                destructive={!target?.hidden}
                reasonLabel="Reason"
                minReason={10}
                onConfirm={(reason) => setHidden.mutate(
                    { commentId: target.id, hidden: !target.hidden, reason },
                    {
                        onSuccess: () => showAlert(200, target.hidden ? "Comment shown" : "Comment hidden"),
                        onError: (error) => showAlert(error?.status || 500, error?.message || "The comment was not changed"),
                    }
                )}
            />
        </section>
    );
}
