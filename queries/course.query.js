import { keepPreviousData } from "@tanstack/react-query";

import { courseClient } from "../clients/course.client";

import { courseKeys } from "@/keys/course.keys";

export const courseQueries = {
    details(courseId) {
        return {
            queryKey: courseKeys.details(courseId),
            queryFn: () => courseClient.getDetails(courseId),
            staleTime: 0,
            gcTime: 1000 * 60 * 5, // 5 minutes
        }
    },

    /**
     * @param {Record<string,string>} params canonical query from lib/listFilters (`toQueryParams`)
     * Each distinct query is its own cache entry, so going back to an earlier search is instant;
     * the previous results stay on screen while a new query loads.
     */
    list(params = {}, { limit } = {}) {
        const query = limit ? { ...params, limit: String(limit) } : params;
        return {
            queryKey: courseKeys.list(query),

            initialPageParam: null,

            queryFn: ({ pageParam }) =>
                courseClient.getList({
                    ...query,
                    ...(pageParam ? { lastId: pageParam } : {}),
                }),

            getNextPageParam: (lastPage) => {
                if (!lastPage.hasMore) return undefined;

                return lastPage.lastId;
            },

            placeholderData: keepPreviousData,
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
        };
    },

    filters() {
        return {
            queryKey: courseKeys.filters(),
            queryFn: () => courseClient.getFilters(),
            staleTime: 10 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
        };
    },

    learning(lessonId) {
        return {
            queryKey: courseKeys.learning(lessonId),
            queryFn: () => courseClient.getLearning({ lessonId }),
            enabled: !!lessonId,
            staleTime: 0,
            gcTime: 1000 * 30, // 30 seconds
        };
    },

    comments(courseId) {
        return {
            queryKey: courseKeys.comments(courseId),
            initialPageParam: null,
            queryFn: ({ pageParam }) =>
                courseClient.getComments({
                    courseId,
                    lastCreated: pageParam
                }),
            getNextPageParam: (lastPage) => {
                if (!lastPage.hasMore) return undefined;

                return lastPage.lastCreated;
            },
            enabled: !!courseId,
            staleTime: 0,
            gcTime: 1000 * 30, // 30 seconds
            refetchOnWindowFocus: true,
        };
    }
}