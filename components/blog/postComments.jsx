"use client";

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { AuthorAvatar } from "@/components/blog/postCard";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { Textarea } from "@/components/shadcn/textarea";
import { useApp } from "@/contexts/appContext";
import { formatRelative } from "@/lib/format";
import { retryTransient } from "@/lib/queryTimes";
import { useAddComment, useDeleteComment } from "@/mutations/blog.mutation";
import { blogQueries } from "@/queries/blog.query";

import { LuTrash2 } from "react-icons/lu";

const MAX_BODY = 2000;

// Drops the zod path prefix the API puts on field errors.
const errorText = (error) => (error?.message || "Something went wrong").replace(/^body: /, "");

/** The body is user content: plain text only, never Markdown or HTML. */
export function CommentItem({ comment, onDelete, deleting = false }) {
    const [confirming, setConfirming] = useState(false);
    return (
        <li className="flex gap-3">
            <AuthorAvatar author={comment.author} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    <Link href={`/profile/${comment.author.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                        {comment.author.username}
                    </Link>
                    <time dateTime={new Date(comment.createdAt).toISOString()}>{formatRelative(comment.createdAt)}</time>
                    {comment.own && (
                        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" disabled={deleting} onClick={() => setConfirming(true)}>
                            <LuTrash2 />
                            Delete
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

    if (status === "loading") return null;
    if (status !== "authenticated") {
        return (
            <p className="text-sm text-muted-foreground">
                <Link href={`/auth?next=${encodeURIComponent(`/blog/${slug}#comments`)}`} className="font-medium text-foreground underline underline-offset-4">
                    Sign in to join the discussion
                </Link>
            </p>
        );
    }

    const submit = (event) => {
        event.preventDefault();
        add.mutate(body.trim(), {
            onSuccess: () => setBody(""),
            onError: (error) => showAlert(error?.status || 500, errorText(error)),
        });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-2">
            <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={MAX_BODY}
                rows={3}
                placeholder="Share what you think"
                aria-label="Comment"
            />
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground tabular-nums">{body.length}/{MAX_BODY}</span>
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
        <section id="comments" aria-labelledby="comments-heading" className="flex min-w-0 flex-col gap-6 border-t pt-8 xl:col-start-1">
            <h2 id="comments-heading" className="text-lg font-semibold tracking-tight text-foreground">Comments ({count})</h2>
            <CommentForm postId={postId} slug={slug} />
            {query.isError && (
                <p role="alert" className="text-sm text-destructive">
                    Could not load comments.{" "}
                    <button type="button" className="font-medium underline underline-offset-4" disabled={query.isFetching} onClick={() => query.refetch()}>
                        Try again
                    </button>
                </p>
            )}
            {query.isSuccess && items.length === 0 && (
                <p className="text-sm text-muted-foreground">No comments yet. Be the first to share what you think.</p>
            )}
            {items.length > 0 && (
                <ul className="flex list-none flex-col gap-6 p-0">
                    {items.map((comment) => <CommentItem key={comment.id} comment={comment} onDelete={onDelete} deleting={remove.isPending} />)}
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
