import { memo, useMemo } from "react";
import { useSession } from 'next-auth/react';
import Link from "next/link";

import { useCourseVotingComment } from "@/mutations/course.mutation";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/appContext";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";

import { LuHeart } from "react-icons/lu";

const formatDate = (str) => {
    if (!str) return 'Recently';
    const now = new Date();
    const date = new Date(str);
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 10) {
        return 'Just now';
    } else if (diffInSeconds < 60) {
        return `${diffInSeconds}s ago`;
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours}h ago`;
    } else {
        const days = Math.floor(diffInSeconds / 86400);
        if (days > 30) {
            return date.toLocaleDateString();
        }
        return `${days}d ago`;
    }
};


const CommentItem = ({ data, courseId }) => {
    const { data: session } = useSession();
    const useVoting = useCourseVotingComment();
    const { showAlert } = useApp();

    const formattedDate = useMemo(() => formatDate(data.created_at), [data.created_at]);

    // A like is an upvote on the server; a learner's old downvote is replaced by it.
    const isLiked = data.vote === 'upvote';
    const likes = Number(data.upvotes) || 0;

    const handleLike = () => {
        if (!session || useVoting.isPending) return;
        useVoting.mutate(
            { commentId: data.id, courseId, vote: isLiked ? null : 'upvote' },
            { onError: () => showAlert(500, "Could not update your like. Please try again.") }
        );
    };

    const username = data.username || 'Anonymous';

    const identity = (
        <>
            <Avatar className="size-8">
                <AvatarImage src={data.avatar || undefined} alt="" />
                <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
                    {username.charAt(0).toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-semibold text-foreground group-hover/user:underline group-hover/user:underline-offset-4">
                {username}
            </span>
        </>
    );

    return (
        <article className="flex flex-col gap-2 px-4 py-3.5">
            <header className="flex min-w-0 items-center gap-2.5">
                {data.showProfile && data.username ? (
                    <Link
                        href={`/profile/${encodeURIComponent(data.username)}`}
                        aria-label={`View profile of ${username}`}
                        className="group/user flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                        {identity}
                    </Link>
                ) : (
                    <span className="flex min-w-0 items-center gap-2.5">{identity}</span>
                )}
                <span aria-hidden="true" className="text-muted-foreground">&middot;</span>
                <time
                    dateTime={data.created_at || undefined}
                    className="shrink-0 text-xs text-muted-foreground"
                    title={data.created_at ? new Date(data.created_at).toLocaleString() : undefined}
                >
                    {formattedDate}
                </time>
            </header>

            <p className="pl-[42px] text-sm leading-relaxed break-words whitespace-pre-line text-foreground">
                {data.comment}
            </p>

            {/* One like per learner, shown as a heart with its count. The count moves on click
                (optimistic, see useCourseVotingComment) and goes back if the server refuses. */}
            <div className="flex items-center pl-[38px]">
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleLike}
                    className={cn("text-muted-foreground", isLiked && "text-destructive hover:text-destructive")}
                    disabled={!session}
                    title={!session ? "Sign in to like comments" : undefined}
                    aria-label={`${isLiked ? 'Unlike' : 'Like'} this comment, ${likes} ${likes === 1 ? 'like' : 'likes'}`}
                    aria-pressed={isLiked}
                >
                    <LuHeart className={cn("transition-transform duration-150 active:scale-90", isLiked && "fill-current")} aria-hidden="true" />
                    <span className="tabular">{likes}</span>
                </Button>
            </div>
        </article>
    );
};

export default memo(CommentItem);
