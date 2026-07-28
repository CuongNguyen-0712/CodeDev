import { useState } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";

import Form from 'next/form';

import { LoadingContent } from "@/app/component/ui/loading";
import { ErrorReload } from "@/app/component/ui/error";

import { courseQueries } from "@/app/query/course.query";
import { IoSend } from "react-icons/io5";

import { useApp } from "@/app/contexts/appContext";

import { useCourseComment } from "@/app/mutation/course.mutation";

import CommentItem from "./commentItem";

export default function CommentPage({ courseId }) {
    const [comment, setComment] = useState({
        content: '',
    })

    const { showAlert: alert } = useApp()

    const useComment = useCourseComment()

    const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, error } = useInfiniteQuery(courseQueries.comments(courseId))

    const comments = data?.pages?.flatMap(page => page) || [];

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (useComment.isPending) return

        if (comment.content.length === 0) {
            return;
        }

        try {
            await useComment.mutateAsync({
                courseId,
                content: comment.content
            });

            setComment({
                content: '',
            });
        }
        catch (error) {
            alert(500, "Failed to submit comment. Please try again later.");
        }
    }

    return (
        <div className="comments-sidebar" id="comments" >
            <div className="comments-container">
                {
                    isLoading ?
                        <LoadingContent />
                        :
                        isError ?
                            <ErrorReload
                                data={error}
                                refetch={() => refetch()}
                            />
                            :
                            comments && comments.length > 0 ?
                                <div className="comments-list">
                                    {comments.map((item) => (
                                        <CommentItem
                                            key={item.id}
                                            data={item}
                                        />
                                    ))}
                                    {hasNextPage && (
                                        <button
                                            className="load-more-btn"
                                            onClick={fetchNextPage}
                                        >
                                            {
                                                isLoading ?
                                                    <LoadingContent scale={0.5} />
                                                    :
                                                    <>
                                                        Load more comments
                                                    </>
                                            }
                                        </button>
                                    )}
                                </div>
                                :
                                <div className="empty-comments">
                                    <p>No comments yet. Be the first!</p>
                                </div>
                }
            </div>

            <Form onSubmit={handleSubmit} className="comment-form">
                <div className="form-input-wrapper">
                    <textarea
                        name="comment"
                        rows="3"
                        placeholder="Share your thoughts..."
                        value={comment.content}
                        readOnly={useComment.isPending}
                        onChange={(e) =>
                            setComment(prev => ({
                                ...prev,
                                content: e.target.value
                            }))
                        }
                    />
                    <button
                        type="submit"
                        className="submit-btn"
                        disabled={useComment.isPending || comment.content.length === 0}
                    >
                        {useComment.isPending ? (
                            <LoadingContent scale={0.4} color="var(--white)" />
                        ) : (
                            <IoSend fontSize={16} />
                        )}
                    </button>
                </div>
            </Form>
        </div>
    )
}