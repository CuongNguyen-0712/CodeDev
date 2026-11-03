import { memo, useMemo } from "react";
import { useSession } from 'next-auth/react';
import Link from "next/link";

import { useCourseVotingComment } from "@/mutations/course.mutation";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/appContext";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { AuthorStars } from "../ratingStars";

import { LuThumbsDown, LuThumbsUp } from "react-icons/lu";

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

    const isUp = data.vote === 'upvote';
    const isDown = data.vote === 'downvote';
    const upvotes = Number(data.upvotes) || 0;

    // Clicking the vote already given takes it back; the other one replaces it.
    const vote = (kind) => {
        if (!session || useVoting.isPending) return;
        useVoting.mutate(
            { commentId: data.id, courseId, vote: data.vote === kind ? null : kind },
            { onError: () => showAlert(500, "Could not save your vote. Please try again.") }
        );
    };
    const signInHint = !session ? "Sign in to vote on comments" : undefined;
    const voteButton = "inline-flex h-8 items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:transition-transform active:[&>svg]:scale-90";

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
                <AuthorStars stars={data.rating} />
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

            {/* Up shows how many found the comment helpful; down only records the learner's view, with no
                count, so a comment is never shamed by a number. Both move at once (optimistic) and go back
                if the server refuses. */}
            <div className="pl-[42px]">
                <div role="group" aria-label="Rate this comment" title={signInHint} className="inline-flex items-center overflow-hidden rounded-full border border-border bg-background">
                    <button
                        type="button"
                        onClick={() => vote('upvote')}
                        disabled={!session}
                        aria-pressed={isUp}
                        aria-label={`Helpful, ${upvotes} ${upvotes === 1 ? 'person' : 'people'} found this helpful`}
                        className={cn(voteButton, "pr-2.5 pl-3", isUp && "bg-primary-soft text-primary-ink hover:bg-primary-soft hover:text-primary-ink")}
                    >
                        <LuThumbsUp className={cn(isUp && "fill-current")} aria-hidden="true" />
                        <span className="tabular-nums">{upvotes}</span>
                    </button>
                    <span aria-hidden="true" className="h-4 w-px bg-border" />
                    <button
                        type="button"
                        onClick={() => vote('downvote')}
                        disabled={!session}
                        aria-pressed={isDown}
                        aria-label="Not helpful"
                        className={cn(voteButton, "w-9", isDown && "bg-destructive-soft text-destructive hover:bg-destructive-soft hover:text-destructive")}
                    >
                        <LuThumbsDown className={cn(isDown && "fill-current")} aria-hidden="true" />
                    </button>
                </div>
            </div>
        </article>
    );
};

export default memo(CommentItem);
