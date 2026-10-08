import { memo, useMemo } from "react";
import Link from "next/link";
import { useSession } from 'next-auth/react';

import { IoHeart, IoHeartDislike } from "react-icons/io5";
import { useCourseVotingComment } from "@/mutations/course.mutation";

import "@/styles/course/[id]/item.css";

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

    const formattedDate = useMemo(() => formatDate(data.created_at), [data.created_at]);

    const handleVoting = async (voteType) => {
        if (!session || useVoting.isPending) return;

        await useVoting.mutateAsync({
            commentId: data.id,
            courseId: courseId,
            vote: voteType === data.vote ? null : voteType,
        });
    };

    return (
        <article className="comment-card">
            <div className="comment-header-row">
                <Link
                    className="comment-user-link"
                    href={data.user_id ? `/profile/${data.user_id}` : '#'}
                    title={data.username || 'User'}
                >
                    <div className="comment-avatar-wrapper">
                        <img
                            className="comment-avatar"
                            src={data.avatar || '/image/static/no_image.png'}
                            alt={data.username || 'User'}
                            height={36}
                            width={36}
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '/image/static/no_image.png';
                            }}
                        />
                    </div>

                    <div className="comment-user-info">
                        <h4 className="comment-username">{data.username || 'Anonymous'}</h4>
                        <span className="comment-date">{formattedDate}</span>
                    </div>
                </Link>
            </div>

            <div className="comment-body">
                <p className="comment-text">{data.comment}</p>

                <div className="comment-actions">
                    <button
                        type="button"
                        name="upvote"
                        onClick={() => handleVoting('upvote')}
                        className={`vote-btn upvote ${data.vote === 'upvote' ? 'active' : ''}`}
                        disabled={useVoting.isPending || !session}
                        title={!session ? "Please log in to vote" : (data.vote === 'upvote' ? "Remove upvote" : "Upvote")}
                        aria-pressed={data.vote === 'upvote'}
                    >
                        <IoHeart fontSize={16} />
                        <span>{Number(data.upvotes) || 0}</span>
                    </button>

                    <button
                        type="button"
                        name="downvote"
                        onClick={() => handleVoting('downvote')}
                        className={`vote-btn downvote ${data.vote === 'downvote' ? 'active' : ''}`}
                        disabled={useVoting.isPending || !session}
                        title={!session ? "Please log in to vote" : (data.vote === 'downvote' ? "Remove downvote" : "Downvote")}
                        aria-pressed={data.vote === 'downvote'}
                    >
                        <IoHeartDislike fontSize={16} />
                        <span>{Number(data.downvotes) || 0}</span>
                    </button>
                </div>
            </div>
        </article>
    );
};

export default memo(CommentItem);