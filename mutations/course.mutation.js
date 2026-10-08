import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    registerCourseAction,
    withdrawCourseAction,
    submitLessonAction,
    favoriteCourseAction,
    unfavoriteCourseAction,
    postCommentAction,
    voteCommentAction,
    submitChallengeAction
} from "@/actions/course.actions";

import { userKeys } from "@/keys/user.keys";
import { courseKeys } from "@/keys/course.keys";

function extractId(variables) {
    if (typeof variables === 'object' && variables !== null) {
        return variables.courseId || variables.id;
    }
    return variables;
}

export const useCourseRegister = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (courseId) => {
            const res = await registerCourseAction(courseId);
            return res;
        },

        onSuccess: (_, variables) => {
            const id = extractId(variables);

            queryClient.invalidateQueries({
                queryKey: userKeys.courseProgress(),
            });

            if (id) {
                queryClient.invalidateQueries({
                    queryKey: courseKeys.details(id),
                });
            }
        },
    });
};

export const useCourseWithdraw = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (courseId) => {
            const res = await withdrawCourseAction(courseId);
            return res;
        },

        onMutate: async (courseIdOrData) => {
            const targetId = extractId(courseIdOrData);

            await queryClient.cancelQueries({
                queryKey: userKeys.courseProgress(),
            });

            const previousQueries = queryClient.getQueriesData({
                queryKey: userKeys.courseProgress(),
            });

            previousQueries.forEach(([queryKey, oldData]) => {
                if (!oldData) return;

                queryClient.setQueryData(queryKey, (old) => {
                    if (!old) return old;

                    if (old.pages && Array.isArray(old.pages)) {
                        return {
                            ...old,
                            pages: old.pages.map((page) => ({
                                ...page,
                                data: Array.isArray(page?.data)
                                    ? page.data.filter((item) => item.id !== targetId)
                                    : page?.data || [],
                            })),
                        };
                    }

                    if (Array.isArray(old)) {
                        return old.filter((item) => item.id !== targetId);
                    }

                    return old;
                });
            });

            return { previousQueries };
        },

        onError: (_, __, context) => {
            context?.previousQueries?.forEach(([queryKey, data]) => {
                queryClient.setQueryData(queryKey, data);
            });
        },

        onSettled: () => {
            queryClient.invalidateQueries({
                queryKey: userKeys.courseProgress(),
            });

            queryClient.invalidateQueries({
                queryKey: courseKeys.all,
            });
        },
    });
};

export const useCourseSubmitLesson = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data) => {
            const res = await submitLessonAction(data);
            return res;
        },

        onSuccess: (_, variables) => {
            const courseId = extractId(variables);

            queryClient.invalidateQueries({
                queryKey: userKeys.courseProgress(),
            });

            if (courseId) {
                queryClient.invalidateQueries({
                    queryKey: userKeys.learningProgress(courseId),
                });
            }

            queryClient.invalidateQueries({
                queryKey: userKeys.me(),
            });
        }
    });
};

export const useCourseSubmitChallenge = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data) => {
            const res = await submitChallengeAction(data);
            return res;
        },

        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: userKeys.me(),
            });
            queryClient.invalidateQueries({
                queryKey: userKeys.overview(),
            });
            queryClient.invalidateQueries({
                queryKey: userKeys.courseProgress(),
            });
        }
    });
};

export const useCourseFavorite = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data) => {
            const res = await favoriteCourseAction(data);
            return res;
        },

        onSuccess: (_, variables) => {
            const courseId = extractId(variables);

            queryClient.invalidateQueries({
                queryKey: userKeys.courseProgress(),
            });

            if (courseId) {
                queryClient.invalidateQueries({
                    queryKey: courseKeys.details(courseId),
                });
            }
        }
    });
};

export const useCourseUnfavorite = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data) => {
            const res = await unfavoriteCourseAction(data);
            return res;
        },

        onSuccess: (_, variables) => {
            const courseId = extractId(variables);

            queryClient.invalidateQueries({
                queryKey: userKeys.courseProgress(),
            });

            if (courseId) {
                queryClient.invalidateQueries({
                    queryKey: courseKeys.details(courseId),
                });
            }
        }
    });
};

export const useCourseComment = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data) => {
            const res = await postCommentAction(data);
            return res;
        },

        onSuccess: (res, variables) => {
            const courseId = extractId(variables);
            const newComment = res?.data;

            if (courseId && newComment) {
                queryClient.setQueryData(courseKeys.comments(courseId), (oldData) => {
                    if (!oldData?.pages) return oldData;

                    const exists = oldData.pages.some((page) =>
                        page.data?.some((item) => item.id === newComment.id)
                    );

                    if (exists) return oldData;

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
            }
        }
    });
};

export const useCourseVotingComment = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data) => {
            const res = await voteCommentAction(data);
            return res;
        },

        onMutate: async ({ commentId, courseId, vote }) => {
            if (!courseId || !commentId) return;

            const queryKey = courseKeys.comments(courseId);
            await queryClient.cancelQueries({ queryKey });

            const previousData = queryClient.getQueryData(queryKey);

            queryClient.setQueryData(queryKey, (old) => {
                if (!old?.pages) return old;

                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        data: (page.data || []).map((item) => {
                            if (item.id !== commentId) return item;

                            const prevVote = item.vote;
                            let newUpvotes = Number(item.upvotes) || 0;
                            let newDownvotes = Number(item.downvotes) || 0;

                            // Revert previous vote counts
                            if (prevVote === 'upvote') newUpvotes = Math.max(0, newUpvotes - 1);
                            if (prevVote === 'downvote') newDownvotes = Math.max(0, newDownvotes - 1);

                            // Apply new vote
                            if (vote === 'upvote') newUpvotes += 1;
                            if (vote === 'downvote') newDownvotes += 1;

                            return {
                                ...item,
                                vote,
                                upvotes: newUpvotes,
                                downvotes: newDownvotes,
                            };
                        }),
                    })),
                };
            });

            return { previousData, queryKey };
        },

        onSuccess: (res, variables) => {
            const courseId = variables?.courseId;
            const commentId = variables?.commentId;
            const serverData = res?.data;

            if (courseId && commentId && serverData) {
                queryClient.setQueryData(courseKeys.comments(courseId), (old) => {
                    if (!old?.pages) return old;

                    return {
                        ...old,
                        pages: old.pages.map((page) => ({
                            ...page,
                            data: (page.data || []).map((item) => {
                                if (item.id !== commentId) return item;

                                return {
                                    ...item,
                                    upvotes: Number(serverData.upvotes) || 0,
                                    downvotes: Number(serverData.downvotes) || 0,
                                    vote: serverData.vote !== undefined ? serverData.vote : item.vote,
                                };
                            }),
                        })),
                    };
                });
            }
        },

        onError: (_, __, context) => {
            if (context?.queryKey && context?.previousData) {
                queryClient.setQueryData(context.queryKey, context.previousData);
            }
        },
    });
};