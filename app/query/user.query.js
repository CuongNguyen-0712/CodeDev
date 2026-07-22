import { userClient } from "@/app/clients/user.client";

import { userKeys } from "@/app/keys/user.keys";

export const userQueries = {
    me(status) {
        return {
            queryKey: userKeys.me(),
            queryFn: () => userClient.getMe(),
            enabled: status === 'authenticated'
        };
    },

    courseProgress(status, params) {
        return {
            queryKey: userKeys.courseProgressList(params),
            queryFn: () => userClient.getCourseProgress(params),
            enabled: status === 'authenticated'
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
