"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { formatPostDate } from "@/components/blog/postCard";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { useApp } from "@/contexts/appContext";
import { retryTransient } from "@/lib/queryTimes";
import { useDeletePost } from "@/mutations/blog.mutation";
import { blogQueries } from "@/queries/blog.query";

import { LuHeart, LuMessageCircle, LuPenLine, LuTrash2 } from "react-icons/lu";

const STATUS = {
    draft: { label: "Draft", variant: "muted" },
    pending: { label: "Pending", variant: "info" },
    published: { label: "Published", variant: "success" },
    rejected: { label: "Rejected", variant: "warning" },
    hidden: { label: "Hidden", variant: "destructive" },
};

export default function MyPosts() {
    const { showAlert } = useApp();
    const remove = useDeletePost();
    const [target, setTarget] = useState(null);
    const query = useQuery({ ...blogQueries.mine(), retry: retryTransient });

    const items = query.data?.items || [];

    const confirmDelete = () => remove.mutate(target.id, {
        onSuccess: () => showAlert(200, "Post deleted"),
        onError: (error) => showAlert(error?.status || 500, error?.message || "The post was not deleted"),
    });

    if (query.isPending) {
        return (
            <ul className="flex flex-col gap-3" aria-busy="true">
                {Array.from({ length: 3 }, (_, index) => <li key={index}><Skeleton className="h-20 w-full" /></li>)}
            </ul>
        );
    }
    if (query.isError) {
        return (
            <p role="alert" className="text-sm">
                Could not load your posts. <button type="button" className="cursor-pointer font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button>
            </p>
        );
    }
    if (items.length === 0) {
        return <p className="text-sm text-muted-foreground">You have not written a post yet.</p>;
    }

    return (
        <>
            <ul className="flex flex-col gap-3">
                {items.map((post) => {
                    const status = STATUS[post.status] || { label: post.status, variant: "muted" };
                    const appealRejected = post.status === "hidden" && post.appealedAt;
                    return (
                        <li key={post.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start">
                            <div className="min-w-0 flex-1 space-y-1.5">
                                {post.status === "published" ? (
                                    <Link href={`/blog/${post.slug}`} className="block font-semibold break-words text-foreground underline-offset-4 hover:underline">{post.title}</Link>
                                ) : (
                                    <p className="font-semibold break-words text-foreground">{post.title}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                    <Badge variant={status.variant}>{status.label}</Badge>
                                    <span>Updated {formatPostDate(post.updatedAt)}</span>
                                    {post.status === "published" && (
                                        <>
                                            <span className="inline-flex items-center gap-1">
                                                <LuHeart className="size-3.5" aria-hidden="true" />
                                                <span className="tabular-nums">{post.likeCount ?? 0}</span>
                                                <span className="sr-only">{post.likeCount === 1 ? "like" : "likes"}</span>
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <LuMessageCircle className="size-3.5" aria-hidden="true" />
                                                <span className="tabular-nums">{post.commentCount ?? 0}</span>
                                                <span className="sr-only">{post.commentCount === 1 ? "comment" : "comments"}</span>
                                            </span>
                                        </>
                                    )}
                                </div>
                                {post.status === "rejected" && post.rejectReason && (
                                    <p className="text-sm break-words text-muted-foreground">Rejected: {post.rejectReason}</p>
                                )}
                                {post.status === "hidden" && (
                                    <>
                                        {post.hiddenReason && <p className="text-sm break-words text-muted-foreground">Hidden: {post.hiddenReason}</p>}
                                        {post.purgeAt && <p className="text-sm text-muted-foreground">Deletes on {formatPostDate(post.purgeAt)}</p>}
                                        {appealRejected && <p className="text-sm text-muted-foreground">Appeal rejected</p>}
                                    </>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <Button asChild variant="outline" size="sm">
                                    <Link href={`/blog/edit/${post.id}`}>
                                        <LuPenLine aria-hidden="true" />
                                        {post.status === "hidden" && !post.appealedAt ? "Appeal" : "Edit"}
                                    </Link>
                                </Button>
                                <Button variant="ghost" size="icon-sm" disabled={remove.isPending} onClick={() => setTarget(post)} aria-label={`Delete "${post.title}"`}>
                                    <LuTrash2 aria-hidden="true" />
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>

            <ConfirmDialog
                open={!!target}
                onOpenChange={(open) => !open && setTarget(null)}
                title="Delete this post?"
                description={target ? `"${target.title}" will be deleted for good.` : "This post will be deleted for good."}
                confirmLabel="Delete post"
                onConfirm={confirmDelete}
            />
        </>
    );
}
