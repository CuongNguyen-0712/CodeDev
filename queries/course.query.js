import { keepPreviousData } from "@tanstack/react-query";

import { courseClient } from "../clients/course.client";

import { courseKeys } from "@/keys/course.keys";
import { QUERY_TIMES } from "@/lib/queryTimes";

export const courseQueries = {
    // Public course page (+ the viewer's enrolment); register / withdraw / progress invalidate it.
    details(courseId) {
        return {
            queryKey: courseKeys.details(courseId),
            queryFn: () => courseClient.getDetails(courseId),
            ...QUERY_TIMES.catalog,
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
            ...QUERY_TIMES.catalog,
        };
    },

    filters() {
        return {
            queryKey: courseKeys.filters(),
            queryFn: () => courseClient.getFilters(),
            ...QUERY_TIMES.reference,
        };
    },

    // Lesson content + the learner's lesson state; submitting a lesson invalidates courseKeys.all.
    // Kept for a while so switching back to a lesson is instant.
    learning(lessonId) {
        return {
            queryKey: courseKeys.learning(lessonId),
            queryFn: () => courseClient.getLearning({ lessonId }),
            enabled: !!lessonId,
            ...QUERY_TIMES.personal,
        };
    },

    // Other learners post and vote: short stale time, refreshed when the tab regains focus.
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
            ...QUERY_TIMES.live,
            refetchOnWindowFocus: true,
        };
    }
}
