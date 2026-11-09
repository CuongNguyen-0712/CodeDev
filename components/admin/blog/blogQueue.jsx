'use client';

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import PageHeader from "@/components/admin/shell/pageHeader";
import RowAction from "@/components/admin/ui/rowAction";
import TabBar from "@/components/admin/ui/tabBar";
import { useUrlFilters } from "@/components/admin/ui/useUrlFilters";
import { formatDate, formatRelative } from "@/components/admin/ui/format";
import { useAdminBlogAction } from "@/mutations/premium.mutation";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuCheck, LuEye, LuEyeOff, LuExternalLink, LuX } from "react-icons/lu";

const BlogMarkdown = dynamic(() => import("@/components/blog/markdown"), { loading: () => <Skeleton className="h-40 w-full" /> });
const MEDIA_ORIGINS = (process.env.NEXT_PUBLIC_MEDIA_ORIGINS || "https://res.cloudinary.com").split(",");
const DAY = 86400000;

const TABS = [
    { key: "pending", label: "Pending" },
    { key: "appeal", label: "Appeals" },
    { key: "hidden", label: "Hidden" },
    { key: "rejected", label: "Rejected" },
    { key: "published", label: "Published" },
];
const EMPTY = {
    pending: "No first posts are waiting for review.", appeal: "No appeals are waiting.", hidden: "No hidden posts.",
    rejected: "No rejected posts.", published: "No published posts yet.",
};
const DONE = { approve: "Post approved", reject: "Post rejected", hide: "Post hidden", show: "Post shown" };
const STATUS = {
    pending: { label: "Pending", variant: "info" }, published: { label: "Published", variant: "success" },
    hidden: { label: "Hidden", variant: "warning" }, rejected: { label: "Rejected", variant: "muted" },
};

function purgeText(purgeAt) {
    if (!purgeAt) return null;
    const days = Math.ceil((new Date(purgeAt).getTime() - Date.now()) / DAY);
    return days <= 0 ? "Deletes today" : `Deletes in ${days} ${days === 1 ? "day" : "days"}`;
}

const isAppeal = (post) => post.status === "pending" && Boolean(post.appealedAt);

// Read-only: moderators see the full post before deciding.
function PreviewDialog({ post, onClose }) {
    const query = useQuery({
        queryKey: adminKeys.blogPost(post?.id),
        queryFn: () => adminClient.getBlogPost(post.id),
        enabled: Boolean(post),
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });
    return (
        <Dialog open={Boolean(post)} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{post?.title}</DialogTitle>
                    <DialogDescription>By {post?.author.username}. Read-only preview.</DialogDescription>
                </DialogHeader>
                {query.isPending ? <Skeleton className="h-40 w-full" />
                    : query.isError ? <p className="text-sm">Couldn&apos;t load the post. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                        : <BlogMarkdown body={query.data.body} origins={MEDIA_ORIGINS} />}
            </DialogContent>
        </Dialog>
    );
}

/** Blog moderation (blog.moderate): first-post review, appeals, hide / show, and when hidden posts are deleted. */
export default function BlogQueue() {
    const { showAlert } = useApp();
    const act = useAdminBlogAction();
    const [{ status }, update] = useUrlFilters({ status: TABS.map((tab) => tab.key) }, { status: "pending" });
    const [preview, setPreview] = useState(null);
    const [target, setTarget] = useState(null);
    const filters = { status };
    const query = useInfiniteQuery({
        queryKey: adminKeys.blog(filters),
        queryFn: ({ pageParam }) => adminClient.listBlog({ ...filters, cursor: pageParam || undefined }),
        initialPageParam: null,
        getNextPageParam: (page) => page.nextCursor || undefined,
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });
    const posts = (query.data?.pages || []).flatMap((page) => page.items);

    const run = (post, action, reason) => act.mutate(
        { postId: post.id, action, reason },
        {
            onSuccess: (result) => showAlert(200, result?.changed === false ? "Already done" : DONE[action]),
            onError: (error) => showAlert(error?.status || 500, error?.message || "The post was not changed"),
        }
    );
    const busy = act.isPending;

    return (
        <>
            <PageHeader title="Blog" description="Review first posts, decide appeals, and see when hidden posts are deleted." />
            <TabBar tabs={TABS} value={status} onChange={(key) => update({ status: key })} label="Blog queues" />

            <div className="overflow-hidden rounded-lg border border-border bg-card" aria-busy={query.isPending}>
                {query.isPending ? (
                    <ul className="divide-y divide-border">
                        {Array.from({ length: 4 }, (_, index) => <li key={index} className="px-4 py-3"><Skeleton className="h-14 w-full" /></li>)}
                    </ul>
                ) : query.isError ? (
                    <p className="p-4 text-sm">Couldn&apos;t load the posts. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                ) : posts.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">{EMPTY[status]}</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {posts.map((post) => {
                            const purge = post.status === "hidden" ? purgeText(post.purgeAt) : null;
                            const appeal = isAppeal(post);
                            return (
                                <li key={post.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">{post.author.username}</span>
                                            <span>{formatRelative(post.updatedAt)}</span>
                                            <Badge variant={appeal ? "primary" : STATUS[post.status]?.variant || "muted"}>{appeal ? "Appeal" : STATUS[post.status]?.label || post.status}</Badge>
                                            {purge && <Badge variant="warning" title={`Deleted on ${formatDate(post.purgeAt)}`}>{purge}</Badge>}
                                        </p>
                                        <p className="text-sm font-medium break-words">{post.title}</p>
                                        <p className="text-sm break-words text-muted-foreground">{post.excerpt}</p>
                                        {appeal && (
                                            <p className="text-sm break-words">
                                                <span className="font-medium">Appeal: </span>{post.appealReason || "No reason given."}
                                                {post.hiddenReason && <span className="block text-muted-foreground"><span className="font-medium">Hidden because: </span>{post.hiddenReason}</span>}
                                            </p>
                                        )}
                                        {post.status === "hidden" && post.hiddenReason && <p className="text-sm break-words text-muted-foreground"><span className="font-medium">Hidden because: </span>{post.hiddenReason}</p>}
                                        {post.status === "rejected" && post.rejectReason && <p className="text-sm break-words text-muted-foreground"><span className="font-medium">Rejected because: </span>{post.rejectReason}</p>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1">
                                        {post.status === "published" ? (
                                            <Button asChild variant="ghost" size="sm" className="text-foreground">
                                                <Link href={`/blog/${post.slug}`} target="_blank" rel="noopener" aria-label={`View ${post.title}`}><LuExternalLink aria-hidden="true" />View</Link>
                                            </Button>
                                        ) : (
                                            <RowAction icon={LuEye} label="View" target={post.title} onClick={() => setPreview(post)} />
                                        )}
                                        {(post.status === "pending" || post.status === "hidden") && (
                                            <RowAction
                                                icon={post.status === "hidden" ? LuEye : LuCheck}
                                                label={post.status === "hidden" ? "Show" : appeal ? "Restore" : "Approve"}
                                                target={post.title} tone="primary" disabled={busy}
                                                onClick={() => run(post, post.status === "hidden" ? "show" : "approve")}
                                            />
                                        )}
                                        {post.status === "pending" && (
                                            <RowAction icon={LuX} label={appeal ? "Reject appeal" : "Reject"} target={post.title} tone="danger" disabled={busy} onClick={() => setTarget({ post, action: "reject" })} />
                                        )}
                                        {post.status === "published" && (
                                            <RowAction icon={LuEyeOff} label="Hide" target={post.title} tone="danger" disabled={busy} onClick={() => setTarget({ post, action: "hide" })} />
                                        )}
                                    </div>
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

            <PreviewDialog post={preview} onClose={() => setPreview(null)} />
            <ConfirmDialog
                open={Boolean(target)}
                onOpenChange={(value) => !value && setTarget(null)}
                title={target ? `${target.action === "hide" ? "Hide" : isAppeal(target.post) ? "Reject the appeal for" : "Reject"} "${target.post.title}"` : ""}
                description={target?.action === "hide"
                    ? "The post leaves the blog and is deleted after the grace period unless it is shown again. The author is told why."
                    : isAppeal(target?.post || {})
                        ? "The post stays hidden and keeps its deletion date. The author is told why."
                        : "The author is told why and can edit and send the post again."}
                confirmLabel={target?.action === "hide" ? "Hide post" : "Reject"}
                reasonLabel="Reason"
                minReason={10}
                onConfirm={(reason) => run(target.post, target.action, reason)}
            />
        </>
    );
}
