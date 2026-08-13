import { memo, useMemo } from "react";

import Link from "next/link";

import { useSession } from 'next-auth/react';


import { IoHeart, IoHeartDislike } from "react-icons/io5";

import { useCourseVotingComment } from "@/app/mutation/course.mutation";

import "@/app/style/course/[id]/item.css";

const formatDate = (str) => {
    const now = new Date();
    const date = new Date(str);
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 5) {
        return 'Just now';
    } else if (diffInSeconds < 60) {
        return `${diffInSeconds} seconds ago`;
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
    else {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
};

const CommentItem = ({ data, courseId }) => {
    const { data: session } = useSession();
    const useVoting = useCourseVotingComment();

    const formattedDate = useMemo(() => formatDate(data.created_at), [data.created_at]);

    const handleVoting = async (e) => {
        e.preventDefault();

        if (!session || useVoting.isPending) return;

        const voteType = e.currentTarget.name;

        await useVoting.mutateAsync({
            commentId: data.id,
            courseId: courseId,
            vote: voteType === data.vote ? null : voteType,
        });
    };

    return (
        <div className="comment-card">
            <Link className="comment-header" href={`/profile/${data.user_id}`} title={data.username}>
                <img
                    className="comment-avatar"
                    src={data.avatar}
                    alt={data.username}
                    height={50}
                    width={50}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/image/static/no_image.png';
                    }}
                />
                <div className="comment-user-info">
                    <h4 className="comment-username">{data.username}</h4>
                    <span className="comment-date">{formattedDate}</span>
                </div>
            </Link>
            <div className="comment-body">
                <p className="comment-text">{data.comment}</p>
                <div className="comment-actions">
                    <button
                        name="upvote"
                        onClick={handleVoting}
                        className={`vote-btn upvote ${data.vote === 'upvote' ? 'active' : ''}`}
                    >
                        <IoHeart fontSize={18} />
                        <span>{data.upvotes}</span>
                    </button>
                    <button
                        name="downvote"
                        onClick={handleVoting}
                        className={`vote-btn downvote ${data.vote === 'downvote' ? 'active' : ''}`}
                    >
                        <IoHeartDislike fontSize={18} />
                        <span>{data.downvotes}</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default memo(CommentItem);