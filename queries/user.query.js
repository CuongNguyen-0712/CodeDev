import { userClient } from "@/clients/user.client";

import { userKeys } from "@/keys/user.keys";

export const userQueries = {
    me(status) {
        return {
            queryKey: userKeys.me(),
            queryFn: () => userClient.getMe(),
            enabled: status === 'authenticated',
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,
        };
    },

    overview(status) {
        return {
            queryKey: userKeys.overview(),
            queryFn: () => userClient.getOverview(),
            enabled: status === 'authenticated',
            staleTime: 0,
            cacheTime: 1000 * 60 * 30,
            gcTime: 1000 * 60 * 30,
            refetchOnWindowFocus: true,
        };
    },

    courseProgress(status, params) {
        return {
            queryKey: userKeys.courseProgressList(params),

            enabled: status === 'authenticated',

            initialPageParam: null,

            queryFn: ({ pageParam }) =>
                userClient.getCourseProgress({
                    ...params,
                    nextCursor: pageParam,
                }),

            getNextPageParam: (lastPage) =>
                lastPage?.hasMore ? lastPage.nextCursor : undefined,

            staleTime: 0,

            gcTime: 10 * 60 * 1000, // 10 minutes

            refetchOnWindowFocus: true,
        };
    },

    learningProgress(status, courseId) {
        return {
            queryKey: userKeys.learningProgress(courseId),
            queryFn: () => userClient.getLearningProgress({ courseId }),
            enabled: status === 'authenticated',
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: true,
        };
    }
}
