import { useState, useRef } from "react";
import Link from "next/link";
import Form from 'next/form';

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { ErrorReload } from "@/components/ui/error";
import { courseQueries } from "@/queries/course.query";
import { courseKeys } from "@/keys/course.keys";
import { useCourseComment } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { TextAreaGroup } from "@/components/ui/input";
import { usePusherChannel } from "@/hooks/usePusherChannel";
import { channels, events } from "@/lib/realtime";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import CommentItem from "./commentItem";
import { uniqBy } from "lodash";

import { LuLoaderCircle, LuLogIn, LuMessagesSquare, LuSendHorizontal } from "react-icons/lu";

const MAX_COMMENT_LENGTH = 200;

function CommentSkeleton() {
    return (
        <div className="flex flex-col gap-2 px-4 py-3.5" aria-hidden="true">
            <div className="flex items-center gap-2.5">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-12" />
            </div>
            <div className="space-y-1.5 pl-[42px]">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
            </div>
        </div>
    );
}

export default function CommentPage({ courseId }) {
    const inputRef = useRef(null);
    const scrollRef = useRef(null);
    const queryClient = useQueryClient();

    const [comment, setComment] = useState({
        content: '',
    });
    const [fieldError, setFieldError] = useState(null);

    const { data: session } = useSession();
    const { showAlert: alert } = useApp();
    const useComment = useCourseComment();

    const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, error, isFetchingNextPage } = useInfiniteQuery(
        courseQueries.comments(courseId)
    );

    const rawComments = data?.pages?.flatMap(page => page.data || []) || [];
    const comments = uniqBy(rawComments, 'id');

    // Realtime discussion feed (new comments + vote counts from other learners).
    const updateComments = (updater) => {
        queryClient.setQueryData(courseKeys.comments(courseId), (oldData) => {
            if (!oldData || !oldData.pages) return oldData;
            return updater(oldData);
        });
    };

    usePusherChannel(courseId ? channels.course(courseId) : null, {
        [events.COMMENT_CREATED]: (newComment) => {
            if (newComment?.stale) {
                queryClient.invalidateQueries({ queryKey: courseKeys.comments(courseId) });
                return;
            }
            if (!newComment?.id) return;

            updateComments((oldData) => {
                // The author already has it from the mutation response.
                const exists = oldData.pages.some(page =>
                    page.data?.some(item => item.id === newComment.id)
                );
                if (exists) return oldData;

                const [firstPage, ...rest] = oldData.pages;
                return {
                    ...oldData,
                    pages: [{ ...firstPage, data: [newComment, ...(firstPage?.data || [])] }, ...rest],
                };
            });
        },

        [events.COMMENT_VOTED]: ({ commentId, upvotes, downvotes } = {}) => {
            if (!commentId) return;

            updateComments((oldData) => ({
                ...oldData,
                pages: oldData.pages.map((page) => ({
                    ...page,
                    data: (page.data || []).map((item) => item.id !== commentId ? item : {
                        ...item,
                        upvotes: Number(upvotes) || 0,
                        downvotes: Number(downvotes) || 0,
                    }),
                })),
            }));
        },
    }, {
        // Events sent while the socket was down are lost: resync the feed.
        onReconnect: () => queryClient.invalidateQueries({ queryKey: courseKeys.comments(courseId) }),
    });

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
        if (trimmed.length === 0) {
            setFieldError("Write a comment before posting.");
            inputRef.current?.focus();
            return;
        }

        if (comment.content.length > MAX_COMMENT_LENGTH) {
            setFieldError(`Comments can be up to ${MAX_COMMENT_LENGTH} characters.`);
            inputRef.current?.focus();
            return;
        }

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
        if (fieldError) setFieldError(null);
    };

    return (
        <section id="comments" aria-labelledby="course-comments-heading" className="scroll-mt-16 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
                <h2 id="course-comments-heading" className="text-base font-semibold">Discussion</h2>
                {!isLoading && !isError && (
                    <span className="font-mono text-xs text-muted-foreground tabular">
                        {comments.length}{hasNextPage ? '+' : ''} {comments.length === 1 ? 'comment' : 'comments'}
                    </span>
                )}
            </div>

            {/* Comment form or guest notice */}
            {!session ? (
                <div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">Sign in to ask a question or share feedback on this course.</p>
                    <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
                        <Link href="/auth"><LuLogIn />Sign in to comment</Link>
                    </Button>
                </div>
            ) : (
                <Form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border bg-card p-4" noValidate>
                    <TextAreaGroup
                        label="Add a comment"
                        name="content"
                        rows={3}
                        value={comment.content}
                        onChange={handleChange}
                        ref={inputRef}
                        maxLength={MAX_COMMENT_LENGTH}
                        error={fieldError}
                        placeholder="Ask a question or share what you think about this course"
                    />

                    <div className="flex justify-end">
                        <Button type="submit" size="sm" disabled={useComment.isPending}>
                            {useComment.isPending ? (
                                <LuLoaderCircle className="animate-spin" aria-hidden="true" />
                            ) : (
                                <LuSendHorizontal aria-hidden="true" />
                            )}
                            {useComment.isPending ? 'Posting...' : 'Post comment'}
                        </Button>
                    </div>
                </Form>
            )}

            {/* Comments feed */}
            {isLoading ? (
                <div className="divide-y rounded-lg border bg-card">
                    {[0, 1, 2].map((index) => <CommentSkeleton key={index} />)}
                </div>
            ) : isError ? (
                <ErrorReload
                    data={error}
                    refetch={() => refetch()}
                />
            ) : comments.length > 0 ? (
                <div ref={scrollRef} className="flex flex-col gap-2">
                    <ol className="list-none divide-y rounded-lg border bg-card">
                        {comments.map((item) => (
                            <li key={item.id}>
                                <CommentItem
                                    data={item}
                                    courseId={courseId}
                                />
                            </li>
                        ))}
                    </ol>

                    {hasNextPage && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="self-center"
                            onClick={() => fetchNextPage()}
                            disabled={isFetchingNextPage}
                        >
                            {isFetchingNextPage && <LuLoaderCircle className="animate-spin" aria-hidden="true" />}
                            {isFetchingNextPage ? 'Loading comments...' : 'Load more comments'}
                        </Button>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
                    <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <LuMessagesSquare className="size-5" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <h3 className="text-sm font-semibold">No comments yet</h3>
                        <p className="max-w-[48ch] text-sm text-muted-foreground">
                            Questions and feedback from learners on this course will show up here.
                        </p>
                    </div>
                    {/* Guests already get the sign-in prompt above the feed. */}
                    {session && (
                        <Button variant="outline" size="sm" onClick={() => inputRef.current?.focus()}>
                            Write the first comment
                        </Button>
                    )}
                </div>
            )}
        </section>
    );
}
