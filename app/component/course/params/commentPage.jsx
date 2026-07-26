import { useInfiniteQuery } from "@tanstack/react-query";

import { courseQueries } from "@/app/query/course.query";

export default function CommentPage({ courseId }) {
    const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, error } = useInfiniteQuery(courseQueries.comments({ courseId: courseId }))

    return (
        <section className="comments-sidebar" id="comments" >
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
                            data && data.length > 0 ?
                                <div className="comments-list">
                                    {data.map((item) => (
                                        <CommentItem
                                            key={item.id}
                                            data={item}
                                            alert={(status, message) => alert(status, message)}
                                        />
                                    ))}
                                    {/* 
                                    {load.hasMore && (
                                        <button
                                            className="load-more-btn"
                                            onClick={handleLoadComment}
                                        >
                                            {load.handling ? (
                                                <LoadingContent scale={0.5} />
                                            ) : (
                                                <>Load more comments</>
                                            )}
                                        </button>
                                    )} */}
                                </div>
                                :
                                <div className="empty-comments">
                                    <p>No comments yet. Be the first!</p>
                                </div>
                }
            </div>

            <Form onSubmit={submitComment} className="comment-form">
                <div className="form-input-wrapper">
                    <textarea
                        name="comment"
                        rows="3"
                        placeholder="Share your thoughts..."
                        value={comment.content}
                        readOnly={comment.handling}
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
                        disabled={comment.handling || comment.content.length === 0}
                    >
                        {comment.handling ? (
                            <LoadingContent scale={0.4} color="var(--white)" />
                        ) : (
                            <IoSend fontSize={16} />
                        )}
                    </button>
                </div>
            </Form>
        </section>
    )
}