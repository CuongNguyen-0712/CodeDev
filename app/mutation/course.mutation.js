import { useMutation, useQueryClient } from "@tanstack/react-query";
import { courseClient } from "@/app/clients/course.client";

import { userKeys } from "@/app/keys/user.keys";
import { courseKeys } from "@/app/keys/course.keys";

export const useCourseRegister = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (courseId) => courseClient.postRegister(courseId),

        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: userKeys.courseProgress(),
            });

            queryClient.invalidateQueries({
                queryKey: courseKeys.details(variables.courseId),
            });
        },
    });
}

export const useCourseWithdraw = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (courseId) => courseClient.postWithdraw(courseId),

        //Optimistic Update
        onMutate: async ({ courseId }) => {
            await queryClient.cancelQueries({
                queryKey: userKeys.courseProgress(),
            });

            const previousQueries = queryClient.getQueriesData({
                queryKey: userKeys.courseProgress(),
            });

            previousQueries.forEach(([queryKey, data]) => {
                if (!data) return;

                queryClient.setQueryData(
                    queryKey,
                    data.filter(course => course.id !== courseId)
                );
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
}

export const useCourseSubmitLesson = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data) => courseClient.postSubmitLesson(data),

        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: userKeys.courseProgress(),
            })

            queryClient.invalidateQueries({
                queryKey: userKeys.learningProgress(variables.courseId),
            });

            queryClient.invalidateQueries({
                queryKey: userKeys.me(),
            });
        }
    });
}

export const useCourseFavorite = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data) => courseClient.postFavorite(data),

        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: userKeys.courseProgress(),
            });
        }
    });
}