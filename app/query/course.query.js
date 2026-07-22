import { courseClient } from "../clients/course.client";

import { courseKeys } from "@/app/keys/course.keys";

export const courseQueries = {
    details(courseId) {
        return {
            queryKey: courseKeys.details(courseId),
            queryFn: () => courseClient.getDetails(courseId),
            staleTime: 1000 * 60 * 5, // 5 minutes
            cacheTime: 1000 * 60 * 10, // 10 minutes
        }
    },

    list(params) {
        return {
            queryKey: courseKeys.list(params),

            initialPageParam: null,

            queryFn: ({ pageParam }) =>
                courseClient.getList({
                    ...params,
                    lastId: pageParam,
                }),

            getNextPageParam: (lastPage) => {
                if (!lastPage.hasMore) return undefined;

                return lastPage.lastId;
            },

            staleTime: 0,
            cacheTime: 1000 * 60 * 5, // 5 minutes
            gcTime: 1000 * 60 * 1, // 5 minutes
        };
    },

    learning(lessonId) {
        return {
            queryKey: courseKeys.learning(lessonId),
            queryFn: () => courseClient.getLearning({ lessonId }),
            enabled: !!lessonId,
            staleTime: 0,
            cacheTime: 1000 * 30, // 30 seconds
            gcTime: 1000 * 30, // 30 seconds
        };
    }
}