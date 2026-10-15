import { memo, useMemo } from "react";
import Link from "next/link";
import { useSession } from 'next-auth/react';

import { useCourseVotingComment } from "@/mutations/course.mutation";
import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";

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

const activeVote = "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70 hover:text-primary-soft-foreground";

const CommentItem = ({ data, courseId }) => {
    const { data: session } = useSession();
    const useVoting = useCourseVotingComment();

    const formattedDate = useMemo(() => formatDate(data.created_at), [data.created_at]);

    const handleVoting = async (voteType) => {
        if (!session || useVoting.isPending) return;

        await useVoting.mutateAsync({
            commentId: data.id,
            courseId: courseId,
            vote: voteType === data.vote ? null : voteType,
        });
    };

    const username = data.username || 'Anonymous';
    const isUpvoted = data.vote === 'upvote';
    const isDownvoted = data.vote === 'downvote';

    const identity = (
        <>
            <Avatar className="size-8">
                <AvatarImage src={data.avatar || undefined} alt="" />
                <AvatarFallback className="text-xs font-medium">
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
                {data.user_id ? (
                    <Link
                        href={`/profile/${data.user_id}`}
                        className="group/user flex min-w-0 items-center gap-2.5 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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

            <div className="flex items-center gap-1 pl-[38px]">
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    name="upvote"
                    onClick={() => handleVoting('upvote')}
                    className={cn("text-muted-foreground", isUpvoted && activeVote)}
                    disabled={useVoting.isPending || !session}
                    title={!session ? "Sign in to vote" : undefined}
                    aria-label={isUpvoted ? `Remove upvote, ${Number(data.upvotes) || 0} upvotes` : `Upvote, ${Number(data.upvotes) || 0} upvotes`}
                    aria-pressed={isUpvoted}
                >
                    <LuThumbsUp className={cn(isUpvoted && "fill-current")} aria-hidden="true" />
                    <span className="font-mono tabular">{Number(data.upvotes) || 0}</span>
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    name="downvote"
                    onClick={() => handleVoting('downvote')}
                    className={cn("text-muted-foreground", isDownvoted && activeVote)}
                    disabled={useVoting.isPending || !session}
                    title={!session ? "Sign in to vote" : undefined}
                    aria-label={isDownvoted ? `Remove downvote, ${Number(data.downvotes) || 0} downvotes` : `Downvote, ${Number(data.downvotes) || 0} downvotes`}
                    aria-pressed={isDownvoted}
                >
                    <LuThumbsDown className={cn(isDownvoted && "fill-current")} aria-hidden="true" />
                    <span className="font-mono tabular">{Number(data.downvotes) || 0}</span>
                </Button>
            </div>
        </article>
    );
};

export default memo(CommentItem);
