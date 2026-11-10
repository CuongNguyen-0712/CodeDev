"use client";

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { AuthorAvatar } from "@/components/blog/postCard";
import { ErrorReload } from "@/components/ui/error";
import { Button } from "@/components/shadcn/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";
import { Textarea } from "@/components/shadcn/textarea";
import { useApp } from "@/contexts/appContext";
import { formatRelative } from "@/lib/format";
import { retryTransient } from "@/lib/queryTimes";
import { useAddComment, useDeleteComment } from "@/mutations/blog.mutation";
import { blogQueries } from "@/queries/blog.query";

import { LuLogIn, LuMessagesSquare, LuTrash2 } from "react-icons/lu";

const MAX_BODY = 2000;

// Drops the zod path prefix the API puts on field errors.
const errorText = (error) => (error?.message || "Something went wrong").replace(/^body: /, "");

function CommentSkeleton() {
    return (
        <li className="flex flex-col gap-2" aria-hidden="true">
            <div className="flex items-center gap-2.5">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-12" />
            </div>
            <div className="space-y-1.5 pl-[42px]">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
            </div>
        </li>
    );
}

/** The body is user content: plain text only, never Markdown or HTML. */
export function CommentItem({ comment, onDelete, deleting = false }) {
    const [confirming, setConfirming] = useState(false);
    return (
        // 32px avatar and a 10px gap: the same 42px indent as the course comments (commentItem.jsx).
        <li className="flex gap-2.5">
            <AuthorAvatar author={comment.author} size="default" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-h-8 flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                    <Link href={`/profile/${comment.author.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                        {comment.author.username}
                    </Link>
                    <span aria-hidden="true">·</span>
                    <time className="text-xs" dateTime={new Date(comment.createdAt).toISOString()}>{formatRelative(comment.createdAt)}</time>
                    {comment.own && (
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="ml-auto text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                            aria-label="Delete comment"
                            disabled={deleting}
                            onClick={() => setConfirming(true)}
                        >
                            <LuTrash2 aria-hidden="true" />
                        </Button>
                    )}
                </div>
                <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap break-words text-foreground">{comment.body}</p>
            </div>
            {comment.own && (
                <ConfirmDialog
                    open={confirming}
                    onOpenChange={setConfirming}
                    title="Delete comment"
                    description="This comment will be removed for everyone. This cannot be undone."
                    confirmLabel="Delete comment"
                    onConfirm={() => onDelete(comment.id)}
                />
            )}
        </li>
    );
}

function CommentForm({ postId, slug }) {
    const { status } = useSession();
    const { showAlert } = useApp();
    const add = useAddComment(postId);
    const [body, setBody] = useState("");

    // Holds the form's place, so the list does not move when the session arrives.
    if (status === "loading") return <Skeleton className="h-[8.25rem] w-full rounded-lg" />;
    if (status !== "authenticated") {
        return (
            <div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Sign in to join the discussion.</p>
                <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
                    <Link href={`/auth?next=${encodeURIComponent(`/blog/${slug}#comments`)}`}>
                        <LuLogIn aria-hidden="true" />
                        Sign in to comment
                    </Link>
                </Button>
            </div>
        );
    }

    const submit = (event) => {
        event.preventDefault();
        // The keyboard shortcut submits past the disabled button, so the same rule is checked here.
        if (!body.trim() || add.isPending) return;
        add.mutate(body.trim(), {
            onSuccess: () => setBody(""),
            onError: (error) => showAlert(error?.status || 500, errorText(error)),
        });
    };

    return (
        // One bordered box, like the sign-in prompt that takes this place for guests.
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border bg-card p-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
            <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                // Ctrl or Cmd + Enter sends, as in most comment boxes.
                onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form.requestSubmit();
                }}
                maxLength={MAX_BODY}
                rows={3}
                placeholder="Share what you think"
                aria-label="Comment"
                className="resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <div className="flex items-center justify-between gap-3">
                {/* The counter only matters near the limit. */}
                <span className="text-xs text-muted-foreground tabular-nums">{body.length > MAX_BODY * 0.8 && `${body.length}/${MAX_BODY}`}</span>
                <Button type="submit" disabled={!body.trim() || add.isPending}>
                    {add.isPending && <Spinner />}
                    Post comment
                </Button>
            </div>
        </form>
    );
}

/** `initialCount` is the cached comment count; the viewer query takes over once it loads. */
export default function PostComments({ postId, slug, initialCount }) {
    const { showAlert } = useApp();
    const query = useInfiniteQuery({ ...blogQueries.comments(postId), retry: retryTransient });
    const viewer = useQuery(blogQueries.viewer(postId));
    const remove = useDeleteComment(postId);

    const items = query.data?.pages.flatMap((page) => page.items) || [];
    const count = viewer.data?.commentCount ?? initialCount;
    const onDelete = (id) => remove.mutate(id, { onError: (error) => showAlert(error?.status || 500, errorText(error)) });

    return (
        <section id="comments" aria-labelledby="comments-heading" className="flex min-w-0 scroll-mt-20 flex-col gap-6 border-t pt-8 xl:col-start-1">
            <h2 id="comments-heading" className="text-xl font-semibold tracking-tight text-foreground">Comments ({count})</h2>
            <CommentForm postId={postId} slug={slug} />
            {query.isLoading && (
                <ul aria-busy="true" className="flex list-none flex-col gap-6 p-0">
                    {[0, 1, 2].map((index) => <CommentSkeleton key={index} />)}
                </ul>
            )}
            {query.isError && <ErrorReload data={query.error} refetch={() => query.refetch()} />}
            {query.isSuccess && items.length === 0 && (
                <Empty className="border border-dashed">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <LuMessagesSquare aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle><h3 className="text-sm font-semibold">No comments yet</h3></EmptyTitle>
                        <EmptyDescription>Be the first to share what you think.</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            )}
            {items.length > 0 && (
                <ul className="flex list-none flex-col gap-6 p-0">
                    {items.map((comment) => <CommentItem key={comment.id} comment={comment} onDelete={onDelete} deleting={remove.isPending && remove.variables === comment.id} />)}
                </ul>
            )}
            {query.hasNextPage && (
                <div className="flex justify-center">
                    <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                        {query.isFetchingNextPage && <Spinner />}
                        Load more
                    </Button>
                </div>
            )}
        </section>
    );
}
