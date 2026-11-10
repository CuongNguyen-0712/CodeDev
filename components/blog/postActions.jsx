"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import SharePostButton from "@/components/blog/sharePostButton";
import { BAR_BUTTON, BAR_COUNT_BUTTON } from "@/components/blog/shared";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/shadcn/field";
import { Spinner } from "@/components/shadcn/spinner";
import { Textarea } from "@/components/shadcn/textarea";
import { useApp } from "@/contexts/appContext";
import { nextLikeState } from "@/lib/blog/likeState.mjs";
import { cn } from "@/lib/utils";
import { useReportPost, useSetLike } from "@/mutations/blog.mutation";
import { blogQueries } from "@/queries/blog.query";

import { LuCheck, LuFlag, LuHeart, LuMessageCircle } from "react-icons/lu";

const MIN_REASON = 5;
const MAX_REASON = 500;

// Drops the zod path prefix the API puts on field errors.
const errorText = (error) => (error?.message || "Something went wrong").replace(/^reason: /, "");

// Signed-out users go to sign-in and come back to the page they were on, filters included.
function useSignedIn() {
    const { status, data } = useSession();
    const router = useRouter();
    const toSignIn = () => router.push(`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    // session.user.id is the user's public id, the same kind as post.author.id.
    return { signedIn: status === "authenticated", loading: status === "loading", userId: data?.user?.id ?? null, toSignIn };
}

/**
 * Owns its { liked, count }. The feed seeds both from the one feed-state query shared by the page's
 * buttons (`pageIds`); the post page (`onPost`) seeds both from the viewer state. A click flips both
 * at once, then takes the server's answer, or goes back on error. Re-seeding waits while a click is pending.
 */
export function LikeButton({ postId, pageIds, likeCount, authorId, onPost = false, className }) {
    const { showAlert } = useApp();
    const { signedIn, loading, userId, toSignIn } = useSignedIn();
    const feed = useQuery(blogQueries.feedState(pageIds, !onPost));
    const viewer = useQuery({ ...blogQueries.viewer(postId), enabled: onPost });
    const setLike = useSetLike();
    const read = onPost ? viewer : feed;
    // A failed read falls back to not liked and enabled; the server still enforces every rule.
    const settled = read.isSuccess || read.isError;
    const sourceLiked = onPost ? Boolean(viewer.data?.liked) : Boolean(feed.data?.ids?.includes(postId));
    const sourceCount = onPost ? (viewer.data?.likeCount ?? likeCount) : (feed.data?.counts?.[postId]?.likeCount ?? likeCount);
    const own = onPost ? Boolean(viewer.data?.own) : Boolean(userId) && userId === authorId;
    const [state, setState] = useState({ liked: sourceLiked, count: sourceCount });

    // Re-seed during render from each source on its own (see nextLikeState).
    const source = { liked: sourceLiked, count: sourceCount };
    const [seen, setSeen] = useState(source);
    const next = nextLikeState(state, seen, source, setLike.isPending);
    if (next.seen.liked !== seen.liked || next.seen.count !== seen.count) {
        setSeen(next.seen);
        setState(next.state);
    }

    const toggle = () => {
        // Guarded here, not with `disabled`: a disabled button dims to half opacity on every load and click.
        if (loading || setLike.isPending || (signedIn && !settled)) return;
        if (!signedIn) return toSignIn();
        const before = state;
        const liked = !before.liked;
        setState({ liked, count: Math.max(0, before.count + (liked ? 1 : -1)) });
        setLike.mutate({ id: postId, liked }, {
            onSuccess: (result) => setState({ liked: result.liked, count: result.likeCount }),
            onError: (error) => {
                setState(before);
                showAlert(error?.status || 500, errorText(error));
            },
        });
    };

    // Your own post: a count to read, not a button that looks broken.
    if (own) {
        return (
            <span className={cn("inline-flex items-center text-sm font-medium", className, "hover:bg-transparent hover:text-muted-foreground")} title="Your post">
                <LuHeart aria-hidden="true" />
                <span className="tabular-nums" aria-hidden="true">{state.count}</span>
                <span className="sr-only">{state.count} {state.count === 1 ? "like" : "likes"} on your post</span>
            </span>
        );
    }

    return (
        <Button
            variant="ghost"
            className={cn(
                className,
                "[&_svg]:transition-transform [&_svg]:duration-150 motion-safe:active:[&_svg]:scale-90",
            )}
            aria-label={state.count > 0 ? `Like, ${state.count} ${state.count === 1 ? "like" : "likes"}` : "Like"}
            aria-pressed={state.liked}
            onClick={toggle}
        >
            <LuHeart className={cn(state.liked && "fill-current text-destructive")} aria-hidden="true" />
            <span className="tabular-nums">{state.count}</span>
        </Button>
    );
}

const commentLabel = (count) => (count > 0 ? `Comment, ${count} ${count === 1 ? "comment" : "comments"}` : "Comment");

/** The feed's Comment link, with the live count from the page's shared feed-state query. */
export function CommentButton({ postId, pageIds, slug, commentCount, className }) {
    const { data } = useQuery(blogQueries.feedState(pageIds));
    const count = data?.counts?.[postId]?.commentCount ?? commentCount;
    return (
        <Button asChild variant="ghost" className={className}>
            <Link href={`/blog/${slug}#comments`} aria-label={commentLabel(count)}>
                <LuMessageCircle aria-hidden="true" />
                <span className="tabular-nums">{count}</span>
            </Link>
        </Button>
    );
}

function ReportDialog({ open, onOpenChange, postId, onReported }) {
    const { showAlert } = useApp();
    const report = useReportPost();
    const [reason, setReason] = useState("");

    const submit = () => report.mutate({ id: postId, reason: reason.trim() }, {
        onSuccess: () => { showAlert(200, "Thanks, the post was reported"); onReported(); },
        onError: (error) => {
            if (error?.status === 409) onReported();
            else showAlert(error?.status || 500, errorText(error));
        },
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Report this post</DialogTitle>
                    <DialogDescription>Tell the moderators what is wrong with it. They review every report.</DialogDescription>
                </DialogHeader>
                <Field>
                    <FieldLabel htmlFor="report-reason">Reason</FieldLabel>
                    <Textarea
                        id="report-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        maxLength={MAX_REASON}
                        className="h-24 resize-none field-sizing-fixed"
                        autoFocus
                    />
                    <FieldDescription>At least {MIN_REASON} characters. {reason.length}/{MAX_REASON}</FieldDescription>
                </Field>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={reason.trim().length < MIN_REASON || report.isPending} onClick={submit}>
                        {report.isPending && <Spinner />}
                        Report post
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Like, comments, share and report for the post page, laid out like the feed bar; the counts are the cached values. */
export default function PostActions({ postId, slug, title, likeCount, commentCount }) {
    const { loading, signedIn, toSignIn } = useSignedIn();
    const viewerQuery = useQuery(blogQueries.viewer(postId));
    const viewer = viewerQuery.data;
    const [open, setOpen] = useState(false);
    const [reportedNow, setReportedNow] = useState(false);
    const reported = reportedNow || Boolean(viewer?.reported);
    const comments = viewer?.commentCount ?? commentCount;

    const startReport = () => {
        if (loading) return;
        if (signedIn) setOpen(true);
        else toSignIn();
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-1 border-t pt-1.5">
            <div className="flex items-center gap-1">
                <LikeButton postId={postId} pageIds={[postId]} likeCount={likeCount} onPost className={BAR_COUNT_BUTTON} />
                <Button asChild variant="ghost" className={BAR_COUNT_BUTTON}>
                    <Link href="#comments" aria-label={commentLabel(comments)}>
                        <LuMessageCircle aria-hidden="true" />
                        <span className="tabular-nums">{comments}</span>
                    </Link>
                </Button>
            </div>
            <div className="flex items-center gap-1">
                <SharePostButton slug={slug} title={title} className={BAR_BUTTON} />
                {/* If the viewer read fails, Report still shows; the server rejects your own post with 400. */}
                {(viewer ? !viewer.own : viewerQuery.isError) && (reported ? (
                    <span className="inline-flex h-10 items-center gap-2 px-3 text-sm font-medium text-muted-foreground [&_svg]:size-5">
                        <LuCheck aria-hidden="true" />
                        Reported
                    </span>
                ) : (
                    <Button variant="ghost" className={BAR_BUTTON} onClick={startReport}>
                        <LuFlag aria-hidden="true" />
                        Report
                    </Button>
                ))}
            </div>
            <ReportDialog open={open} onOpenChange={setOpen} postId={postId} onReported={() => { setReportedNow(true); setOpen(false); }} />
        </div>
    );
}
