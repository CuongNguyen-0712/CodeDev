import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Form from 'next/form';

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { LoadingContent } from "@/components/ui/loading";
import { ErrorReload } from "@/components/ui/error";
import { courseQueries } from "@/queries/course.query";
import { courseKeys } from "@/keys/course.keys";
import { useCourseComment } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { TextAreaGroup } from "@/components/ui/input";
import { getPusherClient } from "@/lib/pusher";

import CommentItem from "./commentItem";
import { uniqBy } from "lodash";

import { IoSend } from "react-icons/io5";
import { MdOutlineForum } from "react-icons/md";

import "@/styles/course/[id]/comment.css";

export default function CommentPage({ courseId }) {
    const inputRef = useRef(null);
    const scrollRef = useRef(null);
    const queryClient = useQueryClient();

    const [comment, setComment] = useState({
        content: '',
    });

    const { data: session } = useSession();
    const { showAlert: alert } = useApp();
    const useComment = useCourseComment();

    const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, error, isFetchingNextPage } = useInfiniteQuery(
        courseQueries.comments(courseId)
    );

    const rawComments = data?.pages?.flatMap(page => page.data || []) || [];
    const comments = uniqBy(rawComments, 'id');

    // Realtime comments subscription with Pusher
    useEffect(() => {
        if (!courseId) return;

        const pusher = getPusherClient();
        if (!pusher) return;

        const channelName = `course-${courseId}`;
        const channel = pusher.subscribe(channelName);

        const handleNewComment = (newComment) => {
            if (!newComment || !newComment.id) return;

            queryClient.setQueryData(courseKeys.comments(courseId), (oldData) => {
                if (!oldData || !oldData.pages) {
                    return oldData;
                }

                // Check if comment already exists (prevent duplicate on author's view)
                const exists = oldData.pages.some(page =>
                    page.data?.some(item => item.id === newComment.id)
                );

                if (exists) {
                    return oldData;
                }

                const firstPage = oldData.pages[0];
                const updatedFirstPage = {
                    ...firstPage,
                    data: [newComment, ...(firstPage?.data || [])],
                };

                return {
                    ...oldData,
                    pages: [updatedFirstPage, ...oldData.pages.slice(1)],
                };
            });
        };

        const handleCommentVoted = ({ commentId, upvotes, downvotes }) => {
            if (!commentId) return;

            queryClient.setQueryData(courseKeys.comments(courseId), (oldData) => {
                if (!oldData || !oldData.pages) return oldData;

                return {
                    ...oldData,
                    pages: oldData.pages.map((page) => ({
                        ...page,
                        data: (page.data || []).map((item) => {
                            if (item.id !== commentId) return item;
                            return {
                                ...item,
                                upvotes: Number(upvotes) || 0,
                                downvotes: Number(downvotes) || 0,
                            };
                        }),
                    })),
                };
            });
        };

        channel.bind("new-comment", handleNewComment);
        channel.bind("comment-voted", handleCommentVoted);

        return () => {
            channel.unbind("new-comment", handleNewComment);
            channel.unbind("comment-voted", handleCommentVoted);
            pusher.unsubscribe(channelName);
        };
    }, [courseId, queryClient]);

    const scrollToTop = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!session) {
            alert(401, "You must be logged in to submit a comment.");
            return;
        }

        if (useComment.isPending) return;

        const trimmed = comment.content.trim();
        if (trimmed.length === 0) return;

        try {
            await useComment.mutateAsync({
                courseId,
                content: trimmed
            });

            setComment({
                content: '',
            });

            inputRef.current?.focus();
            scrollToTop();
        } catch (err) {
            alert(500, err?.message || "Failed to submit comment. Please try again later.");
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setComment(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    return (
        <aside className="comments-sidebar" id="comments" aria-label="Course Discussion">
            {/* Comments Header */}
            <div className="comments-sidebar-header">
                <div className="comments-header-title">
                    <MdOutlineForum fontSize={20} />
                    <h3>Discussion</h3>
                </div>
                <span className="comments-badge" title={`${comments.length} comments`}>
                    {comments.length}
                </span>
            </div>

            {/* Comments Feed */}
            <div className="comments-container" ref={scrollRef}>
                {isLoading ? (
                    <div className="comments-loading">
                        <LoadingContent />
                    </div>
                ) : isError ? (
                    <ErrorReload
                        data={error}
                        refetch={() => refetch()}
                    />
                ) : (
                    <div className="comments-list">
                        {comments && comments.length > 0 ? (
                            comments.map((item) => (
                                <CommentItem
                                    key={item.id}
                                    data={item}
                                    courseId={courseId}
                                />
                            ))
                        ) : (
                            <div className="empty-comments">
                                <MdOutlineForum className="empty-comments-icon" />
                                <p>No comments yet.</p>
                                <span>Be the first to share your thoughts about this course!</span>
                            </div>
                        )}

                        {hasNextPage && (
                            <button
                                type="button"
                                className="load-more-btn"
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                            >
                                {isFetchingNextPage ? (
                                    <LoadingContent scale={0.5} />
                                ) : (
                                    "Load more comments"
                                )}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Comment Form or Guest Notice */}
            {!session ? (
                <div className="comment-guest-prompt">
                    <p>Want to join the discussion?</p>
                    <Link href="/auth" className="guest-login-btn">
                        Sign In to Comment
                    </Link>
                </div>
            ) : (
                <Form onSubmit={handleSubmit} className="comment-form">
                    <TextAreaGroup
                        label="Share your thoughts or question..."
                        name="content"
                        rows="3"
                        value={comment.content}
                        onChange={handleChange}
                        readOnly={useComment.isPending}
                        ref={inputRef}
                    />

                    <div className="comments_actions">
                        <div className="option_actions">
                            <span className={`char-count ${comment.content.length > 200 ? 'exceed' : ''}`}>
                                {comment.content.length}/200
                            </span>
                        </div>

                        <button
                            type="submit"
                            className={`submit-btn ${comment.content.trim().length > 0 && comment.content.length <= 200 ? 'active' : ''}`}
                            disabled={useComment.isPending || comment.content.trim().length === 0 || comment.content.length > 200}
                        >
                            {useComment.isPending ? (
                                <span>
                                    Sending...
                                </span>
                            ) : (
                                <>
                                    <span>Send</span>
                                    <IoSend fontSize={15} />
                                </>
                            )}
                        </button>
                    </div>
                </Form>
            )}
        </aside>
    );
}