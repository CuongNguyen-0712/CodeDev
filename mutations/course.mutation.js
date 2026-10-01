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

        onSuccess: (_, variables) => {
            const courseId = extractId(variables);

            if (courseId) {
                queryClient.invalidateQueries({
                    queryKey: courseKeys.comments(courseId),
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

        onSuccess: (_, variables) => {
            const courseId = extractId(variables);

            if (courseId) {
                queryClient.invalidateQueries({
                    queryKey: courseKeys.comments(courseId),
                });
            }
        }
    });
};