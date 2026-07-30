import { useState } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";

import Form from 'next/form';

import { LoadingContent } from "@/app/component/ui/loading";
import { ErrorReload } from "@/app/component/ui/error";

import { courseQueries } from "@/app/query/course.query";
import { IoSend } from "react-icons/io5";

import { useApp } from "@/app/contexts/appContext";

import { useCourseComment } from "@/app/mutation/course.mutation";

import { TextAreaGroup } from "@/app/component/ui/input";

import CommentItem from "./commentItem";

export default function CommentPage({ courseId }) {
    const [comment, setComment] = useState({
        content: '',
    })

    const { showAlert: alert } = useApp()

    const useComment = useCourseComment()

    const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, error, isFetchingNextPage } = useInfiniteQuery(courseQueries.comments(courseId))

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

    const handleChange = (e) => {
        e.preventDefault();

        const { name, value } = e.target;
        setComment({
            ...comment,
            [name]: value,
        });
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
                            <div className="comments-list">
                                {
                                    comments && comments.length > 0 ?
                                        comments.map((item) => (
                                            <CommentItem
                                                key={item.id}
                                                data={item}
                                                courseId={courseId}
                                            />
                                        ))
                                        :
                                        <div className="empty-comments">
                                            <p>No comments yet. Be the first!</p>
                                        </div>
                                }
                                {
                                    hasNextPage &&
                                    <button
                                        className="load-more-btn"
                                        onClick={fetchNextPage}
                                        disabled={isFetchingNextPage || !hasNextPage}
                                    >
                                        {isFetchingNextPage ? <LoadingContent scale={0.5} /> : "Load more comments"}
                                    </button>
                                }
                            </div>
                }
            </div>

            <Form onSubmit={handleSubmit} className="comment-form">
                <TextAreaGroup
                    label='Share your thoughts...'
                    name="content"
                    rows="4"
                    value={comment.content}
                    onChange={handleChange}
                    readOnly={useComment.isPending}
                />
                <div className="form_actions">
                    <div className="option_actions">
                        <span className={`char-count ${comment.content.length > 200 ? 'exceed' : ''}`}>
                            {comment.content.length}/200
                        </span>
                    </div>
                    <button
                        type="submit"
                        className={`submit-btn ${comment.content.length > 0 ? 'active' : ''}`}
                        disabled={useComment.isPending || comment.content.length === 0}
                    >
                        {
                            useComment.isPending ?
                                <LoadingContent scale={0.4} color="var(--white)" />
                                :
                                <>
                                    <span>Send</span>
                                    <IoSend fontSize={16} />
                                </>
                        }
                    </button>
                </div>
            </Form>
        </div>
    )
}