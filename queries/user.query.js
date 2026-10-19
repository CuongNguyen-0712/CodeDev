import { keepPreviousData } from "@tanstack/react-query";

import { userClient } from "@/clients/user.client";

import { userKeys } from "@/keys/user.keys";
import { QUERY_TIMES } from "@/lib/queryTimes";

export const userQueries = {
    me(status) {
        return {
            queryKey: userKeys.me(),
            queryFn: () => userClient.getMe(),
            enabled: status === 'authenticated',
            // Profile / points: changed by the user's own actions, which invalidate userKeys.
            ...QUERY_TIMES.profile,
            refetchOnWindowFocus: false,
        };
    },

    overview(status) {
        return {
            queryKey: userKeys.overview(),
            queryFn: () => userClient.getOverview(),
            enabled: status === 'authenticated',
            ...QUERY_TIMES.personal,
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
                    ...(pageParam ? { nextCursor: pageParam } : {}),
                }),

            getNextPageParam: (lastPage) =>
                lastPage?.hasMore ? lastPage.nextCursor : undefined,

            placeholderData: keepPreviousData,
            ...QUERY_TIMES.personal,
            refetchOnWindowFocus: true,
        };
    },

    /** Level table + EXP history pages (useInfiniteQuery). */
    experience(status) {
        return {
            queryKey: userKeys.experience(),
            queryFn: ({ pageParam }) => userClient.getExperience(pageParam),
            initialPageParam: null,
            getNextPageParam: (lastPage) => lastPage?.next || undefined,
            enabled: status === 'authenticated',
            ...QUERY_TIMES.personal,
        };
    },

    sessions(status) {
        return {
            queryKey: userKeys.sessions(),
            queryFn: () => userClient.getSessions(),
            enabled: status === 'authenticated',
            ...QUERY_TIMES.personal,
            refetchOnWindowFocus: true,
        };
    },

    learningProgress(status, courseId) {
        return {
            queryKey: userKeys.learningProgress(courseId),
            queryFn: () => userClient.getLearningProgress({ courseId }),
            enabled: status === 'authenticated',
            ...QUERY_TIMES.personal,
            refetchOnWindowFocus: true,
        };
    }
}
