"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

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

import { LuFlag, LuHeart, LuMessageCircle } from "react-icons/lu";

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
export function LikeButton({ postId, pageIds, likeCount, authorId, onPost = false, variant = "outline", className }) {
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

    const disabled = loading || setLike.isPending || (signedIn && !settled) || own;
    return (
        <Button
            variant={variant}
            className={cn(className, state.liked && "text-primary")}
            aria-label={state.count > 0 ? `Like, ${state.count} ${state.count === 1 ? "like" : "likes"}` : "Like"}
            aria-pressed={state.liked}
            disabled={disabled}
            onClick={toggle}
        >
            <LuHeart className={cn(state.liked && "fill-current text-primary")} aria-hidden="true" />
            Like{state.count > 0 && ` ${state.count}`}
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
                Comment{count > 0 && ` ${count}`}
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

/** Like, comments and report for the post page; `likeCount` and `commentCount` are the cached values. */
export default function PostActions({ postId, likeCount, commentCount }) {
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
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <LikeButton postId={postId} pageIds={[postId]} likeCount={likeCount} onPost />
            <Button asChild variant="ghost" className="text-muted-foreground">
                <Link href="#comments" aria-label={commentLabel(comments)}>
                    <LuMessageCircle aria-hidden="true" />
                    Comment{comments > 0 && ` ${comments}`}
                </Link>
            </Button>
            {/* If the viewer read fails, Report still shows; the server rejects your own post with 400. */}
            {(viewer ? !viewer.own : viewerQuery.isError) && (
                <Button variant="ghost" className="ml-auto text-muted-foreground" disabled={reported} onClick={startReport}>
                    <LuFlag aria-hidden="true" />
                    {reported ? "Reported" : "Report"}
                </Button>
            )}
            <ReportDialog open={open} onOpenChange={setOpen} postId={postId} onReported={() => { setReportedNow(true); setOpen(false); }} />
        </div>
    );
}
