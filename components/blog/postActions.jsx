"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/shadcn/field";
import { Textarea } from "@/components/shadcn/textarea";
import { useApp } from "@/contexts/appContext";
import { cn } from "@/lib/utils";
import { useReportPost, useSetLike } from "@/mutations/blog.mutation";
import { blogQueries } from "@/queries/blog.query";

import { LuFlag, LuHeart, LuMessageCircle } from "react-icons/lu";

const MIN_REASON = 5;
const MAX_REASON = 500;

// Drops the zod path prefix the API puts on field errors.
const errorText = (error) => (error?.message || "Something went wrong").replace(/^reason: /, "");

// Signed-out users go to sign-in and come back to the page they were on.
function useSignedIn() {
    const { status } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    return { signedIn: status === "authenticated", loading: status === "loading", toSignIn: () => router.push(`/auth?next=${pathname}`) };
}

/**
 * `pageIds` are all post ids on the page; every LikeButton there reads its liked state from one
 * shared query. The count is the cached one until the first click, then follows the clicks.
 */
export function LikeButton({ postId, pageIds, likeCount, variant = "outline", className }) {
    const { showAlert } = useApp();
    const { signedIn, loading, toSignIn } = useSignedIn();
    const { data } = useQuery(blogQueries.liked(pageIds, signedIn));
    const setLike = useSetLike();
    const [count, setCount] = useState(likeCount);
    const liked = Boolean(data?.ids?.includes(postId));

    const toggle = () => {
        if (loading) return;
        if (!signedIn) return toSignIn();
        const before = count;
        setCount(Math.max(0, count + (liked ? -1 : 1)));
        setLike.mutate({ id: postId, liked: !liked, pageIds }, {
            onSuccess: (result) => setCount(result.likeCount),
            onError: (error) => {
                setCount(before);
                showAlert(error?.status || 500, errorText(error));
            },
        });
    };

    return (
        <Button variant={variant} className={cn(className, liked && "text-primary")} aria-pressed={liked} disabled={setLike.isPending} onClick={toggle}>
            <LuHeart className={cn(liked && "fill-current text-primary")} />
            Like{count > 0 && ` ${count}`}
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
                    <Button disabled={reason.trim().length < MIN_REASON || report.isPending} onClick={submit}>Report post</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Like, comments and report for the post page; `likeCount` and `commentCount` are the cached values. */
export default function PostActions({ postId, likeCount, commentCount }) {
    const { loading, signedIn, toSignIn } = useSignedIn();
    const { data: viewer } = useQuery(blogQueries.viewer(postId));
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
            <LikeButton postId={postId} pageIds={[postId]} likeCount={likeCount} />
            <Button asChild variant="ghost" className="text-muted-foreground">
                <Link href="#comments">
                    <LuMessageCircle />
                    {comments > 0 ? `${comments} ${comments === 1 ? "comment" : "comments"}` : "Comment"}
                </Link>
            </Button>
            {!viewer?.own && (
                <Button variant="ghost" className="ml-auto text-muted-foreground" disabled={reported} onClick={startReport}>
                    <LuFlag />
                    {reported ? "Reported" : "Report"}
                </Button>
            )}
            <ReportDialog open={open} onOpenChange={setOpen} postId={postId} onReported={() => { setReportedNow(true); setOpen(false); }} />
        </div>
    );
}
