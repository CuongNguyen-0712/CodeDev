import { userClient } from "@/app/clients/user.client";

import { userKeys } from "@/app/keys/user.keys";

export const userQueries = {
    me(status) {
        return {
            queryKey: userKeys.me(),
            queryFn: () => userClient.getMe(),
            enabled: status === 'authenticated',
            staleTime: 0,
            cacheTime: 1000 * 60 * 30,
            gcTime: 1000 * 60 * 30,
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
            queryFn: ({ pageParam }) =>
                userClient.getCourseProgress({
                    ...params,
                    nextCursor: pageParam,
                }),
            getNextPageParam: (lastPage) => {
                if (!lastPage.hasMore) return undefined;

                return lastPage.nextCursor;
            },
            staleTime: 0,
            gcTime: 0,
            refetchOnWindowFocus: true,
        };
    },

    learningProgress(status, courseId) {
        return {
            queryKey: userKeys.learningProgress(courseId),
            queryFn: () => userClient.getLearningProgress({ courseId }),
            enabled: status === 'authenticated',
            staleTime: 0,
            gcTime: 0,
            refetchOnWindowFocus: true,
        };
    }
}
